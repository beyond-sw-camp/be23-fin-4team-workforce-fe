# 전자결재 관리자 API 가이드

프론트 관리자 화면과 백엔드(`approval-service`)를 연결하기 위한 API 명세서입니다.

- 관리자 전용 엔드포인트는 `@CheckPermission(resource = APPROVAL_AD, ...)` 로 보호됩니다.
- 권한이 없는 사용자는 게이트웨이/필터 단계에서 `403 Forbidden`을 받습니다.
- 응답 포맷은 공통으로 `ApiResponse<T>` 래퍼를 사용합니다.

---

## 1. 공통 사항

### 1-1. 공통 요청 헤더
게이트웨이에서 인증 토큰 검증 후 주입됩니다. 프론트는 `access token` 만 헤더에 실어 보내면 되고, 아래 헤더는 백엔드 내부 통신용입니다.

| 헤더명 | 타입 | 설명 |
|---|---|---|
| `X-User-CompanyId` | UUID | 소속 회사 ID |
| `X-User-UUID` | UUID | 로그인한 멤버 UUID |
| `X-User-MemberPositionId` | UUID | 현재 선택된 직책-조직 포지션 ID |

> 프론트 axios 인스턴스에서 `Authorization: Bearer {token}` 만 실어 보내면, 게이트웨이가 위 세 헤더를 자동으로 주입합니다.

### 1-2. 공통 응답 포맷
```json
{
  "status": 200,
  "message": "결재 양식 조회 성공",
  "data": { ... }
}
```

### 1-3. 에러 응답 예시
```json
{
  "status": 404,
  "message": "결재 양식을 찾을 수 없습니다.",
  "data": null
}
```

주요 상태코드:
- `400 Bad Request` — 유효성 검증 실패(예: documentName 누락)
- `403 Forbidden` — `APPROVAL_AD` 권한 없음
- `404 Not Found` — 대상 리소스 없음
- `409 Conflict` — 이미 활성/비활성 상태이거나 중복 등록

---

## 2. 결재 양식 관리 (`/approval/documents`)

관리자 화면의 **"결재 양식 관리"** 메뉴용 API 입니다.
양식 생성 / 조회 / 활성화·비활성화 / 자동승인 토글 / 부서 문서함 노출 토글을 지원합니다.

### 2-1. 양식 생성
**관리자 화면 시나리오: "새 양식 만들기" 버튼 → 모달 제출**

- Method: `POST /approval/documents`
- 권한: `APPROVAL_AD : CREATE`

#### Request Body
```json
{
  "documentName": "휴가 신청서",
  "formSchema": "{\"fields\":[{\"key\":\"startDate\",\"label\":\"시작일\",\"type\":\"date\",\"required\":true}]}",
  "requestType": "GENERAL",
  "autoApproveYn": "N",
  "isDeptVisibleYn": "Y"
}
```

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `documentName` | String | ✅ | 양식 이름 (공백 불가) |
| `formSchema` | String(JSON string) | ✅ | 폼 입력 필드 정의. 프론트 렌더러가 파싱할 JSON 문자열 |
| `requestType` | Enum | ✅ | `GENERAL` / `OFFICIAL` (공문) 등 |
| `autoApproveYn` | `"Y"`/`"N"` | ⬜ | 기본 `"N"` — 결재라인 없이 즉시 승인 처리 여부 |
| `isDeptVisibleYn` | `"Y"`/`"N"` | ⬜ | 기본 `"Y"` — 부서 문서함에 노출할지 여부 |

#### Response `201 Created`
```json
{
  "status": 201,
  "message": "결재 양식이 생성되었습니다.",
  "data": {
    "documentId": "11111111-1111-1111-1111-111111111111",
    "companyId": "99999999-9999-9999-9999-999999999999",
    "documentName": "휴가 신청서",
    "formSchema": "{...}",
    "isActiveYn": "Y",
    "requestType": "GENERAL",
    "autoApproveYn": "N",
    "isDeptVisibleYn": "Y",
    "createdAt": "2026-04-16T10:00:00",
    "updatedAt": "2026-04-16T10:00:00"
  }
}
```

---

### 2-2. 양식 단건 조회
**관리자 화면 시나리오: 양식 목록 → 항목 클릭 시 상세**

- Method: `GET /approval/documents/{documentId}`
- 권한: `APPROVAL_AD : READ`

#### Path
- `documentId` (UUID) — 대상 양식 ID

#### Response `200 OK`
`2-1`과 동일한 `ApprovalDocumentResDto` 구조.

---

### 2-3. 활성 양식 목록 (드롭다운용)
**일반 사용자 화면의 "결재 요청 작성" 드롭다운에서도 사용 가능**

- Method: `GET /approval/documents/active`
- 권한: 별도 체크 없음 (로그인만 되어 있으면 조회 가능)

#### Response `200 OK`
```json
{
  "status": 200,
  "message": "활성 결재 양식 목록 조회 성공",
  "data": [
    { "documentId": "...", "documentName": "휴가 신청서", "isActiveYn": "Y", ... }
  ]
}
```

---

### 2-4. 전체 양식 목록 (관리자용)
**관리자 화면 시나리오: "결재 양식 관리" 리스트**

- Method: `GET /approval/documents`
- 권한: `APPROVAL_AD : READ`
- 비활성(`isActiveYn = "N"`) 양식까지 모두 반환

#### Response `200 OK`
```json
{
  "status": 200,
  "message": "전체 결재 양식 목록 조회 성공",
  "data": [ { ...ApprovalDocumentResDto }, ... ]
}
```

---

### 2-5. 양식 활성화 / 비활성화
**관리자 화면 시나리오: 리스트 행의 토글 스위치 or 상세 화면의 "활성화" 버튼**

| 동작 | Method | Path |
|---|---|---|
| 활성화 | `PATCH` | `/approval/documents/{documentId}/activate` |
| 비활성화 | `PATCH` | `/approval/documents/{documentId}/deactivate` |

- 권한: `APPROVAL_AD : UPDATE`
- Body 없음
- Response: 갱신된 `ApprovalDocumentResDto`

> 비활성화 시 결재 요청 작성 드롭다운(`/approval/documents/active`)에서 제외됩니다. 이미 진행 중인 결재건에는 영향 없음.

---

### 2-6. 자동승인 on/off
**관리자 화면 시나리오: 상세 화면의 "자동승인" 토글**

| 동작 | Method | Path |
|---|---|---|
| 자동승인 ON | `PATCH` | `/approval/documents/{documentId}/auto-approve/enable` |
| 자동승인 OFF | `PATCH` | `/approval/documents/{documentId}/auto-approve/disable` |

- 권한: `APPROVAL_AD : UPDATE`
- Body 없음
- Response: 갱신된 `ApprovalDocumentResDto`

> ON 일 경우 결재라인을 거치지 않고 요청 즉시 `APPROVED` 처리되고, 요청자/참조자/공람자에게 알림이 발송됩니다.

---

### 2-7. 부서 문서함 노출 on/off
**관리자 화면 시나리오: 상세 화면의 "부서 문서함 노출" 토글**

| 동작 | Method | Path |
|---|---|---|
| 노출 ON | `PATCH` | `/approval/documents/{documentId}/dept-visible/enable` |
| 노출 OFF | `PATCH` | `/approval/documents/{documentId}/dept-visible/disable` |

- 권한: `APPROVAL_AD : UPDATE`
- Body 없음
- Response: 갱신된 `ApprovalDocumentResDto`

> OFF 일 경우 "부서 문서함" 목록 조회 시 해당 양식의 문서가 제외됩니다.

---

### 2-8. 기본 양식 초기화 (내부용)
- Method: `POST /approval/documents/init?companyId={companyId}`
- 권한: 없음 (내부 호출 전용 — 게이트웨이 외부에 노출 금지)
- 회사 생성 시 기본 양식 세트를 자동 등록

> 프론트에서 직접 호출하지 않습니다. 회사 온보딩 플로우에서 서비스 간 호출로만 사용하세요.

---

## 3. 결재라인 정책 관리 (`/approval/policyLines`)

관리자 화면의 **"결재라인 정책"** 메뉴용 API 입니다.
양식별로 "어떤 직책이 몇 단계로 결재하는지"를 정의합니다.

### 3-1. 결재라인 정책 일괄 저장
**관리자 화면 시나리오: 양식 선택 → 결재라인 편집기에서 단계별 직책/조직 설정 → "저장"**

- Method: `POST /approval/policyLines`
- 권한: `APPROVAL_AD : CREATE`
- 기존 정책을 전부 교체(upsert)하는 일괄 저장 방식

#### Request Body
```json
{
  "documentId": "11111111-1111-1111-1111-111111111111",
  "policyLines": [
    {
      "jobTitleId": "aaaaaaaa-....",
      "stepOrder": 1,
      "organizationId": null
    },
    {
      "jobTitleId": "bbbbbbbb-....",
      "stepOrder": 2,
      "organizationId": "cccccccc-...."
    }
  ]
}
```

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `documentId` | UUID | ✅ | 적용할 결재 양식 ID |
| `policyLines[]` | Array | ✅ | 단계별 정책 목록 (1단계부터 순서대로) |
| `policyLines[].jobTitleId` | UUID | ✅ | 해당 단계를 결재할 직책 ID |
| `policyLines[].stepOrder` | Integer | ✅ | 결재 순서 (1부터 시작, 중복 불가) |
| `policyLines[].organizationId` | UUID | ⬜ | 특정 부서로 한정할 때 지정. `null` 이면 요청자 조직 계열에서 자동 탐색 |

#### Response `201 Created`
```json
{
  "status": 201,
  "message": "결재라인 정책이 저장되었습니다.",
  "data": [
    {
      "policyLineId": "...",
      "documentId": "...",
      "jobTitleId": "...",
      "stepOrder": 1,
      "organizationId": null,
      "createdAt": "2026-04-16T10:00:00",
      "updatedAt": "2026-04-16T10:00:00"
    }
  ]
}
```

---

### 3-2. 양식별 결재라인 조회
**관리자 화면 시나리오: 양식 선택 시 기존 결재라인 불러오기**

- Method: `GET /approval/policyLines/{documentId}`
- 권한: 별도 체크 없음 (로그인 + 같은 회사 조건만 검증)

#### Response `200 OK`
```json
{
  "status": 200,
  "message": "결재라인 정책 조회 성공",
  "data": [
    { ...ApprovalPolicyLineResDto },
    ...
  ]
}
```

`stepOrder` 오름차순으로 정렬되어 반환됩니다.

---

### 3-3. 양식별 결재라인 전체 삭제
**관리자 화면 시나리오: "초기화" 또는 "전부 삭제" 버튼**

- Method: `DELETE /approval/policyLines/{documentId}`
- 권한: `APPROVAL_AD : DELETE`

#### Response `200 OK`
```json
{
  "status": 200,
  "message": "결재라인 정책이 삭제되었습니다.",
  "data": null
}
```

> 이미 진행 중인 결재건의 결재라인(`Approval` 엔티티)에는 영향 없음. 앞으로 새로 생성되는 요청부터만 적용됩니다.

---

### 3-4. 양식별 결재자 후보 조회
**관리자 화면에서는 보통 사용 안함. 일반 사용자의 "결재 요청 작성" 화면에서 사용**
(정책 검증용으로 관리자도 참조 가능하므로 함께 기술)

- Method: `GET /approval/policyLines/{documentId}/candidates`
- 권한: 별도 체크 없음 (로그인만 되어 있으면 조회 가능)
- 요청자의 포지션을 기반으로 각 단계별 후보 결재자 목록을 반환

#### Request Header (추가 필요)
- `X-User-MemberPositionId` — 요청자의 포지션 ID (후보 필터링에 사용)

#### Response `200 OK`
```json
{
  "status": 200,
  "message": "후보 결재자 조회 성공",
  "data": [
    {
      "policyLineId": "...",
      "documentId": "...",
      "jobTitleId": "...",
      "stepOrder": 1,
      "organizationId": null,
      "candidates": [
        {
          "memberPositionId": "...",
          "memberId": "...",
          "memberName": "홍길동",
          "organizationId": "...",
          "organizationName": "인사팀",
          "jobTitleId": "...",
          "jobTitleName": "팀장",
          "jobGradeId": "...",
          "jobGradeName": "책임"
        }
      ]
    }
  ]
}
```

`candidates` 가 비어 있다는 것은 해당 단계에 해당하는 실제 사용자가 없다는 뜻입니다 — 관리자는 이 경우 정책을 수정하거나 사용자를 배치해야 합니다.

---

## 4. 관리자 전형적인 사용 흐름

```
[1] GET /approval/documents            → 현재 등록된 양식 전체 확인
        ↓
[2] POST /approval/documents           → 새 양식 생성 (documentId 획득)
        ↓
[3] POST /approval/policyLines         → 해당 양식의 결재라인 일괄 등록
        ↓
[4] GET /approval/policyLines/{id}/candidates
                                       → 후보 결재자 검증 (빈 후보 없는지)
        ↓
[5] PATCH /approval/documents/{id}/activate
                                       → 양식 활성화 → 사용자에게 노출
```

수정 흐름:
```
[1] GET /approval/documents/{id}       → 현재 설정 확인
[2] PATCH .../auto-approve/enable 등   → 필요한 토글만 호출
[3] POST /approval/policyLines         → 결재라인 교체 (재저장 = upsert)
```

폐기 흐름:
```
[1] PATCH /approval/documents/{id}/deactivate
                                       → 드롭다운에서 즉시 제외
(양식 자체 삭제 API는 없음 — 이력 보존을 위해 비활성 처리만 지원)
```

---

## 5. 프론트 화면 ↔ API 매핑 Quick Reference

### 5-1. 결재 양식 관리 화면

| 화면 동작 | HTTP | Path |
|---|---|---|
| 양식 목록 보기 | GET | `/approval/documents` |
| 양식 상세 보기 | GET | `/approval/documents/{id}` |
| 새 양식 만들기 | POST | `/approval/documents` |
| 양식 활성화 | PATCH | `/approval/documents/{id}/activate` |
| 양식 비활성화 | PATCH | `/approval/documents/{id}/deactivate` |
| 자동승인 ON | PATCH | `/approval/documents/{id}/auto-approve/enable` |
| 자동승인 OFF | PATCH | `/approval/documents/{id}/auto-approve/disable` |
| 부서 문서함 노출 ON | PATCH | `/approval/documents/{id}/dept-visible/enable` |
| 부서 문서함 노출 OFF | PATCH | `/approval/documents/{id}/dept-visible/disable` |

### 5-2. 결재라인 정책 관리 화면

| 화면 동작 | HTTP | Path |
|---|---|---|
| 양식별 결재라인 불러오기 | GET | `/approval/policyLines/{documentId}` |
| 결재라인 저장(=교체) | POST | `/approval/policyLines` |
| 결재라인 전체 삭제 | DELETE | `/approval/policyLines/{documentId}` |
| 후보 결재자 미리보기 | GET | `/approval/policyLines/{documentId}/candidates` |

---

## 6. 참고

- `autoApproveYn = "Y"` 인 양식은 결재라인 정책을 등록할 필요가 없습니다. (요청 즉시 승인되기 때문)
- `requestType = OFFICIAL` (공문)인 양식을 사용하려면 요청자 측에서 수신처(`officialRecipients`)를 반드시 지정해야 합니다 — 이는 사용자 요청 단 API 쪽의 제약이므로 관리자 API에는 영향 없습니다.
- 결재라인 정책은 **순서(`stepOrder`)** 와 **직책(`jobTitleId`)** 만 정의하고, 실제 결재자는 요청 생성 시점에 요청자 조직 계열에서 동적으로 결정됩니다. 따라서 조직 개편이 있어도 정책은 그대로 유지됩니다.
