import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { AwsModule } from './aws/aws.module';
import { EventsModule } from './events/events.module';
import { LocalstackModule } from './localstack/localstack.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    // Outside Docker the POSTGRES_* values come from the root .env; compose injects them in containers.
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../.env'] }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('POSTGRES_HOST') ?? 'localhost',
        port: Number(config.get('POSTGRES_PORT') ?? 5432),
        // Least-privilege role (APP_DB_*), not the POSTGRES_USER superuser.
        username: config.getOrThrow<string>('APP_DB_USER'),
        password: config.getOrThrow<string>('APP_DB_PASSWORD'),
        database: config.getOrThrow<string>('POSTGRES_DB'),
        autoLoadEntities: true,
        // The schema lives in db/init/*.sql (constraints, triggers); TypeORM must never alter it.
        synchronize: false,
      }),
    }),
    AwsModule,
    LocalstackModule,
    EventsModule,
    UsersModule,
    AuthModule,
  ],
})
export class AppModule {}
