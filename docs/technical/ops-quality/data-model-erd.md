# 데이터 모델과 ERD

## 개요

WORKFORCE는 회사 단위 멀티테넌시를 기준으로 구성원, 조직, 결재, 근태, 급여, 목표/평가, ESG 데이터를 분리합니다.

## 주요 도메인

| 도메인 | 주요 엔티티 |
|--------|-------------|
| 회사/회원 | Company, Member, MemberPosition |
| 조직/권한 | Organization, JobGrade, JobTitle, Role, Permission, RolePermission |
| 전자결재 | ApprovalDocument, ApprovalRequest, Approval |
| 전자계약 | ContractTemplate, Contract, ContractParty |
| 근태/휴가 | AttendanceLog, DailyAttendance, MonthlyAttendance, MemberBalance, LeaveRequest |
| 급여 | SalaryPolicy, Salary, Payroll, PayrollItem, MemberAllowance |
| 상여/퇴직 | BonusPolicy, RetirementPolicy |
| 목표/평가 | Goal, GoalActivity, EvaluationSeason, EvaluationDesign, EvaluationResponse, EvaluationCalibration |
| ESG | EsgActivity, EsgPointHistory, EsgCampaign, EsgShopItem |
| 알림/채팅 | Notification, ChatRoom, ChatMessage, ChatParticipant |
| 검색/AI | Search Document, ChatHistory, AI Document Metadata |

## 설계 기준

- 대부분의 엔티티는 `companyId` 또는 Company 연관관계를 통해 회사 범위를 가집니다.
- 상태값은 enum으로 관리해 프론트/백엔드의 상태 분기를 맞춥니다.
- 변경 이력이 필요한 인사/계약/평가/급여 데이터는 현재 상태와 이력성 데이터를 분리합니다.
- 공통 엔티티는 `BaseTimeEntity`로 생성일/수정일을 관리합니다.

## ERD

- [ERD 전체 보기](https://www.erdcloud.com/d/Er4amBY2KpweBcKTk)
- [ERD 이미지](../../asset/WORKFORCE_ERD.png)

![WORKFORCE ERD](../../asset/WORKFORCE_ERD.png)
