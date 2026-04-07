import { httpClient } from '@/shared/api/httpClient';
import { unwrapApiResponse } from '@/shared/api/response';

export type Yn = 'YES' | 'NO';

export type EsgConfig = {
  esgEnabledYn: Yn;
  rewardEnabledYn?: Yn;
  campaignEnabledYn?: Yn;
  shopEnabledYn?: Yn;
  monthlyPointLimit?: number;
};

export type EsgConfigUpdatePayload = {
  esgEnabledYn: Yn;
  rewardEnabledYn: Yn;
  campaignEnabledYn: Yn;
  shopEnabledYn: Yn;
  monthlyPointLimit: number;
};

export type EsgSubjectCategory = 'E' | 'S' | 'G';

export type EsgSubject = {
  subjectId: string;
  title: string;
  description?: string;
  category: EsgSubjectCategory;
  defaultPoints: number;
};

export type EsgSubjectPayload = {
  title: string;
  description: string;
  category: EsgSubjectCategory;
  defaultPoints: number;
};

export type EsgActivityStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | string;

/** 백엔드 EsgCategory (Jackson 직렬화 시 문자열) */
export type EsgActivityCategoryCode = 'E' | 'S' | 'G' | string;

/** 백엔드 EsgActivityResDto */
export type EsgActivity = {
  esgActivityId?: string;
  activityId?: string;
  memberId?: string;
  memberName?: string;
  subjectId?: string;
  subjectTitle?: string;
  category?: EsgActivityCategoryCode;
  categoryDescription?: string;
  status?: EsgActivityStatus;
  verificationContent?: string;
  fileUrl?: string;
  earnedPoints?: number | null;
  rejectReason?: string | null;
  approvedAt?: string | null;
  createdAt?: string | null;
  title?: string;
  [key: string]: unknown;
};

export type EsgCampaignStatus = 'ACTIVE' | 'CLOSED' | string;

/** 백엔드 EsgCampaignResDto */
export type EsgCampaign = {
  esgCampaignId?: string;
  campaignId?: string;
  title?: string;
  description?: string;
  category?: EsgActivityCategoryCode;
  categoryDescription?: string;
  status?: EsgCampaignStatus;
  startDate?: string;
  endDate?: string;
  rewardPoints?: number;
  maxParticipants?: number | null;
  createdAt?: string | null;
  [key: string]: unknown;
};

export type EsgCampaignPayload = {
  title: string;
  description: string;
  category: EsgSubjectCategory;
  startDate: string;
  endDate: string;
  rewardPoints: number;
  maxParticipants: number;
};

/** 백엔드 샵 물품 DTO — 식별자는 esgShopItemId 등으로 올 수 있음, 목록 매핑 후 itemId로 통일 */
export type EsgShopItem = {
  itemId: string;
  title: string;
  description?: string;
  requiredPoints: number;
  stock: number;
  imageUrl?: string;
};

/** 레거시 객체 응답용 — 최신 API는 `data`에 숫자만 올 수 있음 */
export type EsgPointBalance = {
  balance?: number;
  totalPoints?: number;
  availablePoints?: number;
};

/** GET /esg/points/balance — `data: 450` 또는 `{ balance, ... }` */
function normalizePointBalancePayload(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const v = o.balance ?? o.availablePoints ?? o.totalPoints ?? o.points;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim()) {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
  }
  return null;
}

const LIST_CONTAINER_KEYS = [
  'list',
  'items',
  'content',
  'data',
  'rows',
  'subjects',
  'subjectList',
  'subject_list',
  'esgSubjects',
  'results',
  'result',
  'records',
  'elements',
  'payload',
  'value',
  'page',
];

function normalizeList(raw: unknown, depth = 0): unknown[] {
  if (depth > 8) return [];
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'object') return [];
  const o = raw as Record<string, unknown>;
  for (const k of LIST_CONTAINER_KEYS) {
    const v = o[k];
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') {
      const inner = normalizeList(v, depth + 1);
      if (inner.length) return inner;
    }
  }
  /** 알 수 없는 래핑: 중첩 객체 안에 배열만 있는 경우 */
  for (const v of Object.values(o)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const inner = normalizeList(v, depth + 1);
      if (inner.length) return inner;
    }
  }
  /** 필드명이 예상과 다를 때 첫 배열 */
  for (const v of Object.values(o)) {
    if (Array.isArray(v)) {
      return v;
    }
  }
  return [];
}

/** 활동 목록 행이 `{ activity: { activityId, ... } }` 형태일 때 상위로 병합 */
function normalizeActivityApiRow(row: unknown): EsgActivity {
  if (!row || typeof row !== 'object') return row as EsgActivity;
  const r = row as Record<string, unknown>;
  const inner =
    r.activity ?? r.activityDto ?? r.esgActivity ?? r.esgActivityDto ?? r.activityInfo;
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    return { ...(inner as Record<string, unknown>), ...r } as EsgActivity;
  }
  return r as EsgActivity;
}

/** 캠페인 목록 행이 `{ campaign: { ... } }` 형태일 때 상위로 병합 */
function normalizeCampaignApiRow(row: unknown): EsgCampaign {
  if (!row || typeof row !== 'object') return row as EsgCampaign;
  const r = row as Record<string, unknown>;
  const inner = r.campaign ?? r.campaignDto ?? r.esgCampaign ?? r.esgCampaignDto;
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    return { ...(inner as Record<string, unknown>), ...r } as EsgCampaign;
  }
  return r as EsgCampaign;
}

function isLikelyEsgSubjectRow(row: unknown): boolean {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
  const r = row as Record<string, unknown>;
  return Boolean(
    r.title ?? r.name ?? r.subjectTitle ?? r.subjectId ?? r.id ?? r.subject_id ?? r.defaultPoints,
  );
}

/** 객체 트리에서 활동 양식 행 배열을 깊이 우선으로 탐색 */
function deepFindObjectRowArray(raw: unknown, depth = 0): unknown[] {
  if (depth > 14) return [];
  if (Array.isArray(raw)) {
    if (raw.length === 0) return [];
    if (raw.every((x) => isLikelyEsgSubjectRow(x))) return raw;
    return [];
  }
  if (!raw || typeof raw !== 'object') return [];
  for (const v of Object.values(raw)) {
    const found = deepFindObjectRowArray(v, depth + 1);
    if (found.length) return found;
  }
  return [];
}

function pickId(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return '';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 행에 id 필드명이 다를 때 UUID 형태 문자열을 휴리스틱으로 사용 */
function pickUuidLikeFromRow(r: Record<string, unknown>): string {
  for (const v of Object.values(r)) {
    if (typeof v === 'string') {
      const t = v.trim();
      if (t.length >= 32 && UUID_RE.test(t)) return t;
    }
  }
  return '';
}

/** `{ subject: { id, title } }` 형태 병합 */
function flattenSubjectRow(row: unknown): Record<string, unknown> {
  if (!row || typeof row !== 'object') return {};
  const r = row as Record<string, unknown>;
  const inner = r.subject ?? r.subjectDto ?? r.subjectInfo ?? r.esgSubject;
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    const innerObj = inner as Record<string, unknown>;
    return { ...innerObj, ...r };
  }
  return r;
}

function pickSubjectId(r: Record<string, unknown>): string {
  const direct = pickId(r, [
    'subjectId',
    'subject_id',
    'id',
    'uuid',
    'subjectUuid',
    'subject_uuid',
    'key',
    'pk',
  ]);
  if (direct) return direct;
  return pickUuidLikeFromRow(r);
}

function normalizeConfig(raw: unknown): EsgConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const yn = (v: unknown): Yn | undefined => {
    const s = String(v ?? '').toUpperCase();
    if (s === 'YES' || s === 'Y') return 'YES';
    if (s === 'NO' || s === 'N') return 'NO';
    return undefined;
  };
  const esg =
    yn(r.esgEnabledYn ?? r.esg_enabled_yn) ??
    yn(r.enabledYn) ??
    'NO';
  return {
    esgEnabledYn: esg,
    rewardEnabledYn: yn(r.rewardEnabledYn ?? r.reward_enabled_yn),
    campaignEnabledYn: yn(r.campaignEnabledYn ?? r.campaign_enabled_yn),
    shopEnabledYn: yn(r.shopEnabledYn ?? r.shop_enabled_yn),
    monthlyPointLimit:
      typeof r.monthlyPointLimit === 'number'
        ? r.monthlyPointLimit
        : typeof r.monthly_point_limit === 'number'
          ? r.monthly_point_limit
          : undefined,
  };
}

export const esgApi = {
  async getConfig(): Promise<EsgConfig | null> {
    const response = await httpClient.get('/esg/config');
    const unwrapped = unwrapApiResponse<unknown>(response.data);
    return normalizeConfig(unwrapped);
  },

  async updateConfig(payload: EsgConfigUpdatePayload) {
    await httpClient.put('/esg/config', payload);
  },

  async listSubjects(): Promise<EsgSubject[]> {
    const response = await httpClient.get('/esg/subjects');
    let unwrapped: unknown = response.data;
    for (let i = 0; i < 5; i += 1) {
      const next = unwrapApiResponse<unknown>(unwrapped);
      if (next === unwrapped) break;
      unwrapped = next;
    }
    let arr = normalizeList(unwrapped);
    if (arr.length === 0) {
      arr = deepFindObjectRowArray(unwrapped);
    }
    return arr.map((row) => {
      const r = flattenSubjectRow(row);
      const subjectId = pickSubjectId(r);
      const title = String(
        r.title ?? r.name ?? r.subjectTitle ?? r.subject_title ?? r.label ?? '',
      );
      return {
        subjectId,
        title,
        description: typeof r.description === 'string' ? r.description : undefined,
        category: (r.category === 'S' || r.category === 'G' ? r.category : 'E') as EsgSubjectCategory,
        defaultPoints: Number(r.defaultPoints ?? r.default_points ?? 0),
      };
    });
  },

  async createSubject(payload: EsgSubjectPayload) {
    await httpClient.post('/esg/subjects', payload);
  },

  async updateSubject(subjectId: string, payload: EsgSubjectPayload) {
    await httpClient.put(`/esg/subjects/${encodeURIComponent(subjectId)}`, payload);
  },

  async deleteSubject(subjectId: string) {
    await httpClient.delete(`/esg/subjects/${encodeURIComponent(subjectId)}`);
  },

  async submitActivity(params: { subjectId: string; verificationContent?: string; file?: File | null }) {
    const fd = new FormData();
    fd.append('subjectId', params.subjectId);
    if (params.verificationContent?.trim()) {
      fd.append('verificationContent', params.verificationContent.trim());
    }
    if (params.file) {
      fd.append('file', params.file);
    }
    await httpClient.post('/esg/activities', fd);
  },

  async listActivitiesAdmin(status?: EsgActivityStatus) {
    const response = await httpClient.get('/esg/activities', {
      params: status ? { status } : undefined,
    });
    const unwrapped = unwrapApiResponse<unknown>(response.data);
    return normalizeList(unwrapped).map((row) => normalizeActivityApiRow(row)) as EsgActivity[];
  },

  async listMyActivities(status?: EsgActivityStatus) {
    const response = await httpClient.get('/esg/activities/my', {
      params: status ? { status } : undefined,
    });
    const unwrapped = unwrapApiResponse<unknown>(response.data);
    return normalizeList(unwrapped).map((row) => normalizeActivityApiRow(row)) as EsgActivity[];
  },

  async approveActivity(activityId: string) {
    await httpClient.patch(`/esg/activities/${encodeURIComponent(activityId)}/approve`);
  },

  async rejectActivity(activityId: string, reason: string) {
    await httpClient.patch(`/esg/activities/${encodeURIComponent(activityId)}/reject`, { reason });
  },

  /** 보유 포인트 총합 — 응답 `data`가 숫자(예: 450)이거나 객체일 수 있음 */
  async getPointBalance(): Promise<number | null> {
    const response = await httpClient.get('/esg/points/balance');
    const unwrapped = unwrapApiResponse<unknown>(response.data);
    return normalizePointBalancePayload(unwrapped);
  },

  async getPointHistory(): Promise<unknown[]> {
    const response = await httpClient.get('/esg/points/history');
    const unwrapped = unwrapApiResponse<unknown>(response.data);
    return normalizeList(unwrapped);
  },

  async createCampaign(payload: EsgCampaignPayload) {
    await httpClient.post('/esg/campaigns', payload);
  },

  async listCampaigns(status?: EsgCampaignStatus) {
    const response = await httpClient.get('/esg/campaigns', {
      params: status ? { status } : undefined,
    });
    const unwrapped = unwrapApiResponse<unknown>(response.data);
    return normalizeList(unwrapped).map((row) => normalizeCampaignApiRow(row)) as EsgCampaign[];
  },

  async joinCampaign(campaignId: string) {
    await httpClient.post(`/esg/campaigns/${encodeURIComponent(campaignId)}/join`);
  },

  async completeCampaignMember(campaignId: string, targetMemberId: string) {
    await httpClient.patch(
      `/esg/campaigns/${encodeURIComponent(campaignId)}/members/${encodeURIComponent(targetMemberId)}/complete`,
    );
  },

  async closeCampaign(campaignId: string) {
    await httpClient.patch(`/esg/campaigns/${encodeURIComponent(campaignId)}/close`);
  },

  async createShopItem(params: {
    title: string;
    description: string;
    requiredPoints: number;
    stock: number;
    image?: File | null;
  }) {
    const fd = new FormData();
    fd.append('title', params.title);
    fd.append('description', params.description);
    fd.append('requiredPoints', String(params.requiredPoints));
    fd.append('stock', String(params.stock));
    if (params.image) {
      fd.append('image', params.image);
    }
    await httpClient.post('/esg/shop/items', fd);
  },

  async listShopItems(): Promise<EsgShopItem[]> {
    const response = await httpClient.get('/esg/shop/items');
    const unwrapped = unwrapApiResponse<unknown>(response.data);
    const arr = normalizeList(unwrapped);
    return arr.map((row) => {
      const r = row as Record<string, unknown>;
      const itemId = pickId(r, [
        'esgShopItemId',
        'esg_shop_item_id',
        'shopItemId',
        'shop_item_id',
        'itemId',
        'id',
        'item_id',
      ]);
      return {
        itemId,
        title: String(r.title ?? ''),
        description: typeof r.description === 'string' ? r.description : undefined,
        requiredPoints: Number(r.requiredPoints ?? r.required_points ?? 0),
        stock: Number(r.stock ?? 0),
        imageUrl: typeof r.imageUrl === 'string' ? r.imageUrl : typeof r.image_url === 'string' ? r.image_url : undefined,
      };
    });
  },

  async orderShopItem(itemId: string) {
    const id = typeof itemId === 'string' ? itemId.trim() : String(itemId ?? '').trim();
    if (!id) {
      throw new Error('물품 ID를 찾을 수 없습니다. 목록을 새로고침한 뒤 다시 시도해 주세요.');
    }
    await httpClient.post(`/esg/shop/orders/${encodeURIComponent(id)}`);
  },

  async listMyOrders() {
    const response = await httpClient.get('/esg/shop/orders/my');
    const unwrapped = unwrapApiResponse<unknown>(response.data);
    return normalizeList(unwrapped);
  },

  async listAllOrders() {
    const response = await httpClient.get('/esg/shop/orders');
    const unwrapped = unwrapApiResponse<unknown>(response.data);
    return normalizeList(unwrapped);
  },

  async aggregateScores(yearMonth: string) {
    await httpClient.post(`/esg/scores/${encodeURIComponent(yearMonth)}`);
  },

  async getScoreHistory() {
    const response = await httpClient.get('/esg/scores/history');
    const unwrapped = unwrapApiResponse<unknown>(response.data);
    return normalizeList(unwrapped);
  },
};
