export type AccountStatus = 'ACTIVE' | 'BLOCKED' | 'DELETED';

export type AuthFlags = {
  mustChangePassword?: boolean;
  emailVerificationRequired?: boolean;
  accountStatus?: AccountStatus;
};

export type Me = {
  id: string;
  /** JWT·로그인 응답의 회사 UUID — Goal 등 멀티테넌시 API 바디에 사용 */
  companyId?: string;
  name: string;
  email: string;
  permissions: string[];
  /** JWT `isSystemAdmin` / 응답 `isSystemAdminYn === 'YES'` — 백엔드 AOP 에서 Redis 없이 전 권한 통과 */
  isSystemAdmin?: boolean;
  /** 직급·직책 (예: 대리) — JWT 또는 로그인 응답에 있을 때만 채워짐 */
  jobTitle?: string;
  /** 부서·조직명 — JWT 또는 로그인 응답에 있을 때만 채워짐 */
  departmentName?: string;
  /** 고객사(테넌트) 회사명 — 사이드바 등에 표시, JWT/로그인 응답에 있을 때만 */
  companyName?: string;
  /** 고객사 로고 이미지 URL — 등록된 경우 사이드바에 표시 */
  companyLogoUrl?: string;
  /** 프로필(증명) 사진 URL — 있으면 사이드바 등에 표시, 없으면 이름 이니셜 */
  profileImageUrl?: string;
  flags?: AuthFlags;
};

export type LoginInput = {
  email: string;
  password: string;
};

export type AuthSession = {
  user: Me;
};

export type AuthClient = {
  login: (input: LoginInput) => Promise<AuthSession>;
  logout: () => Promise<void>;
  getSession: () => Promise<AuthSession | null>;
  getMe: () => Promise<Me>;
  refreshSession?: () => Promise<AuthSession | null>;
};

export type AuthContextValue = {
  status: 'loading' | 'authenticated' | 'unauthenticated';
  user: Me | null;
  isAuthenticated: boolean;
  login: (input: LoginInput) => Promise<AuthSession>;
  logout: () => Promise<void>;
  /** AT 재발급 후 사용자 정보(JWT 클레임) 갱신 — 성공 여부 */
  refreshAuth: () => Promise<boolean>;
  /** AT 만료 시각(ms). JWT `exp` 또는 발급 기준 +30분 */
  accessExpiresAtMs: number | null;
};
