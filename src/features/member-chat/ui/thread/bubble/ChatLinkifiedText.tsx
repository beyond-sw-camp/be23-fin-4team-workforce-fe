import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { PRETTY_SCROLLBAR_CLASS } from '@/features/member-chat/ui/shared/prettyScrollbar';

/**
 * 채팅 본문 markdown 최소 지원 렌더러.
 * - 프론트 렌더만 변경 (저장 포맷은 plain text 그대로)
 * - HTML은 허용하지 않아 XSS 위험을 최소화
 * - 링크/강조/리스트/인라인코드 정도의 GFM 문법 지원
 */
export function ChatLinkifiedText({ text, className }: { text: string; className?: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className={className}>{children}</p>,
        a: ({ children, href }) => {
          const safeHref = href ?? '#';
          return (
            <a
              href={safeHref}
              target="_blank"
              rel="noopener noreferrer"
              className="tw-break-all tw-text-current tw-underline tw-underline-offset-2"
            >
              {children}
            </a>
          );
        },
        strong: ({ children }) => <strong className="tw-font-bold">{children}</strong>,
        em: ({ children }) => <em className="tw-italic">{children}</em>,
        pre: ({ children }) => (
          <pre
            className={`tw-my-1 tw-max-w-full tw-overflow-x-auto tw-rounded-lg tw-border tw-border-slate-300/50 tw-bg-slate-950/10 tw-p-2.5 tw-text-[12px] tw-leading-relaxed ${PRETTY_SCROLLBAR_CLASS}`}
          >
            {children}
          </pre>
        ),
        code: ({ className: codeClassName, children }) => {
          const isBlock = typeof codeClassName === 'string' && codeClassName.includes('language-');
          if (isBlock) {
            return <code className="tw-whitespace-pre tw-bg-transparent tw-p-0 tw-font-mono">{children}</code>;
          }
          return (
            <code className="tw-rounded tw-bg-slate-900/10 tw-px-1 tw-py-0.5 tw-font-mono tw-text-[0.92em]">
              {children}
            </code>
          );
        },
        ul: ({ children }) => <ul className="tw-my-0 tw-list-disc tw-pl-5">{children}</ul>,
        ol: ({ children }) => <ol className="tw-my-0 tw-list-decimal tw-pl-5">{children}</ol>,
        li: ({ children }) => <li className="tw-my-0.5">{children}</li>,
      }}
    >
      {text}
    </ReactMarkdown>
  );
}
