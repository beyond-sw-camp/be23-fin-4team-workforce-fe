import {
  AudioOutlined,
  DeleteOutlined,
  EditOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  Empty,
  Form,
  Input,
  Pagination,
  Popconfirm,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  aiRecordingsApi,
  type AiRecording,
  type AiRecordingLanguage,
} from '@/features/ai-recordings/api/aiRecordingsApi';
import { AppModal } from '@/shared/ui/AppModal';
import { formatApprovalAttachmentBytes } from '@/features/approvals/api/approvalAttachmentsApi';

type AiRecordingModalProps = {
  open: boolean;
  onClose: () => void;
};

function languageLabel(lang: string): string {
  const k = (lang || '').toLowerCase();
  if (k === 'en') return '영어';
  if (k === 'ja') return '일본어';
  if (k === 'zh') return '중국어';
  return '한국어';
}

function pickRecorderMime(): string | null {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  for (const m of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m;
  }
  return null;
}

function speechRecognitionLang(iso: string): string {
  const k = iso.trim().toLowerCase().split('-')[0] ?? 'ko';
  if (k === 'en') return 'en-US';
  if (k === 'ja') return 'ja-JP';
  if (k === 'zh') return 'zh-CN';
  return 'ko-KR';
}

type WebSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort?: () => void;
  onresult: ((this: WebSpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((this: WebSpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((this: WebSpeechRecognition) => void) | null;
};

function getSpeechRecognitionCtor(): (new () => WebSpeechRecognition) | null {
  const w = window as typeof window & {
    SpeechRecognition?: new () => WebSpeechRecognition;
    webkitSpeechRecognition?: new () => WebSpeechRecognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function apiErrorMessage(e: unknown, fallback: string): string {
  if (!e || typeof e !== 'object') return fallback;
  const status = (e as { status?: number }).status ?? 0;
  if (status === 413) return '녹음이 너무 깁니다. 더 짧게 녹음해 주세요.';
  if (status === 502) return 'AI 변환에 실패했습니다. 잠시 후 다시 시도해 주세요.';
  return e instanceof Error && e.message ? e.message : fallback;
}

export function AiRecordingModal({ open, onClose }: AiRecordingModalProps) {
  const { message } = App.useApp();
  const qc = useQueryClient();

  const [tab, setTab] = useState<'list' | 'create' | 'detail'>('list');
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(8);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState<AiRecordingLanguage>('ko');
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string>('');
  const [liveFinalText, setLiveFinalText] = useState('');
  const [liveInterimText, setLiveInterimText] = useState('');
  const [liveCaptionMode, setLiveCaptionMode] = useState<'off' | 'live' | 'unsupported'>('off');
  const [savingStage, setSavingStage] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editTranscript, setEditTranscript] = useState('');
  const [editSummary, setEditSummary] = useState('');

  const mediaRecorderRef = useState<{ value: MediaRecorder | null }>({ value: null })[0];
  const chunksRef = useState<{ value: Blob[] }>({ value: [] })[0];
  const timerRef = useState<{ value: number | null }>({ value: null })[0];
  const stopInFlightRef = useState<{ value: Promise<void> | null }>({ value: null })[0];
  const recognitionRef = useState<{ value: WebSpeechRecognition | null }>({ value: null })[0];
  const wantLiveCaptionRef = useState<{ value: boolean }>({ value: false })[0];

  useEffect(() => {
    if (!open) return;
    setTab('list');
    setSelectedId(null);
    setEditing(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => setKeyword(keywordInput.trim()), 250);
    return () => window.clearTimeout(t);
  }, [keywordInput, open]);

  useEffect(() => {
    setPage(1);
  }, [keyword]);

  useEffect(() => {
    return () => {
      if (timerRef.value != null) window.clearInterval(timerRef.value);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      const rec = mediaRecorderRef.value;
      if (rec && rec.state !== 'inactive') {
        try {
          rec.stop();
        } catch {
          // ignore
        }
      }
      const sr = recognitionRef.value;
      if (sr) {
        try {
          sr.stop();
        } catch {
          sr.abort?.();
        }
      }
    };
  }, [audioUrl, mediaRecorderRef, recognitionRef, timerRef]);

  const listQ = useQuery({
    queryKey: ['member', 'ai-recordings', page, pageSize, keyword],
    queryFn: () => aiRecordingsApi.list({ page: page - 1, size: pageSize, keyword: keyword || undefined }),
    enabled: open,
    staleTime: 10_000,
  });

  const detailQ = useQuery({
    queryKey: ['member', 'ai-recordings', 'detail', selectedId],
    queryFn: () => aiRecordingsApi.get(selectedId ?? ''),
    enabled: open && tab === 'detail' && Boolean(selectedId),
  });

  const createM = useMutation({
    mutationFn: (blob: Blob) =>
      aiRecordingsApi.create({
        audioBlob: blob,
        title: title.trim() || undefined,
        language,
      }),
    onMutate: () => {
      setSavingStage('음성 업로드 중...');
    },
    onSuccess: async (row) => {
      await qc.invalidateQueries({ queryKey: ['member', 'ai-recordings'] });
      setSavingStage(null);
      setSelectedId(row.recordingId);
      setTab('detail');
      setEditing(false);
      message.success('녹음을 저장했습니다.');
    },
    onError: (e) => {
      setSavingStage(null);
      message.error(apiErrorMessage(e, '녹음 저장에 실패했습니다.'));
    },
  });

  const updateM = useMutation({
    mutationFn: () =>
      aiRecordingsApi.update(selectedId ?? '', {
        title: editTitle.trim() || undefined,
        transcript: editTranscript,
        summary: editSummary,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['member', 'ai-recordings'] });
      await qc.invalidateQueries({ queryKey: ['member', 'ai-recordings', 'detail', selectedId] });
      setEditing(false);
      message.success('수정 저장되었습니다.');
    },
    onError: (e) => {
      message.error(apiErrorMessage(e, '수정에 실패했습니다.'));
    },
  });

  const deleteM = useMutation({
    mutationFn: () => aiRecordingsApi.delete(selectedId ?? ''),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['member', 'ai-recordings'] });
      setSelectedId(null);
      setTab('list');
      message.success('녹음을 삭제했습니다.');
    },
    onError: (e) => {
      message.error(apiErrorMessage(e, '삭제에 실패했습니다.'));
    },
  });

  useEffect(() => {
    if (!detailQ.data) return;
    setEditTitle(detailQ.data.title ?? '');
    setEditTranscript(detailQ.data.transcript ?? '');
    setEditSummary(detailQ.data.summary ?? '');
  }, [detailQ.data]);

  const startRecording = async () => {
    const mime = pickRecorderMime();
    if (!mime) {
      message.error('현재 브라우저에서 녹음을 지원하지 않습니다.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.value = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.value.push(e.data);
      };
      recorder.onerror = () => {
        message.error('녹음 중 오류가 발생했습니다.');
      };
      recorder.start(1000);
      mediaRecorderRef.value = recorder;
      setIsRecording(true);
      setElapsedSec(0);
      setLiveFinalText('');
      setLiveInterimText('');
      setLiveCaptionMode('off');
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl('');
      setAudioBlob(null);
      if (timerRef.value != null) window.clearInterval(timerRef.value);
      timerRef.value = window.setInterval(() => {
        setElapsedSec((s) => s + 1);
      }, 1000);

      const Ctor = getSpeechRecognitionCtor();
      if (!Ctor) {
        setLiveCaptionMode('unsupported');
        return;
      }
      const sr = new Ctor();
      recognitionRef.value = sr;
      wantLiveCaptionRef.value = true;
      sr.continuous = true;
      sr.interimResults = true;
      sr.lang = speechRecognitionLang(language);
      sr.onresult = (event: SpeechRecognitionEvent) => {
        let nextFinal = '';
        let nextInterim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const row = event.results[i];
          const piece = row?.[0]?.transcript ?? '';
          if (row.isFinal) nextFinal += piece;
          else nextInterim += piece;
        }
        if (nextFinal) {
          setLiveFinalText((prev) => `${prev}${nextFinal}${nextFinal.endsWith(' ') ? '' : ' '}`);
        }
        setLiveInterimText(nextInterim);
      };
      sr.onerror = (ev: SpeechRecognitionErrorEvent) => {
        if (ev.error === 'not-allowed') {
          void message.warning('실시간 자막 권한이 거부되었습니다. 녹음은 계속됩니다.');
        }
      };
      sr.onend = () => {
        if (!wantLiveCaptionRef.value || recognitionRef.value !== sr) return;
        try {
          sr.start();
        } catch {
          // ignore
        }
      };
      try {
        sr.start();
        setLiveCaptionMode('live');
      } catch {
        setLiveCaptionMode('unsupported');
        recognitionRef.value = null;
      }
    } catch (e) {
      const errName = e && typeof e === 'object' ? (e as { name?: string }).name : '';
      if (errName === 'NotAllowedError') {
        message.warning('마이크 권한이 필요합니다. 브라우저 설정에서 허용해 주세요.');
      } else {
        message.error('녹음을 시작하지 못했습니다.');
      }
    }
  };

  const stopRecording = async () => {
    if (stopInFlightRef.value) {
      await stopInFlightRef.value;
      return;
    }
    const recorder = mediaRecorderRef.value;
    if (!recorder || recorder.state === 'inactive') return;
    const stopTask = (async () => {
      wantLiveCaptionRef.value = false;
      const sr = recognitionRef.value;
      recognitionRef.value = null;
      if (sr) {
        try {
          sr.onresult = null;
          sr.onerror = null;
          sr.onend = null;
          sr.stop();
        } catch {
          sr.abort?.();
        }
      }

      setIsRecording(false);

      await new Promise<void>((resolve) => {
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        recorder.onstop = () => {
          const blob = new Blob(chunksRef.value, { type: recorder.mimeType || 'audio/webm' });
          recorder.stream.getTracks().forEach((t) => t.stop());
          setAudioBlob(blob);
          const nextUrl = URL.createObjectURL(blob);
          if (audioUrl) URL.revokeObjectURL(audioUrl);
          setAudioUrl(nextUrl);
          done();
        };
        try {
          if (recorder.state !== 'inactive') recorder.requestData();
        } catch {
          // ignore
        }
        try {
          if (recorder.state !== 'inactive') recorder.stop();
          else done();
        } catch {
          done();
        }
        window.setTimeout(() => {
          // 브라우저별 간헐적 onstop 누락 방어: 트랙 정리 후 다음 녹음 가능 상태로 복구
          try {
            recorder.stream.getTracks().forEach((t) => t.stop());
          } catch {
            // ignore
          }
          done();
        }, 2000);
      });

      mediaRecorderRef.value = null;
      if (timerRef.value != null) {
        window.clearInterval(timerRef.value);
        timerRef.value = null;
      }
      setLiveCaptionMode('off');
      const blob = new Blob(chunksRef.value, { type: recorder.mimeType || 'audio/webm' });
      if (!blob.size) {
        message.warning('녹음된 데이터가 없습니다.');
        return;
      }
      setSavingStage('음성 업로드 중...');
      try {
        await createM.mutateAsync(blob);
      } catch {
        // onError에서 사용자 메시지를 이미 노출함. 여기서 재throw하면 콘솔 Uncaught가 발생한다.
      } finally {
        setSavingStage(null);
      }
    })();

    stopInFlightRef.value = stopTask;
    try {
      await stopTask;
    } finally {
      stopInFlightRef.value = null;
    }
  };

  const resetCreateForm = () => {
    if (isRecording) return;
    setTitle('');
    setLanguage('ko');
    setAudioBlob(null);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl('');
    setElapsedSec(0);
    setLiveFinalText('');
    setLiveInterimText('');
    setLiveCaptionMode('off');
  };

  const handleClose = () => {
    if (!createM.isPending && !updateM.isPending && !deleteM.isPending) onClose();
  };

  const currentDetail: AiRecording | null = detailQ.data ?? null;
  const listRows = listQ.data?.content ?? [];
  const livePreviewText = `${liveFinalText}${liveInterimText}`.trimEnd();
  const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
  const ss = String(elapsedSec % 60).padStart(2, '0');

  const createBody = (
    <div className="tw-grid tw-grid-cols-1 tw-gap-4 lg:tw-grid-cols-2">
      <Card title="새 녹음" size="small" className="tw-border-slate-200">
        <Space direction="vertical" className="tw-w-full" size="middle">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            placeholder="제목 (비우면 자동 생성)"
          />
          <Select
            value={language}
            onChange={(v) => setLanguage(v)}
            options={[
              { value: 'ko', label: '한국어' },
              { value: 'en', label: 'English' },
              { value: 'ja', label: '日本語' },
              { value: 'zh', label: '中文' },
            ]}
          />
          <Space wrap>
            {!isRecording ? (
              <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => void startRecording()}>
                녹음 시작
              </Button>
            ) : (
              <Button danger icon={<PauseCircleOutlined />} onClick={() => void stopRecording()}>
                녹음 종료
              </Button>
            )}
            <Tag color={isRecording ? 'red' : 'default'}>
              {isRecording ? `녹음 중 ${mm}:${ss}` : `대기 ${mm}:${ss}`}
            </Tag>
            <Button onClick={resetCreateForm} disabled={isRecording || createM.isPending}>
              초기화
            </Button>
          </Space>
          {isRecording && liveCaptionMode === 'live' ? (
            <Alert
              type="info"
              showIcon
              message="실시간 받아쓰기"
              description="아래 원문은 임시 자막입니다. 녹음 종료 후 AI가 정식 원문/회의록으로 생성합니다."
            />
          ) : null}
          {isRecording && liveCaptionMode === 'unsupported' ? (
            <Alert
              type="warning"
              showIcon
              message="실시간 받아쓰기 미지원 브라우저"
              description="녹음 종료 후 AI 변환 결과는 정상 생성됩니다. Chrome/Edge 사용을 권장합니다."
            />
          ) : null}
          {isRecording ? (
            <Input.TextArea
              rows={8}
              readOnly
              value={livePreviewText}
              placeholder="말하면 여기에서 실시간으로 받아쓰기됩니다."
            />
          ) : null}
          {audioBlob ? (
            <Alert
              type="info"
              showIcon
              message={`녹음 준비 완료: ${formatApprovalAttachmentBytes(audioBlob.size)}`}
              description="녹음 종료 시 자동으로 AI 받아쓰기/회의록 정리를 시작합니다."
            />
          ) : null}
          {audioUrl ? <audio src={audioUrl} controls className="tw-w-full" /> : null}
          {savingStage ? <Spin tip={savingStage} /> : null}
          <Space>
            <Button onClick={() => setTab('list')} disabled={createM.isPending}>
              목록으로
            </Button>
            <Button type="primary" icon={<SaveOutlined />} disabled>
              녹음 종료 시 자동 저장
            </Button>
          </Space>
        </Space>
      </Card>
      <Card title="안내" size="small" className="tw-border-slate-200">
        <Typography.Paragraph className="!tw-mb-2">
          1. 녹음 종료 후 저장을 누르면 AI가 원문/회의록을 생성합니다.
        </Typography.Paragraph>
        <Typography.Paragraph className="!tw-mb-2">
          2. 처리 시간은 녹음 길이에 따라 5초~30초 이상 걸릴 수 있습니다.
        </Typography.Paragraph>
        <Typography.Paragraph className="!tw-mb-0">
          3. 파일은 25MB 이하만 업로드됩니다.
        </Typography.Paragraph>
      </Card>
    </div>
  );

  const listBody = (
    <Space direction="vertical" className="tw-w-full" size="middle">
      <div className="tw-flex tw-items-center tw-gap-2">
        <Input.Search
          allowClear
          value={keywordInput}
          onChange={(e) => setKeywordInput(e.target.value)}
          placeholder="제목 검색"
          className="tw-max-w-md"
        />
        <Button type="primary" icon={<AudioOutlined />} onClick={() => setTab('create')}>
          새 녹음
        </Button>
      </div>
      {listQ.isLoading ? (
        <div className="tw-flex tw-justify-center tw-py-14">
          <Spin />
        </div>
      ) : listRows.length === 0 ? (
        <Empty description="녹음 데이터가 없습니다." />
      ) : (
        <div className="tw-grid tw-grid-cols-1 tw-gap-3 lg:tw-grid-cols-2">
          {listRows.map((row) => (
            <Card
              key={row.recordingId}
              hoverable
              className="tw-border-slate-200"
              onClick={() => {
                setSelectedId(row.recordingId);
                setTab('detail');
              }}
            >
              <Space direction="vertical" className="tw-w-full" size={4}>
                <Typography.Text strong className="tw-truncate" title={row.title || row.audioFileName}>
                  {row.title || row.audioFileName}
                </Typography.Text>
                <Typography.Text type="secondary" className="tw-text-xs">
                  {dayjs(row.createdAt).format('YYYY-MM-DD HH:mm')} · {languageLabel(row.language)} ·{' '}
                  {formatApprovalAttachmentBytes(row.audioSize)}
                </Typography.Text>
                <Typography.Paragraph className="!tw-mb-0 tw-line-clamp-2 tw-text-sm tw-text-slate-600">
                  {row.summaryPreview || '(요약 미리보기 없음)'}
                </Typography.Paragraph>
              </Space>
            </Card>
          ))}
        </div>
      )}
      <div className="tw-flex tw-justify-end">
        <Pagination
          current={page}
          pageSize={pageSize}
          total={listQ.data?.totalElements ?? 0}
          onChange={(p) => setPage(p)}
          showSizeChanger={false}
        />
      </div>
    </Space>
  );

  const detailBody = (
    <Space direction="vertical" className="tw-w-full" size="middle">
      <div className="tw-flex tw-items-center tw-justify-between">
        <Space>
          <Button onClick={() => setTab('list')}>목록으로</Button>
          <Button onClick={() => setEditing((v) => !v)} icon={<EditOutlined />} disabled={detailQ.isLoading}>
            {editing ? '편집 취소' : '편집'}
          </Button>
        </Space>
        <Popconfirm
          title="녹음을 삭제할까요?"
          description="삭제 후 복구할 수 없습니다."
          onConfirm={() => void deleteM.mutateAsync()}
          okButtonProps={{ danger: true }}
        >
          <Button danger icon={<DeleteOutlined />} loading={deleteM.isPending}>
            삭제
          </Button>
        </Popconfirm>
      </div>
      {detailQ.isLoading || !currentDetail ? (
        <div className="tw-flex tw-justify-center tw-py-16">
          <Spin />
        </div>
      ) : (
        <div className="tw-grid tw-grid-cols-1 tw-gap-4">
          <Card size="small" title="기본 정보" className="tw-border-slate-200">
            <Space direction="vertical" className="tw-w-full" size="small">
              {editing ? (
                <Input value={editTitle} maxLength={200} onChange={(e) => setEditTitle(e.target.value)} />
              ) : (
                <Typography.Title level={5} className="!tw-mb-0">
                  {currentDetail.title}
                </Typography.Title>
              )}
              <Typography.Text type="secondary" className="tw-text-xs">
                {dayjs(currentDetail.createdAt).format('YYYY-MM-DD HH:mm')} · {currentDetail.audioFileName} ·{' '}
                {formatApprovalAttachmentBytes(currentDetail.audioSize)}
              </Typography.Text>
              <audio src={currentDetail.audioUrl} controls className="tw-w-full" />
            </Space>
          </Card>
          <Card size="small" title="받아쓰기 원문" className="tw-border-slate-200">
            {editing ? (
              <Input.TextArea rows={8} value={editTranscript} onChange={(e) => setEditTranscript(e.target.value)} />
            ) : (
              <Typography.Paragraph className="!tw-mb-0 tw-whitespace-pre-wrap tw-break-words">
                {currentDetail.transcript || '—'}
              </Typography.Paragraph>
            )}
          </Card>
          <Card size="small" title="AI 회의록" className="tw-border-slate-200">
            {editing ? (
              <Input.TextArea rows={10} value={editSummary} onChange={(e) => setEditSummary(e.target.value)} />
            ) : (
              <div className="prose tw-max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{currentDetail.summary || ''}</ReactMarkdown>
              </div>
            )}
          </Card>
          {editing ? (
            <div className="tw-flex tw-justify-end">
              <Button type="primary" icon={<SaveOutlined />} loading={updateM.isPending} onClick={() => void updateM.mutateAsync()}>
                수정 저장
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </Space>
  );

  const titleNode = useMemo(() => {
    if (tab === 'create') return 'AI 녹음 - 새 녹음';
    if (tab === 'detail') return 'AI 녹음 - 상세';
    return 'AI 녹음 목록';
  }, [tab]);

  return (
    <AppModal
      title={titleNode}
      open={open}
      onCancel={handleClose}
      footer={null}
      centered
      width={1100}
      destroyOnClose={false}
      styles={{ body: { maxHeight: '76vh', overflowY: 'auto' } }}
    >
      {tab === 'list' ? listBody : tab === 'create' ? createBody : detailBody}
    </AppModal>
  );
}
