import { httpClient } from '@/shared/api/httpClient';
import { unwrapApiResponse } from '@/shared/api/response';

export const companyApi = {
  async checkBusinessNumber(businessNumber: string) {
    const response = await httpClient.get('/company/check-business-number', {
      params: { businessNumber },
    });
    return unwrapApiResponse<{ valid: boolean; companyName?: string }>(response.data);
  },
  async sendVerificationCode(payload: { email: string; companyName?: string }) {
    const response = await httpClient.post('/company/send-verification-code', payload);
    return unwrapApiResponse<null>(response.data);
  },
  async verifyCode(payload: { email: string; code: string }) {
    const response = await httpClient.post('/company/verify-code', payload);
    return unwrapApiResponse<null>(response.data);
  },
  async onboarding(payload: {
    businessNumber: string;
    companyName: string;
    representativeName: string;
    address: string;
    email: string;
    password: string;
  }) {
    const response = await httpClient.post('/company/onboarding', payload);
    return unwrapApiResponse<Record<string, unknown>>(response.data);
  },
};
