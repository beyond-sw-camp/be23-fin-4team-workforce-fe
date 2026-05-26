# Goal Service Redesign Spec

## 1. 설계 원칙

goal-service는 OKR 운영 도구가 아니라 반기/연간 인사평가를 위한 목표-성과-평가 흐름을 담당한다.

이번 재설계의 핵심은 다음 세 가지다.

1. 조직목표에서 개인목표로 내려오는 기준을 명확히 한다.
2. 승인된 개인목표를 평가 응답의 기준으로 사용한다.
3. 평가 시즌은 자기평가, 상사평가, 등급확정, 결과공개, 면담 순서로만 진행한다.

다음 기능은 목표 서비스에서 제거한다.

- 실시간 OKR 진척률 입력
- 목표 달성률 롤업
- 헬스 상태
- KPI 템플릿 기반 측정 단위/입력 방식
- OBJECTIVE/KR/TASK 트리
- 공개범위 기반 목표 탐색

## 2. 최종 사용자 흐름

```text
[목표 수립]
HR/팀장: 조직목표 생성
        - 등급 기준 있음: 개인목표에 상속
        - 등급 기준 없음: 개인이 직접 입력
        ↓
구성원: 개인목표 작성
        - 조직목표 연결
        - 가중치 입력
        - 등급 기준 확정
        ↓
구성원: 승인요청
        ↓
상사: 승인
        ↓
개인목표 ACTIVE

[평가]
SELF_EVAL
        ↓
MANAGER_EVAL
        ↓
GRADE_CONFIRM
        ↓
RESULT_PUBLISHED
        ↓
INTERVIEW
        ↓
CLOSED
```

## 3. 도메인 모델

### 3.1 Goal

하나의 `Goal` 엔티티로 조직목표와 개인목표를 표현한다.

```text
OrgGoal
  ownerType = ORGANIZATION
  title
  cycle
  gradeSCriteria / gradeACriteria / gradeBCriteria / gradeCCriteria
  status = DRAFT -> ACTIVE

IndividualGoal
  ownerType = MEMBER
  alignedOrgGoalId -> OrgGoal
  weightPct
  gradeSCriteria / gradeACriteria / gradeBCriteria / gradeCCriteria
  status = DRAFT -> PENDING -> ACTIVE -> COMPLETED
```

### 3.2 GoalApprovalBundle

개인목표 승인 묶음이다.

```text
GoalApprovalBundle
  requestedBy
  approverId
  cycleKey
  status = PENDING -> APPROVED | REJECTED | WITHDRAWN
```

승인요청 시점에는 같은 cycle의 개인목표 가중치 합계가 100이어야 한다.

### 3.3 EvaluationSeason

```text
EvaluationSeason
  companyId
  cycle
  status = DRAFT
        -> SELF_EVAL
        -> MANAGER_EVAL
        -> GRADE_CONFIRM
        -> RESULT_PUBLISHED
        -> INTERVIEW
        -> CLOSED
  resultsPublishedAt
```

시즌 상태는 기본적으로 forward-only다. API로 이전 단계 되돌리기를 제공하지 않는다.

### 3.4 EvaluationGroup

```text
EvaluationGroup
  seasonId
  targetMemberIds
```

`SELF_EVAL` 오픈 시 해당 cycle의 ACTIVE 개인목표 보유자를 자동으로 target에 병합한다.

### 3.5 EvaluationResponse

```text
EvaluationResponse
  evaluationType = SELF | DOWNWARD
  targetMemberId
  evaluatorId
  answersJson
  normalizedScore
  calibratedGrade
  calibrationConfirmedAt
```

### 3.6 Meeting

```text
Meeting
  meetingId
  companyId
  seasonId
  targetMemberId
  evaluatorId
  scheduledAt
  status = SCHEDULED | DONE | CANCELLED
  note
  actionItems
  createdAt
```

결과 공개 후 대상자별 면담을 자동 생성한다.

## 4. 등급 기준 설계

### 4.1 KPI 프레임워크와의 관계

현재 명세의 등급 기준은 넓은 의미에서는 KPI 프레임워크의 평가 기준으로 볼 수 있다.

다만 이번 재설계에서는 기존처럼 별도 KPI 템플릿, 측정 단위, 입력 타입, 실적값, 진척률을 운영하지 않는다. 여기서의 KPI는 단순히 “이 목표를 어떤 기준으로 S/A/B/C 평가할 것인가”를 뜻한다.

즉 이름을 더 정확히 잡으면 다음과 같다.

```text
기존 OKR/KPI 도구식 KPI
  - targetValue
  - actualValue
  - unitType
  - measureType
  - progress
  - rollup
  -> 제거 대상

이번 평가 사이클의 KPI 기준
  - S 기준
  - A 기준
  - B 기준
  - C 기준
  - 선택 등급
  - 증빙
  - 설명
  -> 유지 대상
```

따라서 코드/화면 용어는 `gradeCriteria` 또는 `evaluationCriteria`가 더 직관적이다. 내부 점수 계산에서만 KPI 섹션이라는 이름을 유지할 수 있다.

### 4.2 상속 규칙

```text
OrgGoal 생성
  gradeSCriteria가 있으면 기준 있는 조직목표
  gradeSCriteria가 없으면 기준 없는 조직목표

IndividualGoal 생성
  alignedOrgGoalId가 있고 OrgGoal에 기준이 있으면
    OrgGoal의 S/A/B/C 기준을 개인목표에 복사한다.

  alignedOrgGoalId가 있고 OrgGoal에 기준이 없으면
    구성원이 S/A/B/C 기준을 직접 입력해야 한다.

  alignedOrgGoalId가 없으면
    구성원이 S/A/B/C 기준을 직접 입력해야 한다.
```

개인목표의 등급 기준은 생성 시점 스냅샷이다. 조직목표 기준이 나중에 바뀌어도 기존 개인목표 기준은 바뀌지 않는다.

승인된 개인목표의 등급 기준은 수정할 수 없다.

## 5. 상태 규칙

### 5.1 Goal 상태

```text
DRAFT
  구성원이 수정 가능
  승인요청 가능

PENDING
  결재 진행 중
  직접 수정 불가
  수정하려면 승인요청 철회 후 DRAFT로 돌아가야 함

ACTIVE
  평가 대상
  기준 수정 불가

COMPLETED
  평가 완료 후 종료 상태
```

### 5.2 EvaluationSeason 상태

```text
DRAFT
  시즌 준비 중

SELF_EVAL
  SELF 응답 저장 가능
  DOWNWARD 응답 저장 불가

MANAGER_EVAL
  SELF 응답 저장 불가
  DOWNWARD 응답 저장 가능

GRADE_CONFIRM
  응답 저장 불가
  나래비 미리보기/수동 조정/확정 가능

RESULT_PUBLISHED
  대상자와 평가자가 결과 조회 가능
  면담 자동 생성

INTERVIEW
  결과 조회 가능
  면담 일정/메모/완료 처리 가능

CLOSED
  조회만 가능
```

### 5.3 시즌 전환 정책

시즌 전환은 다음 순서만 허용한다.

```text
DRAFT -> SELF_EVAL
SELF_EVAL -> MANAGER_EVAL
MANAGER_EVAL -> GRADE_CONFIRM
GRADE_CONFIRM -> RESULT_PUBLISHED
RESULT_PUBLISHED -> INTERVIEW
INTERVIEW -> CLOSED
```

미제출 응답이 있을 때 다음 단계로 전환할지 여부는 단순하게 운영한다.

```text
SELF 미제출자가 있어도 MANAGER_EVAL 전환 가능
DOWNWARD 미제출자가 있으면 GRADE_CONFIRM 전환 불가
calibrationConfirmedAt이 없는 응답이 있으면 RESULT_PUBLISHED 전환 불가
```

자기평가는 본인 기록 성격이 강하므로 미제출을 허용한다. 상사평가는 최종 점수와 등급의 기반이므로 미제출 상태에서 등급확정으로 넘어갈 수 없다.

## 6. 권한 모델

권한은 Redis 권한 문자열과 서비스 레이어 신원 검증을 함께 사용한다.

### 6.1 역할

```text
HR Admin
  전사 목표 생성
  평가 시즌 생성/단계 전환
  나래비 조회/조정/확정
  결과 공개
  전체 데이터 조회

팀장
  담당 팀 조직목표 생성
  담당 팀원 개인목표 승인/반려
  담당 팀원 상사평가 작성
  담당 팀원 면담 진행

구성원
  본인 개인목표 작성
  본인 자기평가 작성
  결과 공개 후 본인 결과 조회
  본인 면담 조회
```

### 6.2 Redis 권한 예시

```text
HR Admin
  GOAL:CREATE:COMPANY
  GOAL:READ:COMPANY
  GOAL:UPDATE:COMPANY
  GOAL:DELETE:COMPANY
  EVALUATION:CREATE:COMPANY
  EVALUATION:READ:COMPANY
  EVALUATION:UPDATE:COMPANY
  EVALUATION:DELETE:COMPANY

팀장
  GOAL:CREATE:TEAM
  GOAL:READ:TEAM
  GOAL:UPDATE:TEAM
  EVALUATION:READ:TEAM
  EVALUATION:UPDATE:TEAM

구성원
  GOAL:CREATE:SELF
  GOAL:READ:SELF
  GOAL:UPDATE:SELF
  GOAL:DELETE:SELF
  EVALUATION:READ:SELF
```

TEAM 범위 권한은 역할 확인만 담당한다. 실제 담당 팀원 여부는 서비스 레이어에서 검증한다.

## 7. API 변경

### 7.1 EvaluationSeason

```text
POST /evaluation/evaluation-seasons/{seasonId}/open-self-eval
POST /evaluation/evaluation-seasons/{seasonId}/open-manager-eval
POST /evaluation/evaluation-seasons/{seasonId}/open-grade-confirm
POST /evaluation/evaluation-seasons/{seasonId}/publish-results
POST /evaluation/evaluation-seasons/{seasonId}/open-interview
POST /evaluation/evaluation-seasons/{seasonId}/close
```

모든 시즌 전환 API는 `EVALUATION:UPDATE:COMPANY` 권한이 필요하다.

### 7.2 Meeting

```text
GET   /evaluation/evaluation-seasons/{seasonId}/meetings
GET   /evaluation/evaluation-seasons/{seasonId}/meetings/mine
PATCH /evaluation/meetings/{meetingId}
POST  /evaluation/meetings/{meetingId}/done
```

면담 수정과 완료는 `EVALUATION:UPDATE:TEAM` 권한과 `evaluatorId == requesterId` 검증을 모두 통과해야 한다.

## 8. answersJson 표준 구조

기존 스키마는 유지하되 저장 형식을 통일한다.

```json
{
  "answers": [
    {
      "goalId": "uuid",
      "goalTitle": "인원 감축",
      "weightPct": 50,
      "gradeCriteria": {
        "S": "10명",
        "A": "8명",
        "B": "5명",
        "C": "3명"
      },
      "selectedGrade": "B",
      "evidenceUrl": "https://s3/.../evidence.pdf",
      "description": "5명 감축 달성으로 B 등급 적합"
    }
  ]
}
```

점수는 `selectedGrade.defaultScore * weightPct / 100`으로 계산한다.

## 9. 나래비 흐름

```text
GRADE_CONFIRM 진입
  ↓
getCalibrationOverview(seasonId)
  점수순 대상자 목록과 현재 등급 조회
  ↓
previewRelativeDistribution(seasonId)
  목표 분포 대비 예상 등급 미리보기
  ↓
adjustCalibrations(seasonId, adjustments)
  HR 수동 조정
  CalibrationHistory 기록
  ↓
confirmCalibration(seasonId)
  모든 DOWNWARD 응답에 calibrationConfirmedAt 기록
  ↓
publishResults(seasonId)
  resultsPublishedAt 기록
  Meeting 자동 생성
```

`publishResults()`는 idempotent 해야 한다. 재호출해도 결과 공개 시각이 불필요하게 바뀌거나 Meeting이 중복 생성되면 안 된다.

## 10. Meeting 생성 규칙

결과 공개 시 시즌의 평가 대상자별로 면담을 자동 생성한다.

```text
대상자 추출
  EvaluationGroup.targetMemberIds

평가자 추출
  대상자의 DOWNWARD EvaluationResponse.evaluatorId

생성
  seasonId
  targetMemberId
  evaluatorId
  scheduledAt = null
  status = SCHEDULED
```

중복 방지를 위해 다음 조합은 유일해야 한다.

```text
seasonId + targetMemberId + evaluatorId
```

평가자를 찾을 수 없는 대상자는 Meeting을 생성하지 않고 운영 로그로 남긴다. 결과 공개 자체는 막지 않는다.

## 11. 변경 파일

### 11.1 수정

```text
goal-service/src/main/java/com/_team/_team/goal/domain/Goal.java
goal-service/src/main/java/com/_team/_team/goal/service/GoalService.java
goal-service/src/main/java/com/_team/_team/goal/repository/GoalRepository.java
goal-service/src/main/java/com/_team/_team/goal/evaluation/domain/EvaluationSeason.java
goal-service/src/main/java/com/_team/_team/goal/evaluation/domain/enums/SeasonStatus.java
goal-service/src/main/java/com/_team/_team/goal/evaluation/service/EvaluationSeasonService.java
goal-service/src/main/java/com/_team/_team/goal/evaluation/service/EvaluationResponseService.java
goal-service/src/main/java/com/_team/_team/goal/evaluation/controller/EvaluationSeasonController.java
```

### 11.2 삭제

```text
goal-service/src/main/java/com/_team/_team/goal/service/GoalRollupService.java
goal-service/src/main/java/com/_team/_team/goal/service/GoalProgressUpdateService.java
goal-service/src/main/java/com/_team/_team/goal/service/GoalSeasonReadinessService.java
goal-service/src/main/java/com/_team/_team/goal/service/GoalTreeService.java
goal-service/src/main/java/com/_team/_team/goal/service/GoalSummaryService.java
goal-service/src/main/java/com/_team/_team/goal/service/GoalCompletionFileService.java
goal-service/src/main/java/com/_team/_team/goal/controller/GoalProgressUpdateController.java
goal-service/src/main/java/com/_team/_team/goal/controller/GoalSeasonReadinessController.java
goal-service/src/main/java/com/_team/_team/goal/controller/GoalSummaryController.java
goal-service/src/main/java/com/_team/_team/goal/domain/enums/GoalHealthStatus.java
goal-service/src/main/java/com/_team/_team/goal/domain/enums/MeasureType.java
goal-service/src/main/java/com/_team/_team/goal/domain/enums/UnitType.java
goal-service/src/main/java/com/_team/_team/goal/domain/enums/RollupPolicy.java
goal-service/src/main/java/com/_team/_team/goal/domain/enums/RollupSource.java
goal-service/src/main/java/com/_team/_team/goal/domain/enums/KpiSpecCycleType.java
goal-service/src/main/java/com/_team/_team/goal/domain/enums/GoalVisibility.java
goal-service/src/main/java/com/_team/_team/goal/domain/enums/InputType.java
goal-service/src/main/java/com/_team/_team/goal/domain/enums/GoalKind.java
```

### 11.3 신규

```text
goal-service/src/main/java/com/_team/_team/goal/meeting/domain/Meeting.java
goal-service/src/main/java/com/_team/_team/goal/meeting/domain/enums/MeetingStatus.java
goal-service/src/main/java/com/_team/_team/goal/meeting/repository/MeetingRepository.java
goal-service/src/main/java/com/_team/_team/goal/meeting/service/MeetingService.java
goal-service/src/main/java/com/_team/_team/goal/meeting/controller/MeetingController.java
goal-service/src/main/java/com/_team/_team/goal/meeting/dto/MeetingResDto.java
goal-service/src/main/java/com/_team/_team/goal/meeting/dto/MeetingUpdateReqDto.java
```

## 12. 구현 순서

### 12.1 Goal 단순화

1. OKR 필드 제거
2. OKR 서비스/컨트롤러/enum 삭제
3. 등급 기준 상속 메서드 추가
4. 개인목표 생성 시 기준 상속/직접입력 검증 추가
5. 승인요청 시 weightPct 합계 100 검증

### 12.2 평가 시즌 5단계화

1. `SeasonStatus` 교체
2. `EvaluationSeason` 전환 메서드 추가
3. `EvaluationSeasonService` stage 전환 메서드 추가
4. `EvaluationSeasonController` 엔드포인트 교체

### 12.3 응답 저장 단계 분리

1. SELF는 `SELF_EVAL`에서만 저장
2. DOWNWARD는 `MANAGER_EVAL`에서만 저장
3. DOWNWARD 저장 시 `EVALUATION:UPDATE:TEAM|COMPANY` 권한 확인
4. 결과 공개 전/후 조회 조건 분리

### 12.4 면담 모듈 추가

1. Meeting 엔티티/enum/repository 추가
2. MeetingService 자동 생성 추가
3. MeetingController 추가
4. `publishResults()`에서 자동 생성 호출
5. 중복 생성 방지

## 13. 검증 시나리오

### 13.1 목표 수립

```text
1. 기준 있는 OrgGoal 생성
2. IndividualGoal 생성
3. OrgGoal 기준이 IndividualGoal에 복사되는지 확인
4. OrgGoal 기준 수정
5. 기존 IndividualGoal 기준이 바뀌지 않는지 확인
6. 새 IndividualGoal은 변경된 기준을 상속받는지 확인
```

```text
1. 기준 없는 OrgGoal 생성
2. IndividualGoal 생성 시 기준 미입력
3. 400 에러 확인
4. S/A/B/C 기준 모두 입력
5. 생성 성공 확인
```

```text
1. 개인목표 여러 개 생성
2. weightPct 합계 100 미만으로 승인요청
3. 승인요청 실패 확인
4. weightPct 합계 100으로 수정
5. 승인요청 성공 확인
```

```text
1. 개인목표 승인요청
2. PENDING 상태에서 직접 수정 시도
3. 실패 확인
4. 승인요청 철회
5. DRAFT 상태에서 수정 성공 확인
```

### 13.2 결재

```text
1. GoalApprovalBundle 제출
2. approverId가 아닌 사용자가 승인 시도
3. 실패 확인
4. approverId가 승인
5. 개인목표 ACTIVE 전환 확인
```

```text
1. GoalApprovalBundle 반려
2. 구성원이 목표 수정
3. 재승인요청
4. 새 승인 흐름이 정상 생성되는지 확인
```

### 13.3 평가 시즌

```text
1. EvaluationSeason 생성
2. openSelfEval 호출
3. ACTIVE 개인목표 보유자가 EvaluationGroup 대상자로 자동 병합되는지 확인
4. SELF 응답 저장 성공
5. DOWNWARD 응답 저장 실패
```

```text
1. openManagerEval 호출
2. SELF 응답 저장 실패
3. DOWNWARD 응답 저장 성공
```

```text
1. DOWNWARD 미제출 응답 존재
2. openGradeConfirm 호출
3. 실패 확인
4. 모든 DOWNWARD 응답 제출
5. openGradeConfirm 성공 확인
```

```text
1. GRADE_CONFIRM 상태
2. calibration 미확정 상태에서 publishResults 호출
3. 실패 확인
4. confirmCalibration 호출
5. publishResults 성공 확인
```

### 13.4 조회 보안

```text
1. 결과 공개 전 구성원이 본인 SELF 응답 조회
2. 성공 확인
3. 결과 공개 전 구성원이 DOWNWARD 응답 조회
4. 실패 확인
5. 결과 공개 전 HR Admin이 전체 응답 조회
6. 성공 확인
```

```text
1. 결과 공개 후 대상자가 본인 결과 조회
2. 성공 확인
3. 결과 공개 후 평가자가 담당 대상 결과 조회
4. 성공 확인
5. 무관한 사용자가 조회
6. 실패 확인
```

### 13.5 나래비

```text
1. 평가 대상자 5명 생성
2. GradeConfig S:20%, A:30%, B:30%, C:20% 설정
3. previewRelativeDistribution 호출
4. 예상 등급 배분 확인
5. adjustCalibrations로 1명 수동 조정
6. CalibrationHistory 기록 확인
7. confirmCalibration 호출
8. 모든 DOWNWARD 응답에 calibrationConfirmedAt 기록 확인
```

### 13.6 결과 공개와 면담

```text
1. publishResults 호출
2. resultsPublishedAt 설정 확인
3. 대상자별 Meeting 자동 생성 확인
4. publishResults 재호출
5. Meeting 중복 생성이 없는지 확인
```

```text
1. evaluatorId가 없는 대상자 존재
2. publishResults 호출
3. 해당 대상자의 Meeting은 생성되지 않음
4. 다른 대상자의 Meeting은 정상 생성됨
5. 운영 로그 확인
```

```text
1. 평가자가 Meeting 일정/메모 수정
2. 성공 확인
3. 평가자가 done 처리
4. status DONE 확인
5. 대상자가 Meeting 수정 시도
6. 실패 확인
```

### 13.7 예외 대상

```text
1. ACTIVE 개인목표는 있지만 퇴사/휴직 상태인 구성원 존재
2. openSelfEval 호출
3. 비활성 구성원은 자동 대상자에서 제외되는지 확인
```

```text
1. 같은 companyId + cycleKey로 시즌 생성
2. 중복 생성 시도
3. 실패 확인
```

```text
1. 시즌 cycle과 개인목표 cycle이 다름
2. openSelfEval 호출
3. 다른 cycle의 개인목표 보유자는 대상자에서 제외되는지 확인
```

## 14. 구현하지 않는 것

이번 범위에서는 다음을 구현하지 않는다.

- 실시간 목표 진척률
- 수치형 KPI 실적 입력
- 목표 트리 롤업
- 헬스 상태 자동 계산
- 복잡한 조직도 기반 권한 엔진
- 시즌 역전환 API
- 면담 자동 시간 배정 알고리즘
- 목표별 실시간 대시보드

필요한 것은 승인된 목표를 기준으로 평가하고, 평가 결과를 확정/공개/면담으로 연결하는 일이다.

