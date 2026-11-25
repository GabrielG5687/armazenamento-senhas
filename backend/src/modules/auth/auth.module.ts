import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PasswordService } from '../../shared/security/password.service';
import { TotpCryptoService } from '../../shared/security/totp-crypto.service';
import { RateLimiterService } from '../../shared/security/rate-limiter.service';
import { AuditModule } from '../audit/audit.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [
    AuditModule,
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwtSecret'),
        signOptions: { algorithm: 'HS256' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    PasswordService,
    TotpCryptoService,
    AuthService,
    {
      provide: RateLimiterService,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new RateLimiterService(
          config.get<number>('loginRateLimitWindowMs') ?? 60_000,
          config.get<number>('loginRateLimitMax') ?? 5,
        ),
    },
  ],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}