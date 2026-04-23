import { httpClient } from '@/shared/api/httpClient';
import type {
  CreateRolePayload,
  RolePermissionItem,
  UpdateRolePayload,
} from '@/features/member/model/role-permission';

export type {
  CreateRolePayload,
  PermissionAction,
  PermissionRange,
  PermissionResource,
  RolePermissionItem,
  UpdateRolePayload,
} from '@/features/member/model/role-permission';
export {
  ROLE_ACTIONS,
  ROLE_PERMISSION_RANGES,
  ROLE_RESOURCES,
} from '@/features/member/model/role-permission';
import { unwrapApiResponse } from '@/shared/api/response';

/** 역할 목록 행 (백엔드 필드에 맞게 확장 가능) */
export type MemberRoleListItem = {
  id: string;
  name: string;
  description?: string;
};

/** 역할 상세·생성/수정 응답 */
export type MemberRoleDetail = {
  id: string;
  name: string;
  description?: string;
  permissions: RolePermissionItem[];
};

/** @deprecated 목록·상세는 `MemberRoleListItem` / `MemberRoleDetail` 사용 */
export type MemberRole = MemberRoleDetail;

export type MemberSummary = {
  id: string;
  name: string;
  email?: string;
  status?: string;
};

/** GET /member/list — 전자결재 참조·공람 선택용 (memberId·memberPositionId 필수) */
export type MemberListItemForApproval = {
  memberId: string;
  memberPositionId: string;
  name: string;
  organizationName: string;
  jobTitleName: string;
  email?: string;
};

function asTextMemberField(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return '';
}

function extractMemberListRows(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'object') return [];
  const o = raw as Record<string, unknown>;
  for (const k of ['content', 'items', 'list', 'data', 'rows']) {
    const v = o[k];
    if (Array.isArray(v)) return v;
  }
  return [];
}

function normalizeMemberListItemForApproval(raw: unknown): MemberListItemForApproval | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const memberId = asTextMemberField(o.memberId ?? o.member_id ?? o.id);
  const memberPositionId = asTextMemberField(o.memberPositionId ?? o.member_position_id);
  const name = asTextMemberField(o.name);
  if (!memberId || !memberPositionId || !name) return null;
  const email = asTextMemberField(o.email);
  return {
    memberId,
    memberPositionId,
    name,
    organizationName: asTextMemberField(o.organizationName ?? o.organization_name),
    jobTitleName: asTextMemberField(o.jobTitleName ?? o.job_title_name),
    ...(email ? { email } : {}),
  };
}

export type LoginResult = {
  accessToken?: string;
  memberId?: string;
  memberPositionId?: string;
  name?: string;
  isFirstLoginYn?: 'Y' | 'N' | 'YES' | 'NO';
  isEmailVerifiedYn?: 'Y' | 'N' | 'YES' | 'NO';
};

/** 백엔드 고용 형태 (member-service) */
export type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERN';

export type MemberStatus = 'ACTIVE' | 'DORMANT' | 'LEAVE';
export type AccountStatus = 'ACTIVE' | 'BLOCKED' | 'DELETED';

/** 공개 여부 (member-service) */
export type YnFlag = 'YES' | 'NO';

/** PUT /member/my-info — 수정하지 않을 필드는 `null` 로 보내면 유지 */
export type UpdateMyInfoPayload = {
  phoneNumber?: string | null;
  phonePublicYn?: YnFlag | null;
  emergencyContact?: string | null;
  address?: string | null;
  detailAddress?: string | null;
  addressPublicYn?: YnFlag | null;
  bank?: string | null;
  bankAccount?: string | null;
  extensionNumber?: string | null;
  telNumber?: string | null;
};

/** GET /member/dashboard-profile */
export type DashboardProfile = {
  memberId: string;
  name: string;
  profileUrl?: string | null;
  organizationId?: string | null;
  organizationName?: string | null;
  jobGradeName?: string | null;
  jobTitleName?: string | null;
  todayEventCount: number;
};

function normalizeDashboardProfile(raw: unknown): DashboardProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const memberId = asTextMemberField(r.memberId ?? r.member_id);
  const name = asTextMemberField(r.name);
  if (!memberId || !name) return null;
  const profileRaw = r.profileUrl ?? r.profile_url;
  const tc = r.todayEventCount ?? r.today_event_count;
  let todayEventCount = 0;
  if (typeof tc === 'number' && Number.isFinite(tc)) todayEventCount = tc;
  else if (typeof tc === 'string' && tc.trim()) {
    const n = Number(tc);
    if (Number.isFinite(n)) todayEventCount = n;
  }
  return {
    memberId,
    name,
    profileUrl: typeof profileRaw === 'string' && profileRaw.trim() ? profileRaw.trim() : null,
    organizationId: asTextMemberField(r.organizationId ?? r.organization_id) || null,
    organizationName: asTextMemberField(r.organizationName ?? r.organization_name) || null,
    jobGradeName: asTextMemberField(r.jobGradeName ?? r.job_grade_name) || null,
    jobTitleName: asTextMemberField(r.jobTitleName ?? r.job_title_name) || null,
    todayEventCount,
  };
}

/** PUT /member/update/{targetMemberId} — 인사 전용(MEMBER:UPDATE). 본인 정보는 PUT /member/my-info */
export type UpdateMemberHrPayload = {
  name: string;
  sabun: string;
  joinDate: string;
  employmentType: EmploymentType;
  memberStatus: MemberStatus;
  organizationId: string;
  jobGradeId: string;
  jobTitleId: string;
  roleId: string;
  /** null 허용 — 미전송 시 백엔드 기본 처리 */
  isPromotion?: boolean | null;
  /** 선택 */
  changeReason?: string;
};

/** POST /member/create */
export type CreateMemberPayload = {
  name: string;
  englishInitial: string;
  personalEmail: string;
  joinDate: string;
  employmentType: EmploymentType;
  organizationId: string;
  jobGradeId: string;
  jobTitleId: string;
  roleId: string;
};

/** GET /member/{targetMemberId}/history — 직원 인사 이력 (MEMBER:READ, 인사팀) */
export type MemberChangeType =
  | 'PROMOTION'
  | 'GRADE_CHANGE'
  | 'ORG_CHANGE'
  | 'TITLE_CHANGE'
  | 'EMPLOYMENT_CHANGE'
  | 'JOIN'
  | 'DORMANT'
  | 'RETURN'
  | string;

export type MemberHistoryItem = {
  historyId: string;
  memberId: string;
  memberName: string;
  jobGradeName: string;
  organizationName: string;
  changerName: string;
  employmentType: string;
  changeType: MemberChangeType;
  changeReason: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  promotionDate: string | null;
  changedAt: string;
};

function nullableDateString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' && !v.trim()) return null;
  return String(v).trim();
}

function normalizeMemberHistoryRow(raw: unknown): MemberHistoryItem {
  if (!raw || typeof raw !== 'object') {
    throw new Error('이력 행 형식이 올바르지 않습니다.');
  }
  const r = raw as Record<string, unknown>;

  return {
    historyId: String(r.historyId ?? r.history_id ?? '').trim(),
    memberId: String(r.memberId ?? r.member_id ?? '').trim(),
    memberName: String(r.memberName ?? r.member_name ?? '').trim() || '—',
    jobGradeName: String(r.jobGradeName ?? r.job_grade_name ?? '').trim() || '—',
    organizationName: String(r.organizationName ?? r.organization_name ?? '').trim() || '—',
    changerName: String(r.changerName ?? r.changer_name ?? r.changedBy ?? r.changed_by ?? '').trim() || '—',
    employmentType: String(r.employmentType ?? r.employment_type ?? '').trim() || '—',
    changeType: String(r.changeType ?? r.change_type ?? '').trim() || 'UNKNOWN',
    changeReason: String(r.changeReason ?? r.change_reason ?? '').trim() || '—',
    effectiveFrom: String(r.effectiveFrom ?? r.effective_from ?? '').trim() || '—',
    effectiveTo: nullableDateString(r.effectiveTo ?? r.effective_to),
    promotionDate: nullableDateString(r.promotionDate ?? r.promotion_date),
    changedAt: String(r.changedAt ?? r.changed_at ?? '').trim() || '—',
  };
}

/** GET /member/detail/{memberId} — 본인 조회 시 민감 필드 포함, 타인은 공개 설정에 따라 일부 null */
export type MemberDetail = {
  memberId: string;
  email: string;
  name: string;
  sabun: string;
  joinDate: string;
  /** API 구버전에서 `CONTRACTOR` 로 올 수 있음 */
  employmentType: EmploymentType | 'CONTRACTOR';
  memberStatus: MemberStatus;
  accountStatus: AccountStatus;
  profileUrl?: string | null;
  extensionNumber?: string | null;
  telNumber?: string | null;
  /** phonePublicYn = YES 일 때만 의미 있음 (아니면 null) */
  phoneNumber?: string | null;
  address?: string | null;
  detailAddress?: string | null;
  /** 본인 조회 시에만 */
  emergencyContact?: string | null;
  bank?: string | null;
  bankAccount?: string | null;
  memberPositionId?: string;
  /** GET 응답에 포함될 때 — 부서 문서함 등에서 조직 선택 기본값으로 사용 */
  organizationId?: string;
  jobGradeId?: string;
  jobTitleId?: string;
  organizationName?: string;
  jobGradeName?: string;
  jobTitleName?: string;
  roleName?: string;
  /** GET 응답에 있을 때 — 인사 수정 PUT 시 roleId 로 전달 */
  roleId?: string;
  isSystemAdminYn?: YnFlag;
  phonePublicYn?: YnFlag;
  addressPublicYn?: YnFlag;
  /** ESG 집계 점수 — `esgEnabledYn=YES`일 때 마이페이지 등에서 노출 */
  esgScore?: number | null;
};

/** GET /member/position/internal/{memberPositionId} — 결재라인 원·실 결재자 표시 (MemberPositionResDto) */
export type MemberPositionInternalRes = {
  memberPositionId: string;
  memberId: string;
  memberName: string;
  organizationId?: string;
  organizationName: string;
  jobTitleName: string;
  jobGradeName?: string;
};

function normalizeMemberPositionInternal(raw: unknown): MemberPositionInternalRes {
  if (!raw || typeof raw !== 'object') {
    throw new Error('직위 정보 응답을 해석할 수 없습니다.');
  }
  const o = raw as Record<string, unknown>;
  const memberPositionId = asTextMemberField(o.memberPositionId ?? o.member_position_id);
  const memberId = asTextMemberField(o.memberId ?? o.member_id);
  const memberName = asTextMemberField(o.memberName ?? o.member_name);
  if (!memberPositionId || !memberId || !memberName) {
    throw new Error('직위 정보 응답에 필수 필드가 없습니다.');
  }
  return {
    memberPositionId,
    memberId,
    memberName,
    organizationId: asTextMemberField(o.organizationId ?? o.organization_id) || undefined,
    organizationName: asTextMemberField(o.organizationName ?? o.organization_name),
    jobTitleName: asTextMemberField(o.jobTitleName ?? o.job_title_name),
    jobGradeName: asTextMemberField(o.jobGradeName ?? o.job_grade_name) || undefined,
  };
}

/** 백엔드가 `Y`/`y`/`YES` 등으로 줄 수 있음 → `YES` | `NO` 로 통일 */
export function normalizeYnFlag(value: unknown): YnFlag | undefined {
  if (value === true) return 'YES';
  if (value === false) return 'NO';
  if (typeof value !== 'string') return undefined;
  const v = value.trim().toUpperCase();
  if (v === 'Y' || v === 'YES') return 'YES';
  if (v === 'N' || v === 'NO') return 'NO';
  return undefined;
}

function pickNumericOptional(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** 상세 JSON이 camelCase / snake_case 혼용일 때 문자열 필드 보강 */
function pickDetailString(r: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const k of keys) {
    const v = r[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

/** 사번 등 문자열 또는 숫자로 올 수 있는 필드 */
function pickDetailScalar(r: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const k of keys) {
    const v = r[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return undefined;
}

function normalizeMemberDetailResponse(raw: unknown): MemberDetail {
  if (!raw || typeof raw !== 'object') {
    return raw as MemberDetail;
  }
  const r = raw as Record<string, unknown>;
  const base = { ...r } as unknown as MemberDetail;
  const phoneRaw = r.phonePublicYn ?? r.phone_public_yn;
  const addrRaw = r.addressPublicYn ?? r.address_public_yn;
  const phone = normalizeYnFlag(phoneRaw);
  const addr = normalizeYnFlag(addrRaw);
  const esgScore = pickNumericOptional(r.esgScore ?? r.esg_score);
  const memberStatus = pickDetailString(r, ['memberStatus', 'member_status']);
  const accountStatus = pickDetailString(r, ['accountStatus', 'account_status']);
  const organizationId = asTextMemberField(r.organizationId ?? r.organization_id);
  const jobGradeId = asTextMemberField(r.jobGradeId ?? r.job_grade_id);
  const jobTitleId = asTextMemberField(r.jobTitleId ?? r.job_title_id);
  const roleId = asTextMemberField(r.roleId ?? r.role_id);
  const memberIdResolved =
    asTextMemberField(r.memberId ?? r.member_id) || asTextMemberField(base.memberId as unknown);
  const sabunResolved =
    pickDetailScalar(r, [
      'sabun',
      'employeeNumber',
      'employee_number',
      'empNo',
      'emp_no',
      'staffNumber',
      'staff_number',
    ]) ?? asTextMemberField(base.sabun as unknown);
  return {
    ...base,
    memberId: memberIdResolved,
    sabun: sabunResolved,
    ...(memberStatus ? { memberStatus: memberStatus as MemberDetail['memberStatus'] } : {}),
    ...(accountStatus ? { accountStatus: accountStatus as MemberDetail['accountStatus'] } : {}),
    phonePublicYn: phone !== undefined ? phone : normalizeYnFlag(base.phonePublicYn as unknown) ?? base.phonePublicYn,
    addressPublicYn: addr !== undefined ? addr : normalizeYnFlag(base.addressPublicYn as unknown) ?? base.addressPublicYn,
    ...(esgScore !== undefined ? { esgScore } : {}),
    ...(organizationId ? { organizationId } : {}),
    ...(jobGradeId ? { jobGradeId } : {}),
    ...(jobTitleId ? { jobTitleId } : {}),
    ...(roleId ? { roleId } : {}),
  };
}

/** Spring Data Page 등에서 역할 행 배열만 꺼냄 */
function extractRoleListArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'object') return [];
  const r = raw as Record<string, unknown>;
  const keys = ['content', 'roles', 'roleList', 'items', 'list', 'data', 'elements'] as const;
  for (const k of keys) {
    const v = r[k];
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object' && Array.isArray((v as Record<string, unknown>).content)) {
      return (v as { content: unknown[] }).content;
    }
  }
  return [];
}

function asScalarId(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string') {
    const t = value.trim();
    return t;
  }
  if (typeof value === 'boolean') return '';
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (typeof o.toString === 'function') {
      const s = String(value);
      if (s && s !== '[object Object]' && s.length >= 8) return s.trim();
    }
  }
  return '';
}

/** 목록/상세 JSON에서 역할 PK 추출 (`id` · `roleId` · `role_id` 등) */
function pickRoleId(record: Record<string, unknown>): string {
  const directKeys = [
    'id',
    'roleId',
    'role_id',
    'memberRoleId',
    'member_role_id',
    'uuid',
    'roleUuid',
    'role_uuid',
    'roleUUID',
  ] as const;
  for (const k of directKeys) {
    const s = asScalarId(record[k]);
    if (s) return s;
  }
  for (const [k, v] of Object.entries(record)) {
    if (!/Id$/i.test(k) && !/_id$/i.test(k) && k.toLowerCase() !== 'uuid') continue;
    if (/roleName$/i.test(k)) continue;
    const s = asScalarId(v);
    if (s) return s;
  }
  return '';
}

function flattenRoleRow(raw: Record<string, unknown>): Record<string, unknown> {
  const role = raw.role;
  if (role && typeof role === 'object' && !Array.isArray(role)) {
    return { ...raw, ...(role as Record<string, unknown>) };
  }
  return raw;
}

function normalizeRoleListItem(raw: unknown): MemberRoleListItem {
  if (typeof raw === 'string') {
    const id = raw.trim();
    return { id, name: '', description: undefined };
  }
  let r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  r = flattenRoleRow(r);
  const id = pickRoleId(r);
  const name =
    typeof r.name === 'string' ? r.name : typeof r.roleName === 'string' ? r.roleName : '';
  const description =
    typeof r.description === 'string'
      ? r.description
      : typeof r.desc === 'string'
        ? r.desc
        : undefined;
  return { id, name, description };
}

function normalizePermissionItem(raw: unknown): RolePermissionItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const resource = r.resource ?? r.permissionResource;
  const action = r.action;
  const permissionRange = r.permissionRange ?? r.permission_range;
  if (typeof resource !== 'string' || typeof action !== 'string' || typeof permissionRange !== 'string') {
    return null;
  }
  return {
    resource: resource as RolePermissionItem['resource'],
    action: action as RolePermissionItem['action'],
    permissionRange: permissionRange as RolePermissionItem['permissionRange'],
  };
}

function normalizeRoleDetail(raw: unknown): MemberRoleDetail {
  let r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  r = flattenRoleRow(r);
  const id = pickRoleId(r);
  const name =
    typeof r.name === 'string' ? r.name : typeof r.roleName === 'string' ? r.roleName : '';
  const description =
    typeof r.description === 'string'
      ? r.description
      : typeof r.desc === 'string'
        ? r.desc
        : undefined;
  const permsRaw = r.permissions;
  const permissions: RolePermissionItem[] = Array.isArray(permsRaw)
    ? permsRaw.map(normalizePermissionItem).filter((x): x is RolePermissionItem => x !== null)
    : [];
  return { id, name, description, permissions };
}

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
  /** 비밀번호 변경 — `Authorization`, `X-User-UUID` 는 httpClient 인터셉터. 400 시 메시지 예: 현재 비밀번호 불일치, 새 비밀번호 불일치, 현재와 동일 */
  async changePassword(payload: {
    currentPassword: string;
    newPassword: string;
    newPasswordCheck: string;
  }) {
    const response = await httpClient.post('/member/change-password', payload);
    return unwrapApiResponse<null>(response.data);
  },
  async logout() {
    const response = await httpClient.post('/member/logout');
    return unwrapApiResponse<null>(response.data);
  },
  /**
   * 비밀번호 찾기 1단계 — 개인 이메일로 6자리 인증 코드 발송 (유효 5분, Redis).
   * `POST /member/reset-password/send-code?personalEmail=` — 인증 토큰 불필요.
   * 404: 해당 이메일로 가입된 계정 없음.
   */
  async sendResetPasswordCode(personalEmail: string) {
    const response = await httpClient.post('/member/reset-password/send-code', undefined, {
      params: { personalEmail },
    });
    return unwrapApiResponse<null>(response.data);
  },
  /**
   * 비밀번호 찾기 2단계 — 인증 코드 확인 (Redis에 인증 완료 30분).
   * `POST /member/reset-password/verify-code?personalEmail=&code=` — 인증 토큰 불필요.
   * 400: 코드 불일치 또는 만료.
   */
  async verifyResetPasswordCode(personalEmail: string, code: string) {
    const response = await httpClient.post('/member/reset-password/verify-code', undefined, {
      params: { personalEmail, code },
    });
    return unwrapApiResponse<null>(response.data);
  },
  /**
   * 비밀번호 찾기 3단계 — 새 비밀번호 설정 (2단계 완료 후).
   * `POST /member/reset-password` Body: personalEmail, newPassword, newPasswordCheck — 인증 토큰 불필요.
   * 400: 인증 미완료, 새 비밀번호 불일치, 비밀번호 정책 미충족(영문+숫자+특수 8~20자 등).
   */
  async resetPassword(payload: {
    personalEmail: string;
    newPassword: string;
    newPasswordCheck: string;
  }) {
    const response = await httpClient.post('/member/reset-password', payload);
    return unwrapApiResponse<null>(response.data);
  },

  // Member CRUD (헤더 X-User-UUID, X-User-MemberPositionId 는 httpClient 인터셉터에서 설정)
  async create(payload: CreateMemberPayload) {
    const response = await httpClient.post('/member/create', payload);
    return unwrapApiResponse<MemberSummary>(response.data);
  },
  async list(params?: Record<string, unknown>) {
    const response = await httpClient.get('/member/list', { params });
    return unwrapApiResponse<MemberSummary[]>(response.data);
  },
  /** 결재 참조(CC)·공람(CIRCULATION) 선택 — 직원 목록을 memberPositionId 포함 형태로 정규화 */
  async listMembersForApprovals(params?: { keyword?: string }) {
    const response = await httpClient.get('/member/list', { params });
    const raw = unwrapApiResponse<unknown>(response.data);
    const rows = extractMemberListRows(raw)
      .map(normalizeMemberListItemForApproval)
      .filter((v): v is MemberListItemForApproval => v != null);
    const kw = params?.keyword?.trim().toLowerCase();
    if (!kw) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(kw) ||
        r.organizationName.toLowerCase().includes(kw) ||
        r.jobTitleName.toLowerCase().includes(kw) ||
        (r.email?.toLowerCase().includes(kw) ?? false),
    );
  },

  /**
   * GET /member/search — QueryDSL 페이징, **호출자 소속 회사만** 검색 (백엔드 강제).
   * ES(`/search/employees`) 없이도 동작해 급여 설정 등에서 권장.
   */
  async searchMembersLookup(params: { keyword: string; page?: number; size?: number }): Promise<
    {
      memberId: string;
      name?: string;
      email?: string;
      organizationName?: string;
      jobTitleName?: string;
    }[]
  > {
    const kw = params.keyword?.trim() ?? '';
    if (!kw) return [];
    const response = await httpClient.get('/member/search', {
      params: { keyword: kw, page: params.page ?? 0, size: params.size ?? 30 },
    });
    const raw = unwrapApiResponse<unknown>(response.data);
    if (!raw || typeof raw !== 'object') return [];
    const pageObj = raw as Record<string, unknown>;
    const content = Array.isArray(pageObj.content) ? pageObj.content : [];
    const out: {
      memberId: string;
      name?: string;
      email?: string;
      organizationName?: string;
      jobTitleName?: string;
    }[] = [];
    for (const row of content) {
      if (!row || typeof row !== 'object') continue;
      const o = row as Record<string, unknown>;
      const memberId = asTextMemberField(o.memberId ?? o.member_id);
      if (!memberId) continue;
      out.push({
        memberId,
        name: asTextMemberField(o.name) || undefined,
        email: asTextMemberField(o.email) || undefined,
        organizationName: asTextMemberField(o.organizationName ?? o.organization_name) || undefined,
        jobTitleName: asTextMemberField(o.jobTitleName ?? o.job_title_name) || undefined,
      });
    }
    return out;
  },
  async detail(memberId: string) {
    const id = memberId?.trim();
    if (!id) {
      throw new Error('회원 ID가 없습니다.');
    }
    const response = await httpClient.get(`/member/detail/${encodeURIComponent(id)}`);
    const raw = unwrapApiResponse<unknown>(response.data);
    return normalizeMemberDetailResponse(raw);
  },

  /** 403·404 등 — 결재 상세 등에서 타인 프로필 조회가 막힐 때 스냅샷·직위 API로만 표시 */
  async detailOrNull(memberId: string): Promise<MemberDetail | null> {
    try {
      return await this.detail(memberId);
    } catch {
      return null;
    }
  },

  /** GET /member/dashboard-profile */
  async dashboardProfile() {
    const response = await httpClient.get('/member/dashboard-profile');
    const root = response.data;
    if (root && typeof root === 'object' && 'success' in root && (root as { success?: boolean }).success === false) {
      const msg = (root as { message?: string }).message;
      throw new Error(
        typeof msg === 'string' && msg.trim() ? msg : '\ub300\uc2dc\ubcf4\ub4dc \ud504\ub85c\ud544\uc744 \ubd88\ub7ec\uc624\uc9c0 \ubabb\ud588\uc2b5\ub2c8\ub2e4.',
      );
    }
    const data = unwrapApiResponse<unknown>(response.data);
    const parsed = normalizeDashboardProfile(data);
    if (!parsed) {
      throw new Error('\ub300\uc2dc\ubcf4\ub4dc \ud504\ub85c\ud544 \uc751\ub2f5\uc744 \ud574\uc11d\ud560 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4.');
    }
    return parsed;
  },
  /** 결재 상세 등 — approvalLines 의 직위 ID로 이름·부서·직책 조회 */
  async positionInternal(memberPositionId: string) {
    const id = memberPositionId?.trim();
    if (!id) {
      throw new Error('직위 ID가 없습니다.');
    }
    const response = await httpClient.get(`/member/position/internal/${encodeURIComponent(id)}`);
    const raw = unwrapApiResponse<unknown>(response.data);
    return normalizeMemberPositionInternal(raw);
  },
  /** 경로/권한 오류 시 null — member/detail 등으로 폴백 */
  async positionInternalOrNull(memberPositionId: string): Promise<MemberPositionInternalRes | null> {
    try {
      return await this.positionInternal(memberPositionId);
    } catch {
      return null;
    }
  },
  /** 인사용 직원 정보 수정 — PUT /member/update/{targetMemberId} */
  async updateHr(targetMemberId: string, payload: UpdateMemberHrPayload) {
    const id = targetMemberId?.trim();
    if (!id) {
      throw new Error('수정 대상 직원 ID가 없습니다.');
    }
    const response = await httpClient.put(`/member/update/${encodeURIComponent(id)}`, payload);
    return unwrapApiResponse<Record<string, unknown>>(response.data);
  },
  /** 내 정보 수정 — `Authorization`, `X-User-UUID` 는 httpClient 인터셉터. 미변경 필드는 `null` */
  async updateMe(payload: UpdateMyInfoPayload) {
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
  /** PATCH /member/onboarding/complete — 관리자 최초 세팅 완료 처리 */
  async completeOnboarding() {
    const response = await httpClient.patch('/member/onboarding/complete');
    return unwrapApiResponse<null>(response.data);
  },

  // Role management (역할/권한)
  async getRoles() {
    const response = await httpClient.get('/member/role/list');
    const raw = unwrapApiResponse<unknown>(response.data);
    const list = extractRoleListArray(raw);
    return list.map(normalizeRoleListItem);
  },
  async getRole(roleId: string) {
    const id = roleId?.trim();
    if (!id) {
      throw new Error('역할 ID가 없습니다.');
    }
    const response = await httpClient.get(`/member/role/${encodeURIComponent(id)}`);
    const raw = unwrapApiResponse<unknown>(response.data);
    return normalizeRoleDetail(raw);
  },
  async createRole(payload: CreateRolePayload) {
    const response = await httpClient.post('/member/role/create', payload);
    const raw = unwrapApiResponse<unknown>(response.data);
    return normalizeRoleDetail(raw);
  },
  async updateRole(roleId: string, payload: UpdateRolePayload) {
    const id = roleId?.trim();
    if (!id) {
      throw new Error('역할 ID가 없습니다.');
    }
    const response = await httpClient.put(`/member/role/${encodeURIComponent(id)}`, payload);
    const raw = unwrapApiResponse<unknown>(response.data);
    return normalizeRoleDetail(raw);
  },
  async deleteRole(roleId: string) {
    const id = roleId?.trim();
    if (!id) {
      throw new Error('역할 ID가 없습니다.');
    }
    const response = await httpClient.delete(`/member/role/${encodeURIComponent(id)}`);
    return unwrapApiResponse<null>(response.data);
  },
  async changeMemberRole(payload: { memberId: string; roleId: string }) {
    const response = await httpClient.put(`/member/update/${payload.memberId}/role`, { roleId: payload.roleId });
    return unwrapApiResponse<null>(response.data);
  },
  /**
   * GET /member/{targetMemberId}/history — 직원 이력 (최신순).
   * `Authorization`, `X-User-UUID`, `X-User-MemberPositionId` 는 httpClient 인터셉터에서 설정.
   */
  async getMemberHistory(targetMemberId: string): Promise<MemberHistoryItem[]> {
    const id = targetMemberId?.trim();
    if (!id) {
      throw new Error('구성원 ID가 없습니다.');
    }
    const response = await httpClient.get(`/member/${encodeURIComponent(id)}/history`);
    const unwrapped = unwrapApiResponse<unknown>(response.data);
    const arr = Array.isArray(unwrapped) ? unwrapped : [];
    return arr.map(normalizeMemberHistoryRow);
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
    formData.append('profileImage', file);
    const response = await httpClient.patch('/member/profile-image', formData);
    return unwrapApiResponse<{ imageUrl?: string; profileUrl?: string }>(response.data);
  },
  async deleteProfileImage() {
    const response = await httpClient.delete('/member/profile-image');
    return unwrapApiResponse<null>(response.data);
  },

  /** GET /member/signature — 등록된 서명 이미지 URL, 미등록 시 null */
  async getSignatureImageUrl(): Promise<string | null> {
    const response = await httpClient.get('/member/signature');
    const payload = response.data;
    if (payload && typeof payload === 'object' && 'data' in payload) {
      const d = (payload as { data: unknown }).data;
      if (d === null || d === undefined) return null;
      if (typeof d === 'string' && d.trim()) return d.trim();
      return null;
    }
    if (typeof payload === 'string' && payload.trim()) return payload.trim();
    return null;
  },
  /** PATCH /member/signature — PNG 서명 등록·교체 (multipart `signatureImage`) */
  async uploadSignatureImage(file: File) {
    const formData = new FormData();
    formData.append('signatureImage', file);
    const response = await httpClient.patch('/member/signature', formData);
    return unwrapApiResponse<null>(response.data);
  },
  /** DELETE /member/signature */
  async deleteSignatureImage() {
    const response = await httpClient.delete('/member/signature');
    return unwrapApiResponse<null>(response.data);
  },
};
