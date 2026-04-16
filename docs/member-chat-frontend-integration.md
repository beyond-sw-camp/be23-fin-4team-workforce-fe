# Member-Chat 프론트 연동 가이드

`member-chat` 백엔드(`member-service`)와 프론트(`workforce-fe`) 연동 시 누락 방지를 위한 기준 문서입니다.

## 1) 이번 반영 범위

- 메뉴/라우팅
  - `/app/member-chat` 화면 추가
  - 사이드바 메뉴 `멤버 채팅` 노출
- API 클라이언트 스캐폴딩
  - `rooms/my`, `rooms/direct`, `rooms/group`
  - `messages/{roomId}`, `sync`, `edit`, `delete`, `read`
  - 파일 presigned upload/download/confirm
- STOMP/SockJS 스캐폴딩
  - CONNECT: `/mc/connect`
  - SUBSCRIBE: `/mc/topic/room/{roomId}`, `/mc/topic/read/{roomId}`, `/user/queue/errors`
  - SEND: `/mc/app/room/{roomId}/send`, `/mc/app/room/{roomId}/read`
- 기본 UI
  - 방 목록, 메시지 목록, 텍스트 전송, 실시간 메시지 수신/읽음 ack

## 2) 파일 맵

- `src/pages/app/MemberChatPage.tsx`
- `src/features/member-chat/api/memberChatApi.ts`
- `src/features/member-chat/lib/memberChatStompClient.ts`
- `src/features/member-chat/model/types.ts`
- `src/app/router/index.tsx`
- `src/app/locale/app-ko.ts`
- `src/widgets/app-shell/AppShellLayout.tsx`

## 3) 필수 확인 체크리스트

- 인증
  - STOMP CONNECT 헤더에 `Authorization: Bearer <AT>` 포함
  - SEND payload 에 `senderId` 를 넣지 않음(서버 Principal 사용)
- 권한/오류
  - `/user/queue/errors` 수신 시 사용자 알림 처리
  - `CHAT_4291`(rate limit) 등 코드별 UX 문구 분기
- 메시지 UX
  - 낙관적 전송 시 `clientMessageId` 고정 사용(중복 전송 방지)
  - 재연결 후 `/messages/{roomId}/sync` 로 누락 메시지 보정
- 읽음 처리
  - active room 의 최신 메시지 기준으로 read ack 전송
  - 멀티 디바이스 deviceId 전략(브라우저별 고정 UUID) 확정
- 파일
  - presigned 업로드 시 요청 MIME/크기와 실제 파일 일치
  - confirm 이후만 다운로드 허용, `scanStatus` 대기 상태 UX 처리
- 운영
  - WS 연결 실패/재시도, 장시간 idle 재연결, 토큰 만료 시 재로그인 흐름 점검

## 4) 다음 구현 우선순위 (권장)

1. 대화방 생성(1:1/그룹) 모달 + 참여자 검색
2. 메시지 타입별 렌더러(TEXT/NOTICE/FILE/IMAGE)
3. 메시지 편집/삭제 및 revision 히스토리 표시
4. 읽음 상태 UI(마지막 읽음 멤버/시각)
5. 관리자 검색/CSV/Legal Hold 전용 화면
6. E2E 시나리오(연결/구독/전송/읽음/재접속 sync)
