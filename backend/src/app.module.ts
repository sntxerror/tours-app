import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AwsModule } from './aws/aws.module';
import { LocalstackModule } from './localstack/localstack.module';
import { EventsModule } from './events/events.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), AwsModule, LocalstackModule, EventsModule],
})
export class AppModule {}
