import { httpClient } from '@/shared/api/httpClient';
import { unwrapApiResponse } from '@/shared/api/response';

export const organizationApi = {
  async create(payload: Record<string, unknown>) {
    const response = await httpClient.post('/organization/create', payload);
    return unwrapApiResponse<Record<string, unknown>>(response.data);
  },
  async list() {
    const response = await httpClient.get('/organization/list');
    return unwrapApiResponse<Array<Record<string, unknown>>>(response.data);
  },
  async update(organizationId: string, payload: Record<string, unknown>) {
    const response = await httpClient.put(`/organization/${organizationId}`, payload);
    return unwrapApiResponse<Record<string, unknown>>(response.data);
  },
  async remove(organizationId: string) {
    const response = await httpClient.delete(`/organization/${organizationId}`);
    return unwrapApiResponse<null>(response.data);
  },
  async reorder(payload: { organizationIds: string[] }) {
    const response = await httpClient.put('/organization/reorder', payload);
    return unwrapApiResponse<null>(response.data);
  },
  async listJobGrades() {
    const response = await httpClient.get('/organization/job-grade/list');
    return unwrapApiResponse<Array<Record<string, unknown>>>(response.data);
  },
  async createJobGrade(payload: Record<string, unknown>) {
    const response = await httpClient.post('/organization/job-grade/list', payload);
    return unwrapApiResponse<Record<string, unknown>>(response.data);
  },
  async listJobTitles() {
    const response = await httpClient.get('/organization/job-title/list');
    return unwrapApiResponse<Array<Record<string, unknown>>>(response.data);
  },
  async createJobTitle(payload: Record<string, unknown>) {
    const response = await httpClient.post('/organization/job-title/list', payload);
    return unwrapApiResponse<Record<string, unknown>>(response.data);
  },
};
