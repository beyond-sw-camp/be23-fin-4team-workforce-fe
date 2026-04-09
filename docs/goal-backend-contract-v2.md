# Goal Backend Contract v2 (Data Semantics Match)

목표: 레퍼런스와 동일한 “데이터 의미”를 보장하기 위한 백엔드 계약.

## 1. Why

현재 FE는 일부(롤업/트리 필터)를 임시 계산으로 처리 가능하지만, 아래는 서버 공식 값이 필요함:

- 상위 목표 달성률(롤업) 정합성
- 승인/참조 단계 워크플로우
- 조직 트리/집계 기반 탐색
- 활동 내역 타임라인

---

## 2. Goal 조회 응답 확장

`GET /goal` 및 `GET /goal/tree` 응답 node에 필드 추가:

```json
{
  "goalId": "uuid",
  "parentGoalId": "uuid|null",
  "ownerType": "MEMBER|ORGANIZATION",
  "ownerId": "uuid",
  "title": "string",
  "status": "DRAFT|ACTIVE|COMPLETED|CANCELLED",
  "actualValue": 42,
  "targetValue": 100,
  "achievementPct": 42.0,
  "rolledAchievementPct": 65.3,
  "rollupSource": "SELF|CHILDREN_AVG|CHILDREN_WEIGHTED",
  "childCount": 3,
  "hasChildren": true,
  "depth": 2,
  "path": ["rootGoalId", "parentGoalId", "goalId"],
  "cycle": "YEARLY|HALF_YEARLY|QUARTERLY|MONTHLY"
}
```

규칙:

1. `rolledAchievementPct`는 항상 서버 공식값
2. leaf 노드는 `rollupSource=SELF`
3. non-leaf는 정책에 따라 `CHILDREN_AVG` 또는 `CHILDREN_WEIGHTED`
4. `achievementPct`는 자기 KPI 기준, `rolledAchievementPct`는 트리 표시 기준

---

## 3. 롤업 재집계 트랜잭션

트리거:

- 실적 제출
- 실적 검토(승인/반려)
- 목표 상태 변경
- 목표 이동(부모 변경)

처리:

1. affected goal 업데이트
2. parent chain 순회 재집계
3. 같은 트랜잭션 커밋

권장 API:

- `POST /goal/{goalId}/recalculate` (운영 점검/관리자용)

---

## 4. 승인/참조 워크플로우

## 4.1 상태 모델

- Goal approval status:
  - `NOT_REQUESTED`
  - `PENDING`
  - `APPROVED`
  - `REJECTED`

## 4.2 엔티티(개념)

- `GoalApprovalRequest`
  - requestId, goalId, requestedBy, requestedAt, status
- `GoalApprovalStep`
  - stepOrder, approverId, decision, decidedAt, comment
- `GoalApprovalWatcher`
  - memberId (참조자)

## 4.3 API

- `POST /goal/{goalId}/approval/request`
- `GET /goal/{goalId}/approval`
- `POST /goal/{goalId}/approval/{requestId}/approve`
- `POST /goal/{goalId}/approval/{requestId}/reject`
- `POST /goal/{goalId}/approval/{requestId}/watchers`

`GET /goal/{goalId}/approval` 예시:

```json
{
  "goalId": "uuid",
  "approvalStatus": "PENDING",
  "currentStepOrder": 1,
  "steps": [
    { "stepOrder": 1, "approverId": "m1", "decision": "APPROVED", "decidedAt": "..." },
    { "stepOrder": 2, "approverId": "m2", "decision": "PENDING", "decidedAt": null }
  ],
  "watchers": [{ "memberId": "w1" }]
}
```

---

## 5. 조직 트리/집계 조회

권장 endpoint:

- `GET /goal/tree?scope=mine|all|members&orgId=&ownerId=&periodStart=&periodEnd=`
- `GET /goal/summary/by-org?periodStart=&periodEnd=`

응답에 포함:

- 각 org node별 goalCount
- 상태별 count (`draft/active/completed/delayed`)
- 평균 달성률 (`avgRolledAchievementPct`)

---

## 6. 활동 내역(타임라인)

`GET /goal/{goalId}/activities`

```json
[
  {
    "activityId": "uuid",
    "type": "GOAL_CREATED|PERFORMANCE_SUBMITTED|PERFORMANCE_REVIEWED|APPROVAL_REQUESTED|APPROVED|REJECTED|COMMENT_ADDED",
    "actorId": "uuid",
    "createdAt": "2026-04-07T08:00:00Z",
    "summary": "string",
    "meta": {}
  }
]
```

---

## 7. FE 연동 순서

1. `rolledAchievementPct` 계약 반영 -> FE 임시 롤업 제거
2. approval 조회/액션 endpoint 반영 -> 상세 우측 승인 패널 활성화
3. org tree endpoint 반영 -> 우측 패널 실제 조직 트리 데이터 연결
4. activity feed 반영 -> 목표 상세 타임라인 연결

