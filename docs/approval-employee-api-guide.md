# 전자결재 일반 직원 API 가이드

프론트의 일반 직원(기안자/결재자/참조자) 화면과 백엔드(`approval-service`)를 연결하기 위한 API 명세서입니다.

- 일반 직원용 엔드포인트 대부분은 별도 권한 체크 없이 **로그인 + 본인 소속 회사** 조건만 검증합니다.
- 응답 포맷은 공통으로 `ApiResponse<T>` 래퍼를 사용합니다.
- 관리자 전용 API(양식/결재라인 관리)는 별도 문서 `approval-admin-api-guide.md` 참고.

---

## 1. 공통 사항

### 1-1. 공통 요청 헤더
게이트웨이에서 자동 주입됩니다. 프론트는 `Authorization: Bearer {token}` 만 실으면 됩니다.

| 헤더명 | 타입 | 설명 |
|---|---|---|
| `X-User-CompanyId` | UUID | 소속 회사 ID |
| `X-User-UUID` | UUID | 로그인한 멤버 UUID (서버 코드상 `memberId`) |
| `X-User-MemberPositionId` | UUID | 현재 선택된 직책-조직 포지션 ID |

### 1-2. 공통 응답 포맷
```json
{
  "status": 200,
  "message": "결재 요청 조회 성공",
  "data": { ... }
}
```

### 1-3. 주요 Enum 정의

**RequestStatus** (요청자 입장 문서 상태)

| 값 | 의미 |
|---|---|
| `DRAFT` | 임시저장 |
| `WAIT` | 결재 시작 전 대기 |
| `PENDING` | 결재 진행 중 |
| `APPROVED` | 최종 승인 |
| `REJECTED` | 반려됨 |
| `CANCELED` | 취소됨 |

**RequestType** (양식 카테고리)

| 값 | 의미 |
|---|---|
| `VACATION` | 휴가 |
| `ATTENDANCE` | 근태 |
| `HR_MOVEMENT` | 부서 이동 |
| `SALARY` | 급여 |
| `GENERAL` | 일반기안 |
| `CONTRACT` | 전자계약 |
| `CERTIFICATE` | 증명서 발급 |
| `OFFICIAL` | 공문 |

**LineStatus** (개별 결재 단계 상태)

| 값 | 의미 |
|---|---|
| `WAITING` | 이전 단계 대기 중 (아직 내 차례 아님) |
| `PENDING` | 내 차례 (결재 대기) |
| `APPROVED` | 승인 완료 |
| `REJECTED` | 반려 |
| `CANCELED` | 요청이 취소되어 함께 취소됨 |

**ViewerType**

| 값 | 의미 |
|---|---|
| `CC` | 참조 (결재 진행과 동시에 열람 가능) |
| `CIRCULATION` | 공람 (최종 승인 후 열람) |

---

## 2. 결재 요청 작성 (`/approval/requests`)

기안자가 결재를 올리고 관리하는 영역입니다.

### 2-1. 결재 요청 생성 / 임시저장
**프론트 화면: "결재 요청 작성" 페이지의 [상신] / [임시저장] 버튼**

- Method: `POST /approval/requests`

#### Request Body
```json
{
  "documentId": "11111111-...",
  "contentJson": "{\"startDate\":\"2026-05-01\",\"endDate\":\"2026-05-03\",\"reason\":\"연차\"}",
  "requestStatus": "WAIT",
  "approvalLines": [
    {
      "stepOrder": 1,
      "approverMemberId": "...",
      "approverMemberPositionId": "..."
    }
  ],
  "viewers": [
    {
      "viewerMemberId": "...",
      "viewerMemberPositionId": "...",
      "viewerType": "CC"
    }
  ],
  "recipients": [
    {
      "recipientOrganizationId": "...",
      "recipientOrganizationName": "인사팀"
    }
  ]
}
```

| 필드 | 필수 | 설명 |
|---|---|---|
| `documentId` | ✅ | 선택한 양식 ID. `/approval/documents/active` 에서 선택 |
| `contentJson` | ✅ | 양식의 `formSchema` 에 맞춰 프론트가 채운 값(JSON 문자열) |
| `requestStatus` | ✅ | `DRAFT`(임시저장) 또는 `WAIT`(상신) |
| `approvalLines` | ⬜ | 결재 단계 목록. 자동승인 양식이면 비워도 됨 |
| `viewers` | ⬜ | 참조/공람자 |
| `recipients` | ⚠️ | **`requestType = OFFICIAL` (공문) 양식일 때 최소 1건 필수** |

> 상신 후 알림: 첫 번째 결재자에게 "결재 대기" 알림이 자동 발송됩니다(Kafka → WebSocket).

#### Response `201 Created`
`ApprovalRequestResDto` 전체 (문서/결재라인/뷰어/수신처/요청자 스냅샷 포함)

---

### 2-2. 임시저장 수정
**프론트 화면: 임시저장 목록 → 항목 열기 → 편집 → [저장] or [상신]**

- Method: `PATCH /approval/requests/{requestId}`
- Body: `2-1`과 동일한 `ApprovalRequestCreateReqDto`
- **`DRAFT` 상태에서만 수정 가능**. 상신 후에는 취소 후 재작성해야 함.

#### Response `200 OK`
업데이트된 `ApprovalRequestResDto`.

---

### 2-3. 결재 요청 상세 조회
**프론트 화면: 모든 문서함에서 항목 클릭 시 상세 페이지**

- Method: `GET /approval/requests/{requestId}`

백엔드는 내부적으로 요청자/결재자/참조자/공람자/수신 부서 중 한 명인지 확인 후 공개합니다. 권한 없는 경우 `403`.

#### Response `200 OK`
```json
{
  "status": 200,
  "message": "결재 요청 조회 성공",
  "data": {
    "requestId": "...",
    "documentId": "...",
    "documentName": "휴가 신청서",
    "memberId": "...",
    "requestType": "VACATION",
    "contentJson": "{...}",
    "requestStatus": "PENDING",
    "cancelReason": null,
    "createdAt": "2026-04-16T09:00:00",
    "updatedAt": "2026-04-16T09:30:00",
    "documentNumber": null,
    "recipients": [],
    "requesterName": "홍길동",
    "requesterOrganizationId": "...",
    "requesterOrganizationName": "인사팀",
    "approvalLines": [
      {
        "approvalId": "...",
        "requestId": "...",
        "approverMemberId": "...",
        "approverMemberPositionId": "...",
        "stepOrder": 1,
        "approvalStatus": "APPROVED",
        "actedAt": "2026-04-16T09:15:00",
        "comment": "확인",
        "signatureImageUrl": "...",
        "isSignedYn": "Y",
        "createdAt": "...",
        "updatedAt": "...",
        "actualApproverMemberId": null,
        "actualApproverMemberPositionId": null,
        "isProxyYn": "N"
      }
    ],
    "viewers": [
      {
        "viewerId": "...",
        "requestId": "...",
        "viewerMemberId": "...",
        "viewerMemberPositionId": "...",
        "viewerType": "CC",
        "viewerReadStatus": "UNREAD",
        "viewedAt": null,
        "createdAt": "...",
        "updatedAt": "..."
      }
    ]
  }
}
```

> `documentNumber`, `recipients` 는 공문(`OFFICIAL`)일 때만 값이 차있습니다.
> `actualApproverMemberId` / `isProxyYn` 은 대결(부재 위임) 처리 시만 채워집니다.

---

### 2-4. 내가 올린 결재 목록
**프론트 화면: "개인 문서함 > 전체/임시/진행/완료/반려/취소" 탭**

- Method: `GET /approval/requests/my`

#### Query Parameters
| 파라미터 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `status` | RequestStatus | ⬜ | 상태 필터. 생략 시 전체 |
| `requestType` | RequestType | ⬜ | 양식 타입 필터. `OFFICIAL` 주면 공문 발송함으로 사용 가능 |

화면 탭 매핑 예시:

| 프론트 탭 | Query |
|---|---|
| 임시저장 문서 | `?status=DRAFT` |
| 진행 중 문서 | `?status=PENDING` (또는 `WAIT` 포함해서 클라이언트에서 합치기) |
| 결재 완료 문서 | `?status=APPROVED` |
| 결재 반려 문서 | `?status=REJECTED` |
| 결재 취소 문서 | `?status=CANCELED` |
| 공문 발송함 | `?requestType=OFFICIAL` |

#### Response `200 OK`
`List<ApprovalRequestResDto>`

---

### 2-5. 결재 취소
**프론트 화면: 상세 페이지의 [취소] 버튼 (본인이 올린 문서에만 노출)**

- Method: `PATCH /approval/requests/{requestId}/cancel`

#### Request Body
```json
{
  "cancelReason": "오기재로 재작성 필요"
}
```
- `cancelReason` 필수(공백 불가)
- `DRAFT`/`WAIT`/`PENDING` 상태에서만 가능. `APPROVED`/`REJECTED` 는 불가.
- 취소 시 모든 진행 중 결재 단계가 `CANCELED`로 변경되고, 결재자들에게 "취소됨" 알림 발송.

#### Response `200 OK`
업데이트된 `ApprovalRequestResDto` (`requestStatus = CANCELED`)

---

### 2-6. 부서 문서함
**프론트 화면: "부서 문서함" 탭들 (우리 부서 / 하위 부서 전체)**

- Method: `GET /approval/requests/department?organizationId={uuid}&requestType={optional}`

#### Query Parameters
| 파라미터 | 필수 | 설명 |
|---|---|---|
| `organizationId` | ✅ | 조회할 조직 ID (내 부서 ID 또는 하위 부서 ID) |
| `requestType` | ⬜ | 양식 타입 필터 |

- 내가 해당 조직 계열의 관리자/리더 포지션인지 서버에서 검증.
- `isDeptVisibleYn = "N"` 인 양식의 문서는 제외됨.

#### Response `200 OK`
`List<ApprovalRequestResDto>`

---

### 2-7. 공문 수신함
**프론트 화면: "부서 문서함 > 부서 수신함"**

- Method: `GET /approval/requests/official/received`
- 내 현재 포지션의 조직이 `OfficialRecipient`로 지정된 공문 목록 반환
- `requestStatus = APPROVED` 인 공문만 반환 (최종 승인된 공문만 수신되는 개념)

#### Response `200 OK`
`List<ApprovalRequestResDto>` — `documentNumber`가 채워진 공문들.

---

## 3. 결재 처리 (`/approval/approvals`)

결재자 입장에서 승인/반려 및 결재 내역을 조회합니다.

### 3-1. 결재 대기함
**프론트 화면: "결재하기 > 결재 대기 문서"**

- Method: `GET /approval/approvals/pending`
- 내가 결재자인 `PENDING` 상태의 단계만 반환 (= 지금 내 차례)
- **대결(부재 위임)** 이 활성인 문서도 함께 반환됨 — `isProxyYn = "Y"` 로 구분 가능

#### Response `200 OK`
`List<ApprovalRequestResDto>` — 각 문서의 `approvalLines` 에서 내 단계만 `PENDING`

---

### 3-2. 결재 완료함
**프론트 화면: "결재하기 > 결재 완료 문서"**

- Method: `GET /approval/approvals/acted`
- 내가 이미 승인/반려한 단계가 포함된 문서 전체 반환

#### Response `200 OK`
`List<ApprovalRequestResDto>`

---

### 3-3. 승인 처리
**프론트 화면: 결재 상세 화면의 [승인] 버튼**

- Method: `PATCH /approval/approvals/{approvalId}/approve`

> `{approvalId}` 는 `ApprovalLineResDto.approvalId` — 즉 **결재 단계 ID**. 요청 ID 아님에 주의.

#### Request Body
```json
{
  "comment": "확인했습니다."
}
```
- `comment` 는 선택 (승인 시)

#### Response `200 OK`
갱신된 `ApprovalRequestResDto`.

처리 내용:
- 내 단계 `APPROVED` 로 변경
- 다음 단계가 있으면 그 단계를 `PENDING`으로 승격 → 해당 결재자에게 알림
- 마지막 단계였다면 요청 전체 `APPROVED` → 요청자/참조자/공람자에게 알림
- 공문(`OFFICIAL`) 최종 승인 시 `documentNumber` 자동 생성 (예: `인사-2026-0147`)

---

### 3-4. 반려 처리
**프론트 화면: 결재 상세 화면의 [반려] 버튼 → 반려 사유 입력 모달**

- Method: `PATCH /approval/approvals/{approvalId}/reject`

#### Request Body
```json
{
  "comment": "금액 산정 확인 필요"
}
```
- **반려 시 `comment` 필수**(프론트에서 빈 값 제출 방지 권장)

#### Response `200 OK`
갱신된 `ApprovalRequestResDto` (`requestStatus = REJECTED`).

처리 내용:
- 내 단계 `REJECTED` 로, 이후 단계들 `CANCELED` 로 일괄 처리
- 요청자에게 "반려됨" 알림

---

## 4. 참조 / 공람 (`/approval/viewers`)

결재 라인에 포함되지는 않지만 문서를 열람해야 하는 사용자용입니다.

### 4-1. 참조 목록
**프론트 화면: "개인 문서함 > 결재 참조 문서"**

- Method: `GET /approval/viewers/cc`
- 내가 `CC` 로 지정된 문서 목록 (진행 중/완료 문서 모두 포함)

#### Response `200 OK`
`List<ApprovalRequestResDto>`

---

### 4-2. 공람 목록
**프론트 화면: "개인 문서함 > 결재 공람 문서"**

- Method: `GET /approval/viewers/circulation`
- 내가 `CIRCULATION` 으로 지정된 문서 중 **최종 승인(`APPROVED`)** 된 문서만 반환

#### Response `200 OK`
`List<ApprovalRequestResDto>`

---

### 4-3. 읽음 처리
**프론트 화면: 참조/공람 상세 진입 시 백그라운드로 호출**

- Method: `PATCH /approval/viewers/{viewerId}/read`

> `{viewerId}` 는 `ApprovalViewerResDto.viewerId` — 문서 상세의 `viewers[]` 에서 추출.

#### Response `200 OK`
```json
{ "status": 200, "message": "읽음 처리 완료", "data": null }
```

- `viewerReadStatus = READ`, `viewedAt = now()` 로 세팅.
- 프론트에서 UNREAD 필터를 걸어 "아직 안 읽은 것만" 표시하는 경우 이 API 후 목록 새로고침 필요.

---

## 5. 첨부파일 (`/approval/attachments`)

### 5-1. 첨부파일 업로드
**프론트 화면: 결재 요청 작성 페이지의 첨부 섹션**

- Method: `POST /approval/attachments/{requestId}`
- Content-Type: `multipart/form-data`

#### Request
| 필드명 | 타입 | 설명 |
|---|---|---|
| `files` | File[] | 여러 파일 동시 업로드 가능 |

#### Response `201 Created`
```json
{
  "status": 201,
  "message": "첨부파일 업로드 성공",
  "data": [
    {
      "attachmentId": "...",
      "requestId": "...",
      "fileName": "휴가계.pdf",
      "approvalUrl": "https://cdn.../...",
      "fileSize": 123456,
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```

- 요청자 본인만 업로드 가능 (소유권 검증)
- 업로드된 파일은 S3 등 스토리지에 저장되고 `approvalUrl` 로 접근

---

### 5-2. 첨부파일 목록 조회
- Method: `GET /approval/attachments/{requestId}`
- 별도 권한 검증 없음 (문서 상세 조회 권한이 있는 사용자만 `requestId`를 알고 있다는 전제)
- Response: `List<AttachmentResDto>`

---

### 5-3. 첨부파일 삭제
- Method: `DELETE /approval/attachments/{attachmentId}`
- 요청자 본인만 삭제 가능
- Response: `204 No Content` 대신 200 with `null`

---

## 6. 부재 위임 / 대결 (`/approval/absence-proxy`)

휴가 등으로 자리를 비울 때 결재 권한을 다른 직원에게 위임합니다.

### 6-1. 위임 등록
**프론트 화면: "개인 문서함 > 부재 위임 설정" (또는 별도 설정 메뉴)**

- Method: `POST /approval/absence-proxy`

#### Request Body
```json
{
  "substituteId": "aaaa-....",
  "startDate": "2026-05-01T00:00:00",
  "endDate": "2026-05-07T23:59:59"
}
```

| 필드 | 필수 | 설명 |
|---|---|---|
| `substituteId` | ✅ | 대결자 멤버 UUID |
| `startDate` | ✅ | 위임 시작 일시 |
| `endDate` | ✅ | 위임 종료 일시 |

- 시작일 ≥ 현재 시각, 종료일 > 시작일 검증됨.
- 기간 겹침 방지: 같은 위임자-대결자 조합으로 활성 위임이 이미 있으면 오류.

#### Response `201 Created`
```json
{
  "status": 201,
  "message": "부재 위임이 등록되었습니다.",
  "data": {
    "proxyId": "...",
    "companyId": "...",
    "memberId": "...",
    "substituteId": "...",
    "startDate": "2026-05-01T00:00:00",
    "endDate": "2026-05-07T23:59:59",
    "isActiveYn": "Y",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

---

### 6-2. 내가 등록한 위임 목록
**프론트 화면: 위임 설정 화면의 "내가 위임한 목록" 섹션**

- Method: `GET /approval/absence-proxy/my`
- 활성이면서 종료일이 미래인 위임만 반환

#### Response `200 OK`
`List<AbsenceProxyResDto>`

---

### 6-3. 나에게 위임된 목록
**프론트 화면: "내가 대결 중인/예정인 업무" 섹션**

- Method: `GET /approval/absence-proxy/delegated`

#### Response `200 OK`
`List<AbsenceProxyResDto>`

---

### 6-4. 위임 취소(비활성화)
- Method: `PATCH /approval/absence-proxy/{proxyId}/deactivate`
- 본인이 등록한 위임만 취소 가능
- Response: 갱신된 `AbsenceProxyResDto` (`isActiveYn = "N"`)

---

## 7. 화면 흐름 예시

### 7-1. 결재 요청 상신 (기안자)
```
[1] GET /approval/documents/active
        ↓ 양식 목록 드롭다운 채우기
[2] 양식 선택 → 프론트에서 formSchema 파싱 → 입력 폼 렌더
        ↓
[3] GET /approval/policyLines/{documentId}/candidates
        ↓ 결재 단계별 후보 결재자 드롭다운 채우기
[4] POST /approval/requests (requestStatus = WAIT)
        ↓
[5] (선택) POST /approval/attachments/{requestId}
        ↓
    → 첫 결재자에게 알림 자동 발송
```

### 7-2. 결재 처리 (결재자)
```
[1] GET /approval/approvals/pending        → 대기함 리스트
[2] GET /approval/requests/{requestId}     → 상세 진입
[3] GET /approval/attachments/{requestId}  → 첨부파일 확인
[4] PATCH /approval/approvals/{approvalId}/approve
    or
    PATCH /approval/approvals/{approvalId}/reject
        ↓
    → 다음 결재자 or 요청자에게 알림 자동 발송
```

### 7-3. 참조/공람 확인
```
[1] GET /approval/viewers/cc
    or
    GET /approval/viewers/circulation     → 목록
[2] GET /approval/requests/{requestId}    → 상세
[3] PATCH /approval/viewers/{viewerId}/read  → 읽음 처리
```

### 7-4. 공문 발송 & 수신
```
발송 흐름 (기안자)
[1] POST /approval/requests (requestType=OFFICIAL, recipients 필수)
[2] 최종 승인 시 documentNumber 자동 생성 (예: "인사-2026-0147")
[3] GET /approval/requests/my?requestType=OFFICIAL   → 내 공문 발송함

수신 흐름 (수신부서 구성원)
[1] GET /approval/requests/official/received  → 부서 수신함
[2] GET /approval/requests/{requestId}        → 공문 상세
```

---

## 8. 프론트 사이드바 ↔ API 매핑 Quick Reference

### 결재 요청 작성
| 화면 | HTTP | Path |
|---|---|---|
| 양식 선택 드롭다운 | GET | `/approval/documents/active` |
| 후보 결재자 조회 | GET | `/approval/policyLines/{documentId}/candidates` |
| 상신/임시저장 | POST | `/approval/requests` |
| 첨부파일 업로드 | POST | `/approval/attachments/{requestId}` |

### 결재하기 (4개 메뉴)
| 화면 | HTTP | Path |
|---|---|---|
| 결재 대기 문서 | GET | `/approval/approvals/pending` |
| 결재 예정 문서 | ⚠️ | 현재 전용 API 없음 — 프론트에서 `/approval/approvals/pending` 응답의 `approvalLines` 중 `WAITING` 단계를 필터링하거나, 별도 엔드포인트 추가 필요 |
| 결재 완료 문서 | GET | `/approval/approvals/acted` |
| 결재 수신 문서 | ❓ | 의미 명확화 필요 — CC/공람/공문수신 중 어느 것? |

### 개인 문서함
| 화면 | HTTP | Path |
|---|---|---|
| 임시저장 문서 | GET | `/approval/requests/my?status=DRAFT` |
| 진행 중 문서 | GET | `/approval/requests/my?status=PENDING` |
| 결재 완료 문서 | GET | `/approval/requests/my?status=APPROVED` |
| 결재 반려 문서 | GET | `/approval/requests/my?status=REJECTED` |
| 결재 취소 문서 | GET | `/approval/requests/my?status=CANCELED` |
| 결재 참조 문서 | GET | `/approval/viewers/cc` |
| 결재 공람 문서 | GET | `/approval/viewers/circulation` |
| 공문 문서함 | GET | `/approval/requests/my?requestType=OFFICIAL` |

### 부서 문서함
| 화면 | HTTP | Path |
|---|---|---|
| 부서 문서함 (전체) | GET | `/approval/requests/department?organizationId={id}` |
| 부서 수신함 (공문) | GET | `/approval/requests/official/received` |
| 공문 발송함 | GET | `/approval/requests/my?requestType=OFFICIAL` |

### 상세/액션 (공통)
| 화면 | HTTP | Path |
|---|---|---|
| 상세 조회 | GET | `/approval/requests/{requestId}` |
| 첨부파일 조회 | GET | `/approval/attachments/{requestId}` |
| 첨부파일 삭제 | DELETE | `/approval/attachments/{attachmentId}` |
| 임시저장 수정 | PATCH | `/approval/requests/{requestId}` |
| 요청 취소 | PATCH | `/approval/requests/{requestId}/cancel` |
| 승인 | PATCH | `/approval/approvals/{approvalId}/approve` |
| 반려 | PATCH | `/approval/approvals/{approvalId}/reject` |
| 참조/공람 읽음 | PATCH | `/approval/viewers/{viewerId}/read` |

### 부재 위임
| 화면 | HTTP | Path |
|---|---|---|
| 위임 등록 | POST | `/approval/absence-proxy` |
| 내가 위임한 목록 | GET | `/approval/absence-proxy/my` |
| 나에게 위임된 목록 | GET | `/approval/absence-proxy/delegated` |
| 위임 취소 | PATCH | `/approval/absence-proxy/{proxyId}/deactivate` |

---

## 9. 참고 / 주의사항

- **공문(`OFFICIAL`) 작성 시**: `recipients` 배열에 최소 1개 수신 부서를 넣어야 하며, `recipientOrganizationName`을 반드시 함께 전송해야 합니다 (스냅샷 방식 — 조직 개편 후에도 수신 당시의 부서명이 유지되도록 하기 위함).
- **알림**: 결재 관련 이벤트(상신/승인/반려/취소/참조 추가/공람 추가)는 AFTER_COMMIT 이후 Kafka `notification` 토픽으로 발행되어 member-service가 Redis Pub/Sub + WebSocket 으로 사용자에게 푸시합니다. 프론트는 별도 폴링 필요 없음.
- **대결(부재 위임) 동작**: 위임이 활성인 기간에는 위임자에게 걸리는 결재가 대결자에게도 동시에 `PENDING` 상태로 노출되며, 둘 중 먼저 처리한 사람이 결재를 확정합니다. 프론트 UI에서는 `isProxyYn = "Y"` 인 경우 "대결" 배지를 붙이는 것을 권장합니다.
- **상태와 단계**: `RequestStatus`(요청 전체)와 `LineStatus`(개별 단계)는 다른 개념입니다. 예를 들어 요청이 `PENDING`이어도 앞 단계는 `APPROVED`, 현재는 `PENDING`, 이후는 `WAITING` 상태로 섞여 있습니다.
- **documentNumber 형식**: `{부서 앞 2글자}-{YYYY}-{순번 4자리}` — 예: `인사-2026-0147`. 공문 최종 승인 시점에 서버가 생성하며, 프론트는 상세 응답의 `documentNumber` 필드를 그대로 표시하면 됩니다.
