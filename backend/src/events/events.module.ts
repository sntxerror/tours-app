import { Module } from '@nestjs/common';
import { LocalstackModule } from '../localstack/localstack.module';
import { EventPublisherService } from './event-publisher.service';
import { EventConsumerService } from './event-consumer.service';
import { ReceivedEventsStore } from './received-events.store';
import { TestController } from './test.controller';

@Module({
  imports: [LocalstackModule],
  controllers: [TestController],
  providers: [EventPublisherService, EventConsumerService, ReceivedEventsStore],
  exports: [EventPublisherService],
})
export class EventsModule {}
