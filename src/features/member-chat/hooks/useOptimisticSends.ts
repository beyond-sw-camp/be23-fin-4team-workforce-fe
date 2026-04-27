import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { message as antdMessage } from 'antd';
import { memberChatApi } from '@/features/member-chat/api/memberChatApi';
import type {
  MemberChatMessage,
  MemberChatSendRequest,
} from '@/features/member-chat/model/types';

/**
 * Optimistic 전송 상태:
 *  - status:'pending' — 서버 응답 대기, 화면엔 회색 톤 + 스피너로 표시
 *  - status:'failed'  — 전송 실패. ⚠️ 표시 + retry 가능
 *  - 서버 응답으로 동일 clientMessageId 의 정식 메시지가 히스토리에 들어오면 optimistic 제거.
 */
export type OptimisticChatMessage = MemberChatMessage & {
  optimistic: { status: 'pending' | 'failed' };
};

type Options = {
  roomId: number | null;
  selfMemberId?: string;
  /**
   * 서버에서 확정된 메시지 목록 (히스토리). clientMessageId 가 매칭되면 optimistic 항목을 제거한다.
   */
  serverMessages: readonly MemberChatMessage[];
};

/**
 * 텍스트 메시지 옵티미스틱 전송 훅.
 *
 *  - send(text): 즉시 임시 메시지를 로컬 state 에 추가하고 REST 송신.
 *  - 성공 → 서버 메시지가 히스토리에 들어오면(clientMessageId 매칭) 자동 cleanup.
 *  - 실패 → status='failed' 로 마킹. retry(clientMessageId) 로 재시도.
 *  - 메시지 정렬을 위해 임시 messageId 는 (현 시각 ms 단위) 큰 음수를 부여해 항상 맨 끝에 위치.
 */
export function useOptimisticSends({ roomId, selfMemberId, serverMessages }: Options) {
  const queryClient = useQueryClient();
  const [optimistic, setOptimistic] = useState<OptimisticChatMessage[]>([]);

  /** 서버 메시지에 동일 clientMessageId 가 들어오면 제거 (방 전환 시도 새로 시작) */
  useEffect(() => {
    if (optimistic.length === 0) return;
    setOptimistic((prev) =>
      prev.filter((o) => {
        if (!o.clientMessageId) return false; // 안전망 — 식별자 없으면 그냥 정리
        return !serverMessages.some((s) => s.clientMessageId === o.clientMessageId);
      }),
    );
    // optimistic 자체가 deps 면 무한 루프 → serverMessages 변화에만 반응
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverMessages]);

  /** 방 전환 시 optimistic 모두 비움 (다른 방의 잔재가 보이지 않도록) */
  useEffect(() => {
    setOptimistic([]);
  }, [roomId]);

  const send = useCallback(
    async (text: string, replyToId?: number) => {
      if (!roomId || !selfMemberId) {
        antdMessage.error('채팅방을 선택해 주세요.');
        return;
      }
      const trimmed = text.trim();
      if (!trimmed) return;
      const clientMessageId = crypto.randomUUID();
      const optimisticMsg: OptimisticChatMessage = {
        // 큰 양수: 정렬 시 항상 마지막에 오도록 Number.MAX_SAFE_INTEGER 근처 + 카운터.
        // 동시에 여러 건이 pending 상태일 때 서로 순서 유지하기 위해 시각 기반 ID 사용.
        messageId: Number.MAX_SAFE_INTEGER - (Date.now() % 1_000_000_000),
        roomId,
        senderId: selfMemberId,
        type: 'NORMAL',
        content: trimmed,
        createdAt: new Date().toISOString(),
        deleted: false,
        edited: false,
        clientMessageId,
        replyToId,
        readerCount: 0,
        optimistic: { status: 'pending' },
      };
      setOptimistic((prev) => [...prev, optimisticMsg]);

      const body: MemberChatSendRequest = {
        type: 'NORMAL',
        content: trimmed,
        clientMessageId,
        ...(replyToId != null ? { replyToId } : {}),
      };
      try {
        await memberChatApi.sendRoomMessage(roomId, body);
        // 서버가 STOMP 로 fan-out 후 히스토리 쿼리가 무효화 → useEffect cleanup 가 처리
        await queryClient.invalidateQueries({ queryKey: ['member-chat', 'history', roomId] });
      } catch (e) {
        antdMessage.error((e as Error).message || '메시지 전송에 실패했습니다.');
        setOptimistic((prev) =>
          prev.map((o) =>
            o.clientMessageId === clientMessageId ? { ...o, optimistic: { status: 'failed' } } : o,
          ),
        );
      }
    },
    [roomId, selfMemberId, queryClient],
  );

  /** 실패한 optimistic 메시지 재전송 */
  const retry = useCallback(
    async (clientMessageId: string) => {
      const target = optimistic.find((o) => o.clientMessageId === clientMessageId);
      if (!target || !roomId) return;
      // 상태를 다시 pending 으로
      setOptimistic((prev) =>
        prev.map((o) =>
          o.clientMessageId === clientMessageId ? { ...o, optimistic: { status: 'pending' } } : o,
        ),
      );
      try {
        await memberChatApi.sendRoomMessage(roomId, {
          type: target.type,
          content: target.content,
          clientMessageId: target.clientMessageId!,
        });
        await queryClient.invalidateQueries({ queryKey: ['member-chat', 'history', roomId] });
      } catch (e) {
        antdMessage.error((e as Error).message || '재전송 실패');
        setOptimistic((prev) =>
          prev.map((o) =>
            o.clientMessageId === clientMessageId ? { ...o, optimistic: { status: 'failed' } } : o,
          ),
        );
      }
    },
    [optimistic, roomId, queryClient],
  );

  /** 실패한 메시지 영구 삭제 */
  const drop = useCallback((clientMessageId: string) => {
    setOptimistic((prev) => prev.filter((o) => o.clientMessageId !== clientMessageId));
  }, []);

  return { optimistic, send, retry, drop };
}
