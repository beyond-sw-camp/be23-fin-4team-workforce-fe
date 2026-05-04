import { httpClient } from '@/shared/api/httpClient';
import { unwrapApiResponse } from '@/shared/api/response';

export type PersonnelOrderType =
  | 'TRANSFER'
  | 'PROMOTION'
  | 'DEMOTION'
  | 'REASSIGN'
  | 'ROLE_CHANGE';

export type PersonnelOrder = {
  personnelOrderId: string;
  memberId: string;
  companyId: string;
  orderType: PersonnelOrderType;
  effectiveDate: string;
  approvalDocumentId?: string | null;
  beforeOrganizationName?: string | null;
  afterOrganizationName?: string | null;
  beforeJobGradeName?: string | null;
  afterJobGradeName?: string | null;
  beforeJobTitleName?: string | null;
  afterJobTitleName?: string | null;
  reason?: string | null;
  createdAt?: string | null;
};

export const personnelOrderApi = {
  /** 본인 발령 이력 (시간 역순) */
  async listMine(): Promise<PersonnelOrder[]> {
    const { data } = await httpClient.get('/personnel-order/my');
    return (unwrapApiResponse<PersonnelOrder[]>(data) ?? []) as PersonnelOrder[];
  },

  /** 특정 직원 발령 이력 (관리자 - 회사 직원 카드 등) */
  async listByMember(memberId: string): Promise<PersonnelOrder[]> {
    const { data } = await httpClient.get(
      `/personnel-order/by-member/${encodeURIComponent(memberId)}`,
    );
    return (unwrapApiResponse<PersonnelOrder[]>(data) ?? []) as PersonnelOrder[];
  },

  /** 회사 전체 발령 이력 (관리자) */
  async listByCompany(): Promise<PersonnelOrder[]> {
    const { data } = await httpClient.get('/personnel-order/by-company');
    return (unwrapApiResponse<PersonnelOrder[]>(data) ?? []) as PersonnelOrder[];
  },
};
