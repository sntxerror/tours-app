import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsModule } from '../events/events.module';
import { NotificationsSubscriber } from './notifications.subscriber';
import { TeamController } from './team.controller';
import { VacationExpiryService } from './vacation-expiry.service';
import { VacationEventsPublisher } from './vacation-events.publisher';
import { VacationRequest } from './vacation-request.entity';
import { VacationRequestsController } from './vacation-requests.controller';
import { VacationRequestsService } from './vacation-requests.service';

@Module({
  imports: [TypeOrmModule.forFeature([VacationRequest]), EventsModule],
  controllers: [VacationRequestsController, TeamController],
  providers: [
    VacationRequestsService,
    VacationEventsPublisher,
    VacationExpiryService,
    NotificationsSubscriber,
  ],
})
export class VacationRequestsModule {}
