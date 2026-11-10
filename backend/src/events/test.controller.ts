import { Controller, Get, Post } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { ANONYMOUS_ACTOR } from './event-envelope';
import { EventPublisherService } from './event-publisher.service';
import { ReceivedEventsStore } from './received-events.store';

/** Dev-only plumbing check behind the /events-test page; intentionally unauthenticated. */
@Public()
@Controller('test')
export class TestController {
  constructor(
    private readonly publisher: EventPublisherService,
    private readonly store: ReceivedEventsStore,
  ) {}

  @Post('publish')
  publish() {
    return this.publisher.publish(
      'travel.test.ping',
      { message: 'hello from NestJS' },
      { actor: ANONYMOUS_ACTOR },
    );
  }

  @Get('events')
  events() {
    return this.store.list();
  }
}
