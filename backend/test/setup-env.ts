process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://securevault:securevault@localhost:5432/securevault?schema=public';
process.env.JWT_SECRET =
  process.env.JWT_SECRET ?? 'test-secret-test-secret-test-secret-1234';
process.env.TOTP_ENC_KEY =
  process.env.TOTP_ENC_KEY ?? Buffer.alloc(32, 7).toString('base64');
process.env.WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:5173';