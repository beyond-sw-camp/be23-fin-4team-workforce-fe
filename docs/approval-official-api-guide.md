# 공문(OFFICIAL) 프론트 연동 API 가이드

공문 전체 생명주기(작성 → 결재 → 번호 발번 → 수신 → 발송함)를 프론트에서 구현하기 위한 API 명세입니다.

---

## 1. 공통 사항

### 1-1. 헤더
게이트웨이가 토큰에서 추출하여 자동 주입합니다. 프론트는 `Authorization: Bearer {token}` 만 보내면 됩니다.

| 헤더 | 타입 | 설명 |
|---|---|---|
| `X-User-CompanyId` | UUID | 소속 회사 ID |
| `X-User-UUID` | UUID | 로그인 사용자 UUID |
| `X-User-MemberPositionId` | UUID | 현재 직책-조직 포지션 ID |

### 1-2. 응답 래퍼
```json
{
  "status": 200,
  "message": "...",
  "data": <payload>
}
```

### 1-3. 공문 전용 응답 필드 (ApprovalRequestResDto)

일반 결재 응답과 동일하되, 공문일 때 추가로 채워지는 필드입니다.

```ts
{
  // --- 공통 필드 ---
  requestId: string;
  documentId: string;
  documentName: string;               // 양식명 (예: "공문")
  memberId: string;                   // 기안자 UUID
  requestType: "OFFICIAL";
  contentJson: string;                // 양식 입력 내용 (JSON 문자열)
  requestStatus: "DRAFT" | "WAIT" | "PENDING" | "APPROVED" | "REJECTED" | "CANCELED";
  cancelReason: string | null;
  createdAt: string;                  // ISO 8601
  updatedAt: string;

  // --- 요청자 스냅샷 ---
  requesterName: string;              // "홍길동"
  requesterOrganizationId: string;
  requesterOrganizationName: string;  // "인사팀"

  // --- 결재라인 ---
  approvalLines: {
    approvalId: string;               // ★ 승인/반려 시 이 ID 사용
    requestId: string;
    approverMemberId: string;
    approverMemberPositionId: string;
    stepOrder: number;
    approvalStatus: "WAITING" | "PENDING" | "APPROVED" | "REJECTED" | "CANCELED";
    actedAt: string | null;
    comment: string | null;
    signatureImageUrl: string | null;
    isSignedYn: "Y" | "N" | null;
    actualApproverMemberId: string | null;     // 대결 시 실제 처리자
    actualApproverMemberPositionId: string | null;
    isProxyYn: "Y" | "N" | null;              // 대결 여부
    createdAt: string;
    updatedAt: string;
  }[];

  // --- 참조/공람 ---
  viewers: {
    viewerId: string;
    requestId: string;
    viewerMemberId: string;
    viewerMemberPositionId: string;
    viewerType: "CC" | "CIRCULATION";
    viewerReadStatus: "UNREAD" | "READ";
    viewedAt: string | null;
    createdAt: string;
    updatedAt: string;
  }[];

  // ==========================================
  // ★ 공문 전용 필드 (일반 결재에서는 null)
  // ==========================================
  documentNumber: string | null;      // "인사-2026-0147" — 최종 승인 후 발번
  recipients: {
    recipientId: string;
    recipientOrganizationId: string;
    recipientOrganizationName: string;  // 스냅샷
  }[] | null;
}
```

---

## 2. 공문 작성 & 상신

### 2-1. 양식 선택 (드롭다운)

```
GET /approval/documents/active
```

응답 중 `requestType: "OFFICIAL"` 인 양식이 공문 양식입니다.
`documentId`를 획득하여 이후 API에 사용합니다.

---

### 2-2. 결재자 후보 조회

```
GET /approval/policyLines/{documentId}/candidates
```

단계별 후보 결재자 목록이 반환됩니다. 프론트에서 각 단계별로 드롭다운에 후보를 채우고, 기안자가 한 명씩 선택합니다.

#### Response
```json
{
  "data": [
    {
      "policyLineId": "...",
      "stepOrder": 1,
      "jobTitleId": "...",
      "organizationId": null,
      "candidates": [
        {
          "memberPositionId": "...",
          "memberId": "...",
          "memberName": "김팀장",
          "organizationName": "인사팀",
          "jobTitleName": "팀장"
        }
      ]
    }
  ]
}
```

> `candidates`가 빈 배열이면 해당 단계에 배정 가능한 결재자가 없다는 의미 — 프론트에서 "결재자 없음" 표시 필요.

---

### 2-3. 공문 생성 (임시저장 / 상신)

```
POST /approval/requests
```

#### Request Body
```json
{
  "documentId": "11111111-...",
  "contentJson": "{\"title\":\"인사발령 공지\",\"content\":\"...\"}",
  "requestStatus": "WAIT",
  "approvalLines": [
    {
      "stepOrder": 1,
      "approverMemberId": "aaaa-...",
      "approverMemberPositionId": "bbbb-..."
    },
    {
      "stepOrder": 2,
      "approverMemberId": "cccc-...",
      "approverMemberPositionId": "dddd-..."
    }
  ],
  "viewers": [
    {
      "viewerMemberId": "eeee-...",
      "viewerMemberPositionId": "ffff-...",
      "viewerType": "CC"
    }
  ],
  "recipients": [
    {
      "recipientOrganizationId": "1111-...",
      "recipientOrganizationName": "총무팀"
    },
    {
      "recipientOrganizationId": "2222-...",
      "recipientOrganizationName": "개발팀"
    }
  ]
}
```

| 필드 | 필수 | 설명 |
|---|---|---|
| `documentId` | ✅ | 공문 양식 ID |
| `contentJson` | ✅ | 양식 formSchema에 맞춘 입력값 (JSON 문자열) |
| `requestStatus` | ✅ | `"DRAFT"` (임시저장) 또는 `"WAIT"` (상신) |
| `approvalLines` | ⚠️ | 상신(`WAIT`) 시 최소 1건 필수. 자동승인 양식이면 불필요 |
| `viewers` | ⬜ | 참조(`CC`) / 공람(`CIRCULATION`) |
| `recipients` | ✅ | **공문 필수** — 수신 부서 최소 1건. 같은 부서 중복 불가 |

> `recipientOrganizationName`은 반드시 함께 전송해야 합니다 (스냅샷 저장 — 조직 개편 후에도 수신 당시 부서명 유지).

#### `requestStatus` 별 동작

| 값 | 동작 |
|---|---|
| `DRAFT` | 저장만. 알림 미발행. 이후 수정/상신 가능 |
| `WAIT` | 상신. 1단계 결재자에게 알림. 참조자(CC)에게 알림 |
| `WAIT` + 자동승인 | 즉시 `APPROVED`. 공문 번호 자동 생성. 알림 발행 |

#### Response `201 Created`
전체 `ApprovalRequestResDto` (recipients 포함)

#### 주요 에러
| status | message |
|---|---|
| 400 | `공문은 수신 부서가 최소 1개 필요합니다.` |
| 400 | `동일한 수신 부서를 중복 지정할 수 없습니다.` |
| 400 | `결재 제출 시 결재자는 최소 1명 이상이어야 합니다.` |

---

### 2-4. 첨부파일 업로드 (선택)

```
POST /approval/attachments/{requestId}
Content-Type: multipart/form-data
```

| 필드 | 설명 |
|---|---|
| `files` | 여러 파일 동시 업로드 가능 |

#### Response `201 Created`
```json
{
  "data": [
    {
      "attachmentId": "...",
      "requestId": "...",
      "fileName": "인사발령_첨부.pdf",
      "approvalUrl": "https://cdn.../...",
      "fileSize": 123456,
      "createdAt": "..."
    }
  ]
}
```

---

## 3. 임시저장 수정 & 재상신

```
PATCH /approval/requests/{requestId}
```

- **`DRAFT` 상태에서만 가능**
- Body는 `2-3`과 동일한 구조
- `requestStatus: "WAIT"` 으로 보내면 임시저장 → 상신 전환
- 기존 결재라인/참조자/수신부서/첨부파일 전부 삭제 후 재생성 (전체 교체)

---

## 4. 결재 처리 (결재자 화면)

### 4-1. 결재 대기함

```
GET /approval/approvals/pending
```

내가 결재해야 할 문서 목록. 공문 포함.
- `requestType: "OFFICIAL"` 인 건이 공문
- 프론트에서 공문 배지/아이콘을 표시하려면 이 필드로 분기

#### Response
`List<ApprovalRequestResDto>` — recipients 포함.

---

### 4-2. 공문 상세 조회

```
GET /approval/requests/{requestId}
```

접근 권한 자동 검증:
1. 기안자
2. 결재라인에 포함된 결재자
3. 참조/공람자
4. 수신 부서 소속원 (내 조직이 recipients에 포함된 경우)

권한 없으면 `403 Forbidden`.

---

### 4-3. 승인

```
PATCH /approval/approvals/{approvalId}/approve
```

> `approvalId`는 **결재 단계 ID** (= `approvalLines[n].approvalId`). 요청 ID 아님에 주의.

#### Request Body
```json
{
  "comment": "확인했습니다."
}
```
- `comment`는 선택

#### 최종 단계 승인 시 공문 전용 처리
1. `documentNumber` 자동 생성 — `"인사-2026-0147"` 형식
2. Kafka `official-approved` 토픽에 도메인 이벤트 발행
3. 수신 부서의 공문 수신함에 즉시 노출됨

---

### 4-4. 반려

```
PATCH /approval/approvals/{approvalId}/reject
```

#### Request Body
```json
{
  "comment": "수신처 재확인 필요"
}
```
- `comment` **필수** (빈 값 400 에러)
- 반려 시 공문 번호 미생성, 수신함 미노출
- 이후 단계 전부 `REJECTED` 처리

---

### 4-5. 결재 완료함

```
GET /approval/approvals/acted
```

내가 이미 승인/반려한 문서 목록 (공문 포함).

---

## 5. 공문 취소 (기안자)

```
PATCH /approval/requests/{requestId}/cancel
```

#### Request Body
```json
{
  "cancelReason": "수신처 오지정으로 재작성"
}
```

| 취소 가능 상태 | 설명 |
|---|---|
| `DRAFT` | 임시저장 취소. 알림 없음 |
| `WAIT` | 상신 직후 회수. 첫 결재자 + 참조자에게 취소 알림 |
| `PENDING` | 결재 진행 중 회수. 현재 PENDING인 결재자 + 참조자에게 취소 알림 |

> `APPROVED` / `REJECTED` 상태에서는 취소 불가.

---

## 6. 공문 문서함 (사이드바 메뉴별)

### 6-1. 개인 문서함 > 공문 문서함

**의미**: 내가 기안한 공문 전체 (모든 상태)

```
GET /approval/requests/my?requestType=OFFICIAL
```

탭 필터:

| 탭 | Query |
|---|---|
| 전체 | `?requestType=OFFICIAL` |
| 임시저장 | `?requestType=OFFICIAL&status=DRAFT` |
| 진행 중 | `?requestType=OFFICIAL&status=PENDING` |
| 완료 | `?requestType=OFFICIAL&status=APPROVED` |
| 반려 | `?requestType=OFFICIAL&status=REJECTED` |
| 취소 | `?requestType=OFFICIAL&status=CANCELED` |

#### 프론트 리스트 표시 권장 컬럼
`documentName` | `requestStatus` | `documentNumber` (APPROVED만) | `requesterOrganizationName` | `recipients[].recipientOrganizationName` | `createdAt`

---

### 6-2. 부서 문서함 > 부서 수신함

**의미**: 내 부서(+ 상위 조직)가 수신처로 지정된 공문. **APPROVED 상태만** 노출.

```
GET /approval/requests/official/received
```

Query Parameters 없음. 서버가 `X-User-MemberPositionId` 로 내 조직을 조회하고, 상위 조직까지 탐색하여 수신 공문을 반환합니다.

#### 상위 조직 포함 동작
예: 수신처가 "개발본부"로 지정된 공문 → "개발본부 > 프론트팀" 소속 직원도 수신함에서 볼 수 있음.

#### 프론트 리스트 표시 권장 컬럼
`documentNumber` | `requesterOrganizationName` (발신 부서) | `requesterName` (기안자) | `recipients[].recipientOrganizationName` (수신 부서 목록) | `createdAt`

---

### 6-3. 공문 발송함

**의미**: 내가 기안한 공문 중 최종 승인(발송 완료)된 것만.

```
GET /approval/requests/my?requestType=OFFICIAL&status=APPROVED
```

> `documentNumber`가 반드시 채워져 있습니다.

#### 프론트 리스트 표시 권장 컬럼
`documentNumber` | `requesterOrganizationName` | `recipients[].recipientOrganizationName` | `updatedAt` (승인일)

---

## 7. 참조 / 공람 문서에서 공문 확인

참조/공람 목록 API는 일반 결재와 공용입니다. `requestType` 으로 공문을 구분합니다.

```
GET /approval/viewers/cc              → 참조 목록
GET /approval/viewers/circulation     → 공람 목록
```

응답의 `requestType === "OFFICIAL"` 이면 공문.

읽음 처리:
```
PATCH /approval/viewers/{viewerId}/read
```

---

## 8. 프론트 구현 흐름 정리

### 8-1. 공문 작성 → 상신

```
[1] GET /approval/documents/active
        → requestType === "OFFICIAL" 인 양식 선택

[2] GET /approval/policyLines/{documentId}/candidates
        → 단계별 후보 드롭다운 채우기

[3] 수신 부서 선택 UI (조직 트리 / 검색)
        → recipientOrganizationId + recipientOrganizationName 획득

[4] POST /approval/requests
        → requestStatus: "WAIT", recipients 포함

[5] (선택) POST /approval/attachments/{requestId}

    ─→ 결재자에게 알림 자동 발송
```

### 8-2. 공문 결재

```
[1] GET /approval/approvals/pending
        → requestType === "OFFICIAL" 인 건 확인

[2] GET /approval/requests/{requestId}
        → 상세 (내용 + 수신처 + 결재라인 + 첨부)

[3] GET /approval/attachments/{requestId}
        → 첨부파일 목록

[4] PATCH /approval/approvals/{approvalId}/approve  (또는 /reject)

    ─→ 최종 승인 시:
        ├─ 공문 번호 자동 생성
        ├─ Kafka official-approved 이벤트 발행
        └─ 수신함에 즉시 노출
```

### 8-3. 공문 수신 확인

```
[1] GET /approval/requests/official/received
        → 수신함 리스트

[2] GET /approval/requests/{requestId}
        → 공문 상세 (documentNumber, recipients, contentJson 등)

[3] GET /approval/attachments/{requestId}
        → 첨부파일
```

### 8-4. 공문 취소/회수

```
[1] GET /approval/requests/my?requestType=OFFICIAL
        → 공문 문서함에서 대상 선택

[2] PATCH /approval/requests/{requestId}/cancel
        body: { cancelReason: "..." }
        → DRAFT/WAIT/PENDING 상태만 가능
```

---

## 9. 공문 번호 (documentNumber)

### 형식
```
{발신 부서명 앞 2글자}-{YYYY}-{순번 4자리}
```

### 예시
| 부서 | 번호 |
|---|---|
| 인사팀 | `인사-2026-0001` |
| 총무팀 | `총무-2026-0023` |
| 개발본부 | `개발-2026-0147` |

### 규칙
- 최종 승인 시점에 서버가 자동 생성 (프론트 입력 불가)
- 같은 부서 + 같은 년도 기준 순번 자동 증가
- DB UNIQUE 제약 — 중복 시 자동 재시도 (최대 5회)
- `DRAFT` / `WAIT` / `PENDING` 상태에서는 `documentNumber = null`
- `APPROVED` 상태에서만 값이 존재

### 프론트 표시 가이드
- `documentNumber`가 null이면 표시하지 않거나 "발번 전" 표시
- APPROVED 상태에서는 반드시 `documentNumber` 표시 (리스트 + 상세 모두)

---

## 10. 에러 응답 정리

```json
{
  "status": 400,
  "message": "공문은 수신 부서가 최소 1개 필요합니다.",
  "data": null
}
```

### 공문 관련 주요 에러

| status | message | 상황 |
|---|---|---|
| 400 | `공문은 수신 부서가 최소 1개 필요합니다.` | recipients 누락 |
| 400 | `동일한 수신 부서를 중복 지정할 수 없습니다.` | 같은 부서 2번 지정 |
| 400 | `결재 제출 시 결재자는 최소 1명 이상이어야 합니다.` | 상신 시 approvalLines 비어있음 |
| 400 | `요청 상태는 DRAFT 또는 WAIT만 가능합니다.` | 잘못된 requestStatus |
| 400 | `임시저장(DRAFT) 상태에서만 수정 가능합니다.` | WAIT 이후 수정 시도 |
| 400 | `취소 사유는 필수입니다.` | cancelReason 누락 |
| 400 | `반려 사유는 필수입니다.` | 반려 시 comment 누락 |
| 403 | `접근 권한이 없습니다.` | 다른 회사 |
| 403 | `열람 권한이 없습니다.` | 공문 상세 접근 권한 없음 |
| 403 | `본인의 결재 요청만 취소할 수 있습니다.` | 타인 공문 취소 시도 |
| 404 | `결재 양식을 찾을 수 없습니다.` | 잘못된 documentId |
| 404 | `결재 요청을 찾을 수 없습니다.` | 잘못된 requestId |

---

## 11. 사이드바 ↔ API Quick Reference

| 사이드바 메뉴 | HTTP | Path |
|---|---|---|
| 공문 문서함 (전체) | GET | `/approval/requests/my?requestType=OFFICIAL` |
| 공문 문서함 (승인만) | GET | `/approval/requests/my?requestType=OFFICIAL&status=APPROVED` |
| 부서 수신함 | GET | `/approval/requests/official/received` |
| 공문 발송함 | GET | `/approval/requests/my?requestType=OFFICIAL&status=APPROVED` |
| 공문 작성 | POST | `/approval/requests` (recipients 필수) |
| 공문 상세 | GET | `/approval/requests/{requestId}` |
| 공문 승인 | PATCH | `/approval/approvals/{approvalId}/approve` |
| 공문 반려 | PATCH | `/approval/approvals/{approvalId}/reject` |
| 공문 취소 | PATCH | `/approval/requests/{requestId}/cancel` |
| 첨부파일 업로드 | POST | `/approval/attachments/{requestId}` |
| 첨부파일 조회 | GET | `/approval/attachments/{requestId}` |
| 참조/공람 읽음 | PATCH | `/approval/viewers/{viewerId}/read` |
