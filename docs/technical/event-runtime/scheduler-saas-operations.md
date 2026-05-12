# 스케줄러와 운영자 콘솔

## 개요

정기 인사 업무는 회사별 정책과 실행 시간이 다를 수 있습니다. WORKFORCE는 Quartz와 Spring Batch를 연결하고, SaaS 운영자가 스케줄을 조회/수정할 수 있는 운영자 콘솔 API를 제공합니다.

## Quartz + Batch 연결

| 구성 | 역할 |
|------|------|
| `BatchScheduledJob` | Quartz Trigger가 실행되면 Spring Batch Job을 찾아 실행 |
| `BatchJobConfig` | 실제 Job/Step/Worker 정의 |
| `BatchScheduler` | 회사별 JobDetail/Trigger 등록 |
| `CompanyBatchScheduleInitController` | 회사 온보딩 이후 기본 스케줄 초기화 |

## 회사별 Job

대표 Job은 다음과 같습니다.

- `payrollCalculateJob`
- `severancePayJob`
- `payslipSendJob`
- `monthlyAttendanceCloseJob`
- `leaveGrantJob`
- `carryoverLeaveJob`
- `leaveExpireJob`
- `leavePromotionJob`
- `dailyAttendanceDraftJob`
- `dailyAttendanceFinalJob`
- `weeklyLimitCheckJob`
- `slotDeadlineAutoAssignJob`
- `regularBonusPaymentJob`
- `unusedLeaveAutoPayoutJob`

## SaaS 운영자 기능

`member-service`의 SaaS 운영자 영역은 Quartz 테이블과 Scheduler API를 이용해 다음 기능을 제공합니다.

| 기능 | 설명 |
|------|------|
| 스케줄 목록 | Quartz trigger/job 정보를 조회 |
| Cron 수정 | 특정 Job의 Trigger를 새 Cron으로 재등록 |
| 일시중지 | Job pause |
| 재개 | Job resume |
| 세율/요율 운영 | 급여 계산 기준이 되는 세율표/4대보험 요율 관리 |

## 중복 실행 방지

일부 Spring Scheduler는 ShedLock과 Redis lock provider를 사용해 다중 인스턴스 환경에서 중복 실행을 방지합니다.
