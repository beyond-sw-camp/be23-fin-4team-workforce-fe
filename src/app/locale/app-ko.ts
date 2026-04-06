/** 앱 영역(/app) 공통 한글 문구 */

export const APP_BRAND_NAME = '워크포스';

export const APP_MENU_LABEL: Record<string, string> = {
  '/app/dashboard': '대시보드',
  '/app/members': '구성원',
  '/app/organization': '조직',
  '/app/attendance': '근태',
  '/app/leave': '휴가',
  '/app/approvals': '결재',
  '/app/payroll': '급여',
  '/app/mail': '메일',
  '/app/notifications': '알림',
  '/app/performance': '성과',
  '/app/evaluations': '평가',
  '/app/ai-assistant': 'AI 비서',
  '/app/settings': '설정',
};

/** 사이드 메뉴 표시 순서 */
export const APP_MENU_PATH_ORDER = [
  '/app/dashboard',
  '/app/members',
  '/app/organization',
  '/app/attendance',
  '/app/leave',
  '/app/approvals',
  '/app/payroll',
  '/app/mail',
  '/app/notifications',
  '/app/performance',
  '/app/evaluations',
  '/app/ai-assistant',
  '/app/settings',
] as const;

/** 상단 헤더 등에 표시하는 현재 화면 제목 */
export function appHeaderTitleFromPath(pathname: string): string {
  const exact = APP_MENU_LABEL[pathname];
  if (exact) return exact;
  if (/^\/app\/members\/[^/]+$/.test(pathname)) return '구성원 상세';
  return APP_BRAND_NAME;
}

export const APP_GENERIC_PAGE_COPY: Record<string, { title: string; description: string }> = {
  '/organization': {
    title: '조직',
    description: '조직도·부서 관리 기능을 준비 중입니다. 곧 이용하실 수 있어요.',
  },
  '/attendance': {
    title: '근태',
    description: '출퇴근·근무 현황·근태 통계 기능을 준비 중입니다.',
  },
  '/leave': {
    title: '휴가',
    description: '휴가 신청·승인·잔여 일수 관리 기능을 준비 중입니다.',
  },
  '/approvals': {
    title: '결재',
    description: '전자결재·결재함 기능을 준비 중입니다.',
  },
  '/payroll': {
    title: '급여',
    description: '급여 명세·정산 기능을 준비 중입니다.',
  },
  '/mail': {
    title: '메일',
    description: '내부 메일·알림 연동 기능을 준비 중입니다.',
  },
  '/performance': {
    title: '성과',
    description: '목표·성과 관리 기능을 준비 중입니다.',
  },
  '/evaluations': {
    title: '평가',
    description: '인사 평가·피드백 기능을 준비 중입니다.',
  },
  '/ai-assistant': {
    title: 'AI 비서',
    description: '업무 질의·문서 요약 등 AI 지원 기능을 준비 중입니다.',
  },
  '/settings': {
    title: '설정',
    description: '내 계정·알림·환경 설정 화면을 준비 중입니다.',
  },
};

export const MEMBER_STATUS_KO: Record<'ACTIVE' | 'DORMANT' | 'LEAVE', string> = {
  ACTIVE: '재직',
  DORMANT: '휴면',
  LEAVE: '휴직',
};

export const ACCOUNT_STATUS_KO: Record<'ACTIVE' | 'BLOCKED' | 'DELETED', string> = {
  ACTIVE: '정상',
  BLOCKED: '잠금',
  DELETED: '삭제됨',
};

export const EMPLOYMENT_TYPE_KO: Record<'FULL_TIME' | 'CONTRACTOR' | 'INTERN', string> = {
  FULL_TIME: '정규직',
  CONTRACTOR: '계약직',
  INTERN: '인턴',
};
