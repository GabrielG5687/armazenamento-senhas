import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SecretsService } from '../../src/modules/secrets/secrets.service';
import type { PrismaService } from '../../src/shared/database/prisma.service';
import type { PermissionsService } from '../../src/modules/permissions/permissions.service';
import type { CryptographyService } from '../../src/modules/cryptography/cryptography.service';
import type { AuditService } from '../../src/modules/audit/audit.service';

const resourceId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';

const envelope = {
  userId,
  keyFingerprint: 'ABCD1234ABCD1234ABCD1234ABCD1234ABCD1234',
  armoredMessage:
    '-----BEGIN PGP MESSAGE-----\n\nhQEMA0000000000000000000000000000000000000000\n=abcd\n-----END PGP MESSAGE-----',
  checksum: 'sha256:deadbeef',
};

function buildService(overrides: {
  createThrowsP2002: boolean;
  maxVersion: number | null;
}) {
  const permissions = {
    assertCan: jest.fn().mockResolvedValue(undefined),
    assertHasOwner: jest.fn().mockResolvedValue(undefined),
  } as unknown as PermissionsService;

  const cryptography = {
    getActiveKeys: jest.fn().mockResolvedValue(
      new Map([
        [
          userId,
          { fingerprint: envelope.keyFingerprint, armoredPublicKey: 'pub' },
        ],
      ]),
    ),
    validateEnvelope: jest.fn().mockReturnValue({ ok: true }),
  } as unknown as CryptographyService;

  const audit = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as AuditService;

  const prisma = {
    resourcePermission: {
      findMany: jest.fn().mockResolvedValue([
        { aroType: 'USER', aroId: userId },
      ]),
    },
    groupMember: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    user: {
      findMany: jest.fn().mockResolvedValue([{ id: userId }]),
    },
    resourceSecret: {
      aggregate: jest.fn().mockResolvedValue({ _max: { version: overrides.maxVersion ?? 0 } }),
    },
    resource: {
      update: jest.fn().mockResolvedValue({ id: resourceId }),
    },
    $transaction: jest.fn().mockImplementation(async (cb: any) => {
      const tx = {
        resource: {
          update: jest.fn().mockResolvedValue({ id: resourceId }),
        },
        resourceSecret: {
          aggregate: jest.fn().mockResolvedValue({
            _max: { version: overrides.maxVersion ?? 0 },
          }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          create: overrides.createThrowsP2002
            ? jest.fn().mockRejectedValue(
                new Prisma.PrismaClientKnownRequestError(
                  'Unique constraint',
                  { code: 'P2002', clientVersion: '6.2.1' },
                ),
              )
            : jest.fn().mockResolvedValue({
                id: 'secret-1',
                resourceId,
                version: (overrides.maxVersion ?? 0) + 1,
              }),
        },
        resourceSecretRecipient: {
          deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      };
      return cb(tx);
    }),
  } as unknown as PrismaService;

  const service = new SecretsService(
    prisma,
    permissions,
    cryptography,
    audit,
  );
  return { service, prisma, permissions, cryptography, audit };
}

describe('SecretsService.createVersion', () => {
  const input = {
    version: 1,
    formatVersion: 'sv1',
    envelopes: [envelope],
  };

  it('cria uma nova versão quando o número de versão está correto', async () => {
    const { service, prisma } = buildService({
      createThrowsP2002: false,
      maxVersion: 0,
    });

    const result = await service.createVersion(userId, resourceId, input);

    expect(result.version).toBe(1);
    // A alocação de versão agora ocorre dentro da transação.
    expect(prisma.resource.aggregate).toBeUndefined();
  });

  it('converte erro de unicidade (P2002) em ConflictException em vez de 500', async () => {
    // Simula duas requisições concorrentes: a segunda tenta criar a mesma
    // versão e recebe P2002 do banco.
    const { service } = buildService({
      createThrowsP2002: true,
      maxVersion: 0,
    });

    await expect(
      service.createVersion(userId, resourceId, input),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('lança ConflictException quando a versão informada não é a próxima esperada', async () => {
    const { service } = buildService({
      createThrowsP2002: false,
      maxVersion: 5,
    });
    // input.version = 1, mas o próximo esperado é 6.
    await expect(
      service.createVersion(userId, resourceId, {
        ...input,
        version: 1,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('lança UnprocessableEntityException quando não há destinatários', async () => {
    const { service, prisma } = buildService({
      createThrowsP2002: false,
      maxVersion: 0,
    });
    // Sobrescreve findMany para não retornar permissões.
    (prisma.resourcePermission.findMany as jest.Mock).mockResolvedValue([]);

    await expect(
      service.createVersion(userId, resourceId, input),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});
