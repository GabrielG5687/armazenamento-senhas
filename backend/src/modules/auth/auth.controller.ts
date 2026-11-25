import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto, MfaVerifyDto, TotpVerifyDto } from './dto/auth.dto';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { Public } from '../../shared/decorators/public.decorator';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../shared/types';

const REFRESH_COOKIE = 'sv_refresh';

@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth')
@UseGuards(JwtAuthGuard)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(body, {
      ip: request.ip,
      userAgent: request.header('user-agent') ?? undefined,
    });
    if (result.refreshToken && result.refreshExpiresAt) {
      this.setRefreshCookie(response, result.refreshToken, result.refreshExpiresAt);
    }
    return {
      mfaRequired: result.mfaRequired,
      ...(result.challengeToken ? { challengeToken: result.challengeToken } : {}),
      ...(result.accessToken ? { accessToken: result.accessToken } : {}),
      ...(result.user ? { user: result.user } : {}),
    };
  }

  @Public()
  @Post('mfa/verify')
  async verifyMfa(
    @Body() body: MfaVerifyDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.verifyMfa(body, {
      ip: request.ip,
      userAgent: request.header('user-agent') ?? undefined,
    });
    if (result.refreshToken && result.refreshExpiresAt) {
      this.setRefreshCookie(response, result.refreshToken, result.refreshExpiresAt);
    }
    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  @Public()
  @Post('refresh')
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = request.cookies?.[REFRESH_COOKIE];
    if (!token || typeof token !== 'string') {
      throw new UnauthorizedException('Missing refresh token');
    }
    const result = await this.auth.refresh(token);
    if (result.refreshToken && result.refreshExpiresAt) {
      this.setRefreshCookie(response, result.refreshToken, result.refreshExpiresAt);
    }
    return { accessToken: result.accessToken, user: result.user };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.auth.logout(user.sessionId, user.id);
    response.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.me(user.id);
  }

  @Post('mfa/totp/setup')
  setupTotp(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.setupTotp(user.id);
  }

  @Post('mfa/totp/verify')
  @HttpCode(204)
  async verifyTotp(
    @Body() body: TotpVerifyDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.auth.verifyTotpSetup(user.id, body.code);
  }

  @Get('sessions')
  listSessions(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.listSessions(user.id);
  }

  @Delete('sessions')
  @HttpCode(204)
  async revokeOtherSessions(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.auth.revokeOtherSessions(user.id, user.sessionId);
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  async revokeSession(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.auth.revokeSession(user.id, id);
  }

  private setRefreshCookie(response: Response, token: string, expiresAt: Date): void {
    const secure = this.config.get<boolean>('isProduction') ?? false;
    response.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure,
      sameSite: 'strict',
      path: '/api/v1/auth',
      maxAge: Math.max(0, expiresAt.getTime() - Date.now()),
    });
  }
}
