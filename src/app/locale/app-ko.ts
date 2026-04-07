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

/** 성과(/app/performance) 화면 카피 */
export const PERFORMANCE_PAGE_KO = {
  /** 히어로 — 레퍼런스 스타일 상단 요약 */
  heroTitle: '성과 요약',
  /** {pct}는 진행 중 평균 달성률로부터 계산한 “남은 비율”로 치환 */
  heroRemainBefore: '이번 달 목표 달성까지 ',
  heroRemainAfter: ' 남았습니다.',
  heroActiveNoScore:
    '진행 중인 목표가 있습니다. 실적을 입력하면 달성·잔여 비율을 여기에서 확인할 수 있습니다.',
  heroDraftOnly: '진행 전 목표가 있습니다. 목록 또는 보드에서 진행을 시작해 주세요.',
  heroEmpty: '등록된 목표가 없습니다. 목표 등록으로 시작할 수 있습니다.',
  heroIdle: '아래에서 목표·실적·지표 템플릿을 관리할 수 있습니다.',
  /** GOAL_CREATE 등 목표 설계 권한이 있을 때 — 히어로 하단 보조 설명 */
  pageLeadWithCreate:
    '목표 수립·실적 관리를 한 화면에서 처리합니다. 조직 단위 현황은 「전체」 범위로 전환해 확인하세요.',
  /** 목표 생성 권한이 없을 때(실행·입력 중심) */
  pageLeadMember: '배정된 목표의 진행 상태를 확인하고, 기간 중 실적을 제출합니다.',
  scopeMine: '내 목표',
  scopeAll: '전체',
  toolbarScopeLabel: '대상',
  toolbarLayoutLabel: '보기',
  viewList: '리스트',
  viewBoard: '보드',
  filterButton: '필터링',
  goalSortEndDateAsc: '마감 빠른 순',
  goalSortEndDateDesc: '마감 늦은 순',
  goalSortProgressAsc: '진행률 낮은 순',
  goalSortProgressDesc: '진행률 높은 순',
  advancedFilters: '상세 조건',
  avgAchievement: '진행 중 평균 달성률',
  statAll: '전체',
  statTotal: '목표',
  statActive: '진행 중',
  statDraft: '진행 전',
  statCompleted: '완료',
  /** 기간 만료일이 지났는데도 진행 중인 목표 */
  statDelayed: '지연',
  statScopeNote: '집계 범위는 상단 「내 목표 / 전체」 선택과 동일합니다.',
  tabGoals: '목표 및 실적',
  tabTemplates: '지표 템플릿',
  tabTemplatesIntro:
    '목표 생성 시 선택하는 KPI 정의입니다. 공통 지표를 등록해 두면 입력 오류를 줄이고 보고서 형식을 맞출 수 있습니다.',
  filterHint:
    '조건은 이 화면에만 적용됩니다. 보드에서 진행 전 → 진행 중 이동 시 진행 시작이 반영됩니다. 실적 제출 후 검토·확정은 권한과 백엔드 정책을 따릅니다.',
  ctaAddGoal: '목표 추가',
  ctaAddTemplate: '템플릿 등록',
  searchPlaceholder: '찾으시는 목표가 있나요?',
  searchTemplatesPlaceholder: '템플릿 이름으로 검색',
  /** 목표 탭 리스트·보드 — 데이터 없음·필터 결과 없음 공통(두 줄 + SVG) */
  emptyGoalsTitle: '필터 조건에 맞는 목표가 없습니다.',
  emptyGoalsHint: '검색·필터를 바꾸거나 새 목표를 만들어 보세요.',
  emptyTemplates: '템플릿이 없습니다. 회사 지표 형식을 먼저 등록해 주세요.',
  emptyTemplatesSearch: '검색어에 맞는 템플릿이 없습니다. 다른 키워드를 입력해 보세요.',
} as const;

/** 평가(/app/evaluations) 화면 */
export const EVALUATION_PAGE_KO = {
  pageIntro:
    '정책 수립 → 평가 생성 → 동료 배정(선택) → 작성·제출 → 조정·확정 순으로 진행됩니다. 권한에 따라 보이는 메뉴가 달라질 수 있습니다.',
  flowTitle: '평가 진행 순서',
  flowSteps: [
    '인사/관리자가 평가 정책을 등록합니다.',
    '평가 건이 생성되면 작성자는 초안(DRAFT)에서 점수·의견을 입력합니다.',
    '필요 시 동료 평가가 배정·수락됩니다.',
    '제출하면 수정할 수 없습니다(SUBMITTED).',
    '조정 기록 후 최종 확정(CONFIRMED)과 등급이 부여됩니다.',
  ],
  tabMine: '내가 할 평가',
  tabPolicies: '평가 정책',
  activeOnlyPolicies: '활성 정책만',
  policyTableName: '정책명',
  policyTableCycle: '주기',
  policyTablePeriod: '평가 기간',
  policyTableResultOpen: '결과 공개일',
  policyTableActive: '상태',
  policyDeactivate: '비활성화',
  policyDeactivateConfirm: '이 정책을 비활성화할까요?',
  ctaNewPolicy: '새 정책',
  ctaNewEvaluation: '평가 생성',
  policyPickForList: '정책을 선택하면 소속 평가 목록을 볼 수 있습니다.',
  evalTableEvaluatee: '피평가자',
  evalTableEvaluator: '평가자',
  evalTableType: '유형',
  evalTableStatus: '상태',
  evalOpen: '열기',
  emptyMyEval: '나에게 배정된 평가가 없습니다.',
  emptyPolicies: '등록된 평가 정책이 없습니다.',
  drawerTitle: '평가 상세',
  saveDraft: '저장',
  submitEval: '제출',
  submitWarning: '제출 후에는 점수·의견을 수정할 수 없습니다. 계속할까요?',
  confirmEval: '확정',
  confirmTitle: '평가 확정',
  finalScore: '최종 점수',
  finalGrade: '등급',
  roleHintNoH: '정책 관리·확정은 EVALUATION 권한이 있는 역할에서 수행할 수 있습니다.',
  modalNewPolicyTitle: '평가 정책 등록',
  modalNewEvalTitle: '평가 생성',
  evaluateeSearchPlaceholder: '이름·이메일로 검색 후 피평가자 선택',
  evaluateeIdRequired: '피평가자를 선택하세요.',
  uuidInvalidFormat:
    '36자 표준 UUID 형식이어야 합니다. (예: 550e8400-e29b-41d4-a716-446655440000)',
  uuidInvalidCompany:
    '회사 ID가 올바르지 않습니다. 로그인 상태를 확인하거나 다시 로그인해 주세요.',
  peerMemberIdPlaceholder: '동료 평가자 회원 UUID',
  tabPeers: '동료 배정',
  peerAssign: '배정',
  peerListTitle: '동료 배정 현황',
  tabCalibration: '조정 이력',
  calibrationReason: '조정 사유',
  calibrationRecord: '조정 기록',
  statusDraft: '작성 중',
  statusSubmitted: '제출됨',
  statusConfirmed: '확정',
} as const;
