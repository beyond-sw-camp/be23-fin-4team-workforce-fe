# Member-Chat 리팩터 플랜

작성일: 2026-04-26
대상 모듈: `src/features/member-chat/**`, `src/widgets/app-shell/MemberChatModal.tsx`
관련 백엔드: `member-service` 의 `memberchat/**`

레퍼런스 메신저 UI(2-pane, 컨텍스트 메뉴, 부드러운 마감)를 참고하되 우리 디자인 시스템(antd + tw- prefix, primary `#1e3a5f`, accent `#2563EB`)을 유지하면서 진행합니다. 코드 변경은 본 문서가 합의된 다음 단계에서 착수합니다.

---

## 1. 현재 상태 진단

### 1.1 이미 갖춰진 것 (그대로 살림)

레퍼런스의 핵심 UX는 사실상 이미 구현되어 있습니다.

- **2-pane 레이아웃**: `MemberChatPanel.tsx` 가 좌측 방 목록 + 우측 대화창 구조. compact 폭(<780px) 자동 전환 + 뒤로가기 화살표까지 포함.
- **방 목록 상단 액션**: 새 대화 버튼(`AppButton type="primary"`), 검색 입력(`SearchOutlined` prefix).
- **읽음/미읽음 처리**: 카톡 스타일의 메시지별 미읽음 수, 진입 시 `read-latest` ack, 스크롤 하단 도달 시 자동 ack.
- **메시지 수정/삭제**: REST + STOMP 양쪽 경로, 인라인 편집 UI, 삭제 확인 모달.
- **삭제된 메시지 자리표시**: `item.deleted === true` 일 때 "삭제된 메시지입니다." 렌더링 (`MemberChatPanel.tsx:921-924`).
- **수정됨 표시**: 메시지 푸터에 `· 수정됨` 텍스트 (`MemberChatPanel.tsx:1096-1101`).
- **이미지/파일 메시지**: presigned URL, 파일명/용량 표시, 새 탭 다운로드.
- **그룹/1:1 헤더 분기**: 1:1 은 상대 프로필, 그룹은 제목 + 참여자수 + 클릭 시 Drawer.
- **링크 자동변환**: `ChatLinkifiedText`.
- **STOMP 재연결 시 구독 재부착**: `MemberChatStompClient.reattachAllSubscriptions`.

### 1.2 이번 라운드에 손볼 것

| 항목 | 현재 | 개선 방향 |
|---|---|---|
| `MemberChatPanel.tsx` 비대화 | 1242 줄 단일 컴포넌트 | 책임별 분할 (방 목록 / 헤더 / 메시지 리스트 / 입력) |
| 메시지 수정·삭제 진입점 | 모든 내 메시지 푸터에 `수정 \| 삭제` 텍스트 상시 노출 | 컨텍스트 메뉴(우클릭 + 호버 시 점 3개 버튼)로 일원화 |
| 마감 디테일 | 함수형이지만 마감 살짝 거침 (메시지 입력 영역 그림자, 스크롤바 두께, 날짜 separator 등) | 레퍼런스의 부드러운 마감 차용 (`shadow-[0_1px_3px_rgba(15,23,42,0.06)]` 유지하며 패딩·반경 정리) |
| 타이핑 인디케이터 | 없음 | 신규 — STOMP 새 destination 1쌍 추가 후 FE 연결 |
| 플로팅 헤더 색감 | `from-[#4A7FF7] to-[#7BB3FF]` 그라데이션 (메인 톤과 분리됨) | 메인 primary 톤(`#1e3a5f` 계열) 또는 차분한 솔리드로 통일 검토 |

### 1.3 디자인 시스템 토큰 매핑

`tailwind.config.ts` 의 `prefix: 'tw-'` 는 그대로 유지. 색은 인라인 hex 를 쓰는 기존 컨벤션을 유지하되, 이번 리팩터로 도입되는 새 컴포넌트도 동일하게 맞춥니다.

| 용도 | 토큰 | 비고 |
|---|---|---|
| 주 액션 버튼 | `#1e3a5f` (`AppButton variant="primary"`) | 메시지 전송 버튼·새 대화 버튼 |
| 강조/포커스 액센트 | `#2563EB` | 선택된 방 배경, 링크, 인풋 포커스 ring |
| 내 메시지 버블 배경 | `tw-bg-blue-50/90` + `tw-border-blue-200/80` (현재 유지) | 레퍼런스의 짙은 파랑 풀배경은 채택하지 않음 |
| 위험 액션 | `tw-text-rose-600`, `AppConfirmModal okType="danger"` | 메시지 삭제 |
| 타이핑 인디케이터 도트 | `tw-bg-slate-400` | 회색 도트 3개 펄스 |
| 컨텍스트 메뉴 | `tw-bg-white` + `tw-border-slate-200` + `tw-shadow-lg` | 라운드 `tw-rounded-xl` |

레퍼런스의 `blue-600` 솔리드 / `rounded-2xl` 등 마감은 부분적으로만 차용합니다 (메시지 버블은 이미 `tw-rounded-2xl`).

---

## 2. 단계별 리팩터 계획

각 단계는 독립 PR 단위로 끊을 수 있게 잘라뒀습니다. 단계 간 동작 변화가 없도록 (Phase 1 → 시각적 변화 0) 진행합니다.

### Phase 1 — `MemberChatPanel` 분해 (시각적 변화 0)

> 1242 줄의 단일 컴포넌트를 책임별로 쪼개고, 동작/스타일은 그대로 둡니다. 회귀 위험을 최소화하는 것이 핵심.

**신규 파일 구조**

```
src/features/member-chat/ui/
├── MemberChatPanel.tsx              # 컨테이너 (방 선택/연결/뮤테이션 후크 보유, 200줄 목표)
├── room-list/
│   ├── ChatRoomList.tsx             # 좌측 사이드바 (검색 + List + 빈 상태)
│   └── ChatRoomListItem.tsx         # 행 1개 (선택/뱃지/아바타)
├── thread/
│   ├── ChatThread.tsx               # 우측 메시지 리스트 컨테이너 (스크롤/ack)
│   ├── ChatThreadHeader.tsx         # 1:1·그룹 분기 헤더
│   ├── ChatDateSeparator.tsx        # 날짜 구분자
│   ├── ChatMessageRow.tsx           # 메시지 1줄 (내/남, 아바타·푸터)
│   ├── ChatMessageBubble.tsx        # 버블 본체 (스타일·반경)
│   └── bubble/
│       ├── ChatTextBody.tsx         # NORMAL — Linkified
│       ├── ChatImageBody.tsx        # IMAGE — 기존 ChatImagePreview 흡수
│       ├── ChatFileBody.tsx         # FILE — 기존 ChatFileDownloadLink 흡수
│       ├── ChatDeletedBody.tsx      # deleted 자리표시
│       └── ChatEditingBody.tsx      # 인라인 편집 폼 (현재 인라인 JSX 분리)
├── composer/
│   ├── ChatComposer.tsx             # 하단 입력 영역 (TextArea + 첨부 + 전송)
│   └── ChatAttachButton.tsx         # antd Upload 래퍼
└── shared/
    ├── chatFormatters.ts            # formatChatTime, startOfDayKey, formatDateSeparatorLabel, formatFileSize
    └── chatIdentity.ts              # sameMemberUuid, MEMBER_CHAT_OVERLAY_Z 상수
```

**훅으로 빠지는 로직**

```
src/features/member-chat/hooks/
├── useChatRoomConnection.ts   # 활성 방의 STOMP 구독/에러큐/READ 이벤트 - 현재 useEffect (396-443)
├── useChatReadAck.ts          # ackLatestIfViewing + 진입 시 read-latest - 현재 (268-293, 582-621)
├── usePerMemberLastRead.ts    # perMemberLastRead 시드/병합 + unreadByMessageId 계산
├── useDirectPartner.ts        # 1:1 상대 파생 (방 서머리 → 메시지 폴백)
└── useChatComposer.ts         # draft·전송 mutation·업로드 (현재 sendMutation/uploadBefore)
```

**검증 기준**
- [ ] 분해 전후 `MemberChatPanel.tsx` 의 외부 export 시그니처 동일 (`MemberChatPanelProps`)
- [ ] `MemberChatModal.tsx` 의 `<MemberChatPanel variant="floating" .../>` 그대로 동작
- [ ] 시각적 회귀 없음 (스토리북 또는 캡처 비교)

### Phase 2 — 메시지 컨텍스트 메뉴 UI

> 푸터의 `수정 | 삭제` 텍스트 버튼을 컨텍스트 메뉴로 일원화. 발견성·터치 디바이스 대응 향상.

**신규 컴포넌트**: `src/features/member-chat/ui/thread/ChatMessageContextMenu.tsx`

**트리거**
- 우클릭(`onContextMenu`) → 클릭 좌표에 메뉴 표시
- **모든 메시지**(내 메시지·상대 메시지 동일) 호버 시 버블 우상단(내) / 좌상단(상대) 에 점 3개 아이콘 노출 → 클릭 시 동일 메뉴. 메뉴 항목은 권한별로 필터링(아래 표).
- 키보드: 메시지에 포커스 후 `Shift+F10` / `ContextMenu` 키
- 모바일: 길게 누르기(`onTouchStart` + 600ms 타이머). 단 `pointermove` 시 타이머 취소 → 텍스트 선택과 충돌 회피.

**메뉴 항목 분기**
| 항목 | 조건 | 액션 |
|---|---|---|
| 수정 | 내 메시지 + `type === 'NORMAL'` + `!deleted` | 인라인 편집 모드 진입 |
| 삭제 | 내 메시지 + `!deleted` | `AppConfirmModal` 띄움 |
| 복사 | `!deleted` && `type === 'NORMAL'` | `navigator.clipboard.writeText` |
| 답장 | `!deleted` (Phase 4 이후) | `replyToId` 세팅 (이번 라운드는 비활성으로 자리만 둠) |

**구현 포인트**
- 메뉴는 `createPortal` 로 `document.body` 에 렌더 → 플로팅 모달의 z-index(`MEMBER_CHAT_OVERLAY_Z = 10080`) 보다 +50 위에 배치.
- 메뉴 외부 클릭/`Escape`/스크롤 시 닫기.
- 화면 가장자리에서 자동 위치 보정 (오른쪽 잘림 방지).
- 점 3개 아이콘은 antd `MoreOutlined` 사용 (lucide-react 신규 의존성 도입 X — 레퍼런스가 lucide 를 쓰지만 우리는 antd icons 일관성을 유지).

**현 인라인 버튼 제거**
- `MemberChatPanel.tsx:1114-1143` 의 `showMessageActions` 블록 삭제 → 컨텍스트 메뉴로 대체.

### Phase 3 — 삭제/수정 마감 + 시각 디테일

> 데이터 변경 없이, 시각적 마감만 다듬습니다. 백엔드 변경 없음.

| 변경 | 위치 | 설명 |
|---|---|---|
| 삭제된 메시지 톤 정리 | `ChatDeletedBody.tsx` | 본인/상대 모두 `tw-italic tw-text-slate-400 tw-bg-slate-50` + 휴지통 아이콘 |
| `수정됨` 뱃지 마감 | `ChatMessageRow.tsx` 푸터 | 점(`·`) 구분자 톤 통일, 타이포 사이즈 11px → 10.5px tabular-nums |
| 날짜 separator | `ChatDateSeparator.tsx` | 레퍼런스의 양쪽 가는 라인 + 가운데 캡슐 형태로 정리 (`tw-bg-slate-50 tw-border tw-border-slate-100 tw-shadow-sm`) |
| 입력 영역 | `ChatComposer.tsx` | 안내 문구 `Enter로 전송 · Shift+Enter로 줄바꿈 · 맨 아래를 보면 자동 읽음` 배치 정리, 버튼 그림자 톤 다운 |
| 미읽음 카운트 색 | 메시지 푸터 | 현재 `tw-text-amber-500` 유지 (카톡식). 변경 없음 |
| 플로팅 헤더 | `MemberChatModal.tsx:222` | 그라데이션 `#4A7FF7→#7BB3FF` → **`#1e3a5f` 솔리드** 로 교체 (메인 primary 와 일치). 닫기 버튼은 `tw-text-white/85 hover:tw-bg-white/15`. |

### Phase 4 — 타이핑 인디케이터 (FE + BE)

> 레퍼런스에서 강조된 가벼운 실시간 시그널. 영속화 X, STOMP 단발 broadcast.

**FE 변경**

```
src/features/member-chat/lib/memberChatStompClient.ts
  + sendTyping(roomId: number): Promise<void>           // /mc/app/room/{roomId}/typing
  + subscribeTyping(roomId, cb): () => void             // /mc/topic/typing/{roomId}

src/features/member-chat/hooks/useTypingIndicator.ts    // 신규
  - 입력값 변화 throttle (3s 동안 최대 1회 publish)
  - 수신 시 senderId 별 lastTypingAt 맵, 4s 후 자동 만료

src/features/member-chat/ui/thread/ChatTypingIndicator.tsx  // 신규
  - **메시지 리스트 하단(고정)** 에 "○○님이 입력 중…" + 3-도트 펄스
  - 스레드 스크롤과 분리된 absolute/sticky 영역 — 새 메시지가 올라와도 위치 고정
  - 본인은 제외 (senderId === user.id 클라이언트 필터)
```

**타입 추가 (`model/types.ts`)**
```ts
export type MemberChatTypingEvent = {
  roomId: number;
  memberId: string;
  // 서버 시각 — 클라 시계 보정용 (있으면)
  at?: string;
};
```

**BE 변경 (백엔드 대응 — Section 3 참고)**: `ChatStompController.typing()` 추가, broker 토픽 broadcast.

---

## 3. 백엔드 대응 항목

### 3.1 신규 (타이핑 인디케이터)

`member-service/src/main/java/.../memberchat/`

```
controller/ChatStompController.java
  + @MessageMapping("/room/{roomId}/typing")
    public void typing(@DestinationVariable Long roomId, Principal principal)

dto/event/ChatTypingEvent.java   (신규)
  - record ChatTypingEvent(Long roomId, String memberId, Instant at)

service/RedisChatPubSubService.java
  + publishTyping(Long roomId, String memberId)

service/ChatMessageService.java 또는 신규 ChatPresenceService.java
  + handleTyping(String userId, Long roomId)
    1) ChatAuthPolicy.assertParticipant(userId, roomId)  (기존 권한 유틸 재사용)
    2) Redis pub-sub broadcast → /mc/topic/typing/{roomId}
    3) 영속화 X, 레이트리밋 (사용자당 2초 1회)
```

**중요 결정 사항 (확정)**
- 영속화 안함. Redis pub-sub 만 (이미 `RedisChatPubSubService` 가 MESSAGE/EDIT/DELETE 에 쓰는 패턴 동일).
- **Self-broadcast = 클라이언트 필터** (서버는 토픽 전체 fan-out, 클라가 `senderId === me` 거름). 서버에 user destination 분기 안 넣어 단순화.
- Rate limit: 사용자별 `typing:{userId}:{roomId}` Redis key 2초 TTL — `RateLimiter` 빈 재사용.
- 권한: 방 비참여자가 typing 보내면 `ChatErrorCode.NOT_PARTICIPANT` 로 `/user/queue/errors` 에 통지.

### 3.2 검토 필요 (이번 라운드 외 후보)

플랜 합의 단계에서 잘라낸 항목이지만, 추후 라운드를 위해 기록.

- **온라인/프레즌스**: STOMP `CONNECT/DISCONNECT` 이벤트로 `online_users:{companyId}` Redis Set 관리 + 변동 시 `/mc/topic/presence/{companyId}` broadcast. 현 라운드 범위 외.
- **메시지 반응(이모지)**: `mc_chat_reaction` 테이블, `ChatMessage.reactions` Map. 현 라운드 범위 외.
- **답장(Reply) UI**: `replyToId` 컬럼은 이미 있음. UI 만 붙이면 됨.
- **메시지 검색**: 방 내 텍스트 검색 GET `/member-chat/rooms/{roomId}/messages/search?q=`. 데이터 양에 따라 Postgres FTS 또는 별도 인덱스.

### 3.3 변경 없음

- REST 엔드포인트 (`memberChatApi.ts`) 와 매칭되는 컨트롤러는 시그니처 그대로.
- 기존 STOMP destination (`send`/`edit`/`delete`/`read`/`read-latest`) 그대로.
- DB 스키마 변경 없음.

---

## 4. 디렉토리/파일 변경 요약

### 4.1 추가
- 신규 파일들은 Phase 1·2·4 섹션 참고. 합산 ~16 개의 작은 파일.

### 4.2 수정
- `src/features/member-chat/ui/MemberChatPanel.tsx` — 분해 후 컨테이너로 슬림화
- `src/features/member-chat/lib/memberChatStompClient.ts` — `sendTyping`, `subscribeTyping` 추가
- `src/features/member-chat/model/types.ts` — `MemberChatTypingEvent` 추가
- `src/widgets/app-shell/MemberChatModal.tsx` — 헤더 그라데이션 톤 정리 (Phase 3)
- `member-service/.../memberchat/controller/ChatStompController.java` — `typing` 매핑 추가
- `member-service/.../memberchat/service/*` — `ChatPresenceService` 또는 기존 서비스에 `handleTyping`

### 4.3 삭제 없음
- 기존 컴포넌트는 분해 후 흡수되며, 별도 deprecation 단계 불필요 (단일 진입점).

---

## 5. 영향 범위 / 리스크

| 리스크 | 완화책 |
|---|---|
| 분해 중 회귀 (스크롤/ack/구독 누수) | Phase 1 종료 시 시각·동작 변화 0 검증. `lastAckedMessageIdRef`·`userScrolledUpRef` 등 ref 보존 위치를 컨테이너에 둠 |
| STOMP 재연결 시 typing 구독 누락 | `MemberChatStompClient.reattachAllSubscriptions` 에 typing 케이스 추가 — 패턴 동일 |
| 컨텍스트 메뉴 z-index 충돌 (플로팅 모달, antd Modal, Tooltip) | `MEMBER_CHAT_OVERLAY_Z + 70` 으로 고정, 모든 Tooltip 은 `+50`. 프로젝트 전체 z-index 참조 표 갱신 |
| 타이핑 spam | 클라 throttle 3s + 서버 rate limit 2s 이중화 |
| 디자인 톤 충돌 | 인라인 hex 컨벤션 유지. 새 컴포넌트도 `#1e3a5f`/`#2563EB` 외 다른 파랑 안 씀 |
| 모바일 길게-누르기와 텍스트 선택 충돌 | 버블에 `select-none` 부여 시 일반 사용자가 텍스트 복사 못 하는 문제 발생 → `select-text` 유지하되 길게-누르기 타이머는 `pointermove` 시 취소 |

---

## 6. 산출물 체크리스트

- [ ] **Phase 1 PR**: 컴포넌트 분해 only — 시각 변화 0
- [ ] **Phase 2 PR**: 컨텍스트 메뉴 — 인라인 텍스트 액션 제거
- [ ] **Phase 3 PR**: 마감 디테일 (삭제 placeholder/날짜 separator/composer/플로팅 헤더)
- [ ] **Phase 4-BE PR**: `ChatStompController.typing` + `ChatPresenceService` + RateLimiter 적용
- [ ] **Phase 4-FE PR**: `useTypingIndicator` + `ChatTypingIndicator` + STOMP 클라이언트 메서드
- [ ] **문서**: 본 문서 + `docs/member-chat-frontend-integration.md` 의 STOMP destination 표 갱신

---

## 7. 확정된 결정 사항

| # | 항목 | 결정 |
|---|---|---|
| 1 | 플로팅 헤더 톤 | **`#1e3a5f` 솔리드** (메인 primary 와 일치) |
| 2 | 점 3개 호버 버튼 노출 | **모든 메시지** (메뉴 항목만 권한별 필터) |
| 3 | 타이핑 인디케이터 위치 | **메시지 리스트 하단(고정)** |
| 4 | 타이핑 self-broadcast | **클라이언트 필터** (서버는 토픽 전체 fan-out) |
