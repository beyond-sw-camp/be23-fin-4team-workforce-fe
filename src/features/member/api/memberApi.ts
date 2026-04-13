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
  organizationName?: string;
  jobGradeName?: string;
  jobTitleName?: string;
  roleName?: string;
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
  return {
    ...base,
    ...(memberStatus ? { memberStatus: memberStatus as MemberDetail['memberStatus'] } : {}),
    ...(accountStatus ? { accountStatus: accountStatus as MemberDetail['accountStatus'] } : {}),
    phonePublicYn: phone !== undefined ? phone : normalizeYnFlag(base.phonePublicYn as unknown) ?? base.phonePublicYn,
    addressPublicYn: addr !== undefined ? addr : normalizeYnFlag(base.addressPublicYn as unknown) ?? base.addressPublicYn,
    ...(esgScore !== undefined ? { esgScore } : {}),
    ...(organizationId ? { organizationId } : {}),
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
  async sendResetPasswordCode(personalEmail: string) {
    const response = await httpClient.post('/member/reset-password/send-code', undefined, {
      params: { personalEmail },
    });
    return unwrapApiResponse<null>(response.data);
  },
  async verifyResetPasswordCode(personalEmail: string, code: string) {
    const response = await httpClient.post('/member/reset-password/verify-code', undefined, {
      params: { personalEmail, code },
    });
    return unwrapApiResponse<null>(response.data);
  },
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
  async detail(memberId: string) {
    const id = memberId?.trim();
    if (!id) {
      throw new Error('회원 ID가 없습니다.');
    }
    const response = await httpClient.get(`/member/detail/${encodeURIComponent(id)}`);
    const raw = unwrapApiResponse<unknown>(response.data);
    return normalizeMemberDetailResponse(raw);
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
  async update(memberId: string, payload: Record<string, unknown>) {
    const response = await httpClient.put(`/member/update/${memberId}`, payload);
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
    formData.append('profileImage', file);
    const response = await httpClient.patch('/member/profile-image', formData);
    return unwrapApiResponse<{ imageUrl?: string; profileUrl?: string }>(response.data);
  },
  async deleteProfileImage() {
    const response = await httpClient.delete('/member/profile-image');
    return unwrapApiResponse<null>(response.data);
  },
};
