import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { SQSClient } from '@aws-sdk/client-sqs';
import { EVENTBRIDGE_CLIENT, SQS_CLIENT } from './aws.tokens';

/**
 * Single place where AWS SDK clients are built. Every client is pinned to
 * AWS_ENDPOINT_URL (LocalStack) so no traffic can reach a real AWS region.
 * `commoneventframework` only depends on client-ssm; if SSM is enabled
 * (PARAMETER_STORE_ENABLED) it honours the same AWS_ENDPOINT_URL env var.
 */
function clientConfig(config: ConfigService) {
  return {
    endpoint: config.getOrThrow<string>('AWS_ENDPOINT_URL'),
    region: config.get<string>('AWS_REGION', 'eu-west-1'),
    credentials: {
      accessKeyId: config.get<string>('AWS_ACCESS_KEY_ID', 'test'),
      secretAccessKey: config.get<string>('AWS_SECRET_ACCESS_KEY', 'test'),
    },
    maxAttempts: 3,
  };
}

@Global()
@Module({
  providers: [
    {
      provide: EVENTBRIDGE_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => new EventBridgeClient(clientConfig(config)),
    },
    {
      provide: SQS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => new SQSClient(clientConfig(config)),
    },
  ],
  exports: [EVENTBRIDGE_CLIENT, SQS_CLIENT],
})
export class AwsModule {}
