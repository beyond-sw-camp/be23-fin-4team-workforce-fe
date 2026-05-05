import { ArrowRightOutlined, CloseOutlined, DeleteOutlined, SendOutlined, UserOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { App, Button, Popconfirm, Spin, Tooltip } from 'antd';
import dayjs from 'dayjs';
import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  aiApi,
  sortAiChatHistoryChronological,
  type AiChatActionButton,
  type AiChatRequest,
  type AiChatResponse,
} from '@/features/ai/api/aiApi';
import type { ApiError } from '@/shared/api/types';
import { AiChatbotLottieIcon } from '@/shared/ui/AiChatbotLottieIcon';

const MSG_502 =
  '[502] member-service\u2192n8n \uC5F0\uB3D9\uC5D0 \uBB38\uC81C\uAC00 \uC788\uC744 \uC218 \uC788\uC2B5\uB2C8\uB2E4. \uC11C\uBC84 \uB85C\uADF8\u00B7n8n \uC6CC\uD06C\uD50C\uB85C(JSON\u00B7answer)\uB97C \uD655\uC778\uD558\uC138\uC694. \uBE0C\uB77C\uC6B0\uC800 \uC694\uCCAD URL\uC740 http://\u2026/chat \uC785\uB2C8\uB2E4.';
const MSG_RETRY = '\uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.';
const ERR_CHAT = '\uB2F5\uBCC0\uC744 \uAC00\uC838\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.';
const OK_CLEAR = '\uB300\uD654 \uC774\uB825\uC774 \uC0AD\uC81C\uB418\uC5C8\uC2B5\uB2C8\uB2E4.';
const ERR_CLEAR = '\uC0AD\uC81C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.';
const ARIA_EXPAND_PANEL = 'AI \uBE44\uC11C \uD3BC\uCE58\uAE30';
const ARIA_COLLAPSE_PANEL = 'AI \uBE44\uC11C \uC811\uAE30';
const BTN_BOTTOM = '\uB9E8 \uC544\uB798';
const POP_TITLE = '\uC804\uCCB4 \uB300\uD654 \uC774\uB825\uC744 \uC0AD\uC81C\uD560\uAE4C\uC694?';
const POP_OK = '\uC0AD\uC81C';
const POP_CANCEL = '\uCDE8\uC18C';
const ARIA_DEL = '\uB300\uD654 \uC774\uB825 \uC0AD\uC81C';
const ARIA_CLOSE = '\uB2EB\uAE30';
const WELCOME =
  '\u2014 \uC5F0\uCC28\u00B7HR \uC815\uCC45\u00B7"\uB0B4 \uC815\uBCF4 \uC54C\uB824\uC918" \uB4F1 \uC9C8\uBB38\uD574 \uBCF4\uC138\uC694 \u2014';
const PENDING =
  '\uB2F5\uBCC0 \uC0DD\uC131 \uC911\u2026 (\uC218 \uCD08~10\uCD08 \uC774\uC0C1 \uAC78\uB9B4 \uC218 \uC788\uC2B5\uB2C8\uB2E4)';
const SOURCES_LABEL = '\uCC38\uACE0 \uBB38\uC11C';
const PH_PENDING = '\uB2F5\uBCC0 \uB300\uAE30 \uC911\u2026';
const PH_INPUT = '\uBA54\uC2DC\uC9C0\uB97C \uC785\uB825\uD558\uC138\uC694\u2026';
const HINT_KEYS = 'Enter \uC804\uC1A1 \u00B7 Shift+Enter \uC904\uBC14\uAFC8';
const AI_TITLE = 'AI \uBE44\uC11C';
const SOURCES_PREFIX = '\uCC38\uACE0: ';
const ACTION_PREFILL_STORAGE_KEY = 'wf-approval-prefill-chatbot-action';

/** GET /chat/history 에서 버튼 클릭이 `[버튼: action]` 형태로 저장될 때 말풍선 라벨 */
const CHAT_BUTTON_QUESTION_LABEL: Record<string, string> = {
  go_to_form: '\uACB0\uC7AC \uD654\uBA74\uC73C\uB85C \uC774\uB3D9',
  cancel: '\uCDE8\uC18C',
  create_event: '\uB4F1\uB85D',
};
const BTN_CALENDAR_VIEW = '캘린더 보기';

function displayChatUserQuestion(raw: string): string {
  const q = raw.trim();
  const bracket = q.match(/^\[버튼\s*:\s*([^\]]+)]\s*$/);
  if (bracket) {
    const matchedKey = bracket[1];
    const key = matchedKey?.trim().toLowerCase();
    const label = key ? CHAT_BUTTON_QUESTION_LABEL[key] : undefined;
    if (label) return label;
  }
  const legacy = q.match(/^\[button\s*:\s*([^\]]+)]\s*$/i);
  if (legacy) {
    const matchedKey = legacy[1];
    const key = matchedKey?.trim().toLowerCase();
    const label = key ? CHAT_BUTTON_QUESTION_LABEL[key] : undefined;
    if (label) return label;
  }
  return raw;
}
const FAB_HOVER_HINT = '\uBB34\uC5C7\uC774\uB4E0 \uAD81\uAE08\uD55C \uC810\uC744 \uCC57\uBD07 AI\uC5D0\uAC8C \uBB3C\uC5B4\uBCF4\uC138\uC694.';

function chatUserMessage(e: unknown, fallback: string): string {
  const err = e as Partial<ApiError>;
  const status = typeof err.status === 'number' ? err.status : 0;
  const msg = typeof err.message === 'string' ? err.message.trim() : '';
  if (status === 502) {
    return msg || MSG_502;
  }
  if (status >= 500) {
    return msg || MSG_RETRY;
  }
  return msg || fallback;
}

/** Vue room `formatMsgTime` \uACFC \uB3D9\uC77C \uD328\uD134 */
function formatAiMsgTime(dt: string): string {
  if (!dt || dt === '\u2014') return '';
  const d = dayjs(dt);
  if (!d.isValid()) return '';
  const h = d.hour();
  const m = d.format('mm');
  const ap = h < 12 ? '\uC624\uC804' : '\uC624\uD6C4';
  const h12 = h % 12 || 12;
  return `${ap} ${h12}:${m}`;
}

type AnswerSegment = { type: 'text'; text: string } | { type: 'link'; label: string; href: string };

/** 챗봇 고정 패턴: `관련 메뉴: /path` + `화면명: ...` (줄바꿈 없이 한 줄에 올 수 있음) */
function extractMenuLink(text: string): { body: string; menuUrl?: string; screenName?: string } {
  const raw = text ?? '';
  const menuRegex = /관련\s*메뉴\s*:\s*(\/[^\s]+)/;
  const screenRegex = /(?:화면명|화면\s*명)\s*:\s*([^\n]+)/;
  const menuMatch = raw.match(menuRegex);
  const screenMatch = raw.match(screenRegex);
  let body = raw;
  if (menuMatch) body = body.replace(menuMatch[0], '');
  if (screenMatch) body = body.replace(screenMatch[0], '');
  body = body.replace(/\n{3,}/g, '\n\n').trim();
  return {
    body,
    menuUrl: menuMatch?.[1]?.trim(),
    screenName: screenMatch?.[1]?.trim(),
  };
}

/** `제목 (부연)` 형태면 짧은 라벨과 괄호 안 부연을 분리 */
function splitScreenNameDetail(screenNameRaw: string): { short: string; parenthetical?: string } {
  const t = screenNameRaw.trim();
  const m = t.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (m) {
    return { short: (m[1] ?? '').trim(), parenthetical: (m[2] ?? '').trim() };
  }
  return { short: t };
}

const MD_LINK_RE = /\[([^\]]*)\]\((https?:\/\/[^)\s]+|\/[^)\s]+)\)/g;
const BARE_URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;

function mergeAdjacentText(segments: AnswerSegment[]): AnswerSegment[] {
  const out: AnswerSegment[] = [];
  for (const seg of segments) {
    if (seg.type === 'text' && seg.text === '') continue;
    const last = out[out.length - 1];
    if (seg.type === 'text' && last?.type === 'text') {
      last.text += seg.text;
    } else {
      out.push(seg);
    }
  }
  return out;
}

function parseBareUrlsInTextSlice(text: string): AnswerSegment[] {
  if (!text) return [];
  const parts: AnswerSegment[] = [];
  let last = 0;
  BARE_URL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BARE_URL_RE.exec(text)) !== null) {
    if (m.index > last) {
      parts.push({ type: 'text', text: text.slice(last, m.index) });
    }
    const href = m[0];
    parts.push({ type: 'link', label: href, href });
    last = m.index + href.length;
  }
  if (last < text.length) {
    parts.push({ type: 'text', text: text.slice(last) });
  }
  return mergeAdjacentText(parts);
}

/** 마크다운 `[label](url)` 및 본문 내 http(s) URL을 링크 구간으로 분해 */
function parseAnswerSegments(raw: string): AnswerSegment[] {
  const s = raw ?? '';
  const mdChunks: { start: number; end: number; label: string; href: string }[] = [];
  MD_LINK_RE.lastIndex = 0;
  let mm: RegExpExecArray | null;
  while ((mm = MD_LINK_RE.exec(s)) !== null) {
    mdChunks.push({
      start: mm.index,
      end: mm.index + mm[0].length,
      label: mm[1] ?? '',
      href: mm[2] ?? '',
    });
  }
  mdChunks.sort((a, b) => a.start - b.start);

  const segments: AnswerSegment[] = [];
  let cursor = 0;
  for (const ch of mdChunks) {
    if (ch.start > cursor) {
      segments.push(...parseBareUrlsInTextSlice(s.slice(cursor, ch.start)));
    }
    segments.push({ type: 'link', label: (ch.label || '').trim() || ch.href, href: ch.href });
    cursor = ch.end;
  }
  if (cursor < s.length) {
    segments.push(...parseBareUrlsInTextSlice(s.slice(cursor)));
  }
  return mergeAdjacentText(segments);
}

function linkDisplayLabel(label: string, maxLen = 48): string {
  const t = label.trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1)}\u2026`;
}

function classifyHref(href: string): { kind: 'internal'; pathWithSearch: string } | { kind: 'external'; href: string } {
  const h = href.trim();
  if (h.startsWith('/')) {
    return { kind: 'internal', pathWithSearch: h };
  }
  if (/^https?:\/\//i.test(h)) {
    try {
      const u = new URL(h);
      if (u.origin === window.location.origin) {
        return { kind: 'internal', pathWithSearch: `${u.pathname}${u.search}${u.hash}` };
      }
      return { kind: 'external', href: h };
    } catch {
      return { kind: 'external', href: h };
    }
  }
  return { kind: 'external', href: h };
}

function AiParsedAnswerBody({
  answer,
  onNavigateInternal,
}: {
  answer: string;
  onNavigateInternal: (pathWithSearch: string) => void;
}) {
  const { body, menuUrl, screenName } = useMemo(() => extractMenuLink(answer), [answer]);
  const segments = useMemo(() => parseAnswerSegments(body), [body]);
  const screenDetail = useMemo(
    () => (screenName ? splitScreenNameDetail(screenName) : null),
    [screenName],
  );

  const menuButtonLabel = screenDetail?.short ?? (menuUrl ? '\uAD00\uB828 \uBA54\uB274\uB85C \uC774\uB3D9' : '');
  const menuTooltip = screenDetail?.parenthetical ?? menuUrl;

  return (
    <>
      <span className="tw-block tw-whitespace-pre-wrap tw-break-words">
        {segments.map((seg, i) => {
          if (seg.type === 'text') {
            return <Fragment key={i}>{seg.text}</Fragment>;
          }
          const cls = classifyHref(seg.href);
          const display = linkDisplayLabel(seg.label);
          const tip = seg.href;
          const openExternal = () => {
            window.open(seg.href, '_blank', 'noopener,noreferrer');
          };
          if (cls.kind === 'internal') {
            return (
              <Tooltip key={i} title={tip}>
                <Button
                  type="link"
                  size="small"
                  className="!tw-h-auto !tw-p-0 !tw-align-baseline tw-text-[0.8rem]"
                  onClick={() => onNavigateInternal(cls.pathWithSearch)}
                >
                  {display}
                </Button>
              </Tooltip>
            );
          }
          return (
            <Tooltip key={i} title={tip}>
              <Button
                type="link"
                size="small"
                className="!tw-h-auto !tw-p-0 !tw-align-baseline tw-text-[0.8rem]"
                onClick={openExternal}
              >
                {display}
              </Button>
            </Tooltip>
          );
        })}
      </span>
      {menuUrl ? (
        <div className="tw-mt-2 tw-border-t tw-border-[#E8ECF0] tw-pt-2">
          <Tooltip title={menuTooltip || menuUrl}>
            <Button
              type="default"
              size="small"
              icon={<ArrowRightOutlined />}
              className="tw-text-[0.8rem]"
              onClick={() => onNavigateInternal(menuUrl)}
            >
              {menuButtonLabel}
            </Button>
          </Tooltip>
          {screenDetail?.parenthetical ? (
            <p className="tw-m-0 tw-mt-1 tw-text-[10px] tw-leading-snug tw-text-[#64748B]">
              {screenDetail.parenthetical}
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function normalizeActionButtons(buttons: AiChatActionButton[] | null | undefined): AiChatActionButton[] {
  if (!Array.isArray(buttons)) return [];
  return buttons.filter((b) => typeof b?.label === 'string' && !!b.label && typeof b?.value === 'string' && !!b.value);
}

function parseContentPrefill(contentJson?: string | null): Record<string, unknown> | null {
  if (!contentJson || !contentJson.trim()) return null;
  try {
    const parsed = JSON.parse(contentJson) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

export function AiChatbotFab() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [sourcesHint, setSourcesHint] = useState<string[] | null>(null);
  const [actionSessionId, setActionSessionId] = useState<string | null>(null);
  const [pendingActionButtons, setPendingActionButtons] = useState<AiChatActionButton[]>([]);
  /** type=created 이고 redirectUrl이 캘린더일 때만 수동 이동 버튼 */
  const [createdCalendarViewUrl, setCreatedCalendarViewUrl] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { data: history = [], isLoading: historyLoading } = useQuery({
    queryKey: ['ai', 'chat-history'],
    queryFn: () => aiApi.getChatHistory(),
    enabled: open,
    staleTime: 30_000,
  });

  const displayHistory = useMemo(() => sortAiChatHistoryChronological(history), [history]);

  const navigateFromAnswerLink = useCallback(
    (pathWithSearch: string) => {
      try {
        const u = new URL(pathWithSearch, window.location.origin);
        const search: Record<string, string> = {};
        u.searchParams.forEach((v, k) => {
          search[k] = v;
        });
        void navigate({
          to: u.pathname,
          ...(Object.keys(search).length > 0 ? { search } : {}),
          /** 이전 탭의 sideNav 등이 병합되지 않도록 */
          replace: true,
        });
      } catch {
        void navigate({ to: pathWithSearch, replace: true });
      }
    },
    [navigate],
  );

  const handleChatActionResponse = useCallback(
    (data: AiChatResponse) => {
      setCreatedCalendarViewUrl(null);

      const src = Array.isArray(data.sources)
        ? data.sources.filter((s): s is string => typeof s === 'string' && s.trim() !== '')
        : [];
      setSourcesHint(src.length > 0 ? src : null);
      if (data.sessionId && data.sessionId.trim()) {
        setActionSessionId(data.sessionId.trim());
      }
      setPendingActionButtons(normalizeActionButtons(data.actions));
      if (data.type === 'cancelled' || data.type === 'error' || data.type === 'created') {
        setActionSessionId(null);
        setPendingActionButtons([]);
      }

      if (data.type === 'created') {
        const ru = typeof data.redirectUrl === 'string' ? data.redirectUrl.trim() : '';
        if (ru && ru.includes('/app/calendar')) {
          setCreatedCalendarViewUrl(ru);
        }
      }

      if (data.type === 'redirect_to_form') {
        const redirectUrl = typeof data.redirectUrl === 'string' ? data.redirectUrl.trim() : '';
        const preview = data.preview ?? null;
        const prefDocId = preview?.documentId?.trim();
        const prefContent = parseContentPrefill(preview?.contentJson);
        const isCalendarDest = redirectUrl.includes('/app/calendar');
        const canNavigateHref =
          redirectUrl.startsWith('/') || /^https?:\/\//i.test(redirectUrl);

        if (!isCalendarDest && prefDocId && prefContent) {
          sessionStorage.setItem(
            ACTION_PREFILL_STORAGE_KEY,
            JSON.stringify({
              documentId: prefDocId,
              content: prefContent,
            }),
          );
        }

        if (isCalendarDest) {
          if (canNavigateHref) navigateFromAnswerLink(redirectUrl);
        } else if (canNavigateHref) {
          navigateFromAnswerLink(redirectUrl);
        } else if (prefDocId) {
          void navigate({
            to: '/app/approvals',
            search: { tab: 'compose', documentId: prefDocId, prefill: 'true' },
            replace: true,
          });
        } else {
          void navigate({ to: '/app/approvals', search: { tab: 'compose' }, replace: true });
        }
        setActionSessionId(null);
        setPendingActionButtons([]);
        setOpen(false);
      }
      void qc.invalidateQueries({ queryKey: ['ai', 'chat-history'] });
    },
    [navigate, navigateFromAnswerLink, qc],
  );

  const chatM = useMutation({
    mutationFn: (payload: AiChatRequest) => aiApi.chat(payload),
    onSuccess: (data) => {
      handleChatActionResponse(data);
    },
    onError: (e: unknown) => {
      if (import.meta.env.DEV) {
        console.warn('[AiChatbotFab] POST /chat failed', e);
      }
      message.error(chatUserMessage(e, ERR_CHAT));
    },
  });

  const clearM = useMutation({
    mutationFn: () => aiApi.clearChatHistory(),
    onSuccess: () => {
      message.success(OK_CLEAR);
      setPendingActionButtons([]);
      setActionSessionId(null);
      setCreatedCalendarViewUrl(null);
      void qc.invalidateQueries({ queryKey: ['ai', 'chat-history'] });
    },
    onError: (e: unknown) => message.error(chatUserMessage(e, ERR_CLEAR)),
  });

  const pending = chatM.isPending;

  useEffect(() => {
    if (!sourcesHint) return;
    const t = window.setTimeout(() => setSourcesHint(null), 12_000);
    return () => window.clearTimeout(t);
  }, [sourcesHint]);

  useLayoutEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(id);
  }, [displayHistory, open, pending]);

  const send = useCallback(() => {
    const text = input.trim();
    if (!text || pending) return;
    setInput('');
    chatM.mutate({
      question: text,
      ...(actionSessionId ? { sessionId: actionSessionId } : {}),
    });
  }, [actionSessionId, input, pending, chatM]);

  const sendAction = useCallback(
    (action: string) => {
      if (!action || !actionSessionId || pending) return;
      chatM.mutate({ action, sessionId: actionSessionId });
    },
    [actionSessionId, pending, chatM],
  );

  const scrollToBottom = useCallback(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, []);

  const showWelcome = !historyLoading && displayHistory.length === 0 && !pending;

  return (
    <div
      className="tw-pointer-events-none tw-fixed tw-bottom-6 tw-right-6 tw-z-[100] tw-flex tw-flex-col tw-items-end tw-gap-3"
      style={{ maxWidth: 'calc(100vw - 1.5rem)' }}
    >
      <div
        id="ai-chatbot-panel"
        className={[
          'tw-pointer-events-auto tw-w-[min(440px,calc(100vw-1.5rem))] tw-overflow-hidden tw-rounded-2xl tw-border tw-border-slate-200/90 tw-bg-white tw-shadow-2xl tw-shadow-slate-900/12',
          'tw-origin-bottom tw-transition-[max-height,opacity,transform] tw-duration-300 tw-ease-out',
          open
            ? 'tw-max-h-[min(82vh,680px)] tw-translate-y-0 tw-opacity-100'
            : 'tw-pointer-events-none tw-max-h-0 -tw-translate-y-1 tw-opacity-0',
        ].join(' ')}
        aria-hidden={!open}
        role="region"
        aria-labelledby={titleId}
      >
        <div className="tw-flex tw-h-[min(82vh,680px)] tw-flex-col tw-overflow-hidden tw-bg-white">
          <div className="tw-relative tw-z-[1] tw-shrink-0 tw-cursor-default tw-bg-gradient-to-br tw-from-[#4A7FF7] tw-to-[#7BB3FF] tw-shadow-[0_4px_14px_rgba(74,127,247,0.38)]">
            <div className="tw-flex tw-items-center tw-gap-2.5 tw-px-3.5 tw-py-3">
              <div className="tw-flex tw-h-9 tw-w-9 tw-shrink-0 tw-items-center tw-justify-center">
                <AiChatbotLottieIcon className="!tw-h-7 !tw-w-7" />
              </div>
              <div className="tw-min-w-0 tw-flex-1 tw-text-white">
                <p id={titleId} className="tw-m-0 tw-text-xs tw-font-extrabold tw-tracking-wide tw-text-white/75">
                  {AI_TITLE}
                </p>
              </div>
              <div className="tw-flex tw-shrink-0 tw-items-center tw-gap-1">
                <button
                  type="button"
                  className="tw-whitespace-nowrap tw-rounded-full tw-border-0 tw-bg-white tw-px-3 tw-py-1 tw-text-[11px] tw-font-bold tw-text-[#4A7FF7] tw-shadow-md tw-transition-opacity hover:tw-opacity-90"
                  onClick={() => scrollToBottom()}
                >
                  {BTN_BOTTOM}
                </button>
                <Popconfirm
                  title={POP_TITLE}
                  okText={POP_OK}
                  cancelText={POP_CANCEL}
                  okButtonProps={{ danger: true, loading: clearM.isPending }}
                  disabled={history.length === 0 && !historyLoading}
                  onConfirm={() => clearM.mutate()}
                >
                  <button
                    type="button"
                    className="tw-flex tw-h-8 tw-w-8 tw-items-center tw-justify-center tw-rounded-full tw-border-0 tw-bg-white/20 tw-text-white tw-transition-colors hover:tw-bg-white/30 disabled:tw-opacity-40"
                    disabled={(history.length === 0 && !historyLoading) || clearM.isPending}
                    aria-label={ARIA_DEL}
                  >
                    <DeleteOutlined className="!tw-text-sm" />
                  </button>
                </Popconfirm>
                <button
                  type="button"
                  className="tw-flex tw-h-8 tw-w-8 tw-items-center tw-justify-center tw-rounded-full tw-border-0 tw-bg-white/20 tw-text-white tw-transition-colors hover:tw-bg-white/30"
                  aria-label={ARIA_CLOSE}
                  onClick={() => setOpen(false)}
                >
                  <CloseOutlined className="!tw-text-sm" />
                </button>
              </div>
            </div>
          </div>

          <div
            ref={listRef}
            className="wf-scrollbar tw-min-h-0 tw-flex-1 tw-overflow-y-auto tw-bg-[#F4F6F9] tw-px-2.5 tw-py-2.5"
            role="log"
            aria-live="polite"
          >
            {historyLoading && displayHistory.length === 0 ? (
              <div className="tw-flex tw-h-40 tw-items-center tw-justify-center">
                <Spin size="large" />
              </div>
            ) : null}

            {showWelcome ? (
              <div className="tw-mb-2 tw-flex tw-justify-center">
                <span className="tw-rounded-full tw-bg-[#EEF0F3] tw-px-2.5 tw-py-0.5 tw-text-[10px] tw-text-[#94A3B8]">
                  {WELCOME}
                </span>
              </div>
            ) : null}

            {displayHistory.map((item) => (
              <div key={item.id} className="tw-mb-2.5">
                <div className="tw-mb-1.5 tw-flex tw-items-end tw-justify-end tw-gap-1">
                  <div className="tw-flex tw-max-w-[72%] tw-flex-col tw-items-end tw-gap-0.5">
                    <div className="tw-cursor-default tw-rounded-[14px_2px_14px_14px] tw-bg-[#3B82F6] tw-px-3 tw-py-1.5 tw-text-[0.8rem] tw-leading-relaxed tw-text-white tw-shadow-[0_1px_4px_rgba(59,130,246,0.25)] tw-transition-[filter] hover:tw-brightness-[0.97]">
                      <p className="tw-m-0 tw-whitespace-pre-wrap tw-break-words">
                        {displayChatUserQuestion(item.question)}
                      </p>
                    </div>
                    <span className="tw-text-[9px] tw-text-[#94A3B8]">{formatAiMsgTime(item.createdAt)}</span>
                  </div>
                </div>
                <div className="tw-flex tw-items-end tw-justify-start tw-gap-1">
                  <div className="tw-flex tw-h-9 tw-w-9 tw-shrink-0 tw-items-center tw-justify-center tw-overflow-hidden tw-rounded-full tw-bg-gradient-to-br tw-from-white/25 tw-via-sky-50/12 tw-to-sky-200/18 tw-backdrop-blur-xl tw-backdrop-saturate-150 tw-shadow-[0_6px_18px_rgba(59,130,246,0.07)]">
                    <AiChatbotLottieIcon className="!tw-h-7 !tw-w-7" />
                  </div>
                  <div className="tw-flex tw-max-w-[72%] tw-flex-col tw-gap-0.5">
                    <span className="tw-mb-0.5 tw-text-[10px] tw-font-bold tw-text-[#475569]">{AI_TITLE}</span>
                    <div className="tw-cursor-default tw-rounded-[2px_14px_14px_14px] tw-bg-white tw-px-3 tw-py-1.5 tw-text-[0.8rem] tw-leading-relaxed tw-text-[#1E293B] tw-shadow-[0_1px_3px_rgba(0,0,0,0.07)] tw-transition-[filter] hover:tw-brightness-[0.97]">
                      <div className="tw-m-0 tw-text-[0.8rem] tw-leading-relaxed tw-text-[#1E293B]">
                        <AiParsedAnswerBody answer={item.answer} onNavigateInternal={navigateFromAnswerLink} />
                      </div>
                      {item.sources && item.sources.length > 0 ? (
                        <div className="tw-mt-2 tw-border-t tw-border-[#E8ECF0] tw-pt-2 tw-text-[10px] tw-text-[#64748B]">
                          {SOURCES_PREFIX}
                          {item.sources.join(', ')}
                        </div>
                      ) : null}
                    </div>
                    <span className="tw-text-[9px] tw-text-[#94A3B8]">{formatAiMsgTime(item.createdAt)}</span>
                  </div>
                </div>
              </div>
            ))}

            {pending ? (
              <div className="tw-flex tw-items-end tw-justify-start tw-gap-1">
                <div className="tw-flex tw-h-9 tw-w-9 tw-shrink-0 tw-items-center tw-justify-center tw-overflow-hidden tw-rounded-full tw-bg-white/12 tw-backdrop-blur-xl tw-backdrop-saturate-150 tw-shadow-[0_4px_14px_rgba(15,23,42,0.06)]">
                  <AiChatbotLottieIcon className="!tw-h-7 !tw-w-7 tw-opacity-90" />
                </div>
                <div className="tw-flex tw-items-center tw-gap-2 tw-rounded-[2px_14px_14px_14px] tw-bg-white tw-px-3 tw-py-2.5 tw-text-[0.8rem] tw-text-[#64748B] tw-shadow-[0_1px_3px_rgba(0,0,0,0.07)]">
                  <Spin size="small" />
                  <span>{PENDING}</span>
                </div>
              </div>
            ) : null}

            {!pending && pendingActionButtons.length > 0 ? (
              <div className="tw-mt-2 tw-flex tw-flex-wrap tw-gap-2">
                {pendingActionButtons.map((btn, idx) => (
                  <Button
                    key={`${btn.value}-${idx}`}
                    type={idx === 0 ? 'primary' : 'default'}
                    size="small"
                    onClick={() => sendAction(btn.value)}
                  >
                    {btn.label}
                  </Button>
                ))}
              </div>
            ) : null}

            {!pending && createdCalendarViewUrl ? (
              <div className="tw-mt-2 tw-flex tw-flex-wrap tw-gap-2">
                <Button
                  type="primary"
                  size="small"
                  onClick={() => {
                    navigateFromAnswerLink(createdCalendarViewUrl);
                    setCreatedCalendarViewUrl(null);
                  }}
                >
                  {BTN_CALENDAR_VIEW}
                </Button>
              </div>
            ) : null}
          </div>

          {sourcesHint != null && sourcesHint.length > 0 ? (
            <div className="tw-shrink-0 tw-border-t tw-border-[#C7DAFF] tw-bg-[#EEF4FF] tw-px-3 tw-py-2 tw-text-[11px] tw-text-[#2A5FD4]">
              <span className="tw-font-bold">{SOURCES_LABEL}</span>: {sourcesHint.join(', ')}
            </div>
          ) : null}

          <div className="tw-flex tw-shrink-0 tw-items-center tw-gap-1.5 tw-border-t tw-border-[#E8ECF0] tw-bg-white tw-px-2.5 tw-py-2">
            <div className="tw-flex tw-h-[34px] tw-w-[34px] tw-shrink-0 tw-items-center tw-justify-center tw-rounded-full tw-bg-[#F0F4F8] tw-text-[#64748B]">
              <UserOutlined className="!tw-text-base" aria-hidden />
            </div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={pending ? PH_PENDING : PH_INPUT}
              disabled={pending}
              rows={1}
              className="tw-max-h-24 tw-min-h-[34px] tw-flex-1 tw-resize-none tw-rounded-[20px] tw-border-[1.5px] tw-border-transparent tw-bg-[#F0F4F8] tw-px-3 tw-py-2 tw-text-[0.8rem] tw-text-[#1E293B] tw-outline-none tw-transition-[border-color,background] placeholder:tw-text-[#CBD5E1] focus:tw-border-[#3B82F6] focus:tw-bg-white disabled:tw-cursor-not-allowed disabled:tw-opacity-60"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <button
              type="button"
              className="tw-flex tw-h-[34px] tw-w-[34px] tw-shrink-0 tw-items-center tw-justify-center tw-rounded-full tw-border-0 tw-bg-[#3B82F6] tw-text-white tw-shadow-[0_2px_8px_rgba(59,130,246,0.3)] tw-transition-[filter,transform] hover:tw-brightness-105 active:tw-scale-[1.04] disabled:tw-cursor-not-allowed disabled:tw-opacity-45"
              aria-label={'\uC804\uC1A1'}
              disabled={pending || !input.trim()}
              onClick={() => void send()}
            >
              {pending ? <Spin size="small" className="!tw-text-white" /> : <SendOutlined className="!tw-text-sm" />}
            </button>
          </div>
          <p className="tw-m-0 tw-border-t tw-border-transparent tw-bg-white tw-px-3 tw-pb-2 tw-text-center tw-text-[10px] tw-text-[#94A3B8]">
            {HINT_KEYS}
          </p>
        </div>
      </div>

      <div className="tw-pointer-events-auto tw-relative tw-inline-flex tw-shrink-0 tw-group">
        {!open ? (
          <div
            className={[
              'tw-pointer-events-none tw-absolute tw-right-[calc(100%+12px)] tw-top-1/2 -tw-translate-y-1/2',
              'tw-max-w-[280px] tw-min-w-[230px] tw-rounded-full tw-bg-[#EEF3FF] tw-px-4 tw-py-2.5',
              'tw-text-sm tw-leading-snug tw-text-[#1E3A8A]',
              'tw-shadow-[0_8px_20px_rgba(59,130,246,0.16)] tw-ring-1 tw-ring-white/80',
              'tw-opacity-0 tw-translate-x-1 tw-transition-all tw-duration-300',
              'group-hover:tw-opacity-100 group-hover:tw-translate-x-0',
              'group-focus-within:tw-opacity-100 group-focus-within:tw-translate-x-0',
            ].join(' ')}
            aria-hidden
          >
            <div className="tw-break-keep">{FAB_HOVER_HINT}</div>
          </div>
        ) : null}
        <div
          className="tw-pointer-events-none tw-absolute tw-inset-0 tw-rounded-full tw-bg-[#4A7FF7]/18 tw-blur-3xl tw-transition-all tw-duration-700 group-hover:tw-bg-[#4A7FF7]/26"
          aria-hidden
        />
        <button
          type="button"
          className={[
            'tw-relative tw-z-[0] tw-flex tw-h-[4.5rem] tw-w-[4.5rem] tw-shrink-0 tw-items-center tw-justify-center tw-overflow-hidden tw-rounded-full tw-border-0',
            'tw-bg-gradient-to-br tw-from-[#4A7FF7] tw-via-[#5E90F5] tw-to-[#7BB3FF]',
            'tw-shadow-[0_10px_28px_rgba(74,127,247,0.28),inset_0_-2px_6px_rgba(15,23,42,0.08)]',
            'tw-transform-gpu tw-transition-all tw-duration-500 group-hover:tw-scale-105',
            'focus-visible:tw-outline focus-visible:tw-outline-2 focus-visible:tw-outline-offset-2 focus-visible:tw-outline-[#7BB3FF]/70',
            'active:tw-scale-[0.97]',
          ].join(' ')}
          aria-label={open ? ARIA_COLLAPSE_PANEL : ARIA_EXPAND_PANEL}
          aria-expanded={open}
          aria-controls="ai-chatbot-panel"
          onClick={() => setOpen((v) => !v)}
        >
          <div
            className="tw-pointer-events-none tw-absolute tw-inset-0 tw-rounded-full tw-bg-gradient-to-tr tw-from-transparent tw-via-white/8 tw-to-white/14"
            aria-hidden
          />
          <AiChatbotLottieIcon className="tw-relative tw-z-[1] -tw-translate-y-px tw-transition-transform tw-duration-500 group-hover:tw-scale-110 !tw-h-10 !tw-w-10" />
        </button>
      </div>
    </div>
  );
}
