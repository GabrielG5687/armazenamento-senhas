import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { authenticator } from 'otplib';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { User } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { PasswordService } from '../../shared/security/password.service';
import { TotpCryptoService } from '../../shared/security/totp-crypto.service';
import { RateLimiterService } from '../../shared/security/rate-limiter.service';
import { AuditService } from '../audit/audit.service';
import type { LoginDto, MfaVerifyDto } from './dto/auth.dto';

export interface PublicUser {
  id: string;
  email: string;
  role: 'USER' | 'ADMIN';
  displayName: string | null;
  avatarUrl: string | null;
}

export interface LoginResult {
  mfaRequired: boolean;
  challengeToken?: string;
  accessToken?: string;
  refreshToken?: string;
  refreshExpiresAt?: Date;
  user?: PublicUser;
}

interface AccessTokenPayload {
  sub: string;
  sid: string;
  role: 'USER' | 'ADMIN';
  amr: string[];
}

interface ChallengePayload {
  sub: string;
  typ: 'mfa';
  jti: string;
  amr: string[];
}

function durationToSeconds(value: string, fallback: number): number {
  const match = /^(\d+)\s*(s|m|h|d)?$/.exec(value.trim());
  if (!match) {
    return fallback;
  }
  const amount = Number.parseInt(match[1], 10);
  switch (match[2]) {
    case 'm':
      return amount * 60;
    case 'h':
      return amount * 60 * 60;
    case 'd':
      return amount * 60 * 60 * 24;
    case 's':
    case undefined:
    default:
      return amount;
  }
}

@Injectable()
export class AuthService {
  private readonly usedChallenges = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly passwords: PasswordService,
    private readonly totpCrypto: TotpCryptoService,
    private readonly rateLimiter: RateLimiterService,
    private readonly audit: AuditService,
  ) {}

  async login(
    input: LoginDto,
    context: { ip?: string; userAgent?: string } = {},
  ): Promise<LoginResult> {
    const email = input.email.trim().toLowerCase();
    const ipKey = `login:ip:${context.ip ?? 'unknown'}`;
    const emailKey = `login:email:${createHash('sha256').update(email).digest('hex')}`;

    const ipLimit = this.rateLimiter.consume(ipKey);
    if (!ipLimit.allowed) {
      throw new HttpException('Too many login attempts', HttpStatus.TOO_MANY_REQUESTS);
    }
    const emailLimit = this.rateLimiter.consume(emailKey);
    if (!emailLimit.allowed) {
      throw new HttpException('Too many login attempts', HttpStatus.TOO_MANY_REQUESTS);
    }

    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });

    if (!user || !user.passwordHash) {
      await this.audit.record({
        action: 'auth.login.failed',
        targetType: 'AUTH',
        metadata: { reason: 'invalid_credentials' },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status === 'SUSPENDED' || user.status === 'DELETED') {
      await this.audit.record({
        actorId: user.id,
        action: 'auth.login.failed',
        targetType: 'USER',
        targetId: user.id,
        metadata: { reason: 'account_inactive' },
      });
      throw new ForbiddenException('Invalid credentials');
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      await this.audit.record({
        actorId: user.id,
        action: 'auth.login.failed',
        targetType: 'USER',
        targetId: user.id,
        metadata: { reason: 'account_locked' },
      });
      throw new ForbiddenException('Invalid credentials');
    }

    const valid = await this.passwords.verify(user.passwordHash, input.password);
    if (!valid) {
      await this.registerFailure(user);
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    this.rateLimiter.reset(ipKey);
    this.rateLimiter.reset(emailKey);

    const totp = await this.prisma.totpCredential.findFirst({
      where: { userId: user.id, confirmedAt: { not: null }, disabledAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (totp) {
      const challengeToken = await this.jwt.signAsync(
        {
          sub: user.id,
          typ: 'mfa',
          jti: randomUUID(),
          amr: ['pwd'],
        } satisfies ChallengePayload,
        { expiresIn: 5 * 60 },
      );
      await this.audit.record({
        actorId: user.id,
        action: 'auth.mfa.challenged',
        targetType: 'USER',
        targetId: user.id,
        metadata: { method: 'TOTP' },
      });
      return { mfaRequired: true, challengeToken };
    }

    const session = await this.createSession(user, ['pwd'], context);
    await this.audit.record({
      actorId: user.id,
      action: 'auth.login.succeeded',
      targetType: 'USER',
      targetId: user.id,
      metadata: { amr: ['pwd'] },
    });

    return {
      mfaRequired: false,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      refreshExpiresAt: session.refreshExpiresAt,
      user: await this.presentUser(user.id),
    };
  }

  async verifyMfa(
    input: MfaVerifyDto,
    context: { ip?: string; userAgent?: string } = {},
  ): Promise<LoginResult> {
    let payload: ChallengePayload;
    try {
      payload = await this.jwt.verifyAsync<ChallengePayload>(input.challengeToken);
    } catch {
      throw new UnauthorizedException('Invalid MFA challenge');
    }

    if (payload.typ !== 'mfa' || !payload.sub || !payload.jti) {
      throw new UnauthorizedException('Invalid MFA challenge');
    }

    // Rate limit MFA verification attempts by IP and user.
    const mfaIpKey = `mfa:ip:${context.ip ?? 'unknown'}`;
    const mfaUserKey = `mfa:user:${payload.sub}`;
    const mfaIpLimit = this.rateLimiter.consume(mfaIpKey);
    if (!mfaIpLimit.allowed) {
      throw new HttpException(
        'Too many MFA attempts',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const mfaUserLimit = this.rateLimiter.consume(mfaUserKey);
    if (!mfaUserLimit.allowed) {
      throw new HttpException(
        'Too many MFA attempts',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Consume the challenge BEFORE validating the code so a failed attempt
    // cannot replay the same challenge.
    const usedAt = this.usedChallenges.get(payload.jti);
    if (usedAt && usedAt > Date.now()) {
      throw new UnauthorizedException('MFA challenge already used');
    }
    this.usedChallenges.set(payload.jti, Date.now() + 5 * 60_000);
    for (const [jti, expiresAt] of this.usedChallenges.entries()) {
      if (expiresAt <= Date.now()) {
        this.usedChallenges.delete(jti);
      }
    }

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid MFA challenge');
    }

    const credential = await this.prisma.totpCredential.findFirst({
      where: { userId: user.id, confirmedAt: { not: null }, disabledAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!credential) {
      throw new UnauthorizedException('MFA is not configured');
    }

    let secret: string;
    try {
      secret = this.totpCrypto.decrypt(credential.secretEncrypted);
    } catch {
      await this.audit.record({
        actorId: user.id,
        action: 'auth.login.failed',
        targetType: 'USER',
        targetId: user.id,
        metadata: { reason: 'totp_decrypt_failed' },
      });
      throw new UnauthorizedException('Unable to process MFA code');
    }

    const currentStep = Math.floor(Date.now() / 30_000);
    if (
      credential.lastUsedStep !== null &&
      Number(credential.lastUsedStep) >= currentStep
    ) {
      throw new UnauthorizedException('MFA code already used');
    }

    const valid = authenticator.check(input.code, secret);
    if (!valid) {
      await this.audit.record({
        actorId: user.id,
        action: 'auth.login.failed',
        targetType: 'USER',
        targetId: user.id,
        metadata: { reason: 'invalid_totp' },
      });
      throw new UnauthorizedException('Invalid MFA code');
    }

    await this.prisma.totpCredential.update({
      where: { id: credential.id },
      data: { lastUsedStep: BigInt(currentStep) },
    });

    const session = await this.createSession(user, ['pwd', 'totp'], context);
    await this.audit.record({
      actorId: user.id,
      action: 'auth.mfa.verified',
      targetType: 'USER',
      targetId: user.id,
      metadata: { method: 'TOTP' },
    });
    await this.audit.record({
      actorId: user.id,
      action: 'auth.login.succeeded',
      targetType: 'USER',
      targetId: user.id,
      metadata: { amr: ['pwd', 'totp'] },
    });

    return {
      mfaRequired: false,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      refreshExpiresAt: session.refreshExpiresAt,
      user: await this.presentUser(user.id),
    };
  }

  async refresh(refreshToken: string): Promise<LoginResult> {
    const hash = createHash('sha256').update(refreshToken).digest('hex');
    const session = await this.prisma.userSession.findUnique({
      where: { refreshTokenHash: hash },
      include: { user: true },
    });

    if (
      !session ||
      session.revokedAt !== null ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (!session.user || session.user.status !== 'ACTIVE' || session.user.deletedAt) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const amr = Array.isArray(session.mfaAmr) ? (session.mfaAmr as string[]) : [];
    const rotated = randomBytes(32).toString('base64url');
    const rotatedHash = createHash('sha256').update(rotated).digest('hex');
    const refreshTtlSeconds = durationToSeconds(
      this.config.get<string>('jwtRefreshTtl') ?? '30d',
      30 * 24 * 60 * 60,
    );
    const expiresAt = new Date(Date.now() + refreshTtlSeconds * 1000);

    await this.prisma.userSession.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: rotatedHash,
        issuedAt: new Date(),
        expiresAt,
      },
    });

    const accessToken = await this.signAccessToken(
      {
        id: session.user.id,
        role: session.user.role,
      },
      session.id,
      amr,
    );

    return {
      mfaRequired: false,
      accessToken,
      refreshToken: rotated,
      refreshExpiresAt: expiresAt,
      user: await this.presentUser(session.user.id),
    };
  }

  async logout(sessionId: string, userId: string): Promise<void> {
    await this.prisma.userSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.record({
      actorId: userId,
      action: 'auth.logout',
      targetType: 'USER',
      targetId: userId,
      metadata: { sessionId },
    });
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.presentUser(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async setupTotp(userId: string) {
    const existing = await this.prisma.totpCredential.findFirst({
      where: { userId, confirmedAt: { not: null }, disabledAt: null },
    });
    if (existing) {
      throw new ForbiddenException('TOTP is already enabled');
    }

    const secret = authenticator.generateSecret();
    const encrypted = this.totpCrypto.encrypt(secret);
    await this.prisma.totpCredential.create({
      data: { userId, secretEncrypted: encrypted },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    await this.audit.record({
      actorId: userId,
      action: 'auth.mfa.setup',
      targetType: 'USER',
      targetId: userId,
    });

    return {
      secret,
      otpauthUrl: authenticator.keyuri(user?.email ?? 'user', 'SecureVault', secret),
    };
  }

  async verifyTotpSetup(userId: string, code: string): Promise<void> {
    const credential = await this.prisma.totpCredential.findFirst({
      where: { userId, confirmedAt: null, disabledAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!credential) {
      throw new NotFoundException('No pending TOTP setup');
    }

    let secret: string;
    try {
      secret = this.totpCrypto.decrypt(credential.secretEncrypted);
    } catch {
      await this.audit.record({
        actorId: userId,
        action: 'auth.mfa.setup.failed',
        targetType: 'USER',
        targetId: userId,
        metadata: { reason: 'totp_decrypt_failed' },
      });
      throw new UnauthorizedException('Unable to process MFA code');
    }

    if (!authenticator.check(code, secret)) {
      throw new UnauthorizedException('Invalid MFA code');
    }

    await this.prisma.$transaction([
      this.prisma.totpCredential.update({
        where: { id: credential.id },
        data: { confirmedAt: new Date(), lastUsedStep: BigInt(Math.floor(Date.now() / 30_000)) },
      }),
      this.prisma.totpCredential.updateMany({
        where: {
          userId,
          id: { not: credential.id },
          confirmedAt: { not: null },
          disabledAt: null,
        },
        data: { disabledAt: new Date() },
      }),
    ]);

    await this.audit.record({
      actorId: userId,
      action: 'auth.mfa.enabled',
      targetType: 'USER',
      targetId: userId,
      metadata: { method: 'TOTP' },
    });
  }

  async listSessions(userId: string) {
    const sessions = await this.prisma.userSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { issuedAt: 'desc' },
      select: {
        id: true,
        ip: true,
        userAgent: true,
        issuedAt: true,
        expiresAt: true,
      },
    });
    return sessions;
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const result = await this.prisma.userSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) {
      throw new NotFoundException('Session not found');
    }
  }

  async revokeOtherSessions(userId: string, currentSessionId: string): Promise<void> {
    await this.prisma.userSession.updateMany({
      where: { userId, revokedAt: null, id: { not: currentSessionId } },
      data: { revokedAt: new Date() },
    });
  }

  private async registerFailure(user: User): Promise<void> {
    const failures = user.failedLoginCount + 1;
    const backoffMinutes = [1, 5, 15, 60][Math.min(failures, 4) - 1] ?? 60;
    const locked = failures >= 5;
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: failures,
        lockedUntil: locked ? new Date(Date.now() + backoffMinutes * 60_000) : null,
      },
    });
    await this.audit.record({
      actorId: user.id,
      action: 'auth.login.failed',
      targetType: 'USER',
      targetId: user.id,
      metadata: { reason: 'invalid_password', attempts: failures },
    });
  }

  private async createSession(
    user: Pick<User, 'id' | 'email' | 'role'>,
    amr: string[],
    context: { ip?: string; userAgent?: string },
  ): Promise<{ accessToken: string; refreshToken: string; refreshExpiresAt: Date }> {
    const refreshTtlSeconds = durationToSeconds(
      this.config.get<string>('jwtRefreshTtl') ?? '30d',
      30 * 24 * 60 * 60,
    );
    const expiresAt = new Date(Date.now() + refreshTtlSeconds * 1000);

    const activeSessions = await this.prisma.userSession.count({
      where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    if (activeSessions >= 10) {
      const oldest = await this.prisma.userSession.findFirst({
        where: { userId: user.id, revokedAt: null },
        orderBy: { issuedAt: 'asc' },
        select: { id: true },
      });
      if (oldest) {
        await this.prisma.userSession.update({
          where: { id: oldest.id },
          data: { revokedAt: new Date() },
        });
      }
    }

    const refreshToken = randomBytes(32).toString('base64url');
    const refreshTokenHash = createHash('sha256').update(refreshToken).digest('hex');

    const session = await this.prisma.userSession.create({
      data: {
        userId: user.id,
        refreshTokenHash,
        ip: context.ip ?? null,
        userAgent: context.userAgent ?? null,
        mfaAmr: amr,
        issuedAt: new Date(),
        expiresAt,
      },
    });

    const accessToken = await this.signAccessToken(user, session.id, amr);
    return { accessToken, refreshToken, refreshExpiresAt: expiresAt };
  }

  private async signAccessToken(
    user: Pick<User, 'id' | 'role'>,
    sessionId: string,
    amr: string[],
  ): Promise<string> {
    const ttl = durationToSeconds(
      this.config.get<string>('jwtAccessTtl') ?? '15m',
      15 * 60,
    );
    const payload: AccessTokenPayload = {
      sub: user.id,
      sid: sessionId,
      role: user.role,
      amr,
    };
    return this.jwt.signAsync(payload, { expiresIn: ttl });
  }

  private async presentUser(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: { profile: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      displayName: user.profile?.displayName ?? null,
      avatarUrl: user.profile?.avatarUrl ?? null,
    };
  }
}