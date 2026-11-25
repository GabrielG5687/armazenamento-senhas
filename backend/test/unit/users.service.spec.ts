import { ConflictException } from '@nestjs/common';
import { UsersService } from '../../src/modules/users/users.service';
import type { CryptographyService } from '../../src/modules/cryptography/cryptography.service';
import type { PrismaService } from '../../src/shared/database/prisma.service';

const userId = '11111111-1111-4111-8111-111111111111';
const fingerprint = 'ABCD1234ABCD1234ABCD1234ABCD1234ABCD1234';

function buildService(overrides: {
  duplicateUserId: string | null;
  upsertCalled: boolean;
}) {
  const validated = {
    fingerprint,
    keyId: 'keyId-1',
    algorithm: 'ed25519',
    bits: 256,
    keyType: 'ecc' as const,
    uid: '<user@example.com>',
    expiresAt: null,
  };

  const cryptography = {
    validatePublicKey: jest.fn().mockResolvedValue(validated),
  } as unknown as CryptographyService;

  const prisma = {
    userPublicKey: {
      findUnique: jest.fn().mockResolvedValue(
        overrides.duplicateUserId
          ? { userId: overrides.duplicateUserId }
          : { userId },
      ),
    },
    $transaction: jest.fn().mockImplementation(async (cb: any) => {
      const tx = {
        userPublicKey: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          upsert: jest.fn().mockResolvedValue({
            id: 'key-1',
            userId,
            fingerprint,
          }),
        },
      };
      return cb(tx);
    }),
  } as unknown as PrismaService;

  const service = new UsersService(prisma, cryptography);
  return { service, prisma, cryptography };
}

describe('UsersService.addPublicKey', () => {
  it('adiciona uma nova chave para o usuário', async () => {
    const { service, prisma, cryptography } = buildService({
      duplicateUserId: null,
      upsertCalled: true,
    });

    const result = await service.addPublicKey(userId, {
      armoredPublicKey: '-----BEGIN PGP PUBLIC KEY BLOCK-----...',
    });

    expect(cryptography.validatePublicKey).toHaveBeenCalledWith(
      '-----BEGIN PGP PUBLIC KEY BLOCK-----...',
    );
    expect(result).toEqual({ fingerprint, keyId: 'keyId-1' });
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('é idempotente: re-adicionar a mesma chave própria não lança erro de unicidade', async () => {
    // O fingerprint já pertence ao mesmo usuário (duplicate.userId === userId).
    const { service, prisma } = buildService({
      duplicateUserId: userId,
      upsertCalled: true,
    });

    // Duas chamadas com a mesma chave devem retornar sucesso.
    await service.addPublicKey(userId, {
      armoredPublicKey: '-----BEGIN PGP PUBLIC KEY BLOCK-----...',
    });
    await service.addPublicKey(userId, {
      armoredPublicKey: '-----BEGIN PGP PUBLIC KEY BLOCK-----...',
    });

    // O upsert foi chamado nas duas vezes (create na primeira, update na segunda).
    const txUpsertCalls = (prisma.$transaction as jest.Mock).mock.calls;
    expect(txUpsertCalls.length).toBe(2);
  });

  it('lança ConflictException quando a chave já pertence a outro usuário', async () => {
    const { service } = buildService({
      duplicateUserId: '22222222-2222-4222-8222-222222222222',
      upsertCalled: false,
    });

    await expect(
      service.addPublicKey(userId, {
        armoredPublicKey: '-----BEGIN PGP PUBLIC KEY BLOCK-----...',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
