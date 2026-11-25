export interface AppConfig {
  nodeEnv: string;
  port: number;
  webOrigin: string;
  databaseUrl: string;
  jwtSecret: string;
  jwtAccessTtl: string;
  jwtRefreshTtl: string;
  totpEncKey: string;
  serverPublicKey: string;
  serverKeyFingerprint: string;
  maxEnvelopeBytes: number;
  maxSecretBytes: number;
  loginRateLimitWindowMs: number;
  loginRateLimitMax: number;
  isProduction: boolean;
}

function intEnv(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default (): AppConfig => {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  return {
    nodeEnv,
    isProduction: nodeEnv === 'production',
    port: intEnv(process.env.PORT, 3000),
    webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
    databaseUrl: process.env.DATABASE_URL ?? '',
    jwtSecret: process.env.JWT_SECRET ?? '',
    jwtAccessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    jwtRefreshTtl: process.env.JWT_REFRESH_TTL ?? '30d',
    totpEncKey: process.env.TOTP_ENC_KEY ?? '',
    serverPublicKey: process.env.SERVER_PUBLIC_KEY ?? '',
    serverKeyFingerprint: process.env.SERVER_KEY_FINGERPRINT ?? '',
    maxEnvelopeBytes: intEnv(process.env.MAX_ENVELOPE_BYTES, 256 * 1024),
    maxSecretBytes: intEnv(process.env.MAX_SECRET_BYTES, 1024 * 1024),
    loginRateLimitWindowMs: intEnv(process.env.LOGIN_RATE_LIMIT_WINDOW_MS, 60_000),
    loginRateLimitMax: intEnv(process.env.LOGIN_RATE_LIMIT_MAX, 5),
  };
};