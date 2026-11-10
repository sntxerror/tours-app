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

/** The message as it came off the queue, for subscribers that keep the raw delivery (the dev log). */
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

/**
 * Turns queue messages into handler calls with `commoneventframework`, the way a Lambda SQS trigger
 * would: the message is normalised into a CommonEvent whose route (`PUT /events/<type>`) selects the
 * handler registered for that event type. Modules `subscribe` instead of reading the queue themselves.
 *
 * A message that cannot be understood or handled makes `dispatch` throw, so it stays on the queue and
 * ends up in the dead-letter queue after the redrive limit.
 */
@Injectable()
export class EventRouter {
  private readonly logger = new Logger(EventRouter.name);
  private readonly subscriptions: Subscription[] = [];
  private routes?: Set<RouteConfig>;

  subscribe(subscription: Subscription): void {
    this.subscriptions.push(subscription);
    this.routes = undefined; // rebuilt on the next dispatch
  }

  async dispatch(message: Message, queueArn: string): Promise<void> {
    const sqsEvent = {
      Records: [
        {
          messageId: message.MessageId,
          receiptHandle: message.ReceiptHandle,
          body: this.withRoute(message),
          attributes: message.Attributes ?? {},
          md5OfBody: message.MD5OfBody,
          eventSource: 'aws:sqs',
          eventSourceARN: queueArn,
        },
      ],
    };
    // Normalise exactly as the Lambda would; the library prints debug lines to the console, mute them.
    const common = withQuietConsoleLog(() =>
      buildCommonEvent(sqsEvent as unknown as LambdaEvent, this.getRoutes()),
    );

    if (!common.path.startsWith(EVENT_ROUTE_PREFIX)) {
      throw new Error(`Malformed message ${message.MessageId}: no event route in its body`);
    }
    const route = getRouteConfig(common);
    const handler = route?.handler ? resolveHandlerRef(route.handler) : undefined;
    if (!handler) {
      // A valid event nobody subscribed to: nothing to do, and retrying will not change that.
      this.logger.warn(
        `No subscriber for ${common.path.slice(EVENT_ROUTE_PREFIX.length)}, skipping`,
      );
      return;
    }
    await handler({}, common);
  }

  /**
   * EventBridge delivers `{ "detail-type": <type>, "detail": <our envelope>, ... }`. The framework
   * wants the route in a `path` field of the body (on AWS an input transformer on the rule target
   * would add it), so the adapter derives `/events/<detail-type>` here. Anything that is not an
   * EventBridge event is malformed.
   */
  private withRoute(message: Message): string {
    let wrapper: unknown;
    try {
      wrapper = JSON.parse(message.Body ?? '');
    } catch {
      wrapper = undefined;
    }
    const type = (wrapper as { 'detail-type'?: unknown } | null)?.['detail-type'];
    if (typeof wrapper !== 'object' || wrapper === null || typeof type !== 'string') {
      throw new Error(`Malformed message ${message.MessageId}: not an EventBridge event`);
    }
    // Our route goes last so a `path` inside the message can never redirect it.
    return JSON.stringify({ ...wrapper, path: `${EVENT_ROUTE_PREFIX}${type}` });
  }

  private getRoutes(): Set<RouteConfig> {
    if (this.routes) return this.routes;
    const routes = new Set<RouteConfig>();
    for (const type of new Set(this.subscriptions.flatMap((s) => s.types))) {
      const subscribers = this.subscriptions.filter((s) => s.types.includes(type));
      if (subscribers.length === 0) continue;
      const ref = `events#${type}`;
      registerHandlerRef(ref, (_input: unknown, common: CommonEvent) =>
        this.handleType(type, subscribers, common),
      );
      routes.add({ method: 'PUT', path: `${EVENT_ROUTE_PREFIX}${type}`, handler: ref });
    }
    this.routes = routes;
    return routes;
  }

  private async handleType(
    type: EventType,
    subscribers: Subscription[],
    common: CommonEvent,
  ): Promise<void> {
    const body: unknown = JSON.parse(common.body ?? 'null');
    const envelope = (body as { detail?: unknown } | null)?.detail;
    if (!isEnvelope(envelope, type)) {
      throw new Error(`Malformed ${type} event: the body does not hold a valid envelope`);
    }
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

function isEnvelope(value: unknown, type: EventType): value is EventEnvelope {
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
