import { validateEnv } from '../../src/shared/config/env.validation';

describe('validateEnv', () => {
  const baseConfig = {
    DATABASE_URL: 'postgresql://securevault:securevault@localhost:5432/securevault',
    JWT_SECRET: 'test-secret-test-secret-test-secret-1234',
    JWT_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----',
    JWT_PUBLIC_KEY: '-----BEGIN PUBLIC KEY-----\nfake\n-----END PUBLIC KEY-----',
    NODE_ENV: 'test',
  };

  it('não lança erro quando todas as variáveis obrigatórias estão presentes', () => {
    expect(() => validateEnv({ ...baseConfig })).not.toThrow();
  });

  it('lança erro quando JWT_PRIVATE_KEY está ausente', () => {
    const { JWT_PRIVATE_KEY, ...config } = baseConfig;
    expect(() =>
      validateEnv({ ...config, NODE_ENV: 'production' }),
    ).toThrow(/JWT_PRIVATE_KEY is required in production/);
  });

  it('lança erro quando JWT_PUBLIC_KEY está ausente', () => {
    const { JWT_PUBLIC_KEY, ...config } = baseConfig;
    expect(() =>
      validateEnv({ ...config, NODE_ENV: 'production' }),
    ).toThrow(/JWT_PUBLIC_KEY is required in production/);
  });

  it('lança erro quando DATABASE_URL está ausente', () => {
    const { DATABASE_URL, ...config } = baseConfig;
    expect(() => validateEnv(config)).toThrow(/DATABASE_URL is required/);
  });

  it('lança erro quando JWT_SECRET é muito curto', () => {
    expect(() =>
      validateEnv({ ...baseConfig, JWT_SECRET: 'short' }),
    ).toThrow(/JWT_SECRET must contain at least 32 characters/);
  });
});
