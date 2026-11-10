import { Injectable, Logger } from '@nestjs/common';
import type { Message } from '@aws-sdk/client-sqs';
import {
  buildCommonEvent,
  getRouteConfig,
  registerHandlerRef,
  resolveHandlerRef,
  type RouteConfig,
} from 'commoneventframework';
import type { CommonEvent, LambdaEvent } from 'commoneventframework/dist/types/commonEvent';
import type { EventEnvelope } from './event-envelope';
import { describeEvent, withQuietConsoleLog } from './event-log';
import { EVENT_ROUTE_PREFIX, type EventType } from './event-types';

export interface Delivery {
  body: unknown;
  commonEventVersion: string;
}

/** Must be idempotent: SQS delivers at least once, and a failing sibling subscriber triggers a redelivery. */
export type EventHandler = (envelope: EventEnvelope, delivery: Delivery) => Promise<void>;

export interface Subscription {
  name: string;
  types: readonly EventType[];
  handle: EventHandler;
}

interface ParsedEvent {
  envelope: EventEnvelope;
  body: unknown;
}

export class MalformedMessageError extends Error {}

const PARSER_REF = 'events#parseEnvelope';

/**
 * Turns queue messages into handler calls with `commoneventframework`, the way a Lambda SQS trigger
 * would: `buildCommonEvent` normalises the message, its route (`PUT /events/<type>`) selects the
 * route config, the route's input parser validates the envelope and the handler fans it out to the
 * subscribers of that type. Modules `subscribe` instead of reading the queue themselves.
 *
 * `dispatch` only throws when a retry may help (a subscriber failed): the message then stays on the
 * queue. A malformed message is logged and treated as handled, since there is no dead-letter queue.
 */
@Injectable()
export class EventRouter {
  private readonly logger = new Logger(EventRouter.name);
  private readonly subscriptions: Subscription[] = [];
  private routes?: Set<RouteConfig>;

  constructor() {
    registerHandlerRef(PARSER_REF, parseEnvelope);
  }

  subscribe(subscription: Subscription): void {
    this.subscriptions.push(subscription);
    this.routes = undefined;
  }

  async dispatch(message: Message, queueArn: string): Promise<void> {
    try {
      await this.route(message, queueArn);
    } catch (err) {
      if (!(err instanceof MalformedMessageError)) throw err;
      this.logger.error(`Dropping malformed message ${message.MessageId}: ${err.message}`);
    }
  }

  private async route(message: Message, queueArn: string): Promise<void> {
    const routes = this.getRoutes();
    const sqsEvent = {
      Records: [
        {
          messageId: message.MessageId,
          receiptHandle: message.ReceiptHandle,
          body: withRoute(message.Body),
          attributes: message.Attributes ?? {},
          md5OfBody: message.MD5OfBody,
          eventSource: 'aws:sqs',
          eventSourceARN: queueArn,
        },
      ],
    };
    const common = withQuietConsoleLog(() =>
      buildCommonEvent(sqsEvent as unknown as LambdaEvent, routes),
    );

    const route = getRouteConfig(routes, common.method, common.path);
    if (!route?.handler) {
      this.logger.warn(
        `No subscriber for ${common.path.slice(EVENT_ROUTE_PREFIX.length)}, skipping`,
      );
      return;
    }
    const parse = route.inputParser ? resolveHandlerRef(route.inputParser) : undefined;
    const handle = resolveHandlerRef(route.handler);
    if (!handle) throw new Error(`Handler ${route.handler} is not registered`);
    await handle(parse ? parse(common) : {}, common);
  }

  private getRoutes(): Set<RouteConfig> {
    if (this.routes) return this.routes;
    const routes = new Set<RouteConfig>();
    for (const type of new Set(this.subscriptions.flatMap((s) => s.types))) {
      const subscribers = this.subscriptions.filter((s) => s.types.includes(type));
      const ref = `events#${type}`;
      registerHandlerRef(ref, (input: ParsedEvent, common: CommonEvent) =>
        this.fanOut(type, subscribers, input, common),
      );
      routes.add({
        method: 'PUT',
        path: `${EVENT_ROUTE_PREFIX}${type}`,
        handler: ref,
        inputParser: PARSER_REF,
      });
    }
    this.routes = routes;
    return routes;
  }

  private async fanOut(
    type: EventType,
    subscribers: Subscription[],
    { envelope, body }: ParsedEvent,
    common: CommonEvent,
  ): Promise<void> {
    this.logger.log(`Received ${describeEvent(envelope)}`);
    const delivery: Delivery = { body, commonEventVersion: common.version };
    const results = await Promise.allSettled(subscribers.map((s) => s.handle(envelope, delivery)));
    const failures = results.flatMap((result, i) =>
      result.status === 'rejected'
        ? [`${subscribers[i].name}: ${(result.reason as Error)?.message ?? result.reason}`]
        : [],
    );
    if (failures.length > 0) {
      throw new Error(
        `Subscriber(s) failed for ${type} ${envelope.eventId} (${failures.join('; ')})`,
      );
    }
  }
}

/**
 * The rule forwards the raw EventBridge event, `{ "detail-type": <type>, "detail": <our envelope>, ... }`,
 * but the framework reads the route from a `path` field of an SQS body, so the adapter adds
 * `/events/<detail-type>` here. Anything that is not an EventBridge event is malformed.
 *
 * On AWS a rule-target input transformer would normally add the path instead (LocalStack 3.x cannot
 * apply one). The two do not combine as written: a transformer emitting only `{ path, detail }` drops
 * `detail-type`, so this adapter would reject every message. Switching means removing or relaxing it.
 */
function withRoute(body: string | undefined): string {
  let wrapper: unknown;
  try {
    wrapper = JSON.parse(body ?? '');
  } catch {
    wrapper = undefined;
  }
  const type = (wrapper as { 'detail-type'?: unknown } | null)?.['detail-type'];
  if (typeof wrapper !== 'object' || wrapper === null || typeof type !== 'string') {
    throw new MalformedMessageError('not an EventBridge event');
  }
  // Our route goes last so a `path` inside the message can never redirect it.
  return JSON.stringify({ ...wrapper, path: `${EVENT_ROUTE_PREFIX}${type}` });
}

export function parseEnvelope(common: CommonEvent): ParsedEvent {
  const type = common.path.slice(EVENT_ROUTE_PREFIX.length);
  const body: unknown = JSON.parse(common.body ?? 'null');
  const envelope = (body as { detail?: unknown } | null)?.detail;
  if (!isEnvelope(envelope, type)) {
    throw new MalformedMessageError(`the ${type} event does not hold a valid envelope`);
  }
  return { envelope, body };
}

function isEnvelope(value: unknown, type: string): value is EventEnvelope {
  const e = value as Partial<EventEnvelope> | null;
  return (
    typeof e === 'object' &&
    e !== null &&
    e.type === type &&
    typeof e.eventId === 'string' &&
    typeof e.occurredAt === 'string' &&
    typeof e.correlationId === 'string' &&
    typeof e.actor === 'object' &&
    e.actor !== null &&
    typeof e.data === 'object' &&
    e.data !== null
  );
}
