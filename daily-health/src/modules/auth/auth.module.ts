import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AppConfigService } from '../../core/config/app-config.service.js';
import { AccessTokenGuard } from './access-token.guard.js';
import { AuthSessionsService } from './auth-sessions.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { OtpCodesService } from './otp-codes.service.js';
import { PinHashingService } from './pin-hashing.service.js';
import { UserAccountsService } from './user-accounts.service.js';
import { UserContactPointsService } from './user-contact-points.service.js';
import { VerificationTokensService } from './verification-tokens.service.js';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        secret: config.auth.jwtSecret,
        signOptions: { algorithm: 'HS256', issuer: 'daily-health' },
        verifyOptions: { algorithms: ['HS256'], issuer: 'daily-health' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthSessionsService,
    OtpCodesService,
    PinHashingService,
    VerificationTokensService,
    UserAccountsService,
    UserContactPointsService,
    // Global: every route requires a token unless @PublicRoute().
    { provide: APP_GUARD, useClass: AccessTokenGuard },
  ],
  exports: [UserAccountsService, UserContactPointsService],
})
export class AuthModule {}
