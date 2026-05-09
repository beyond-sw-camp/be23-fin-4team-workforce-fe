# Workforce FE - 챗봇 + AI 문서 구현 인벤토리 (Read-only)

아래 내용은 실제 코드만 근거로 작성했습니다. 추측은 포함하지 않았고, 확인 불가 항목은 `missing`으로 표기했습니다.

---

## 섹션 1: 챗봇 UI 구현

### 1-1. FAB 진입점 (`AiChatbotFab`)

파일: `src/widgets/app-shell/AiChatbotFab.tsx`  
연결 위치: `src/widgets/app-shell/AppShellLayout.tsx`

- 배치: `AppShellLayout` 하단에 `<AiChatbotFab/>`로 렌더됨.
  - Source: `src/widgets/app-shell/AppShellLayout.tsx`
- 화면 위치: 우측 하단 `fixed` (`bottom-6`, `right-6`).
  - Source: `src/widgets/app-shell/AiChatbotFab.tsx`
- 아이콘: `AiChatbotLottieIcon` 사용.
  - Source: `src/widgets/app-shell/AiChatbotFab.tsx`
- 클릭 동작: FAB 버튼 클릭 시 `open` state 토글.
  - Source: `src/widgets/app-shell/AiChatbotFab.tsx`

조건부 렌더링:
- 일반 `/app/*` 레이아웃에서는 표시됨.
- `/app/onboarding`에서는 AppShellLayout이 별도 분기 return을 타며 FAB 미표시.
  - Source: `src/widgets/app-shell/AppShellLayout.tsx`
- `embed=compose-modal` + approvals shell 경로에서도 별도 분기 return으로 FAB 미표시.
  - Source: `src/widgets/app-shell/AppShellLayout.tsx`

다른 진입점:
- 사이드바/헤더에 챗봇 페이지 링크나 메뉴는 찾지 못함 (`missing`).
- 현재 확인된 진입점은 FAB 1개.

---

### 1-2. 챗봇 본체 컴포넌트

파일: `src/widgets/app-shell/AiChatbotFab.tsx`  
컴포넌트 이름: `AiChatbotFab`

구조 요약:
- 헤더
  - 제목: `AI 비서`
  - 버튼: `맨 아래`, 대화 이력 삭제(`DeleteOutlined` + `Popconfirm`), 닫기(`CloseOutlined`)
- 메시지 영역
  - `displayHistory.map(...)`로 사용자 질문/AI 답변 렌더
  - 답변 하단에 `sources`가 있으면 `참고:` 라인 표시
  - 스크롤 영역 + 자동 하단 스크롤
- 입력 영역
  - `textarea`
  - Enter 전송, Shift+Enter 줄바꿈
  - 전송 버튼(`SendOutlined`)
- 대기 UI
  - `chatM.isPending`일 때 `Spin` + `답변 생성 중...` 표시

상태 관리:
- 로컬 상태: `open`, `input`, `sourcesHint`
- 서버 상태: TanStack Query (`['ai','chat-history']`)
- 전송/삭제: TanStack Mutation
- Source: `src/widgets/app-shell/AiChatbotFab.tsx`

마크다운 지원:
- `react-markdown` 등 마크다운 렌더 코드 없음 -> `missing`

대화 초기화 / 이력 삭제:
- 헤더 삭제 버튼 클릭 -> `Popconfirm` 확인 -> `aiApi.clearChatHistory()` mutation
- 성공 시 `['ai','chat-history']` invalidate
- Source: `src/widgets/app-shell/AiChatbotFab.tsx`

---

### 1-3. API 호출 구현

호출 함수 위치: `src/features/ai/api/aiApi.ts`

질문 API:
- Method: `POST`
- URL 코드: `httpClient.post(\`${CHAT_PREFIX}/chat\`, { question }, { timeout: 120_000 })`
- Body: `{ question }`
- Response 처리: `unwrapChatResponse`에서 `answer`, `sources` 추출
- Source: `src/features/ai/api/aiApi.ts`

이력 조회 API:
- Method: `GET`
- URL 코드: `httpClient.get(\`${CHAT_PREFIX}/chat/history\`)`
- Response 처리:
  - `unwrapApiResponse` -> `normalizeListPayload` -> `normalizeHistoryItem` -> 정렬
- Source: `src/features/ai/api/aiApi.ts`

이력 삭제 API:
- Method: `DELETE`
- URL 코드: `httpClient.delete(\`${CHAT_PREFIX}/chat/history\`)`
- Source: `src/features/ai/api/aiApi.ts`

추가 설명:
- `CHAT_PREFIX`는 `VITE_CHAT_API_PREFIX`에서 읽고, 없으면 빈 문자열(`''`)이라 기본 경로가 `/chat/*`.
- Source: `src/features/ai/api/aiApi.ts`

---

### 1-4. 인증/인터셉터

파일: `src/shared/api/httpClient.ts`

토큰 주입 방식:
- `getAccessToken()`으로 AT 조회
- request interceptor에서 `Authorization: Bearer ...` 자동 주입
- refresh endpoint(`/member/generate-at`) 호출 시는 Authorization 미주입 분기

X-User-* 헤더:
- interceptor에서 자동 추가
  - `X-User-UUID`
  - `X-User-MemberPositionId`
  - `X-User-CompanyId` (tenant에서 `X-Company-Id` 기반)
  - 그 외 `X-Member-Id`, `X-User-Id`, `X-User-IsSystemAdmin`도 추가

Source:
- `src/shared/api/httpClient.ts`
- 보조 함수/스토어: `src/shared/stores/authTokenStore.ts`, `src/shared/stores/authRefreshIdentityStore.ts`, `src/shared/auth/jwtTenantClaims.ts`

---

## 섹션 2: AI 문서 관리

### 2-1. `AiDocumentsAdminPage` 화면

파일: `src/pages/app/AiDocumentsAdminPage.tsx`  
화면명: `HR 정책 문서 (AI)`  
URL: `/app/ai-documents`  
권한: 시스템 관리자 (`isSystemAdmin`) 라우트 가드

권한 근거:
- Source: `src/app/router/index.tsx`

페이지 레이아웃:

[섹션 1: 문서 업로드]
- 제목: `문서 업로드`
- 방식: `Upload.Dragger` (클릭 + 드래그앤드롭)
- 확장자: `.pdf,.docx,.txt`
- 크기 제한: 10MB
- 다중 업로드: `multiple: false`
- 추가 입력 필드(문서명/카테고리/layer 선택): `missing`

[섹션 2: 업로드된 문서]
- 제목: `업로드된 문서`
- 형태: `Table`
- 컬럼:
  - `문서명`
  - `업로드 일시`
  - `관리`(삭제)
- 페이지네이션: `pagination={false}`
- 정렬/필터 UI: `missing`
- 다운로드 버튼: `missing`

Source:
- `src/pages/app/AiDocumentsAdminPage.tsx`

---

### 2-2. 사용 API 정리

업로드:
- `POST ${AI_PREFIX}/documents/upload`
- 코드: `httpClient.post(\`${AI_PREFIX}/documents/upload\`, form, ...)`
- Content-Type: `multipart/form-data`
- FormData: `file`
- Source: `src/features/ai/api/aiApi.ts`

목록 조회:
- `GET ${AI_PREFIX}/documents`
- 코드: `httpClient.get(\`${AI_PREFIX}/documents\`)`
- Source: `src/features/ai/api/aiApi.ts`

삭제:
- `DELETE ${AI_PREFIX}/documents/{id}`
- 코드: `httpClient.delete(\`${AI_PREFIX}/documents/${encodeURIComponent(documentId)}\`)`
- Source: `src/features/ai/api/aiApi.ts`

다운로드:
- 코드에서 관련 endpoint 호출 확인 못함 -> `missing`

---

### 2-3. layer 표시 여부

- 업로드 시 layer 선택 UI: `missing`
- 목록에서 layer 컬럼 표시: `missing`
- layer 필터: `missing`
- 시스템/자동/HR 업로드 분류 라벨 표시: `missing`

확인 근거:
- 페이지 파일: `src/pages/app/AiDocumentsAdminPage.tsx`
- API 파일: `src/features/ai/api/aiApi.ts`

---

## 섹션 3: 사이드바/메뉴

파일: `src/widgets/app-shell/AppShellLayout.tsx`, `src/app/router/index.tsx`, `src/app/locale/app-ko.ts`

### 3-1. 챗봇/AI 관련 메뉴 위치

- 챗봇 진입 메뉴:
  - 사이드바/헤더 라우트 메뉴 없음 (`missing`)
  - FAB로만 진입

- AI 문서 관리 메뉴:
  - 경로: `/app/ai-documents`
  - 라벨: `HR 정책 문서`
  - 메뉴 삽입 조건: `isAdmin` 분기
  - 라우트 접근 권한: 시스템 관리자만
  - Source: `src/widgets/app-shell/AppShellLayout.tsx`, `src/app/router/index.tsx`

- `/app/ai-assistant`:
  - 라우트는 존재 (`genericPaths`에 포함)
  - 사이드바 기본 메뉴 순서(`APP_MENU_PATH_ORDER`)에는 없음
  - 사실상 GenericPage 라우트로만 존재
  - Source: `src/app/router/index.tsx`, `src/app/locale/app-ko.ts`

---

## 섹션 4: 통합 정리

### 4-1. 챗봇 진입 경로 표

| 진입점 | 위치 | 동작 | 권한 |
|---|---|---|---|
| FAB | 우측 하단 fixed | 패널 오픈/클로즈 (`open` 토글) | 로그인된 AppShell 사용자 (단, onboarding/embed 분기 제외) |
| 사이드바 메뉴 | missing | missing | missing |
| 헤더 메뉴 | missing | missing | missing |

Source:
- `src/widgets/app-shell/AiChatbotFab.tsx`
- `src/widgets/app-shell/AppShellLayout.tsx`

### 4-2. 챗봇 컴포넌트 트리(실제 확인 기반)

```text
AiChatbotFab
├── Header
│   ├── AiChatbotLottieIcon
│   ├── 맨 아래 버튼
│   ├── 대화 이력 삭제(Popconfirm)
│   └── 닫기 버튼
├── Message Area (history map)
│   ├── User Bubble (question)
│   ├── AI Bubble (answer)
│   └── Sources Line (optional)
├── Pending Indicator (Spin + 대기문구)
└── Input Area
    ├── textarea (Enter send / Shift+Enter newline)
    └── Send Button
```

Source: `src/widgets/app-shell/AiChatbotFab.tsx`

### 4-3. AI 문서 관리 컴포넌트 트리(실제 확인 기반)

```text
AiDocumentsAdminPage
├── AppWorkspacePageTitle
├── Card("문서 업로드")
│   └── Upload.Dragger
└── Card("업로드된 문서")
    └── Table
        ├── 문서명
        ├── 업로드 일시
        └── 관리(삭제 Popconfirm)
```

Source: `src/pages/app/AiDocumentsAdminPage.tsx`

---

## 섹션 5: 환경 변수 / 설정

### 5-1. API 관련 환경 변수

확인 파일:
- `.env.example`
- `src/app/config/env.ts`

확인된 변수:
- `VITE_API_BASE_URL` (예시: `http://localhost:8080`)
- `VITE_API_TIMEOUT_MS` (옵션)
- `VITE_CHAT_API_PREFIX` (주석/옵션, 비워두거나 생략 권장 주석)

`VITE_AI_SERVICE_URL`, `VITE_CHATBOT_URL`:
- 코드/예시 파일에서 확인 못함 -> `missing`

### 5-2. baseURL 처리

- axios 인스턴스:
  - 파일: `src/shared/api/httpClient.ts`
  - `baseURL: env.VITE_API_BASE_URL`
- `env` 파싱:
  - 파일: `src/app/config/env.ts`
  - Zod schema로 `VITE_API_BASE_URL` 필수 검증

`vite.config.ts`:
- API URL 별도 하드코딩 없음 (react plugin + alias 중심)
- Source: `vite.config.ts`

---

## 섹션 6: 챗봇 사용 흐름 검증

시나리오: "내 계좌번호 어디서 수정해?" 입력

1. 사용자가 FAB 클릭
- 위치: `AiChatbotFab` 하단 FAB 버튼
- 코드: `onClick={() => setOpen((v) => !v)}`
- Source: `src/widgets/app-shell/AiChatbotFab.tsx`

2. 패널 오픈
- `open=true` 되면 챗봇 패널 확장
- Source: `src/widgets/app-shell/AiChatbotFab.tsx`

3. 입력
- `textarea`에 입력 -> `input` state 갱신
- Source: `src/widgets/app-shell/AiChatbotFab.tsx`

4. 전송
- Enter(Shift 미사용) 또는 전송 버튼
- `send()` -> `chatM.mutate(text)`
- Source: `src/widgets/app-shell/AiChatbotFab.tsx`

5. API 호출
- mutationFn: `aiApi.chat(question)`
- 실제 HTTP: `httpClient.post(\`${CHAT_PREFIX}/chat\`, { question }, { timeout: 120_000 })`
- Source:
  - `src/widgets/app-shell/AiChatbotFab.tsx`
  - `src/features/ai/api/aiApi.ts`

6. 헤더 주입
- `httpClient` request interceptor에서 Authorization + X-User-* 자동 주입
- Source: `src/shared/api/httpClient.ts`

7. 응답 처리
- `unwrapChatResponse`로 `answer`, `sources` 파싱
- `onSuccess`에서 `sourcesHint` 갱신 + `['ai','chat-history']` invalidate
- Source:
  - `src/features/ai/api/aiApi.ts`
  - `src/widgets/app-shell/AiChatbotFab.tsx`

8. UI 업데이트
- history query 재조회 후 메시지 목록 렌더
- pending 종료
- Source: `src/widgets/app-shell/AiChatbotFab.tsx`

---

## 결론 요약 (질문 목적 기준)

1. 챗봇 호출 경로
- 프론트 코드 기준 실제 호출은 `POST /chat`, `GET /chat/history`, `DELETE /chat/history` (게이트웨이 baseURL + 상대경로)
- Source: `src/features/ai/api/aiApi.ts`, `src/shared/api/httpClient.ts`

2. 챗봇 진입 방식
- FAB 기반 패널 오픈
- Source: `src/widgets/app-shell/AiChatbotFab.tsx`, `src/widgets/app-shell/AppShellLayout.tsx`

3. HR 업로드 문서
- 업로드/목록/삭제는 구현됨
- 다운로드/layer 노출/필터는 `missing`
- Source: `src/pages/app/AiDocumentsAdminPage.tsx`, `src/features/ai/api/aiApi.ts`

