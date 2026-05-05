import { httpClient } from '@/shared/api/httpClient';
import { unwrapApiResponse } from '@/shared/api/response';

/** GET /company/info — CompanyInfoResDto */
export type CompanyInfo = {
  companyId?: string;
  companyName?: string;
  companyDomain?: string;
  logoUrl?: string | null;
  sealImageUrl?: string | null;
};

function pickStr(r: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = r[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

function normalizeCompanyInfo(raw: unknown): CompanyInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const companyId = pickStr(r, ['companyId', 'company_id']);
  const companyName = pickStr(r, ['companyName', 'company_name', 'name']);
  const companyDomain = pickStr(r, ['companyDomain', 'company_domain', 'domain']);
  const logoRaw = r.logoUrl ?? r.logo_url;
  const logoUrl =
    typeof logoRaw === 'string' && logoRaw.trim()
      ? logoRaw.trim()
      : logoRaw === null
        ? null
        : undefined;
  const sealRaw = r.sealImageUrl ?? r.seal_image_url;
  const sealImageUrl =
    typeof sealRaw === 'string' && sealRaw.trim()
      ? sealRaw.trim()
      : sealRaw === null
        ? null
        : undefined;
  if (!companyId && !companyName && !companyDomain && logoUrl === undefined && sealImageUrl === undefined) return null;
  return { companyId, companyName, companyDomain, logoUrl: logoUrl ?? undefined, sealImageUrl: sealImageUrl ?? undefined };
}

export type CheckBusinessNumberResponse = {
  success: boolean;
  message?: string;
  companyName?: string;
};

export type CompanyOnboardingPayload = {
  companyName: string;
  companyDomain: string;
  ceoName: string;
  businessNumber: string;
  address: string;
  detailAddress: string;
  adminEmail: string;
  adminPassword: string;
  adminPasswordCheck: string;
  adminName: string;
};

/** `data: null` 봉투에서도 루트의 success/message를 읽습니다. */
function parseApiEnvelope(raw: unknown): { success: boolean; message?: string } {
  const bad = { success: false as const };
  if (raw == null || typeof raw !== 'object') return bad;

  const root = raw as Record<string, unknown>;
  const inner =
    root.data != null && typeof root.data === 'object' ? (root.data as Record<string, unknown>) : null;

  if (inner && typeof inner.success === 'boolean') {
    return {
      success: inner.success,
      message: typeof inner.message === 'string' ? inner.message : undefined,
    };
  }

  if (typeof root.success === 'boolean') {
    return {
      success: root.success,
      message: typeof root.message === 'string' ? root.message : undefined,
    };
  }

  return bad;
}

function parseCheckBusinessNumberResponse(raw: unknown): CheckBusinessNumberResponse {
  const fallback: CheckBusinessNumberResponse = {
    success: false,
    message: '사업자번호 검증 응답을 확인할 수 없습니다.',
  };
  if (raw == null || typeof raw !== 'object') return fallback;

  const root = raw as Record<string, unknown>;
  const dataField = root.data;
  const inner =
    dataField != null && typeof dataField === 'object' ? (dataField as Record<string, unknown>) : null;

  if (inner && typeof inner.success === 'boolean') {
    return {
      success: inner.success,
      message: typeof inner.message === 'string' ? inner.message : undefined,
      companyName: typeof inner.companyName === 'string' ? inner.companyName : undefined,
    };
  }

  if (typeof root.success === 'boolean') {
    return {
      success: root.success,
      message: typeof root.message === 'string' ? root.message : undefined,
      companyName:
        (inner && typeof inner.companyName === 'string' ? inner.companyName : undefined) ??
        (typeof root.companyName === 'string' ? root.companyName : undefined),
    };
  }

  return fallback;
}

export const companyApi = {
  async checkBusinessNumber(businessNumber: string) {
    const digitsOnly = businessNumber.replace(/\D/g, '');
    const response = await httpClient.get('/company/check-business-number', {
      params: { businessNumber: digitsOnly },
    });
    return parseCheckBusinessNumberResponse(response.data);
  },

  async sendVerificationCode(email: string) {
    const response = await httpClient.post('/company/send-verification-code', undefined, {
      params: { email },
    });
    return parseApiEnvelope(response.data);
  },

  async verifyCode(email: string, code: string) {
    const response = await httpClient.post('/company/verify-code', undefined, {
      params: { email, code },
    });
    return parseApiEnvelope(response.data);
  },

  async onboarding(payload: CompanyOnboardingPayload) {
    const response = await httpClient.post('/company/onboarding', payload);
    return parseApiEnvelope(response.data);
  },

  /** 회사 로고 — `Authorization` + `X-User-Id`(멤버 UUID) 필요. multipart part name: `logo` */
  async updateLogo(logo: File) {
    const fd = new FormData();
    fd.append('logo', logo);
    await httpClient.patch('/company/logo', fd);
  },

  /** 회사 인감(직인) — multipart part name: `seal` */
  async updateSeal(seal: File) {
    const fd = new FormData();
    fd.append('seal', seal);
    await httpClient.patch('/company/seal', fd);
  },

  /** 로그인 후 회사명·도메인·로고 URL — `X-User-UUID` 헤더 */
  async getCompanyInfo(): Promise<CompanyInfo | null> {
    const response = await httpClient.get('/company/info');
    const unwrapped = unwrapApiResponse<unknown>(response.data);
    return normalizeCompanyInfo(unwrapped);
  },
};
