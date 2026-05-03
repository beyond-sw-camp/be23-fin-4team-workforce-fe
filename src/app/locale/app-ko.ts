/** 앱 영역(/app) 공통 한글 문구 */

export const APP_BRAND_NAME = '워크포스';

export const APP_MENU_LABEL: Record<string, string> = {
  '/app/dashboard': '대시보드',
  '/app/insights': '인사이트',
  '/app/calendar': '일정',
  '/app/members': '구성원',
  '/app/organization': '조직',
  '/app/roles': '역할·권한',
  '/app/attendance': '내 근태',
  '/app/leave': '휴가 계획 관리',
  '/app/approvals': '결재함',
  '/app/contracts/send': '계약 발송',
  '/app/contracts': '전자계약',
  '/app/approvals/department': '부서 문서함',
  '/app/payroll': '급여 조회',
  '/app/payroll/annual': '연봉 조회',
  '/app/income': '소득관리',
  '/app/notifications': '알림',
  '/app/performance': '목표',
  '/app/evaluations': '내 평가',
  '/app/meetings': '면담',
  '/app/settings': '설정',
  '/app/ai-documents': 'HR 정책 문서',
  '/app/work-trips': '출장 신청/이력',
  '/app/attendance/monthly': '개인 월근태근무',
  '/app/attendance/schedules/my': '개인 근무 스케줄',
  '/app/attendance/overtime': '초과근무 관리',
  '/app/attendance/work-time': '내 주간 근무시간',
  '/app/attendance/company': '근태 현황',
  '/app/attendance/corrections': '출퇴근 정정 검토',
  '/app/attendance/holidays': '공휴일 관리',
  '/app/attendance/schedules': '근무스케줄 관리',
  '/app/attendance/overtime-policies': '연장근로 정책',
  '/app/attendance/flexible-slots': '시차 출퇴근 시간대',
  '/app/attendance/overtime-status': '초과근무 현황',
  '/app/leave/policies': '연차 정책 관리',
  '/app/leave/absence': '휴직 관리',
  '/app/leave/types': '휴가 종류 관리',
  '/app/leave/my-promotion': '휴가 계획 회신',
  '/app/leave/promotion-no-response': '촉진 알림 현황',
  '/app/payroll/admin': '급여 정산 관리',
  '/app/payroll/admin/allowances': '수당 관리',
  '/app/payroll/tax-summary': '세금·4대보험',
  '/app/payroll/allowances': '수당 변경 신청',
  '/app/payroll/negotiations': '내 연봉 협상 이력',
  '/app/payroll/retirement': '퇴직금 조회',
  '/app/salary/unused-leave': '연차수당 정산',
  '/app/salary/settings': '급여 정책',
  '/app/salary/pay-grade-table': '호봉표 관리',
  '/app/salary/retirement-policy': '퇴직급여 정책',
  '/app/salary/bonus-policy': '상여/성과금 정책',
};

/** 사이드 메뉴 표시 순서 */
export const APP_MENU_PATH_ORDER = [
  '/app/dashboard',
  '/app/insights',
  '/app/calendar',
  '/app/members',
  '/app/organization',
  '/app/attendance',
  '/app/leave',
  '/app/work-trips',
  '/app/approvals',
  '/app/payroll',
  '/app/performance',
  '/app/evaluations',
  '/app/meetings',
] as const;

/** ESG 메뉴(설정 ON 시 사이드바에 삽입) — 경로·라벨 */
export const ESG_MENU_PATH_ORDER = [
  '/app/esg',
  '/app/esg/shop',
  '/app/esg/admin',
] as const;

export const ESG_MENU_LABEL: Record<string, string> = {
  '/app/esg': 'My ESG',
  '/app/esg/shop': 'ESG 샵',
  '/app/esg/admin': 'ESG 설정',
};

/** 사이드바 접이식 그룹 — 통일 키워드: 「영역·영역」 */

/** 성과·평가·미팅 묶음 */
export const APP_MENU_TALENT_HUB_LABEL = '성과 관리';

/** 구성원·조직·권한 묶음 */
export const APP_MENU_ORG_HR_GROUP_LABEL = '인사 관리';

/** 사이드바 전용 — 라우트 없음, 조직도 모달 트리거 */
export const APP_MENU_ORG_CHART_SIDEBAR_KEY = '__wf_org_chart__';
export const APP_MENU_ORG_CHART_LABEL = '전체 조직도';

/** ESG 하위 화면 묶음 */
export const APP_MENU_ESG_GROUP_LABEL = 'ESG';

/** 근무 묶음 */
export const APP_MENU_WORK_GROUP_LABEL = '근태 관리';

/** 휴가 묶음 */
export const APP_MENU_LEAVE_GROUP_LABEL = '휴무 관리';

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
  if (pathname === '/app/attendance/monthly') return '개인 월근태근무';
  if (pathname === '/app/attendance/schedules/my') return '개인 근무 스케줄';
  if (pathname === '/app/attendance/overtime') return '초과 근무 관리';
  if (pathname === '/app/attendance/work-time') return '내 주간 근무시간';
  if (pathname === '/app/attendance/company') return '근태 현황';
  if (pathname === '/app/attendance/overtime-policies') return '연장근로 정책';
  if (pathname === '/app/attendance/overtime-status') return '초과근무 현황';
  if (pathname === '/app/attendance/flexible-slots') return '시차 출퇴근 시간대';
  if (pathname === '/app/leave/policies') return '연차 정책 관리';
  if (pathname === '/app/leave/absence') return '휴직 관리';
  if (pathname === '/app/leave/types') return '휴가 종류 관리';
  if (pathname === '/app/attendance/holidays') return '휴무일/공휴일 관리';
  if (pathname === '/app/attendance/schedules') return '근무 스케줄 관리';
  if (pathname === '/app/work-trips') return '출장 신청/이력';
  if (pathname === '/app/payroll/allowances') return '수당 변경 신청';
  if (pathname === '/app/salary/settings') return '급여 정책 설정';
  if (pathname === '/app/salary/pay-grade-table') return '호봉표 관리';
  if (pathname === '/app/salary/bonus-policy') return '보너스 정책';
  if (pathname === '/app/payroll') return '급여 조회';
  if (pathname === '/app/payroll/annual') return '연봉 조회';
  if (pathname === '/app/payroll/negotiations') return '내 연봉 협상 이력';
  if (pathname === '/app/income') return '소득관리';
  if (pathname === '/app/payroll/admin') return '급여 정산 관리';
  if (pathname === '/app/payroll/admin/allowances') return '수당 관리';
  if (/^\/app\/payroll\/admin\/[^/]+$/.test(pathname)) return '급여대장 편집';
  if (/^\/app\/payroll\/[^/]+$/.test(pathname)) return '급여 명세';
  if (/^\/app\/members\/[^/]+$/.test(pathname)) return '구성원 상세';
  if (pathname === '/app/approvals/department') return '부서 문서함';
  if (pathname === '/app/contracts/send') return '계약 발송';
  if (pathname === '/app/contracts') return '전자계약';
  if (/^\/app\/meetings\/[^/]+$/.test(pathname)) return '면담 상세';
  return APP_BRAND_NAME;
}

/** 일정(/app/calendar) */
export const CALENDAR_PAGE_KO = {
  workspaceEyebrow: 'Schedules & availability planning',
  pageTitle: '일정 관리',
} as const;

export const APP_GENERIC_PAGE_COPY: Record<string, { title: string; description: string }> = {
  '/approvals': {
    title: '결재',
    description: '전자결재·결재함 기능을 준비 중입니다.',
  },
  '/mail': {
    title: '메일',
    description: '내부 메일·알림 연동 기능을 준비 중입니다.',
  },
  '/meetings': {
    title: '면담',
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
  INITIAL: '수습',
  /** 구 API 호환 */
  CONTRACTOR: '계약직',
};

/** GET /member/{id}/history changeType */
export const MEMBER_HISTORY_CHANGE_TYPE_KO: Record<string, string> = {
  PROMOTION: '승진',
  GRADE_CHANGE: '직급 변경',
  ORG_CHANGE: '부서 이동',
  TITLE_CHANGE: '직책 변경',
  EMPLOYMENT_CHANGE: '고용형태 변경',
  JOIN: '입사',
  DORMANT: '휴직',
  RETURN: '복직',
  INITIAL: '최초 반영',
};

/** 성과(/app/performance) 화면 카피 */
export const PERFORMANCE_PAGE_KO = {
  /** 히어로 상단 영문 아이라인 */
  workspaceEyebrow: 'Goals & outcomes workspace',
  /** 히어로 — 레퍼런스 스타일 상단 요약 */
  heroTitle: '성과 관리',
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
  /** ACTIVE는 있으나 산출 가능한 달성률(pct)이 없을 때 요약 바 대신 */
  avgAchievementUnavailable: '산출 가능한 달성률이 없어 평균을 표시할 수 없습니다.',
  statAll: '전체',
  statTotal: '목표',
  statActive: '진행 중',
  statDraft: '진행 전',
  statCompleted: '완료',
  statScopeNote: '집계 범위는 상단 「내 목표 / 전체」 선택과 동일합니다.',
  approvalStripTitle: '완료 제출 승인',
  approvalStripCenter: '승인 센터',
  approvalStripPending: '내가 처리할 승인',
  approvalStripPendingShort: '처리 대기',
  approvalStripMine: '내가 보낸 요청',
  approvalStripMineShort: '내 요청',
  approvalStripEmptyPending: '대기 중인 요청이 없습니다.',
  approvalStripEmptyMine: '요청 내역이 없습니다.',
  approvalStripLoading: '불러오는 중…',
  tabGoals: '목표 및 실적',
  tabTemplates: '지표 템플릿',
  tabTemplatesIntro:
    '목표 생성 시 선택하는 KPI 정의입니다. 공통 지표를 등록해 두면 입력 오류를 줄이고 보고서 형식을 맞출 수 있습니다.',
  filterHint:
    '조건은 이 화면에만 적용됩니다. 목표 카드에서 「진행 시작」하면 상태가 반영됩니다. 실적 제출 후 검토·확정은 권한과 백엔드 정책을 따릅니다.',
  ctaAddGoal: '목표 추가',
  ctaAddTemplate: '템플릿 등록',
  kpiPresetButton: '추천 템플릿',
  kpiPresetTooltip: '자주 쓰는 지표 형식으로 양식을 채웁니다. 저장 전에 이름·수치를 조정하세요.',
  kpiPresetApplied: '추천 템플릿이 적용되었습니다.',
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
    '하위 평균: 직속 하위 목표 달성률을 단순 평균합니다. 가중 롤업: 하위 목표별 가중치를 반영해 합산합니다(가중치 미입력 시 저장이 제한될 수 있습니다).',
  goalRollupChildrenAvg: '하위 목표 평균',
  goalRollupChildrenWeighted: '하위 목표 가중 합산',
  goalOrganizationOwnerLabel: '담당 조직',
  goalOrganizationOwnerPlaceholder: '조직 API에서 불러온 목록 중 선택',
  goalOrganizationOwnerRequired: '조직 목표는 담당 조직을 선택해야 합니다.',
  goalOrganizationListEmpty:
    '등록된 조직이 없습니다. 조직 마스터·연동을 확인한 뒤 조직 목표를 만들 수 있습니다.',
  goalContributionPctLabel: '기여도(%)',
  goalContributionPctTooltip: 'GoalCreateReqDto contributionPct. 선택 입력.',
  goalWeightPctLabel: '가중치(%)',
  goalWeightPctTooltip: '하위 목표 가중 합산 방식을 사용할 때 적용됩니다. 비우면 전송하지 않습니다.',
  goalOwnerTypeMemberHint:
    '구성원: 개인 목표입니다. 누가 직접 수행하고 관리할지 지정합니다. 보통 본인 목표를 만들 때 사용합니다.',
  goalOwnerTypeOrgHint:
    '조직: 팀/부서 목표입니다. 조직 단위로 관리하며, 목표 책임자가 진행 상황을 주도합니다.',
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
  /** 목표 상세 — 자동 집계(⚡) 설명 (목표 레퍼런스 톤) */
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
  /** 허브 상단 영문 아이라인 */
  workspaceEyebrow: '평가 운영',
  // Page
  pageTitle: '평가 관리',

  // Tabs
  tabSeasons: '시즌 관리',
  tabMyEvaluations: '내 평가',
  tabDesigns: '평가 설계',
  tabProgress: '진행 관리',
  tabCalibration: '등급 조정',
  tabAnalytics: '결과 분석',
  tabAnomalies: '오류 감지',
  myEvaluationsEmptyHint:
    '할당된 평가가 없을 때: 시즌이 초안이면 관리자가 시즌을 시작해야 평가 할당이 생깁니다. 이미 진행 중인 시즌이면 그룹에 평가자를 지정한 뒤 저장했는지 확인하세요. (저장 시 할당이 갱신됩니다)',

  // Season
  seasonAdd: '평가 기간 추가',
  seasonName: '평가명',
  seasonType: '유형',
  seasonPeriod: '기간',
  /** 시즌 생성 — 평가 기준 설정 키 vs 진행 기간 분리 */
  seasonOkrPeriod: '평가에 사용할 목표 기간',
  seasonOkrPeriodHint:
    '평가를 시작하면 이 목표 기간의 승인 완료 목표만 평가 기준으로 사용됩니다.',
  seasonOpsPeriod: '평가 진행 기간',
  seasonOpsPeriodHint: '자기평가·등급 조정 등 평가 프로세스의 운영 구간입니다. 목표 기간과 달라도 됩니다.',
  seasonCycleYear: '연도',
  seasonCycleSegment: '기간',
  seasonTargetPreview: '평가 기준 시작일',
  seasonStatus: '상태',
  seasonActions: '액션',
  seasonEdit: '편집',
  seasonStart: '시작',
  seasonClose: '종료',
  seasonView: '조회',
  seasonSelect: '평가 기간 선택',
  seasonStartConfirm: '평가를 시작하시겠습니까?',
  seasonCloseConfirm: '평가를 종료하시겠습니까?',
  seasonCreated: '평가 기간이 생성되었습니다.',
  seasonStarted: '평가가 시작되었습니다.',
  seasonClosed: '평가가 종료되었습니다.',
  seasonResultPublishDate: '결과 공개일',
  seasonTypeAnnual: '연간',
  seasonTypeHalfYear: '반기',
  seasonTypeQuarter: '분기',

  // Status
  statusDraft: '초안',
  statusActive: '진행 중',
  statusClosed: '완료',
  statusNotStarted: '미시작',
  statusInProgress: '진행 중',
  statusSubmitted: '완료',

  // Group
  groupAdd: '그룹 추가',
  groupsTitle: '그룹 관리',
  groupName: '그룹명',
  groupTargetCount: '대상 인원',
  groupPersonCount: '명',
  groupEvalTypes: '평가 유형',
  groupDesign: '적용 설계',
  groupCreated: '그룹이 생성되었습니다.',

  // Eval types
  evalTypeSelf: '셀프',
  evalTypeDownward: '하향',
  evalTypeUpward: '상향',
  evalTypePeer: '동료',

  // Design
  designAdd: '설계 추가',
  designName: '설계명',
  designSections: '섹션',
  designSectionCount: '개',
  designPreview: '미리보기',
  designSave: '저장',
  designSelect: '설계 선택',
  designCreated: '설계가 생성되었습니다.',
  designSectionConfig: '섹션 구성(JSON)',
  designGradeConfig: '등급 설정(JSON)',
  designSectionAdd: '섹션 추가',
  designQuestionAdd: '문항 추가',
  designWeight: '가중치',
  designWeightSum: '전체 가중치 합계',
  designWeightWarning: '100% 필요',
  designWeightOk: '100% 충족',

  // Question types
  questionTypeText: '서술형',
  questionTypeScale: '척도형',
  questionTypeGrade: '등급형',
  questionTypeGap: '낙차형',

  // Grade
  gradeAbsolute: '절대 평가',
  gradeRelative: '상대 평가',
  gradeTargetDist: '목표 분포',

  // Response / Write
  writeTitle: '평가 작성',
  writeProgress: '진행률',
  writeSave: '임시 저장',
  writeSubmit: '제출',
  evaluationType: '평가 유형',
  evaluationTarget: '평가 대상',
  evaluationStatus: '상태',
  evaluationAction: '액션',
  evaluationWrite: '작성',
  evaluationSubmitted: '제출 완료',
  writeAutoSaved: '자동 저장됨',
  writeRequired: '필수',
  writeReferencePanel: '참고자료',
  writeCriteriaPanel: '기준 명세',

  /** 나의 평가 작성 목록(허브 모달) */
  myAssignmentsTitle: '나의 평가 작성 목록',
  myAssignmentsSubtitle: '배정된 평가를 모두 확인하고, 미완료 건은 작성 화면으로 이동할 수 있습니다.',
  myAssignmentsFilterAll: '전체',
  myAssignmentsFilterTodo: '작성 필요',
  myAssignmentsFilterDone: '제출 완료',
  myAssignmentsColSeason: '시즌',
  myAssignmentsColSubmittedAt: '제출일',
  myAssignmentsActionStart: '작성 시작',
  myAssignmentsActionContinue: '이어 작성',
  myAssignmentsActionView: '제출 내역',
  myAssignmentsEmpty: '표시할 평가가 없습니다.',
  myAssignmentsEmptyTodo: '작성이 필요한 평가가 없습니다.',

  // Progress
  progressTitle: '진행도 관리',
  progressOverall: '전체 진행률',
  progressCompleted: '완료',
  progressRemindAll: '리마인드 일괄 발송',
  progressRemindOne: '발송',
  progressAction: '액션',
  progressReminderConfirm: '미완료 평가자에게 리마인드를 발송할까요?',
  reminderSent: '리마인드가 발송되었습니다.',
  progressLastAccess: '마지막 접속',
  progressLastRemind: '마지막 리마인드',

  // 등급 검토
  calibrationTitle: '등급 조정',
  calibrationConfirm: '확정하기',
  calibrationConfirmed: '등급 조정이 확정되었습니다.',
  calibrationBaseline: '기준점 설정',
  calibrationRange: '범위',
  calibrationBaselineValue: '기준값',
  calibrationApply: '적용',
  calibrationDistribution: '분포 비교',
  calibrationTarget: '목표 분포',
  calibrationCurrent: '현재 분포',
  calibrationDiff: '차이',
  calibrationAdjust: '등급 조율',
  calibrationCurrentGrade: '현재 등급',
  calibrationAdjustedGrade: '조정 등급',
  calibrationReason: '사유',
  calibrationConfirmStatus: '확정 상태',
  calibrationUnconfirmed: '미확정',
  calibrationConfirmModal: '확정 후 수정 불가합니다.',
  /** 결과 공개 시 백엔드가 자동 등급 확정 — 등급 조정 탭 안내 */
  calibrationPublishAutoNote:
    '결과 공개 시점에 제출이 모두 완료된 시즌은, 절대평가 구간·상대평가 목표 분포에 따라 등급이 자동 확정됩니다. 공개 전에 미리 같은 기준으로 고정하려면 아래 「확정하기」를 사용하세요. 이미 확정된 시즌은 공개 시 등급 산식을 다시 덮어쓰지 않습니다.',

  // Analytics
  analyticsTitle: '결과 분석',
  analyticsGradeDist: '등급 분포',
  analyticsScoreSummary: '점수 요약',
  analyticsAvgScore: '평균 점수',
  analyticsMaxScore: '최고 점수',
  analyticsMinScore: '최저 점수',
  analyticsSampleCount: '응답 수',
  analyticsByType: '평가 유형별 평균',
  analyticsNoGrade: '미부여',
  analyticsEmpty: '아직 분석할 결과가 없습니다.',

  // Common
  save: '저장',
  cancel: '취소',
  delete: '삭제',
  edit: '편집',
  confirm: '확인',
  search: '검색',
  team: '팀',
  member: '구성원',
  score: '점수',
  grade: '등급',
  noData: '데이터가 없습니다.',
} as const;
