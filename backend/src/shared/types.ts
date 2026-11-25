export type PermissionLevelName = 'READ' | 'UPDATE' | 'OWNER';
export type PermissionActionName = 'READ' | 'UPDATE' | 'DELETE' | 'SHARE';
export type AcoTypeName = 'RESOURCE' | 'FOLDER';

export interface AcoRef {
  type: AcoTypeName;
  id: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: 'USER' | 'ADMIN';
  sessionId: string;
  amr: string[];
}

export interface RequestContext {
  requestId: string;
  ip?: string;
  userAgent?: string;
}

export interface CursorPayload {
  createdAt: string;
  id: string;
}