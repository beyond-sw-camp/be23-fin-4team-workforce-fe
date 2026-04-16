import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { Me } from '@/features/auth/types';
import { memberApi, type MemberDetail } from '@/features/member/api/memberApi';
import type { MemberChatMessage } from '@/features/member-chat/model/types';

export type ChatSenderRow = {
  name: string;
  /** 직책(또는 직급) · 소속 */
  subtitle: string;
  avatarUrl?: string | null;
};

function detailToRow(d: MemberDetail): ChatSenderRow {
  const title = d.jobTitleName?.trim() || d.jobGradeName?.trim() || '';
  const org = d.organizationName?.trim() || '';
  const subtitle = [title, org].filter(Boolean).join(' · ');
  return {
    name: d.name?.trim() || '—',
    subtitle,
    avatarUrl: d.profileUrl,
  };
}

/**
 * 채팅 메시지 발신자 UUID → 표시용 프로필(이름·직급/소속·프로필 이미지).
 * REST에 senderName 이 이미 있으면 member/detail 을 호출하지 않는다.
 * 본인은 JWT/세션 `Me`로 먼저 채워 네트워크를 줄인다.
 */
export function useChatSenderProfiles(messages: readonly MemberChatMessage[], me: Me | null) {
  const sortedUnique = useMemo(
    () =>
      [...new Set(messages.map((m) => String(m.senderId).trim()).filter(Boolean))].sort(),
    [messages],
  );

  const needsMemberDetailFetch = useMemo(
    () => messages.some((m) => !m.senderName?.trim()),
    [messages],
  );

  const query = useQuery({
    queryKey: ['member-chat', 'sender-profiles', sortedUnique],
    enabled: needsMemberDetailFetch && sortedUnique.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Map<string, ChatSenderRow>> => {
      const map = new Map<string, ChatSenderRow>();
      const selfId = me?.id?.trim();
      if (selfId && sortedUnique.includes(selfId)) {
        const title = me.jobTitle?.trim() || '';
        const org = me.departmentName?.trim() || '';
        const subtitle = [title, org].filter(Boolean).join(' · ');
        map.set(selfId, {
          name: me.name?.trim() || '나',
          subtitle,
          avatarUrl: me.profileImageUrl ?? null,
        });
      }

      const missing = sortedUnique.filter((id) => !map.has(id));
      await Promise.all(
        missing.map(async (id) => {
          try {
            const d = await memberApi.detail(id);
            map.set(id, detailToRow(d));
          } catch {
            /* 권한 없음·삭제 등 — 맵에 넣지 않고 UI에서 폴백 */
          }
        }),
      );
      return map;
    },
  });

  /**
   * REST 히스토리에 senderName 등이 오면 그대로 쓰고, 없을 때만 member/detail 캐시를 쓴다(STOMP만 온 이벤트 등).
   */
  const getRow = (msg: MemberChatMessage): ChatSenderRow => {
    const fromApi = msg.senderName?.trim();
    if (fromApi) {
      const title = msg.senderJobTitleName?.trim() || msg.senderJobGradeName?.trim() || '';
      const org = msg.senderOrganizationName?.trim() || '';
      const subtitle = [title, org].filter(Boolean).join(' · ');
      return {
        name: fromApi,
        subtitle,
        avatarUrl: msg.senderProfileUrl ?? null,
      };
    }
    const id = msg.senderId?.trim();
    if (!id) {
      return { name: '—', subtitle: '', avatarUrl: null };
    }
    const hit = query.data?.get(id);
    if (hit) return hit;
    const name = query.isFetching ? '…' : `${id.slice(0, 8)}…`;
    return { name, subtitle: '', avatarUrl: null };
  };

  return { getRow, isFetching: query.isFetching };
}

function initialFromName(name: string): string {
  const t = name.trim();
  if (!t) return '?';
  return t.slice(0, 1);
}

export function chatSenderInitial(name: string): string {
  return initialFromName(name);
}
