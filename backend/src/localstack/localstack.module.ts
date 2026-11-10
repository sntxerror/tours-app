import { Module } from '@nestjs/common';
import { LocalstackBootstrapService } from './localstack-bootstrap.service';

@Module({
  providers: [LocalstackBootstrapService],
  exports: [LocalstackBootstrapService],
})
export class LocalstackModule {}
