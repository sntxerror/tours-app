import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LocalstackModule } from '../localstack/localstack.module';
import { DevEventLogSubscriber } from './dev-event-log.subscriber';
import { EventConsumerService } from './event-consumer.service';
import { EventPublisherService } from './event-publisher.service';
import { EventRouter } from './event-router.service';
import { OutboxEvent } from './outbox/outbox-event.entity';
import { OutboxRelayService } from './outbox/outbox-relay.service';
import { OutboxService } from './outbox/outbox.service';
import { ReceivedEventsStore } from './received-events.store';
import { TestEndpointsGuard } from './test-endpoints.guard';
import { TestController } from './test.controller';

@Module({
  imports: [LocalstackModule, TypeOrmModule.forFeature([OutboxEvent])],
  controllers: [TestController],
  providers: [
    EventPublisherService,
    OutboxService,
    OutboxRelayService,
    EventRouter,
    EventConsumerService,
    ReceivedEventsStore,
    DevEventLogSubscriber,
    TestEndpointsGuard,
  ],
  exports: [OutboxService, EventRouter],
})
export class EventsModule {}
