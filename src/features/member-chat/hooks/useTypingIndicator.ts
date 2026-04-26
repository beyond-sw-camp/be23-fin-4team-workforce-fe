import { useCallback, useEffect, useRef, useState } from 'react';
import { memberChatStompClient } from '@/features/member-chat/lib/memberChatStompClient';
import type { MemberChatTypingEvent } from '@/features/member-chat/model/types';
import { sameMemberUuid } from '@/features/member-chat/ui/shared/chatIdentity';

const TYPING_THROTTLE_MS = 3_000;
const TYPING_EXPIRE_MS = 4_000;

type Options = {
  roomId: number | null;
  selfMemberId?: string;
};

/**
 * 타이핑 인디케이터 훅.
 *  - notifyTyping(): 입력 변화에 호출. 3초 throttle 로 STOMP publish.
 *  - typingMemberIds: 현재 입력 중인 다른 멤버들. 4초 동안 갱신 없으면 자동 만료.
 *  - 본인은 클라이언트에서 senderId 로 필터링.
 */
export function useTypingIndicator({ roomId, selfMemberId }: Options) {
  const [typingMap, setTypingMap] = useState<Record<string, number>>({});
  const lastSentRef = useRef(0);

  // 토픽 구독.
  // 프로덕션: 본인 타이핑은 자기 화면에 표시하지 않는다 (self-filter).
  // 개발 모드: round-trip 검증 용도로 self-filter 를 끔 — 본인이 타이핑하면 자기 화면에서도 인디케이터 확인 가능.
  useEffect(() => {
    if (!roomId) return;
    const isDev = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV);
    const unsub = memberChatStompClient.subscribeTypingEvents(roomId, (payload: MemberChatTypingEvent) => {
      if (!isDev && sameMemberUuid(payload.memberId, selfMemberId)) return;
      const now = Date.now();
      setTypingMap((prev) => ({ ...prev, [payload.memberId]: now }));
    });
    return () => unsub();
  }, [roomId, selfMemberId]);

  // 만료 스윕 (1초 간격)
  useEffect(() => {
    const id = window.setInterval(() => {
      const cutoff = Date.now() - TYPING_EXPIRE_MS;
      setTypingMap((prev) => {
        let changed = false;
        const next: Record<string, number> = {};
        for (const [k, v] of Object.entries(prev)) {
          if (v >= cutoff) {
            next[k] = v;
          } else {
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 1_000);
    return () => window.clearInterval(id);
  }, []);

  // 방 전환 시 초기화
  useEffect(() => {
    setTypingMap({});
    lastSentRef.current = 0;
  }, [roomId]);

  const notifyTyping = useCallback(() => {
    if (!roomId) return;
    const now = Date.now();
    if (now - lastSentRef.current < TYPING_THROTTLE_MS) return;
    lastSentRef.current = now;
    void memberChatStompClient.sendTyping(roomId);
  }, [roomId]);

  const typingMemberIds = Object.keys(typingMap);

  return { typingMemberIds, notifyTyping };
}
