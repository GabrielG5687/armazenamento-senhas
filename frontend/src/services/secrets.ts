import { http } from './http';

export interface SecretEnvelopePayload {
  userId: string;
  armoredMessage: string;
  keyFingerprint: string;
  checksum: string;
  signature?: string;
}

export interface CreateSecretVersionPayload {
  version: number;
  formatVersion: string;
  envelopes: SecretEnvelopePayload[];
}

export interface CurrentSecretResponse {
  version: number;
  formatVersion: string;
  keyFingerprint: string;
  armoredMessage: string;
  signature?: string;
}

export interface SecretVersionSummary {
  version: number;
  formatVersion: string;
  createdAt: string;
  byteSize: number;
  isCurrent: boolean;
}

export const secretsService = {
  async createVersion(resourceId: string, dto: CreateSecretVersionPayload) {
    const res = await http.put(`/resources/${resourceId}/secret`, dto);
    return res.data;
  },

  async getCurrent(resourceId: string): Promise<CurrentSecretResponse> {
    const res = await http.get<CurrentSecretResponse>(`/resources/${resourceId}/secret`);
    return res.data;
  },

  async listVersions(resourceId: string): Promise<SecretVersionSummary[]> {
    const res = await http.get<SecretVersionSummary[]>(
      `/resources/${resourceId}/secret/versions`,
    );
    return res.data;
  },
};
