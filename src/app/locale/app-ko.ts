/** 앱 영역(/app) 공통 한글 문구 */

export const APP_BRAND_NAME = '워크포스';

export const APP_MENU_LABEL: Record<string, string> = {
  '/app/dashboard': '대시보드',
  '/app/calendar': '일정',
  '/app/members': '구성원',
  '/app/organization': '조직',
  '/app/roles': '역할·권한',
  '/app/attendance': '근태',
  '/app/leave': '휴가',
  '/app/approvals': '결재',
  '/app/payroll': '급여',
  '/app/mail': '메일',
  '/app/notifications': '알림',
  '/app/performance': '성과',
  '/app/evaluations': '평가',
  '/app/meetings': '미팅',
  '/app/settings': '설정',
  '/app/ai-documents': 'HR 정책 문서',
};

/** 사이드 메뉴 표시 순서 */
export const APP_MENU_PATH_ORDER = [
  '/app/dashboard',
  '/app/calendar',
  '/app/members',
  '/app/organization',
  '/app/roles',
  '/app/attendance',
  '/app/leave',
  '/app/approvals',
  '/app/payroll',
  '/app/mail',
  '/app/performance',
  '/app/evaluations',
  '/app/meetings',
  '/app/settings',
] as const;

/** ESG 메뉴(설정 ON 시 사이드바에 삽입) — 경로·라벨 */
export const ESG_MENU_PATH_ORDER = [
  '/app/esg',
  '/app/esg/activities',
  '/app/esg/campaigns',
  '/app/esg/shop',
  '/app/esg/admin',
] as const;

export const ESG_MENU_LABEL: Record<string, string> = {
  '/app/esg': 'ESG',
  '/app/esg/activities': 'ESG 활동',
  '/app/esg/campaigns': 'ESG 캠페인',
  '/app/esg/shop': 'ESG 샵',
  '/app/esg/admin': 'ESG 관리',
};

/** 성과·평가·미팅 — 사이드바 접이식 그룹 제목 */
export const APP_MENU_TALENT_HUB_LABEL = '성과·평가·미팅';

/** 상단 헤더 등에 표시하는 현재 화면 제목 */
export function appHeaderTitleFromPath(
  pathname: string,
  opts?: { isSystemAdmin?: boolean },
): string {
  if (pathname === '/app/dashboard' && opts?.isSystemAdmin) {
    return '관리자 대시보드';
  }
  const exact = APP_MENU_LABEL[pathname] ?? ESG_MENU_LABEL[pathname];
  if (exact) return exact;
  if (pathname === '/app/me') return '마이페이지';
  if (pathname === '/app/me/edit') return '내 정보 수정';
  if (/^\/app\/members\/[^/]+$/.test(pathname)) return '구성원 상세';
  return APP_BRAND_NAME;
}

export const APP_GENERIC_PAGE_COPY: Record<string, { title: string; description: string }> = {
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
  '/meetings': {
    title: '미팅',
    description: '1:1·팀 미팅 일정·기록 기능을 준비 중입니다.',
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
  DORMANT: '휴직',
  LEAVE: '퇴직',
};

export const ACCOUNT_STATUS_KO: Record<'ACTIVE' | 'BLOCKED' | 'DELETED', string> = {
  ACTIVE: '정상',
  BLOCKED: '잠금',
  DELETED: '삭제됨',
};

export const EMPLOYMENT_TYPE_KO: Record<string, string> = {
  FULL_TIME: '정규직',
  PART_TIME: '파트타임',
  CONTRACT: '계약직',
  INTERN: '인턴',
  /** 구 API 호환 */
  CONTRACTOR: '계약직',
};

/** 성과(/app/performance) 화면 카피 */
export const PERFORMANCE_PAGE_KO = {
  /** 히어로 — 레퍼런스 스타일 상단 요약 */
  heroTitle: '성과 요약',
  /** {pct}는 진행 중 평균 달성률로부터 계산한 “남은 비율”로 치환 */
  heroRemainBefore: '현재 목표 달성까지 ',
  heroRemainAfter: ' 남았습니다.',
  heroActiveNoScore:
    '진행 중인 목표가 있습니다. 실적을 입력하면 달성·잔여 비율을 여기에서 확인할 수 있습니다.',
  heroDraftOnly: '진행 전 목표가 있습니다. 목록에서 진행을 시작해 주세요.',
  heroEmpty: '등록된 목표가 없습니다. 목표 등록으로 시작할 수 있습니다.',
  heroIdle: '아래에서 목표·실적·지표 템플릿을 관리할 수 있습니다.',
  /** GOAL_CREATE 등 목표 설계 권한이 있을 때 — 히어로 하단 보조 설명 */
  pageLeadWithCreate:
    '목표 수립·실적 관리를 한 화면에서 처리합니다. 조직 단위 현황은 「전체」 범위로 전환해 확인하세요.',
  /** 목표 생성 권한이 없을 때(실행·입력 중심) */
  pageLeadMember: '배정된 목표의 진행 상태를 확인하고, 기간 중 실적을 제출합니다.',
  scopeMine: '내 목표',
  scopeAll: '전체',
  scopeMembers: '구성원 목표',
  quickPickAll: '전체',
  orgSearchPlaceholder: '담당자·조직 검색',
  /** 멤버 목록/상세 API에 없는 ownerId — 과거 담당·타회사·삭제 계정·동기화 지연 등 */
  memberProfileUnknown: '담당자 프로필 없음',
  quickPickTitle: '빠른 선택',
  orgPanelTitle: '조직별 보기',
  toolbarScopeLabel: '대상',
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
    '조건은 이 화면에만 적용됩니다. 목표 카드에서 「진행 시작」하면 상태가 반영됩니다. 실적 제출 후 검토·확정은 권한과 백엔드 정책을 따릅니다.',
  ctaAddGoal: '목표 추가',
  ctaAddTemplate: '템플릿 등록',
  searchPlaceholder: '찾으시는 목표가 있나요?',
  searchTemplatesPlaceholder: '템플릿 이름으로 검색',
  /** 목표 탭 목록 — 데이터 없음·필터 결과 없음 공통(두 줄 + SVG) */
  emptyGoalsTitle: '필터 조건에 맞는 목표가 없습니다.',
  emptyGoalsHint: '검색·필터를 바꾸거나 새 목표를 만들어 보세요.',
  emptyTemplates: '템플릿이 없습니다. 회사 지표 형식을 먼저 등록해 주세요.',
  emptyTemplatesSearch: '검색어에 맞는 템플릿이 없습니다. 다른 키워드를 입력해 보세요.',
  templateInactive: '비활성',
  templateDeactivate: '비활성화',
  templateDeactivateConfirm:
    '이 KPI 템플릿을 비활성화할까요? 이후 새 목표에서는 선택할 수 없습니다.',
  templateNoActiveForGoal:
    '활성 KPI 템플릿이 없습니다. 템플릿 탭에서 등록하거나 비활성 템플릿을 확인해 주세요.',
  parentGoalLabel: '상위 목표',
  parentGoalPlaceholder: '루트 목표 — 상위 없음',
  parentGoalTooltip:
    '하위 목표로 만들 때만 선택합니다. 목록에 보이는 본인이 조회 가능한 목표만 선택할 수 있습니다.',
  parentGoalUnknown: '상위 미표시(권한·목록 밖)',
  goalRollupPolicyLabel: '하위 목표 롤업 방식',
  goalRollupPolicyTooltip:
    'CHILDREN_AVG: 직속 하위 달성률 평균. CHILDREN_WEIGHTED: 가중치·롤업 정책에 따름(가중치 미입력 시 서버 검증).',
  goalRollupChildrenAvg: '하위 평균 (CHILDREN_AVG)',
  goalRollupChildrenWeighted: '가중 롤업 (CHILDREN_WEIGHTED)',
  goalOrganizationOwnerLabel: '담당 조직',
  goalOrganizationOwnerPlaceholder: '조직 API에서 불러온 목록 중 선택',
  goalOrganizationOwnerRequired: '조직 목표는 담당 조직을 선택해야 합니다.',
  goalOrganizationListEmpty:
    '등록된 조직이 없습니다. 조직 마스터·연동을 확인한 뒤 조직 목표를 만들 수 있습니다.',
  goalContributionPctLabel: '기여도(%)',
  goalContributionPctTooltip: 'GoalCreateReqDto contributionPct. 선택 입력.',
  goalWeightPctLabel: '가중치(%)',
  goalWeightPctTooltip: '롤업이 CHILDREN_WEIGHTED일 때 사용. 비우면 전송하지 않습니다.',
  goalOwnerTypeMemberHint: '목표 소유 구성원을 지정합니다. 기본값은 본인이며, 검색으로 다른 구성원을 선택할 수 있습니다.',
  goalOwnerTypeOrgHint: '조직 엔티티 UUID를 선택합니다. 회사 ID(`companyId`)와는 별도입니다.',
  goalMemberOwnerLabel: '담당 구성원',
  goalMemberOwnerPlaceholder: '이름·이메일로 검색하여 선택',
  goalMemberOwnerRequired: '담당 구성원을 선택해 주세요.',
  /** 승인 카드 하단 안내 */
  approvalSectionHint:
    '승인 단계·담당자는 조직 정책과 백엔드 설정을 따릅니다. 반려 시 사유를 남기면 재검토에 도움이 됩니다.',
  approvalModalRequestTitle: '승인 요청',
  approvalModalApproveTitle: '승인 처리',
  approvalModalRejectTitle: '반려 처리',
  approvalApproversLabel: '승인자',
  approvalApproversPlaceholder: '검색하여 승인자를 선택',
  approvalApproversRequired: '승인자를 선택해 주세요.',
  approvalStepsEmpty: '등록된 승인자가 없습니다. 승인 요청 시 승인자를 지정합니다.',
  approvalCommentLabel: '코멘트',
  approvalCommentPlaceholderApprove: '승인 메모(선택)',
  approvalCommentPlaceholderReject: '반려 사유(필수)',
  approvalRejectCommentRequired: '반려 사유를 입력해 주세요.',
  approvalModalConfirm: '확인',
  approvalModalCancel: '취소',
  activityEmpty: '등록된 활동이 없습니다.',
  activityShowMore: '더보기',
  activityShowLess: '접기',
  /** 목표 상세 — 자동 집계(⚡) 설명 (OKR 레퍼런스 톤) */
  autoUpdateTooltip:
    '하위 목표·실적이 반영되면 이 목표의 진행률을 자동으로 다시 계산해요. 직접 %를 바꾸려면 자동 집계를 끄세요.',
  /** 수동 진행 반영 (POST /goal/{id}/updates) */
  ctaGoalProgressUpdate: '업데이트',
  progressUpdateModalTitle: '목표 업데이트',
  progressUpdateModalLead:
    '진행률(%)와 상태를 남기면 활동 내역에 기록됩니다. 코멘트·반응은 우측 활동/댓글에서 이어가면 됩니다.',
  progressUpdateFieldPct: '진행률(%)',
  progressUpdateFieldStatus: '상태',
  progressUpdateFieldNote: '메모(선택)',
  progressUpdateSubmit: '반영하기',
  progressUpdateRecent: '최근 업데이트 이력',
  goalProgressScaleHint: '목표 지표',
  subGoalsHeading: '하위 목표',
  subGoalsEmpty: '연결된 하위 목표가 없습니다. 목록에서 상위 목표를 지정해 추가할 수 있습니다.',
  periodRemainPrefix: 'D-',
  periodOverdue: '지연',
  /** PerformanceRecord — 매니저 검토 파이프라인 (진행률 업데이트와 구분) */
  ctaManagerReviewSubmit: '검토용 실적 제출',
  listQuickManagerReviewSubmit: '검토 제출',
  perfModalTitle: '검토용 실적 제출',
  perfModalLead:
    '달성 수치를 제출하면 매니저 검토·확정 후 목표 집계에 반영됩니다. 진행률만 빠르게 바꾸려면 상단 「업데이트」를 사용하세요.',
  perfFieldActualLabel: '달성 수치',
  perfFieldActualTooltip: '이번에 보고하는 실적 값입니다. 목표 지표(예: 건수·금액)와 같은 단위로 입력하세요.',
  perfFieldSelfScoreLabel: '자기 평가(선택)',
  perfFieldSelfScorePlaceholder: '미입력 시 검토자가 환산 점수만으로 판단합니다',
  perfFieldCommentLabel: '코멘트',
  perfFieldCommentPlaceholder: '근거·성과 요약 등',
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
