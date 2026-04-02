import { httpClient } from '@/shared/api/httpClient';
import { unwrapApiResponse } from '@/shared/api/response';

export type MemberRole = {
  id: string;
  name: string;
  permissions: string[];
};

export type MemberSummary = {
  id: string;
  name: string;
  email?: string;
  status?: string;
};

export type LoginResult = {
  accessToken?: string;
  memberId?: string;
  name?: string;
  isFirstLoginYn?: 'Y' | 'N';
  isEmailVerifiedYn?: 'Y' | 'N';
};

export type EmploymentType = 'FULL_TIME' | 'CONTRACTOR' | 'INTERN';
export type MemberStatus = 'ACTIVE' | 'DORMANT' | 'LEAVE';
export type AccountStatus = 'ACTIVE' | 'BLOCKED' | 'DELETED';

export type MemberDetail = {
  memberId: string;
  email: string;
  name: string;
  sabun: string;
  joinDate: string;
  employmentType: EmploymentType;
  memberStatus: MemberStatus;
  accountStatus: AccountStatus;
  organizationName?: string;
  jobGradeName?: string;
  jobTitleName?: string;
  roleName?: string;
  profileUrl?: string;
};

export const memberApi = {
  // Auth & account
  async login(payload: { email: string; password: string }) {
    const response = await httpClient.post('/member/login', payload);
    return unwrapApiResponse<LoginResult>(response.data);
  },
  async generateAccessToken() {
    const response = await httpClient.post('/member/generate-at');
    return unwrapApiResponse<{ accessToken?: string }>(response.data);
  },
  async changePassword(payload: { currentPassword: string; newPassword: string }) {
    const response = await httpClient.post('/member/change-password', payload);
    return unwrapApiResponse<null>(response.data);
  },
  async logout() {
    const response = await httpClient.post('/member/logout');
    return unwrapApiResponse<null>(response.data);
  },
  async sendResetPasswordCode(payload: { email: string }) {
    const response = await httpClient.post('/member/reset-password/send-code', payload);
    return unwrapApiResponse<null>(response.data);
  },
  async verifyResetPasswordCode(payload: { email: string; code: string }) {
    const response = await httpClient.post('/member/reset-password/verify-code', payload);
    return unwrapApiResponse<null>(response.data);
  },
  async resetPassword(payload: { email: string; code: string; newPassword: string }) {
    const response = await httpClient.post('/member/reset-password', payload);
    return unwrapApiResponse<null>(response.data);
  },

  // Member CRUD
  async create(payload: Record<string, unknown>) {
    const response = await httpClient.post('/member/create', payload);
    return unwrapApiResponse<MemberSummary>(response.data);
  },
  async list(params?: Record<string, unknown>) {
    const response = await httpClient.get('/member/list', { params });
    return unwrapApiResponse<MemberSummary[]>(response.data);
  },
  async detail(memberId: string) {
    const response = await httpClient.get(`/member/detail/${memberId}`);
    return unwrapApiResponse<MemberDetail>(response.data);
  },
  async update(memberId: string, payload: Record<string, unknown>) {
    const response = await httpClient.put(`/member/update/${memberId}`, payload);
    return unwrapApiResponse<Record<string, unknown>>(response.data);
  },
  async updateMe(payload: Record<string, unknown>) {
    const response = await httpClient.put('/member/my-info', payload);
    return unwrapApiResponse<Record<string, unknown>>(response.data);
  },
  async remove(memberId: string) {
    const response = await httpClient.delete(`/member/${memberId}`);
    return unwrapApiResponse<null>(response.data);
  },
  async restore(memberId: string) {
    const response = await httpClient.patch(`/member/${memberId}/restore`);
    return unwrapApiResponse<null>(response.data);
  },
  async unlock(memberId: string) {
    const response = await httpClient.patch(`/member/${memberId}/unblock`);
    return unwrapApiResponse<null>(response.data);
  },
  async leave(memberId: string) {
    const response = await httpClient.patch(`/member/${memberId}/dormant`);
    return unwrapApiResponse<null>(response.data);
  },
  async returnFromLeave(memberId: string) {
    const response = await httpClient.patch(`/member/${memberId}/return`);
    return unwrapApiResponse<null>(response.data);
  },

  // Role management
  async getRoles() {
    const response = await httpClient.get('/member/role/list');
    return unwrapApiResponse<MemberRole[]>(response.data);
  },
  async getRole(roleId: string) {
    const response = await httpClient.get(`/member/role/${roleId}`);
    return unwrapApiResponse<MemberRole>(response.data);
  },
  async createRole(payload: { name: string; permissions: string[] }) {
    const response = await httpClient.post('/member/role/create', payload);
    return unwrapApiResponse<MemberRole>(response.data);
  },
  async updateRole(roleId: string, payload: { name?: string; permissions?: string[] }) {
    const response = await httpClient.put(`/member/role/${roleId}`, payload);
    return unwrapApiResponse<MemberRole>(response.data);
  },
  async deleteRole(roleId: string) {
    const response = await httpClient.delete(`/member/role/${roleId}`);
    return unwrapApiResponse<null>(response.data);
  },
  async changeMemberRole(payload: { memberId: string; roleId: string }) {
    const response = await httpClient.put(`/member/update/${payload.memberId}/role`, { roleId: payload.roleId });
    return unwrapApiResponse<null>(response.data);
  },
  async history(memberId: string) {
    const response = await httpClient.get(`/member/${memberId}/history`);
    return unwrapApiResponse<Array<Record<string, unknown>>>(response.data);
  },

  // Profile & verification
  async sendEmailCode(payload: { email: string }) {
    const response = await httpClient.post('/member/email/send-code', payload);
    return unwrapApiResponse<null>(response.data);
  },
  async verifyEmailCode(payload: { email: string; code: string }) {
    const response = await httpClient.post('/member/email/verify-code', payload);
    return unwrapApiResponse<null>(response.data);
  },
  async uploadProfileImage(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    const response = await httpClient.patch('/member/profile-image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return unwrapApiResponse<{ imageUrl?: string }>(response.data);
  },
  async deleteProfileImage() {
    const response = await httpClient.delete('/member/profile-image');
    return unwrapApiResponse<null>(response.data);
  },
};
