import { CloseOutlined, DeleteOutlined, RobotOutlined, SendOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Input, Modal, Popconfirm, Spin, Typography } from 'antd';
import dayjs from 'dayjs';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { aiApi } from '@/features/ai/api/aiApi';

export function AiChatbotFab() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [sourcesHint, setSourcesHint] = useState<string[] | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { data: history = [], isLoading: historyLoading } = useQuery({
    queryKey: ['ai', 'chat-history'],
    queryFn: () => aiApi.getChatHistory(),
    enabled: open,
    staleTime: 30_000,
  });

  const chatM = useMutation({
    mutationFn: (question: string) => aiApi.chat(question),
    onSuccess: (data) => {
      setSourcesHint(Array.isArray(data.sources) ? data.sources : []);
      void qc.invalidateQueries({ queryKey: ['ai', 'chat-history'] });
    },
    onError: (e: Error) => message.error(e.message || '답변을 가져오지 못했습니다.'),
  });

  const clearM = useMutation({
    mutationFn: () => aiApi.clearChatHistory(),
    onSuccess: () => {
      message.success('대화 이력이 삭제되었습니다.');
      void qc.invalidateQueries({ queryKey: ['ai', 'chat-history'] });
    },
    onError: (e: Error) => message.error(e.message || '삭제에 실패했습니다.'),
  });

  const pending = chatM.isPending;

  useEffect(() => {
    if (!sourcesHint) return;
    const t = window.setTimeout(() => setSourcesHint(null), 12_000);
    return () => window.clearTimeout(t);
  }, [sourcesHint]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [history, open, pending]);

  const send = useCallback(() => {
    const text = input.trim();
    if (!text || pending) return;
    setInput('');
    chatM.mutate(text);
  }, [input, pending, chatM]);

  const showWelcome = !historyLoading && history.length === 0 && !pending;

  return (
    <>
      <button
        type="button"
        className="tw-fixed tw-bottom-6 tw-right-6 tw-z-[100] tw-flex tw-h-14 tw-w-14 tw-items-center tw-justify-center tw-rounded-full tw-border-0 tw-bg-[#2563EB] tw-text-2xl tw-text-white tw-shadow-lg tw-shadow-blue-500/30 tw-transition-[transform,box-shadow,filter] hover:tw-brightness-110 hover:tw-shadow-xl focus-visible:tw-outline focus-visible:tw-outline-2 focus-visible:tw-outline-offset-2 focus-visible:tw-outline-[#2563EB] active:tw-scale-95"
        aria-label="AI 비서 열기"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <RobotOutlined aria-hidden />
      </button>

      <Modal
        title={null}
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        width={520}
        centered
        destroyOnHidden={false}
        maskClosable
        classNames={{ body: '!tw-p-0' }}
        className="[&_.ant-modal-content]:tw-overflow-hidden [&_.ant-modal-content]:tw-p-0"
        aria-labelledby={titleId}
      >
        <div className="tw-flex tw-h-[min(78vh,640px)] tw-flex-col tw-bg-white">
          <div className="tw-flex tw-shrink-0 tw-items-center tw-justify-between tw-gap-2 tw-border-b tw-border-slate-200 tw-bg-slate-50 tw-px-4 tw-py-3">
            <div className="tw-flex tw-min-w-0 tw-items-center tw-gap-2">
              <span className="tw-flex tw-h-9 tw-w-9 tw-shrink-0 tw-items-center tw-justify-center tw-rounded-full tw-bg-[#2563EB] tw-text-lg tw-text-white">
                <RobotOutlined aria-hidden />
              </span>
              <div className="tw-min-w-0">
                <Typography.Text id={titleId} strong className="tw-block tw-text-base tw-text-slate-900">
                  AI 비서
                </Typography.Text>
                <Typography.Text type="secondary" className="tw-block tw-text-xs">
                  HR 정책·개인화 질의 (최근 대화는 서버에 저장됩니다)
                </Typography.Text>
              </div>
            </div>
            <div className="tw-flex tw-shrink-0 tw-items-center tw-gap-1">
              <Popconfirm
                title="전체 대화 이력을 삭제할까요?"
                okText="삭제"
                cancelText="취소"
                okButtonProps={{ danger: true, loading: clearM.isPending }}
                disabled={history.length === 0 && !historyLoading}
                onConfirm={() => clearM.mutate()}
              >
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  className="tw-text-slate-600"
                  disabled={(history.length === 0 && !historyLoading) || clearM.isPending}
                >
                  이력 삭제
                </Button>
              </Popconfirm>
              <Button
                type="text"
                size="small"
                icon={<CloseOutlined />}
                className="tw-text-slate-500"
                aria-label="닫기"
                onClick={() => setOpen(false)}
              />
            </div>
          </div>

          <div
            ref={listRef}
            className="wf-scrollbar tw-min-h-0 tw-flex-1 tw-overflow-y-auto tw-bg-slate-50/80 tw-px-4 tw-py-3"
            role="log"
            aria-live="polite"
          >
            <Spin spinning={historyLoading && history.length === 0}>
              {showWelcome && (
                <div className="tw-mb-4 tw-rounded-xl tw-border tw-border-dashed tw-border-slate-200 tw-bg-white tw-px-3 tw-py-3 tw-text-sm tw-text-slate-600">
                  안녕하세요. 연차·취업규칙 등 HR 질문이나 &quot;나는 누구야&quot;처럼 개인화 질문도 해 보세요. 답변은 정책
                  문서와 프로필 정보를 바탕으로 제공됩니다.
                </div>
              )}

              {history.map((item) => (
                <article
                  key={item.id}
                  className="tw-mb-4 tw-rounded-xl tw-border tw-border-slate-200 tw-bg-white tw-p-3 tw-shadow-sm last:tw-mb-0"
                >
                  <div className="tw-mb-2 tw-flex tw-items-center tw-justify-between tw-gap-2">
                    <Typography.Text type="secondary" className="tw-text-[11px]">
                      {dayjs(item.createdAt).isValid()
                        ? dayjs(item.createdAt).format('YYYY-MM-DD HH:mm')
                        : item.createdAt}
                    </Typography.Text>
                  </div>
                  <div className="tw-mb-2 tw-flex tw-justify-end">
                    <div className="tw-max-w-[95%] tw-rounded-2xl tw-rounded-br-md tw-bg-[#2563EB] tw-px-3 tw-py-2 tw-text-sm tw-leading-relaxed tw-text-white">
                      {item.question}
                    </div>
                  </div>
                  <div className="tw-flex tw-justify-start">
                    <div className="tw-max-w-[95%] tw-rounded-2xl tw-rounded-bl-md tw-border tw-border-slate-100 tw-bg-slate-50 tw-px-3 tw-py-2 tw-text-sm tw-leading-relaxed tw-text-slate-800">
                      <span className="tw-whitespace-pre-wrap">{item.answer}</span>
                      {item.sources && item.sources.length > 0 && (
                        <div className="tw-mt-2 tw-border-t tw-border-slate-200 tw-pt-2 tw-text-[11px] tw-text-slate-500">
                          참고 문서: {item.sources.join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              ))}

              {pending && (
                <div className="tw-flex tw-items-center tw-gap-2 tw-rounded-lg tw-border tw-border-slate-200 tw-bg-white tw-px-3 tw-py-3 tw-text-sm tw-text-slate-600">
                  <Spin size="small" />
                  <span>답변을 생성하는 중입니다… (수 초 걸릴 수 있습니다)</span>
                </div>
              )}
            </Spin>
          </div>

          {sourcesHint && (
            <div className="tw-shrink-0 tw-border-t tw-border-amber-100 tw-bg-amber-50/80 tw-px-4 tw-py-2 tw-text-[11px] tw-text-slate-700">
              {sourcesHint.length > 0 ? (
                <>
                  <span className="tw-font-medium tw-text-amber-900">참고 문서</span>: {sourcesHint.join(', ')}
                </>
              ) : (
                <span className="tw-text-slate-600">
                  참고 문서 없음 — 개인화 답변이거나 관련 정책 문서가 없을 수 있습니다.
                </span>
              )}
            </div>
          )}

          <div className="tw-shrink-0 tw-border-t tw-border-slate-200 tw-bg-white tw-p-3">
            <div className="tw-flex tw-items-end tw-gap-2">
              <Input.TextArea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="질문을 입력하세요…"
                autoSize={{ minRows: 1, maxRows: 4 }}
                className="tw-flex-1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                disabled={pending}
              />
              <Button
                type="primary"
                icon={<SendOutlined />}
                className="tw-shrink-0"
                aria-label="보내기"
                onClick={() => void send()}
                disabled={pending || !input.trim()}
                loading={pending}
              />
            </div>
            <Typography.Text type="secondary" className="tw-mt-1 tw-block tw-text-[11px]">
              Enter로 전송 · Shift+Enter로 줄 바꿈
            </Typography.Text>
          </div>
        </div>
      </Modal>
    </>
  );
}
