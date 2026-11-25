export interface LoginDto {
  email: string;
  password: string;
}

export interface MfaVerifyDto {
  challengeToken: string;
  code: string;
}

export interface TotpVerifyDto {
  code: string;
}

export interface LoginResult {
  mfaRequired: boolean;
  challengeToken?: string;
  accessToken?: string;
  refreshToken?: string;
  refreshExpiresAt?: string;
  user?: {
    id: string;
    email: string;
    role: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
}
