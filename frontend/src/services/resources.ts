import { http } from './http';
import type { Resource } from '@/types';

export interface ResourceType {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  currentVersion: number;
}

export interface ResourceListItem {
  id: string;
  name: string;
  username: string | null;
  uri: string | null;
  description: string | null;
  status: string;
  resourceType: { slug: string; name: string };
  createdAt: string;
  updatedAt: string;
  permission: string | null;
}

export interface ListResourcesResponse {
  items: ResourceListItem[];
  nextCursor: string | null;
}

export interface CreateResourceDto {
  name: string;
  username?: string;
  uri?: string;
  description?: string;
  resourceTypeId: string;
  folderId?: string;
}

export const resourcesService = {
  async listTypes(): Promise<ResourceType[]> {
    const res = await http.get<ResourceType[]>('/resource-types');
    return res.data;
  },

  async list(params?: {
    q?: string;
    pageSize?: number;
    cursor?: string;
    folderId?: string;
  }): Promise<ListResourcesResponse> {
    const res = await http.get<ListResourcesResponse>('/resources', { params });
    return res.data;
  },

  async create(dto: CreateResourceDto): Promise<Resource & {
    resourceType?: { id: string; slug: string; name: string };
  }> {
    const res = await http.post('/resources', dto);
    return res.data;
  },

  async getById(id: string) {
    const res = await http.get(`/resources/${id}`);
    return res.data;
  },
};
