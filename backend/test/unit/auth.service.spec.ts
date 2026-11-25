jest.mock('otplib', () => ({
  authenticator: {
    check: jest.fn(),
    generateSecret: jest.fn(),
  },
}));

import {
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import { AuthService } from '../../src/modules/auth/auth.service';
import type { AuditService } from '../../src/modules/audit/audit.service';
import type { PasswordService } from '../../src/shared/security/password.service';
import type { RateLimiterService } from '../../src/shared/security/rate-limiter.service';
import type { TotpCryptoService } from '../../src/shared/security/totp-crypto.service';
import type { PrismaService } from '../../src/shared/database/prisma.service';
import { authenticator } from 'otplib';

const user = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'user@example.com',
  passwordHash: 'argon2-hash',
  role: 'USER' as const,
  status: 'ACTIVE' as const,
  failedLoginCount: 0,
  lockedUntil: null,
  lastLoginAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

function buildService(overrides: {
  passwordValid: boolean;
  totpConfirmed: boolean;
}) {
  const prisma = {
    user: {
      findFirst: jest.fn().mockResolvedValue(user),
      update: jest.fn().mockResolvedValue(user),
    },
    totpCredential: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          overrides.totpConfirmed
            ? {
                id: 'totp-1',
                userId: user.id,
                secretEncrypted: 'encrypted',
                confirmedAt: new Date(),
                disabledAt: null,
              }
            : null,
        ),
    },
    userSession: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({
        id: '22222222-2222-4222-8222-222222222222',
      }),
    },
  } as unknown as PrismaService;

  const jwt = {
    signAsync: jest.fn().mockResolvedValue('signed-token'),
    verifyAsync: jest.fn(),
  } as unknown as JwtService;

  const config = {
    get: jest.fn().mockReturnValue('15m'),
  } as unknown as ConfigService;

  const passwords = {
    verify: jest.fn().mockResolvedValue(overrides.passwordValid),
  } as unknown as PasswordService;

  const totpCrypto = {
    decrypt: jest.fn().mockReturnValue('TOTPSECRET'),
  } as unknown as TotpCryptoService;

  const rateLimiter = {
    consume: jest.fn().mockReturnValue({ allowed: true, retryAfterMs: 0 }),
    reset: jest.fn(),
  } as unknown as RateLimiterService;

  const audit = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as AuditService;

  return {
    service: new AuthService(
      prisma,
      jwt,
      config,
      passwords,
      totpCrypto,
      rateLimiter,
      audit,
    ),
    prisma,
    audit,
  };
}

describe('AuthService.login', () => {
  it('returns credentials-invalid for a wrong password without revealing account details', async () => {
    const { service, audit } = buildService({ passwordValid: false, totpConfirmed: false });

    await expect(
      service.login({ email: user.email, password: 'wrong' }, { ip: '127.0.0.1' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.login.failed' }),
    );
  });

  it('asks for MFA when a confirmed TOTP credential exists', async () => {
    const { service } = buildService({ passwordValid: true, totpConfirmed: true });

    const result = await service.login(
      { email: user.email, password: 'correct' },
      { ip: '127.0.0.1' },
    );

    expect(result.mfaRequired).toBe(true);
    expect(result.challengeToken).toBe('signed-token');
    expect(result.accessToken).toBeUndefined();
  });

  it('issues an access token and session when MFA is not configured', async () => {
    const { service, prisma } = buildService({ passwordValid: true, totpConfirmed: false });

    const result = await service.login(
      { email: user.email, password: 'correct' },
      { ip: '127.0.0.1' },
    );

    expect(result.mfaRequired).toBe(false);
    expect(result.accessToken).toBe('signed-token');
    expect(result.refreshToken).toBeDefined();
    expect(prisma.userSession.create).toHaveBeenCalled();
  });
});

describe('AuthService.verifyMfa', () => {
  const challengePayload = {
    sub: user.id,
    typ: 'mfa' as const,
    jti: 'challenge-1',
    amr: ['pwd'] as string[],
  };

  function buildVerifyMfaService(overrides: {
    rateLimitAllowed: boolean;
    totpValid: boolean;
    challengeAlreadyUsed: boolean;
  }) {
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue(user),
      },
      totpCredential: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'totp-1',
          userId: user.id,
          secretEncrypted: 'encrypted',
          confirmedAt: new Date(),
          disabledAt: null,
          lastUsedStep: null,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      userSession: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({
          id: '22222222-2222-4222-8222-222222222222',
        }),
      },
    } as unknown as PrismaService;

    const jwt = {
      signAsync: jest.fn().mockResolvedValue('access-token'),
      verifyAsync: jest.fn().mockResolvedValue(challengePayload),
    } as unknown as JwtService;

    const config = {
      get: jest.fn().mockReturnValue('15m'),
    } as unknown as ConfigService;

    const totpCrypto = {
      decrypt: jest.fn().mockReturnValue('TOTPSECRET'),
    } as unknown as TotpCryptoService;

    const rateLimiter = {
      consume: jest
        .fn()
        .mockReturnValue({
          allowed: overrides.rateLimitAllowed,
          retryAfterMs: 0,
        }),
      reset: jest.fn(),
    } as unknown as RateLimiterService;

    const audit = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuditService;

    (authenticator.check as jest.Mock).mockReturnValue(overrides.totpValid);

    if (overrides.challengeAlreadyUsed) {
      // Simula que o desafio já foi consumido em uma tentativa anterior.
      const service = new AuthService(
        prisma,
        jwt,
        config,
        { verify: jest.fn().mockResolvedValue(true) } as unknown as PasswordService,
        totpCrypto,
        rateLimiter,
        audit,
      );
      // Força o desafio como já usado no mapa de memória do serviço.
      (service as any).usedChallenges.set(
        challengePayload.jti,
        Date.now() + 5 * 60_000,
      );
      return { service, prisma, jwt, rateLimiter, audit, totpCrypto };
    }

    const service = new AuthService(
      prisma,
      jwt,
      config,
      { verify: jest.fn().mockResolvedValue(true) } as unknown as PasswordService,
      totpCrypto,
      rateLimiter,
      audit,
    );
    return { service, prisma, jwt, rateLimiter, audit, totpCrypto };
  }

  it('rejects when rate limit is exceeded (IP)', async () => {
    const { service, rateLimiter } = buildVerifyMfaService({
      rateLimitAllowed: false,
      totpValid: true,
      challengeAlreadyUsed: false,
    });

    await expect(
      service.verifyMfa(
        { challengeToken: 'token', code: '123456' },
        { ip: '127.0.0.1' },
      ),
    ).rejects.toBeInstanceOf(HttpException);

    expect(rateLimiter.consume).toHaveBeenCalled();
  });

  it('consumes the challenge on a failed attempt and rejects reuse', async () => {
    const { service, rateLimiter } = buildVerifyMfaService({
      rateLimitAllowed: true,
      totpValid: false,
      challengeAlreadyUsed: false,
    });

    // Primeira tentativa com código inválido: consome o desafio e falha.
    await expect(
      service.verifyMfa(
        { challengeToken: 'token', code: '000000' },
        { ip: '127.0.0.1' },
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    // Segunda tentativa com o mesmo desafio: deve ser rejeitada (replay).
    await expect(
      service.verifyMfa(
        { challengeToken: 'token', code: '123456' },
        { ip: '127.0.0.1' },
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    // O rate limiter foi chamado para ambas as tentativas.
    expect(rateLimiter.consume).toHaveBeenCalledTimes(4);
  });

  it('rejects a challenge already used before any validation', async () => {
    const { service } = buildVerifyMfaService({
      rateLimitAllowed: true,
      totpValid: true,
      challengeAlreadyUsed: true,
    });

    await expect(
      service.verifyMfa(
        { challengeToken: 'token', code: '123456' },
        { ip: '127.0.0.1' },
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('issues tokens when MFA code is valid and challenge is fresh', async () => {
    const { service, prisma, jwt } = buildVerifyMfaService({
      rateLimitAllowed: true,
      totpValid: true,
      challengeAlreadyUsed: false,
    });

    const result = await service.verifyMfa(
      { challengeToken: 'token', code: '123456' },
      { ip: '127.0.0.1' },
    );

    expect(result.mfaRequired).toBe(false);
    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
    expect(jwt.verifyAsync).toHaveBeenCalledWith('token');
    expect(prisma.totpCredential.update).toHaveBeenCalled();
  });

  it('rejects with clear error when TOTP decryption fails', async () => {
    const { service, totpCrypto, audit } = buildVerifyMfaService({
      rateLimitAllowed: true,
      totpValid: true,
      challengeAlreadyUsed: false,
    });
    (totpCrypto.decrypt as jest.Mock).mockImplementation(() => {
      throw new Error('GCM tag mismatch');
    });

    await expect(
      service.verifyMfa(
        { challengeToken: 'token', code: '123456' },
        { ip: '127.0.0.1' },
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.login.failed',
        metadata: expect.objectContaining({ reason: 'totp_decrypt_failed' }),
      }),
    );
  });
});

describe('AuthService.verifyTotpSetup', () => {
  const userId = user.id;

  function buildVerifyTotpSetupService(overrides: {
    totpValid: boolean;
    decryptFails: boolean;
  }) {
    const prisma = {
      $transaction: jest.fn().mockImplementation(async (calls: any[]) => {
        const results = [];
        for (const call of calls) {
          results.push(await call);
        }
        return results;
      }),
      totpCredential: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'totp-1',
          userId,
          secretEncrypted: 'encrypted',
          confirmedAt: null,
          disabledAt: null,
        }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    } as unknown as PrismaService;

    const totpCrypto = {
      decrypt: jest.fn().mockReturnValue('TOTPSECRET'),
    } as unknown as TotpCryptoService;

    const audit = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuditService;

    (authenticator.check as jest.Mock).mockReturnValue(overrides.totpValid);
    if (overrides.decryptFails) {
      (totpCrypto.decrypt as jest.Mock).mockImplementation(() => {
        throw new Error('GCM tag mismatch');
      });
    }

    const service = new AuthService(
      prisma,
      { signAsync: jest.fn(), verifyAsync: jest.fn() } as unknown as JwtService,
      { get: jest.fn().mockReturnValue('15m') } as unknown as ConfigService,
      { verify: jest.fn().mockResolvedValue(true) } as unknown as PasswordService,
      totpCrypto,
      { consume: jest.fn().mockReturnValue({ allowed: true, retryAfterMs: 0 }), reset: jest.fn() } as unknown as RateLimiterService,
      audit,
    );
    return { service, prisma, totpCrypto, audit };
  }

  it('confirma setup TOTP quando o código é válido', async () => {
    const { service, prisma, audit } = buildVerifyTotpSetupService({
      totpValid: true,
      decryptFails: false,
    });

    await service.verifyTotpSetup(userId, '123456');

    expect(prisma.totpCredential.update).toHaveBeenCalledWith({
      where: { id: 'totp-1' },
      data: expect.objectContaining({ confirmedAt: expect.any(Date) }),
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.mfa.enabled' }),
    );
  });

  it('rejects com erro claro quando descriptografia TOTP falha no setup', async () => {
    const { service, audit } = buildVerifyTotpSetupService({
      totpValid: true,
      decryptFails: true,
    });

    await expect(
      service.verifyTotpSetup(userId, '123456'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.mfa.setup.failed',
        metadata: expect.objectContaining({ reason: 'totp_decrypt_failed' }),
      }),
    );
  });
});