export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const errors: string[] = [];

  if (!config.DATABASE_URL || typeof config.DATABASE_URL !== 'string') {
    errors.push('DATABASE_URL is required');
  }
  if (!config.JWT_SECRET || String(config.JWT_SECRET).length < 32) {
    errors.push('JWT_SECRET must contain at least 32 characters');
  }

  const isProduction = config.NODE_ENV === 'production';

  if (isProduction && (!config.JWT_PRIVATE_KEY || typeof config.JWT_PRIVATE_KEY !== 'string')) {
    errors.push('JWT_PRIVATE_KEY is required in production');
  }
  if (isProduction && (!config.JWT_PUBLIC_KEY || typeof config.JWT_PUBLIC_KEY !== 'string')) {
    errors.push('JWT_PUBLIC_KEY is required in production');
  }

  if (config.TOTP_ENC_KEY) {
    const key = Buffer.from(String(config.TOTP_ENC_KEY), 'base64');
    if (key.length !== 32) {
      errors.push('TOTP_ENC_KEY must decode to exactly 32 bytes (base64)');
    }
  } else if (config.NODE_ENV === 'production') {
    errors.push('TOTP_ENC_KEY is required in production');
  }

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration: ${errors.join('; ')}`);
  }

  return config;
}