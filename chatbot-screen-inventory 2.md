# Workforce FE Screen Inventory (RAG Seed)

## 섹션 1: 기술 스택 요약

- 프레임워크: React 18 + TypeScript + Vite
  - Source: `package.json:44-47`, `package.json:79-82`, `src/main.tsx:6-10`
- 라우팅: TanStack Router (code-based route tree)
  - Source: `package.json:33-34`, `src/app/router/index.tsx:92-835`
- 상태 관리:
  - 서버 상태: TanStack Query
    - Source: `package.json:31-32`, `src/app/providers/AppProviders.tsx:39`
  - 전역 스토어: Zustand
    - Source: `package.json:54`
  - 인증/권한 컨텍스트: `AuthProvider`, `PermissionsProvider`
    - Source: `src/app/providers/AppProviders.tsx:40-48`
- UI 라이브러리: Ant Design + Tailwind CSS + Ant Icons
  - Source: `package.json:25`, `package.json:35`, `package.json:78`, `src/app/providers/AppProviders.tsx:3-4,42-44`
- 프로젝트 구조: app/features/pages/widgets/shared 기반의 feature/domain 혼합 구조
  - Source: `src/app/*`, `src/features/*`, `src/pages/*`, `src/widgets/*`, `src/shared/*`

### 인증 흐름 (로그인 후 리다이렉트)

1. 로그인 상태가 아니면 앱 레이아웃 진입 시 `/login`으로 이동
2. 계정 상태 BLOCKED면 `/403`
3. 비밀번호 강제 변경이면 `/change-password?forced=true`
4. 이메일 인증 필요면 `/verify-email`
5. 로그인 후 기본 진입:
   - `mustChangePassword=true` -> `/change-password`
   - `onboardingRequired=true` -> `/app/onboarding`
   - 그 외 -> `APP_POST_LOGIN_PATH`

Source:
- `src/app/router/guards.ts:9-29`
- `src/app/router/index.tsx:86-90,112-120,133-147`

### 레이아웃 구조

- Public 루트:
  - `publicLayoutRoute` (pathless `Outlet`)
  - `homeRoute` (`HomePublicLayout`)
- App 루트:
  - `appLayoutRoute` (`AppShellLayout`) + `requireAuth`
  - 하위 `/app/*`는 `appBaseRoute`(Outlet)

Source:
- `src/app/router/index.tsx:97-121,98-105,165,749-825`
- `src/widgets/app-shell/AppShellLayout.tsx`

---

## 섹션 2: 전체 라우트 목록

### Public

| URL 경로 | 화면명 (한글) | 컴포넌트 파일 | 접근 권한 | 설명 | 주요 기능 |
|---|---|---|---|---|---|
| `/` | 랜딩 | `src/pages/public/LandingHomePage.tsx` | 비로그인 | 홈 랜딩 | 제품 소개/로그인 진입 |
| `/login` | 로그인 | `src/pages/public/LoginPage.tsx` | 비로그인 | 로그인 화면 | 인증 |
| `/find-password` | 비밀번호 찾기 | `src/pages/public/FindPasswordPage.tsx` | 누구나 | 비밀번호 찾기 | 재설정 진입 |
| `/change-password` | 비밀번호 변경 | `src/pages/public/ChangePasswordPage.tsx` | 로그인(강제변경 또는 forced) | 비밀번호 변경 | 정책 검증 후 변경 |
| `/reset-password` | 비밀번호 재설정 | `src/pages/public/ResetPasswordPage.tsx` | 누구나 | 재설정 | 토큰/이메일 기반 재설정 |
| `/verify-email` | 이메일 인증 | `src/pages/public/VerifyEmailPage.tsx` | 조건부 | 이메일 인증 | 인증 확인 |
| `/company/onboarding` | 회사 온보딩(임베드) | `src/pages/public/CompanyOnboardingPage.tsx` | 비로그인 | 회사 초기 설정 | 회사 생성/초기값 입력 |
| `/403` | 접근 금지 | `src/pages/ForbiddenPage.tsx` | 누구나 | 권한 없음 안내 | 가드 실패 landing |
| `/404` | Not Found | `src/pages/NotFoundPage.tsx` | 누구나 | 라우트 없음 | 오류 안내 |

Source: `src/app/router/index.tsx:122-163,746-747`

### ESS (Employee Self Service)

| URL 경로 | 화면명 (한글) | 컴포넌트 파일 | 접근 권한 | 설명 | 주요 기능 |
|---|---|---|---|---|---|
| `/app/me` | 마이페이지 | `src/pages/app/MyProfilePage.tsx` | 로그인 사용자 | 내 정보 조회 | 개인정보 조회 |
| `/app/me/edit` | 내 정보 수정 | `src/pages/app/MyProfileEditPage.tsx` | 로그인 사용자 | 내 정보 수정 | 휴대폰/주소/은행/계좌/연락처 공개범위 수정 |
| `/app/attendance` | 내 근태 | `src/pages/app/salary-service/my/MyAttendancePage.tsx` | 로그인 사용자 | 개인 근태 | 출퇴근/근태 현황 |
| `/app/attendance/monthly` | 개인 월근태근무 | `src/pages/app/salary-service/my/MyAttendanceMonthlyPage.tsx` | 로그인 사용자 | 월 근태 조회 | 월별 근태 내역 |
| `/app/attendance/schedules/my` | 개인 근무 스케줄 | `src/pages/app/salary-service/my/MyScheduleSelectionsPage.tsx` | 로그인 사용자 | 개인 스케줄 | 스케줄 확인/선택 |
| `/app/attendance/overtime` | 초과근무 관리 | `src/pages/app/salary-service/my/MyOvertimeRequestsPage.tsx` | 로그인 사용자 | OT 신청/조회 | 초과근무 신청 |
| `/app/attendance/work-time` | 내 주간 근무시간 | `src/pages/app/salary-service/my/MyWorkTimePage.tsx` | 로그인 사용자 | 주간 시간 조회 | 누적 시간/상태 |
| `/app/leave` | 휴가계획 관리 | `src/pages/app/salary-service/my/MyLeavePage.tsx` | 로그인 사용자 | 휴가 관리 | 휴가 신청/조회 |
| `/app/leave/my-promotion` | 내 연차 사용 통보 | `src/pages/app/salary-service/my/MyLeavePromotionPage.tsx` | 로그인 사용자 | 연차 통보 회신 | 통보 확인/응답 |
| `/app/work-trips` | 출장 신청/이력 | `src/pages/app/salary-service/my/MyWorkTripsPage.tsx` | 로그인 사용자 | 출장 | 출장 신청/조회 |
| `/app/payroll` | 급여 조회 | `src/pages/app/salary-service/my/MyPayrollPage.tsx` | 로그인 사용자 | 급여 조회 | 명세 목록 |
| `/app/payroll/$payrollId` | 급여 명세 | `src/pages/app/salary-service/my/PayrollDetailPage.tsx` | 로그인 사용자 | 급여 상세 | 월별 명세 상세 |
| `/app/payroll/allowances` | 수당 변경 신청 | `src/pages/app/salary-service/my/MyAllowancesPage.tsx` | 로그인 사용자 | 수당 신청 | 수당 신청/조회 |
| `/app/payroll/annual` | 연봉 조회 | `src/pages/app/salary-service/my/MyAnnualSalaryPage.tsx` | 로그인 사용자 | 연봉 조회 | 연봉 정보 |
| `/app/payroll/retirement` | 퇴직금 조회 | `src/pages/app/salary-service/my/MyRetirementInquiryPage.tsx` | 로그인 사용자 | 퇴직금 | 추정/조회 |
| `/app/income` | 소득관리 | `src/pages/app/salary-service/my/MyIncomeManagementPage.tsx` | 로그인 사용자 | 소득관리 | 은행계좌/원천징수 조정(준비중) |
| `/app/approvals` | 결재함 | `src/pages/app/ApprovalsPage.tsx` | 로그인 사용자 | 전자결재 허브 | 결재 작성/내문서/대기/참조/공람/임시저장 |
| `/app/approvals/my-requests` | 내 기안 문서함 | `src/pages/app/MyApprovalRequestsPage.tsx` | 로그인 사용자 | 내 기안 검색 | 검색/필터/상세 |
| `/app/approvals/department` | 부서 문서함 | `src/pages/app/DepartmentApprovalSearchPage.tsx` | 로그인 사용자 | 부서 검색 | 조직기반 문서 검색 |
| `/app/approvals/absence-proxy` | 부재 위임 | `src/pages/app/AbsenceProxyPage.tsx` | 로그인 사용자 | 결재 위임 | 위임 등록/관리 |
| `/app/evaluations/my-results` | 내 평가 결과 목록 | `src/pages/app/evaluations/MyEvaluationResultsListPage.tsx` | 로그인 사용자 | 본인 결과 | 시즌별 결과 조회 |
| `/app/evaluations/seasons/$seasonId/my-result` | 내 평가 결과 | `src/pages/app/evaluations/MyEvaluationResultPage.tsx` | 로그인 사용자 | 시즌 결과 | 상세 조회 |
| `/app/evaluations/$responseId/write` | 평가 작성 | `src/pages/app/EvaluationWritePage.tsx` | 로그인 사용자 | 평가 응답 작성 | 평가 폼 작성 |
| `/app/esg` | My ESG | `src/pages/app/esg/EsgHomePage.tsx` | 로그인 사용자 | ESG 대시보드 | 활동/포인트 현황 |
| `/app/esg/shop` | ESG 샵 | `src/pages/app/esg/EsgShopPage.tsx` | 로그인 사용자 | 포인트 상점 | 물품 조회/구매 |

Source: `src/app/router/index.tsx:217-318,333-394,447-689`, `src/app/locale/app-ko.ts:12-50`

### Admin (HR/관리자 전용 또는 권한 기반)

| URL 경로 | 화면명 (한글) | 컴포넌트 파일 | 접근 권한 | 설명 | 주요 기능 |
|---|---|---|---|---|---|
| `/app/onboarding` | 관리자 온보딩 | `src/pages/app/OnboardingStepperPage.tsx` | 시스템 관리자 | 초기 설정 | 정책/조직/결재 등 초기 구성 |
| `/app/members` | 구성원 | `src/pages/app/MembersPage.tsx` | `requireMemberDirectoryAccess` | 직원 관리 | 조회/등록/검색 |
| `/app/members/$memberId` | 구성원 상세 | `src/pages/app/MemberDetailPage.tsx` | `requireMemberDirectoryAccess` | 직원 상세 | 인사정보/이력 조회 |
| `/app/members/$memberId/edit` | 구성원 수정 | `src/pages/app/MemberEditPage.tsx` | `PERM.MEMBER_UPDATE` | 직원 수정 | 인사정보 변경 |
| `/app/organization` | 조직 | `src/pages/app/OrganizationPage.tsx` | 시스템 관리자 | 조직 설정 | 구조/직급/직책/역할 탭 |
| `/app/roles` | (레거시) 역할·권한 | redirect-only | 시스템 관리자 | 레거시 경로 | `/app/organization?tab=roles`로 이동 |
| `/app/ai-documents` | HR 정책 문서 | `src/pages/app/AiDocumentsAdminPage.tsx` | 시스템 관리자 | 정책문서 관리 | 업로드/관리 |
| `/app/esg/admin` | ESG 설정 | `src/pages/app/esg/EsgAdminPage.tsx` | 시스템 관리자 | ESG 관리 | 활동/정책 관리 |
| `/app/evaluations/seasons/$seasonId` | 평가 시즌 상세 | `src/pages/app/evaluations/EvaluationSeasonDetailPage.tsx` | `PERM.EVALUATION_READ/UPDATE/CREATE` 중 하나 | 시즌 운영 | progress/groups/design/calibration/results |
| `/app/attendance/company` | 근태 현황 | `src/pages/app/salary-service/admin/AdminAttendancePage.tsx` | 시스템 관리자 | 전사 근태 | 일근태 조회 |
| `/app/attendance/company/monthly` | (레거시) 월근태 | `src/pages/app/salary-service/admin/AdminAttendancePage.tsx` | 시스템 관리자 | 레거시 경로 | `/app/attendance/company`로 이동 |
| `/app/attendance/holidays` | 휴무일/공휴일 관리 | `src/pages/app/salary-service/admin/AdminCompanyHolidaysPage.tsx` | 시스템 관리자 | 공휴일 관리 | 연도별 공휴일 |
| `/app/attendance/schedules` | 근무스케줄 관리 | `src/pages/app/salary-service/admin/AdminWorkSchedulesPage.tsx` | 시스템 관리자 | 스케줄 정책 | 스케줄 관리 |
| `/app/attendance/overtime-policies` | 연장근로 정책 | `src/pages/app/salary-service/admin/AdminOvertimePoliciesPage.tsx` | 시스템 관리자 | OT 정책 | 정책 설정 |
| `/app/attendance/flexible-slots` | 시차 출퇴근 시간대 | `src/pages/app/salary-service/admin/AdminFlexibleSlotsPage.tsx` | 시스템 관리자 | 탄력 시간대 | 시간대 설정 |
| `/app/attendance/comprehensive-ot` | 포괄임금 OT 현황 | `src/pages/app/salary-service/admin/AdminComprehensiveOvertimePage.tsx` | 시스템 관리자 | OT 현황 | 집계 조회 |
| `/app/leave/policies` | 연차 정책 관리 | `src/pages/app/salary-service/admin/AdminLeavePoliciesPage.tsx` | 시스템 관리자 | 연차 정책 | 정책 설정 |
| `/app/leave/promotion-no-response` | 연차 통보 미응답자 관리 | `src/pages/app/salary-service/admin/AdminLeavePromotionNoResponsePage.tsx` | 시스템 관리자 | 미응답 관리 | 후속 처리 |
| `/app/leave/absence` | 휴직 관리 | `src/pages/app/salary-service/admin/AdminLeaveOfAbsencePage.tsx` | 시스템 관리자 | 휴직 관리 | 휴직 처리 |
| `/app/leave/types` | 휴가 관리 | `src/pages/app/salary-service/admin/AdminCompanyLeaveTypesPage.tsx` | 시스템 관리자 | 휴가 유형 | 휴가 타입 관리 |
| `/app/payroll/admin` | 급여 정산 관리 | `src/pages/app/salary-service/admin/AdminPayrollPage.tsx` | 시스템 관리자 | 급여 정산 | 월별 정산 |
| `/app/payroll/admin/$payrollId` | 급여대장 편집 | `src/pages/app/salary-service/admin/AdminPayrollManagePage.tsx` | 시스템 관리자 | 급여대장 수정 | 상세 편집 |
| `/app/payroll/tax-summary` | 세금·4대보험 | `src/pages/app/salary-service/admin/AdminPayrollTaxSummaryPage.tsx` | 시스템 관리자 | 세금 집계 | 보험/원천세 |
| `/app/salary/settings` | 급여 정책 | `src/pages/app/salary-service/admin/AdminSalarySettingsPage.tsx` | 시스템 관리자 | 급여 정책 | 항목/정책 |
| `/app/salary/pay-grade-table` | 호봉표 관리 | `src/pages/app/salary-service/admin/AdminPayGradeTablePage.tsx` | 시스템 관리자 | 호봉표 | 테이블 관리 |
| `/app/salary/unused-leave` | 연차수당 정산 | `src/pages/app/salary-service/admin/AdminUnusedLeavePayoutPage.tsx` | 시스템 관리자 | 연차수당 | 정산 |
| `/app/salary/retirement-policy` | 퇴직급여 정책 | `src/pages/app/salary-service/admin/AdminRetirementPolicyPage.tsx` | 시스템 관리자 | 퇴직 정책 | 정책 설정 |

Source: `src/app/router/index.tsx:173-261,363-433,476-553,568-611,619-733`

### Common (공통)

| URL 경로 | 화면명 (한글) | 컴포넌트 파일 | 접근 권한 | 설명 | 주요 기능 |
|---|---|---|---|---|---|
| `/app/dashboard` | 대시보드 | `src/pages/app/DashboardPage.tsx` | 로그인 사용자 | 홈 대시보드 | 위젯/요약 |
| `/app/insights` | 인사이트 | `src/pages/app/HrInsightsPage.tsx` | 로그인 사용자 | HR 인사이트 | 지표 분석 |
| `/app/calendar` | 일정 | `src/pages/app/CalendarPage.tsx` | 로그인 사용자 | 회사/개인 일정 | 일정 조회/관리 |
| `/app/notifications` | 알림 | `src/pages/app/NotificationsPage.tsx` | 로그인 사용자 | 알림 목록 | 읽음 처리/이동 |
| `/app/performance` | 성과 | `src/pages/app/PerformancePage.tsx` | 로그인 사용자 | 목표 관리 | 목표/KPI 관리 |
| `/app/performance/approvals/$requestId` | 목표 결재 상세 | `src/pages/app/GoalApprovalDetailPage.tsx` | 로그인 사용자 | 성과결재 상세 | 결재 상세 조회 |
| `/app/evaluations` | 평가 허브 | `src/pages/app/evaluations/EvaluationsHubPage.tsx` | 로그인 사용자 | 평가 허브 | 시즌/결과/작성 진입 |
| `/app/meetings` | 면담 | `src/pages/app/MeetingsPage.tsx` | 로그인 사용자 | 면담 관리 | 면담 목록/기록 |
| `/app/meetings/$meetingId` | 면담 상세 | `src/pages/app/MeetingDetailPage.tsx` | 로그인 사용자 | 면담 상세 | 상세 조회/편집 |
| `/app/mail` | 메일(준비중) | `src/pages/app/GenericPage.tsx` | 로그인 사용자 | placeholder | 준비중 |
| `/app/ai-assistant` | AI 비서(준비중) | `src/pages/app/GenericPage.tsx` | 로그인 사용자 | placeholder | 준비중 |
| `/app/settings` | 설정(준비중) | `src/pages/app/GenericPage.tsx` | 로그인 사용자 | placeholder | 준비중 |

Source: `src/app/router/index.tsx:167-277,351-361,435-445,735-744`

---

## 섹션 3: 메뉴 구조 (사이드바/네비게이션)

### 전체 구조

📁 사이드바 (기본 순서)  
- 대시보드 (`/app/dashboard`)  
- 인사이트 (`/app/insights`)  
- 일정 (`/app/calendar`)  
- 인사 관리 (그룹)  
  - 구성원 (`/app/members`) [권한 조건]
  - 조직 (`/app/organization`) [권한 조건]
  - 결재 양식 설정 (`/app/approvals?tab=admin`, wf-nav-key) [관리자/인사권한]
  - 휴직 관리 (`/app/leave/absence`) [관리자만]
- 근태 (그룹)
  - 직원: 내 근태/초과근무/개인스케줄/월근태/휴가(+내 연차 사용 통보 조건부)
  - 관리자: 근태 현황/근무스케줄/연장근로 정책
- 휴가 (그룹, 관리자 전용)
  - 휴무일/공휴일 관리
  - 휴가 관리
  - 연차 정책 관리
- 출장 신청/이력 (`/app/work-trips`)
- 전자결재 (그룹, 동적)
  - `approvalGuideNav` + `approvalSiderMenu` 구성 기반
- 급여/급여 관리 (그룹)
  - 직원: 급여조회/연봉조회/소득관리/퇴직금조회
  - 관리자: 급여정산관리/세금·4대보험/급여정책/퇴직급여정책
- 성과 관리 (그룹)
  - 성과(`/app/performance`) / 평가(`/app/evaluations`) / 면담(`/app/meetings`)
- ESG (그룹, 설정 ON 시)
  - My ESG / ESG 샵 / ESG 설정(관리자)
- HR 정책 문서 (`/app/ai-documents`, 관리자 전용 영역에 추가)

### 역할/권한 필터링 로직

- `isAdmin`: `user?.isSystemAdmin === true`
- 인사관리 그룹 기본 항목 노출:
  - `isAdmin` 또는 `canAccessMemberDirectory(...)` 또는 permission string 기반
- 결재 양식 설정 노출:
  - `isAdmin` 또는 `PERM.APPROVAL_AD_READ` 또는 인사 접근 가능
- ESG 그룹 노출:
  - `esgConfig.esgEnabledYn === 'YES'`
  - `/app/esg/admin`은 관리자만
- 휴가 통보 메뉴 `/app/leave/my-promotion`:
  - leave policy 중 `isPromotionYn === 'Y'`일 때

Source:
- 메뉴 빌드: `src/widgets/app-shell/AppShellLayout.tsx:238-552,554-667`
- 라벨/순서: `src/app/locale/app-ko.ts:5-102`

---

## 섹션 4: 직원 액션별 화면 매핑

| 액션 | 화면 URL | 화면명 | 비고 |
|---|---|---|---|
| 비밀번호 변경 | `/change-password` | 비밀번호 변경 | 로그인 상태/강제변경 플로우 |
| 계좌번호 수정 | `/app/me/edit` | 내 정보 수정 | `bank`, `bankAccount` 폼 필드 존재 |
| 주소 변경 | `/app/me/edit` | 내 정보 수정 | `address`, `detailAddress` |
| 휴대폰 번호 변경 | `/app/me/edit` | 내 정보 수정 | `phoneNumber` |
| 프로필 사진 변경 | ❌ 미구현(전용 수정화면 근거 없음) | missing | 마이정보 수정 페이지에 프로필 업로드 UI 없음 |
| 이메일 변경 | ❌ 미구현(전용 수정화면 근거 없음) | missing | `MyProfileEditPage`에 email 필드 없음 |
| 휴가 신청 | `/app/leave` | 휴가계획 관리 | 화면 내부 상세 플로우는 페이지 구현 기준 |
| 휴가 잔여일수 조회 | `/app/leave` | 휴가계획 관리 | 같은 화면 내 조회 |
| 휴가 사용 이력 조회 | `/app/leave` | 휴가계획 관리 | 같은 화면 내 조회 |
| 연장근무 신청 | `/app/attendance/overtime` | 초과근무 관리 | OT 신청 |
| 출장 신청 | `/app/work-trips` | 출장 신청/이력 | 신청/이력 |
| 사직서 작성 | ❌ 미구현(전용 경로/화면 근거 없음) | missing | 결재 양식에서 가능성은 있으나 전용 경로 없음 |
| 급여 명세서 조회 | `/app/payroll`, `/app/payroll/$payrollId` | 급여 조회 / 급여 명세 | 목록/상세 |
| 미사용 연차수당 조회 | ⚠️ 직원 전용 조회 화면 없음 | `/app/salary/unused-leave`(관리자) | 직원 액션 기준으로는 미구현 |
| 결재 신청 (양식 선택) | `/app/approvals?tab=compose` | 결재함(작성 허브) | 결재 양식 선택 후 작성 |
| 내가 올린 결재 진행 상태 | `/app/approvals?tab=my` 또는 `/app/approvals/my-requests` | 내 결재함 / 내 기안 문서함 | 탭/검색페이지 병행 |
| 내가 결재할 문서 목록 | `/app/approvals?tab=pending` | 결재함(결재 대기) | 대기/예정 포함 |
| 결재 위임 등록 | `/app/approvals/absence-proxy` | 부재 위임 | 위임 등록 |
| 조직도 조회 | URL 없음(사이드바 조직도 모달) + `/app/organization`(관리자) | 전체 조직도 / 조직 | 모달은 라우트 없는 트리거 |
| 동료에게 메시지 보내기 | URL 없음(플로팅 모달) | 멤버 채팅 | 헤더 아이콘/조직도 우측 패널 버튼 |
| 캘린더 조회 (회사 일정) | `/app/calendar` | 일정 | 회사/개인 일정 |
| 면담 기록 작성 | `/app/meetings`, `/app/meetings/$meetingId` | 면담 / 면담 상세 | 목록/상세에서 작성 |
| 평가 작성 | `/app/evaluations/$responseId/write` | 평가 작성 | 응답 작성 |
| 목표 (KPI/OKR) 설정 | `/app/performance` | 성과 | 목표 설정/관리 |
| ESG 활동 제출 | `/app/esg` | My ESG | 활동 제출 UI는 ESG 홈 도메인 |
| ESG 포인트 조회 | `/app/esg` | My ESG | 포인트 조회 |
| ESG 그린장터 (포인트로 물품 구매) | `/app/esg/shop` | ESG 샵 | 포인트 상점 |
| 알림 조회 | 헤더 드롭패널 + `/app/notifications` | 알림 센터 / 알림 | 드롭다운 + 전체 페이지 |

Source:
- 라우트: `src/app/router/index.tsx:133-147,299-349,447-689`
- 내정보 수정 필드: `src/pages/app/MyProfileEditPage.tsx:169-252`
- 계좌관리 준비중 안내: `src/pages/app/salary-service/my/MyIncomeManagementPage.tsx:47-79`
- 결재 탭/허브: `src/pages/app/ApprovalsPage.tsx:1389-1394`
- 조직도/메신저: `src/widgets/organization/OrgChartMemberSidePanel.tsx:195-204`, `src/widgets/app-shell/MemberChatOpener.tsx:23-27`
- 알림 드롭패널: `src/widgets/app-shell/AppShellLayout.tsx` (헤더 알림 Popover 영역)

---

## 섹션 5: 관리자/HR 액션별 화면 매핑

| 액션 | 화면 URL | 화면명 |
|---|---|---|
| 직원 등록 | `/app/members` | 구성원 |
| 직원 정보 수정 | `/app/members/$memberId/edit` | 구성원 수정 |
| 휴가 정책 관리 | `/app/leave/policies` | 연차 정책 관리 |
| 회사 공휴일 관리 | `/app/attendance/holidays` | 휴무일/공휴일 관리 |
| 근무 스케줄 관리 | `/app/attendance/schedules` | 근무스케줄 관리 |
| 연장근로 정책 관리 | `/app/attendance/overtime-policies` | 연장근로 정책 |
| 급여 항목 관리 | `/app/salary/settings` | 급여 정책 |
| 급여 정책 관리 | `/app/salary/settings` | 급여 정책 |
| 호봉표 관리 | `/app/salary/pay-grade-table` | 호봉표 관리 |
| 결재 양식 관리 | `/app/approvals?tab=admin` | 결재 양식 설정 |
| 결재 라인 정책 관리 | `/app/approvals?tab=admin` | 결재 양식 설정(내 정책) |
| 조직도 편집 | `/app/organization?tab=structure` | 조직 |
| 직급/직책 관리 | `/app/organization?tab=grades`, `/app/organization?tab=titles` | 조직 |
| 권한/역할 관리 | `/app/organization?tab=roles` (또는 `/app/roles` 리다이렉트) | 조직 |
| ESG 활동 양식 관리 | `/app/esg/admin` | ESG 설정 |
| ESG 활동 승인/반려 | `/app/esg/admin` | ESG 설정 |
| 평가 시즌 관리 | `/app/evaluations`, `/app/evaluations/seasons/$seasonId` | 평가 허브 / 평가 시즌 상세 |
| 평가 설계 (양식) 관리 | `/app/evaluations/seasons/$seasonId?tab=design` | 평가 시즌 상세 |

Source:
- 라우트/권한: `src/app/router/index.tsx:229-261,363-433,489-733`
- 사이드바 결재양식설정: `src/widgets/app-shell/AppShellLayout.tsx:606-614`

---

## 섹션 6: 기존 챗봇 라우트 검증

| 하드코딩 라우트 | 검증 결과 | 실제 정보 |
|---|---|---|
| `/ess/attendance/leave-request` | ❌ 없음 | 실제 prefix는 `/app/*`, 휴가는 `/app/leave` |
| `/ess/attendance` | ❌ 없음 | 실제는 `/app/attendance` |
| `/ess/attendance/overtime` | ❌ 없음 | 실제는 `/app/attendance/overtime` |
| `/ess/salary` | ❌ 없음 | 실제 급여는 `/app/payroll` |
| `/ess/approval/request` | ❌ 없음 | 실제 결재 작성은 `/app/approvals?tab=compose` |
| `/admin/salary/items` | ❌ 없음 | 유사 기능은 `/app/salary/settings` |
| `/admin/salary/pay-grade` | ❌ 없음 | 실제는 `/app/salary/pay-grade-table` |

Source: `src/app/router/index.tsx:165-825` 전체 경로 대조

---

## 섹션 7: URL 패턴 컨벤션

1. Prefix 컨벤션
- 인증 이후 앱 화면은 대부분 `/app/*`
- Public는 `/`, `/login`, `/find-password` 등

2. 네이밍 컨벤션
- kebab-case 중심 (`/pay-grade-table`, `/promotion-no-response`, `/tax-summary`)
- 일부 단어 조합은 하이픈, snake_case 없음

3. URL 파라미터
- TanStack Router `$param` 스타일
  - 예: `/app/members/$memberId`, `/app/payroll/$payrollId`

4. 쿼리 스트링 사용
- 매우 적극적 사용
  - 결재: `tab`, `box`, `myStatus`, `embed` 등
  - 조직: `tab=structure|grades|titles|roles`
  - 평가 시즌: `tab=progress|groups|design|calibration|results`

5. 리다이렉트/레거시 호환
- `/app/roles` -> `/app/organization?tab=roles`
- `/app/attendance/company/monthly` -> `/app/attendance/company`

Source:
- `src/app/router/index.tsx:279-331,363-422,476-485`

---

## 섹션 8: 카테고리에 안 맞는 화면들

기존 분류(휴가, 급여, 근태, 결재, 평가, 면담, ESG, 회사, 조직)에 완전히 들어가지 않거나 횡단 성격이 강한 화면:

| URL | 화면명 | 이유 |
|---|---|---|
| `/app/dashboard` | 대시보드 | 전 도메인 요약 허브 |
| `/app/insights` | 인사이트 | 분석/리포팅 성격 |
| `/app/notifications` + 헤더 드롭패널 | 알림 | 전 도메인 이벤트 허브 |
| `/app/ai-documents` | HR 정책 문서 | 문서/지식 베이스 성격 |
| `/app/mail` | 메일(준비중) | 커뮤니케이션 도메인(placeholder) |
| `/app/ai-assistant` | AI 비서(준비중) | 챗봇/assistant 기능 |
| `/app/settings` | 설정(준비중) | 환경설정 도메인 |
| URL 없음(플로팅) | 멤버 채팅 | 라우트 없는 모달형 UX |

Source:
- 라우트: `src/app/router/index.tsx:167-744`
- Generic copy: `src/app/locale/app-ko.ts:150-170`
- 채팅 모달: `src/widgets/app-shell/MemberChatOpener.tsx:19-49`

---

## 추가 참고: 권한 가드 요약

- `requireAuth`: 인증/계정상태/강제비번/이메일인증 검사
- `requirePermissions`: 지정 permission spec 모두 필요
- `requireMemberDirectoryAccess`: 시스템관리자 또는 MEMBER_CREATE/UPDATE 권한 필요

Source: `src/app/router/guards.ts:9-54`

