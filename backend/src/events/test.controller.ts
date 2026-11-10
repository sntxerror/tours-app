import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { ANONYMOUS_ACTOR } from './event-envelope';
import { EventPublisherService } from './event-publisher.service';
import { DevEvent } from './event-types';
import { ReceivedEventsStore } from './received-events.store';
import { TestEndpointsGuard } from './test-endpoints.guard';

@Public()
@UseGuards(TestEndpointsGuard)
@Controller('test')
export class TestController {
  constructor(
    private readonly publisher: EventPublisherService,
    private readonly store: ReceivedEventsStore,
  ) {}

  @Post('publish')
  publish() {
    return this.publisher.publish(
      DevEvent.Ping,
      { message: 'hello from NestJS' },
      { actor: ANONYMOUS_ACTOR },
    );
  }

  @Get('events')
  events() {
    return this.store.list();
  }
}
