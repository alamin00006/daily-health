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
  changePinRequestSchema,
  guestLoginRequestSchema,
  loginWithOtpRequestSchema,
  loginWithPinRequestSchema,
  refreshTokenRequestSchema,
  resetPinRequestSchema,
  sendOtpRequestSchema,
  signupRequestSchema,
  updatePushTokenRequestSchema,
  verifyOtpRequestSchema,
  type AuthTokensResponse,
  type ChangePinRequest,
  type GuestLoginRequest,
  type LoginWithOtpRequest,
  type LoginWithPinRequest,
  type RefreshTokenRequest,
  type ResetPinRequest,
  type SendOtpRequest,
  type SendOtpResponse,
  type SignupRequest,
  type UpdatePushTokenRequest,
  type VerifyOtpRequest,
  type VerifyOtpResponse,
} from '../../shared-contracts/auth.contract.js';
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
    summary: 'Email a 6-digit code (SIGNUP, LOGIN or RESET_PIN)',
    description:
      'Always answers 202 with the same body, whether or not the email has an account.',
  })
  @ApiZodBody(sendOtpRequestSchema)
  sendOtp(
    @Body(new ZodValidationPipe(sendOtpRequestSchema)) body: SendOtpRequest,
  ): Promise<SendOtpResponse> {
    return this.auth.sendOtp(body.email, body.purpose);
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
    return this.auth.verifyOtp(body.email, body.purpose, body.code);
  }

  @PublicRoute()
  @Post('signup')
  @ApiOperation({
    summary: 'Create the account with a verified email and a 6-digit PIN',
  })
  @ApiZodBody(signupRequestSchema)
  signup(
    @Body(new ZodValidationPipe(signupRequestSchema)) body: SignupRequest,
  ): Promise<AuthTokensResponse> {
    return this.auth.signup(body.verificationToken, body.pin, body.device);
  }

  @PublicRoute()
  @LoginRateLimit()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log in with email + PIN',
    description:
      '5 wrong PINs lock PIN login for 15 minutes (doubling after that).',
  })
  @ApiZodBody(loginWithPinRequestSchema)
  login(
    @Body(new ZodValidationPipe(loginWithPinRequestSchema))
    body: LoginWithPinRequest,
  ): Promise<AuthTokensResponse> {
    return this.auth.loginWithPin(body.email, body.pin, body.device);
  }

  @PublicRoute()
  @Post('login/otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Log in with an email code (purpose LOGIN); also clears a PIN lock',
  })
  @ApiZodBody(loginWithOtpRequestSchema)
  loginWithOtp(
    @Body(new ZodValidationPipe(loginWithOtpRequestSchema))
    body: LoginWithOtpRequest,
  ): Promise<AuthTokensResponse> {
    return this.auth.loginWithOtp(body.verificationToken, body.device);
  }

  @PublicRoute()
  @Post('pin/reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Set a new PIN after verifying a RESET_PIN code; signs out other devices',
  })
  @ApiZodBody(resetPinRequestSchema)
  resetPin(
    @Body(new ZodValidationPipe(resetPinRequestSchema)) body: ResetPinRequest,
  ): Promise<AuthTokensResponse> {
    return this.auth.resetPin(body.verificationToken, body.newPin, body.device);
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
  @Post('pin/change')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Change PIN while logged in; signs out other devices',
  })
  @ApiZodBody(changePinRequestSchema)
  changePin(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(changePinRequestSchema)) body: ChangePinRequest,
  ): Promise<void> {
    return this.auth.changePin(
      user.userId,
      user.sessionId,
      body.currentPin,
      body.newPin,
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
