import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsModule } from '../events/events.module';
import { AuditController } from './audit.controller';
import { AuditLog } from './audit-log.entity';
import { AuditService } from './audit.service';
import { AuditSubscriber } from './audit.subscriber';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLog]), EventsModule],
  controllers: [AuditController],
  providers: [AuditService, AuditSubscriber],
})
export class AuditModule {}
