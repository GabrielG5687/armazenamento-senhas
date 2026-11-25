import { http } from './http';
import type { User, PaginationMeta } from '@/types';

export interface CreateUserDto {
  email: string;
  displayName: string;
  role?: 'USER' | 'ADMIN';
}

export interface UpdateUserDto {
  displayName?: string;
  role?: 'USER' | 'ADMIN';
  status?: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'DELETED';
}

export interface ListUsersResponse {
  items: User[];
  page: number;
  pageSize: number;
  total: number;
}

export const usersService = {
  async create(dto: CreateUserDto): Promise<User> {
    const res = await http.post<User>('/users', dto);
    return res.data;
  },

  async list(
    page = 1,
    pageSize = 50,
    filters?: { role?: 'USER' | 'ADMIN'; status?: string; q?: string },
  ): Promise<ListUsersResponse> {
    const params: Record<string, string | number> = {
      page: String(page),
      pageSize: String(pageSize),
    };
    if (filters?.role) params.role = filters.role;
    if (filters?.status) params.status = filters.status;
    if (filters?.q) params.q = filters.q;
    const res = await http.get<ListUsersResponse>('/users', { params });
    return res.data;
  },

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const res = await http.patch<User>(`/users/${id}`, dto);
    return res.data;
  },

  async getById(id: string): Promise<User> {
    const res = await http.get<User>(`/users/${id}`);
    return res.data;
  },
};
