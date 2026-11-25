import 'dotenv/config';
import { PrismaClient, type Prisma } from '@prisma/client';
import argon2 from 'argon2';
import { readKey } from 'openpgp';

const prisma = new PrismaClient();

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@securevault.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'ChangeMe123!';

const RESOURCE_TYPES: Array<{
  slug: string;
  name: string;
  description: string;
  schema: Prisma.InputJsonValue;
}> = [
  {
    slug: 'login-password',
    name: 'Login e senha',
    description: 'Credencial de usuário e senha para um serviço web.',
    schema: {
      type: 'object',
      properties: {
        password: { type: 'string', format: 'password' },
        notes: { type: 'string' },
      },
      required: ['password'],
      additionalProperties: false,
    },
  },
  {
    slug: 'database',
    name: 'Banco de dados',
    description: 'Conexão de banco de dados.',
    schema: {
      type: 'object',
      properties: {
        host: { type: 'string' },
        port: { type: 'integer' },
        database: { type: 'string' },
        username: { type: 'string' },
        password: { type: 'string', format: 'password' },
      },
      required: ['host', 'database', 'username', 'password'],
      additionalProperties: false,
    },
  },
  {
    slug: 'server',
    name: 'Servidor',
    description: 'Acesso SSH ou administrativo a servidor.',
    schema: {
      type: 'object',
      properties: {
        host: { type: 'string' },
        port: { type: 'integer' },
        username: { type: 'string' },
        password: { type: 'string', format: 'password' },
        notes: { type: 'string' },
      },
      required: ['host', 'username', 'password'],
      additionalProperties: false,
    },
  },
  {
    slug: 'wifi',
    name: 'Rede Wi-Fi',
    description: 'Credenciais de rede sem fio.',
    schema: {
      type: 'object',
      properties: {
        ssid: { type: 'string' },
        password: { type: 'string', format: 'password' },
      },
      required: ['ssid', 'password'],
      additionalProperties: false,
    },
  },
  {
    slug: 'api-key',
    name: 'Chave de API',
    description: 'Chave de acesso a API.',
    schema: {
      type: 'object',
      properties: {
        key: { type: 'string', format: 'password' },
        label: { type: 'string' },
      },
      required: ['key'],
      additionalProperties: false,
    },
  },
  {
    slug: 'token',
    name: 'Token',
    description: 'Token opaco ou certificado.',
    schema: {
      type: 'object',
      properties: {
        token: { type: 'string', format: 'password' },
        label: { type: 'string' },
      },
      required: ['token'],
      additionalProperties: false,
    },
  },
  {
    slug: 'custom',
    name: 'Personalizado',
    description: 'Schema livre definido pelo cliente.',
    schema: {
      type: 'object',
      additionalProperties: true,
    },
  },
];

async function seedAdmin(): Promise<void> {
  const passwordHash = await argon2.hash(ADMIN_PASSWORD, { type: argon2.argon2id });

  const user = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { role: 'ADMIN', status: 'ACTIVE' },
    create: {
      email: ADMIN_EMAIL,
      passwordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
      profile: {
        create: {
          displayName: 'Administrator',
        },
      },
    },
    select: { id: true, passwordHash: true },
  });

  if (!user.passwordHash) {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });
  }

  console.log(`Admin ready: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
}

async function seedResourceTypes(): Promise<void> {
  for (const type of RESOURCE_TYPES) {
    const resourceType = await prisma.resourceType.upsert({
      where: { slug: type.slug },
      update: { name: type.name, description: type.description, isActive: true },
      create: {
        slug: type.slug,
        name: type.name,
        description: type.description,
        currentVersion: 1,
      },
      select: { id: true },
    });

    await prisma.resourceTypeVersion.upsert({
      where: {
        resourceTypeId_version: {
          resourceTypeId: resourceType.id,
          version: 1,
        },
      },
      update: { schema: type.schema, isActive: true },
      create: {
        resourceTypeId: resourceType.id,
        version: 1,
        schema: type.schema,
      },
    });
  }
  console.log(`Seeded ${RESOURCE_TYPES.length} resource types`);
}

async function seedServerKey(): Promise<void> {
  const armored = process.env.SERVER_PUBLIC_KEY;
  const expectedFingerprint = process.env.SERVER_KEY_FINGERPRINT;

  if (!armored || !expectedFingerprint) {
    console.log('SERVER_PUBLIC_KEY not configured; skipping server key seed');
    return;
  }

  if (armored.includes('PRIVATE KEY BLOCK')) {
    console.warn('SERVER_PUBLIC_KEY contains a private key; skipping seed');
    return;
  }

  try {
    const key = await readKey({ armoredKey: armored });
    if (key.isPrivate()) {
      console.warn('SERVER_PUBLIC_KEY is a private key; skipping seed');
      return;
    }
    const fingerprint = key.getFingerprint();
    await prisma.serverPublicKey.upsert({
      where: { kid: expectedFingerprint },
      update: {
        armoredPublicKey: armored,
        fingerprint,
        algorithm: key.getAlgorithmInfo().algorithm,
        isActive: true,
      },
      create: {
        kid: expectedFingerprint,
        fingerprint,
        armoredPublicKey: armored,
        algorithm: key.getAlgorithmInfo().algorithm,
        isActive: true,
      },
    });
    console.log(`Server public key seeded: ${fingerprint}`);
  } catch {
    console.warn('SERVER_PUBLIC_KEY is not a valid OpenPGP public key; skipping seed');
  }
}

async function main(): Promise<void> {
  await seedAdmin();
  await seedResourceTypes();
  await seedServerKey();
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });