import { Controller, Get, Post } from '@nestjs/common';
import { EventPublisherService } from './event-publisher.service';
import { ReceivedEventsStore } from './received-events.store';

@Controller('test')
export class TestController {
  constructor(
    private readonly publisher: EventPublisherService,
    private readonly store: ReceivedEventsStore,
  ) {}

  @Post('publish')
  publish() {
    return this.publisher.publish('travel.test.ping', { message: 'hello from NestJS' });
  }

  @Get('events')
  events() {
    return this.store.list();
  }
}
