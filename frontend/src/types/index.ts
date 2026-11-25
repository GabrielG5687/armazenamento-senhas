export type UserRole = 'USER' | 'ADMIN';
export type UserStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'DELETED';
export type PermissionLevel = 'READ' | 'UPDATE' | 'OWNER';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  displayName: string | null;
  avatarUrl: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  sessionId: string;
  amr: string[];
}

export interface Resource {
  id: string;
  name: string;
  username: string | null;
  uri: string | null;
  description: string | null;
  status: string;
  resourceTypeId: string;
  resourceTypeVersion: number;
  createdById: string;
  updatedById: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface SecretVersion {
  version: number;
  formatVersion: string;
  createdAt: string;
  byteSize: number;
  isCurrent: boolean;
}

export interface SecretEnvelope {
  userId: string;
  keyFingerprint: string;
  armoredMessage: string;
  signature: string | null;
  algorithm: string;
  formatVersion: string;
  checksum: string;
}

export interface CreateSecretVersionDto {
  version: number;
  formatVersion: string;
  envelopes: SecretEnvelope[];
}

export interface ResourcePermission {
  id: string;
  resourceId: string;
  aroType: 'USER' | 'GROUP';
  aroId: string;
  level: PermissionLevel;
  createdAt: string;
}

export interface SharingOperation {
  id: string;
  operation: string;
  status: string;
  actorId: string;
  resourceId: string | null;
  groupId: string | null;
  payload: unknown;
  expiresAt: string;
  completedAt: string | null;
  createdAt: string;
}

export interface LoginResult {
  mfaRequired: boolean;
  challengeToken?: string;
  accessToken?: string;
  refreshToken?: string;
  refreshExpiresAt?: string;
  user?: User;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
}

export interface ApiError {
  type: string;
  title: string;
  status: number;
  code: string;
  requestId: string;
  details?: unknown;
}
