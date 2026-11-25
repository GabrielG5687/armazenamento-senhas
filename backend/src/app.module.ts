import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import configuration from './shared/config/configuration';
import { validateEnv } from './shared/config/env.validation';
import { SharedModule } from './shared/shared.module';
import { RequestContextService } from './shared/context/request-context.service';
import { RequestContextMiddleware } from './shared/context/request-context.middleware';
import { AllExceptionsFilter } from './shared/filters/all-exceptions.filter';
import { LoggingInterceptor } from './shared/interceptors/logging.interceptor';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CryptographyModule } from './modules/cryptography/cryptography.module';
import { ResourceTypesModule } from './modules/resource-types/resource-types.module';
import { ResourcesModule } from './modules/resources/resources.module';
import { SecretsModule } from './modules/secrets/secrets.module';
import { FoldersModule } from './modules/folders/folders.module';
import { GroupsModule } from './modules/groups/groups.module';
import { SharingModule } from './modules/sharing/sharing.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
      envFilePath: ['.env'],
    }),
    SharedModule,
    PermissionsModule,
    AuditModule,
    AuthModule,
    UsersModule,
    CryptographyModule,
    ResourceTypesModule,
    ResourcesModule,
    SecretsModule,
    FoldersModule,
    GroupsModule,
    SharingModule,
    HealthModule,
  ],
  providers: [
    RequestContextMiddleware,
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule implements NestModule {
  constructor(private readonly requestContext: RequestContextService) {}

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}