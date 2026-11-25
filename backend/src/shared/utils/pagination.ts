import type { CursorPayload } from '../types';

export interface PaginationInput {
  page?: number;
  pageSize?: number;
  cursor?: string;
}

export interface NormalizedPagination {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
  cursor: CursorPayload | null;
}

export function normalizePagination(input: PaginationInput): NormalizedPagination {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 50));
  return {
    page,
    pageSize,
    skip: input.cursor ? 0 : (page - 1) * pageSize,
    take: pageSize,
    cursor: decodeCursor(input.cursor),
  };
}

export function encodeCursor(cursor: CursorPayload): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCursor(raw: string | undefined): CursorPayload | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as CursorPayload;
    if (!parsed.createdAt || !parsed.id) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function buildPage<T>(items: T[], page: number, pageSize: number, total: number) {
  return {
    items,
    page,
    pageSize,
    total,
  };
}