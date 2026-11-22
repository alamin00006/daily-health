import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  PublicRoute,
} from '../../common/auth/auth-route.decorators.js';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { LoginRateLimit } from '../../common/decorators/login-rate-limit.decorator.js';
import { OtpRateLimit } from '../../common/decorators/otp-rate-limit.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { ApiZodBody } from '../../common/swagger/api-zod-body.decorator.js';
import {
  changePasswordRequestSchema,
  guestLoginRequestSchema,
  loginWithOtpRequestSchema,
  loginWithPasswordRequestSchema,
  refreshTokenRequestSchema,
  resetPasswordRequestSchema,
  sendOtpRequestSchema,
  signupRequestSchema,
  updatePushTokenRequestSchema,
  verifyOtpRequestSchema,
  type AuthTokensResponse,
  type ChangePasswordRequest,
  type GuestLoginRequest,
  type LoginWithOtpRequest,
  type LoginWithPasswordRequest,
  type RefreshTokenRequest,
  type ResetPasswordRequest,
  type SendOtpRequest,
  type SendOtpResponse,
  type SignupRequest,
  type UpdatePushTokenRequest,
  type VerifyOtpRequest,
  type VerifyOtpResponse,
} from '../../shared-contracts/auth.contract.js';
import { accountIdentifierOf } from './account-identifier.js';
import { AuthService } from './auth.service.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @PublicRoute()
  @OtpRateLimit()
  @Post('otp/send')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Send a 6-digit code by email or SMS (SIGNUP, LOGIN or RESET_PASSWORD)',
    description:
      'Give email or phone. Always answers 202 with the same body, whether or not it has an account. SMS_NOT_AVAILABLE (503) while no SMS gateway is set.',
  })
  @ApiZodBody(sendOtpRequestSchema)
  sendOtp(
    @Body(new ZodValidationPipe(sendOtpRequestSchema)) body: SendOtpRequest,
  ): Promise<SendOtpResponse> {
    return this.auth.sendOtp(accountIdentifierOf(body), body.purpose);
  }

  @PublicRoute()
  @OtpRateLimit()
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Check the code; returns a single-use verification token',
  })
  @ApiZodBody(verifyOtpRequestSchema)
  verifyOtp(
    @Body(new ZodValidationPipe(verifyOtpRequestSchema)) body: VerifyOtpRequest,
  ): Promise<VerifyOtpResponse> {
    return this.auth.verifyOtp(accountIdentifierOf(body), body.purpose, body.code);
  }

  @PublicRoute()
  @Post('signup')
  @ApiOperation({
    summary: 'Create the account with a verified email or phone and a password',
  })
  @ApiZodBody(signupRequestSchema)
  signup(
    @Body(new ZodValidationPipe(signupRequestSchema)) body: SignupRequest,
  ): Promise<AuthTokensResponse> {
    return this.auth.signup(body.verificationToken, body.password, body.device);
  }

  @PublicRoute()
  @LoginRateLimit()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log in with email or phone + password',
    description:
      '5 wrong passwords lock password login for 15 minutes (doubling after that).',
  })
  @ApiZodBody(loginWithPasswordRequestSchema)
  login(
    @Body(new ZodValidationPipe(loginWithPasswordRequestSchema))
    body: LoginWithPasswordRequest,
  ): Promise<AuthTokensResponse> {
    return this.auth.loginWithPassword(accountIdentifierOf(body), body.password, body.device);
  }

  @PublicRoute()
  @Post('login/otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Log in with an email / SMS code (purpose LOGIN); also clears a password lock',
  })
  @ApiZodBody(loginWithOtpRequestSchema)
  loginWithOtp(
    @Body(new ZodValidationPipe(loginWithOtpRequestSchema))
    body: LoginWithOtpRequest,
  ): Promise<AuthTokensResponse> {
    return this.auth.loginWithOtp(body.verificationToken, body.device);
  }

  @PublicRoute()
  @Post('password/reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Set a new password after verifying a RESET_PASSWORD code; signs out other devices',
  })
  @ApiZodBody(resetPasswordRequestSchema)
  resetPassword(
    @Body(new ZodValidationPipe(resetPasswordRequestSchema)) body: ResetPasswordRequest,
  ): Promise<AuthTokensResponse> {
    return this.auth.resetPassword(body.verificationToken, body.newPassword, body.device);
  }

  @PublicRoute()
  @Post('guest')
  @ApiOperation({ summary: 'Browse as a guest (no health profiles)' })
  @ApiZodBody(guestLoginRequestSchema)
  guest(
    @Body(new ZodValidationPipe(guestLoginRequestSchema))
    body: GuestLoginRequest,
  ): Promise<AuthTokensResponse> {
    return this.auth.loginAsGuest(body.device);
  }

  @PublicRoute()
  @LoginRateLimit()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Swap a refresh token for new tokens (rotation)' })
  @ApiZodBody(refreshTokenRequestSchema)
  refresh(
    @Body(new ZodValidationPipe(refreshTokenRequestSchema))
    body: RefreshTokenRequest,
  ): Promise<AuthTokensResponse> {
    return this.auth.refresh(body.refreshToken);
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'End this session' })
  logout(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.auth.logout(user.sessionId);
  }

  @ApiBearerAuth()
  @LoginRateLimit()
  @Post('password/change')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Change password while logged in; signs out other devices',
  })
  @ApiZodBody(changePasswordRequestSchema)
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(changePasswordRequestSchema)) body: ChangePasswordRequest,
  ): Promise<void> {
    return this.auth.changePassword(
      user.userId,
      user.sessionId,
      body.currentPassword,
      body.newPassword,
    );
  }

  @ApiBearerAuth()
  @Put('device/push-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Set or clear this device's Expo push token" })
  @ApiZodBody(updatePushTokenRequestSchema)
  updatePushToken(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updatePushTokenRequestSchema))
    body: UpdatePushTokenRequest,
  ): Promise<void> {
    return this.auth.updatePushToken(user.sessionId, body.pushToken);
  }
}
