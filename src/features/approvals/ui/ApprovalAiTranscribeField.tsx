import { DownloadOutlined } from '@ant-design/icons';
import { App, Button, Form, Space, Spin, Typography } from 'antd';
import axios from 'axios';
import { useCallback, useEffect, useRef, useState } from 'react';
import { transcribeMeetingAudio, summarizeMeetingTranscript } from '@/features/approvals/api/aiTranscribeApi';
import { formatApprovalAttachmentBytes } from '@/features/approvals/api/approvalAttachmentsApi';
import type { FormFieldSchema } from '@/features/approvals/lib/approvalFormSchema';

export type ApprovalAiTranscribeFieldProps = {
  field: FormFieldSchema;
  onPendingAudioBlobChange: (blob: Blob | null) => void;
};

/** Web Speech API `lang` (ISO-639-1 → BCP 47) */
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

function pickRecorderMime(): string | null {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  for (const m of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m;
  }
  return null;
}

function mergeContent(
  form: ReturnType<typeof Form.useFormInstance>,
  patch: Record<string, unknown>,
): void {
  const prev = (form.getFieldValue('content') ?? {}) as Record<string, unknown>;
  form.setFieldsValue({ content: { ...prev, ...patch } });
}

function transcribeErrorMessage(status: number, fallback: string): string {
  if (status === 413) {
    return '녹음 시간이 너무 깁니다 (약 30분 이상). 짧게 녹음 후 다시 시도해 주세요.';
  }
  if (status === 422) {
    return '음성에서 텍스트를 추출하지 못했어요. 마이크 위치와 주변 소음을 확인해 주세요.';
  }
  if (status === 502) {
    return '회의록 AI 정리 서버에 일시적인 오류가 있습니다. 원문은 유지되니, 아래에서 회의록만 다시 받아 보세요.';
  }
  return fallback;
}

export function ApprovalAiTranscribeField({ field, onPendingAudioBlobChange }: ApprovalAiTranscribeFieldProps) {
  const { message } = App.useApp();
  const form = Form.useFormInstance();
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  /** 녹음 세션 중에만 true. onend에서 재시작할지 판별 */
  const wantLiveCaptionRef = useRef(false);
  const recognitionRef = useRef<WebSpeechRecognition | null>(null);
  const liveCaptionFinalRef = useRef('');

  const [recording, setRecording] = useState(false);
  const [liveCaptionMode, setLiveCaptionMode] = useState<'off' | 'live' | 'unsupported'>('off');
  const [phase, setPhase] = useState<'idle' | 'transcribe' | 'resummarize'>('idle');
  /** 직전 녹음 종료 시점의 webm — 다시 받기 전까지 다운로드 가능 */
  const [lastRecordingDownload, setLastRecordingDownload] = useState<{
    blob: Blob;
    fileName: string;
  } | null>(null);

  const cfg = field.type === 'ai_transcribe' ? field.config : undefined;
  const lang = (cfg?.language ?? 'ko').trim() || 'ko';

  const stopLiveSpeech = useCallback(() => {
    wantLiveCaptionRef.current = false;
    const r = recognitionRef.current;
    recognitionRef.current = null;
    if (!r) return;
    try {
      r.onend = null;
      r.onresult = null;
      r.onerror = null;
      r.stop();
    } catch {
      try {
        r.abort?.();
      } catch {
        // ignore
      }
    }
  }, []);

  const stopStream = useCallback(() => {
    const s = streamRef.current;
    if (s) {
      for (const t of s.getTracks()) {
        try {
          t.stop();
        } catch {
          // ignore
        }
      }
    }
    streamRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      stopLiveSpeech();
      stopStream();
      recorderRef.current = null;
      abortRef.current?.abort();
    };
  }, [stopLiveSpeech, stopStream]);

  const cancelInFlight = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase('idle');
  };

  const startLiveSpeechIfSupported = useCallback(
    (fillTranscript: string, fillSummary: string) => {
      const Ctor = getSpeechRecognitionCtor();
      if (!Ctor) {
        setLiveCaptionMode('unsupported');
        void message.info(
          '이 브라우저에서는 실시간 자막(Web Speech API)을 쓸 수 없습니다. 녹음 종료 후 AI가 원문을 채웁니다.',
        );
        return;
      }
      liveCaptionFinalRef.current = '';
      mergeContent(form, { [fillTranscript]: '', [fillSummary]: '' });
      const r = new Ctor();
      recognitionRef.current = r;
      r.continuous = true;
      r.interimResults = true;
      r.lang = speechRecognitionLang(lang);
      wantLiveCaptionRef.current = true;

      r.onresult = (event: SpeechRecognitionEvent) => {
        let deltaFinal = '';
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const row = event.results[i];
          if (!row) continue;
          const piece = row?.[0]?.transcript ?? '';
          if (row.isFinal) deltaFinal += piece;
          else interim += piece;
        }
        if (deltaFinal) {
          liveCaptionFinalRef.current += deltaFinal + (deltaFinal.endsWith(' ') ? '' : ' ');
        }
        const preview = `${liveCaptionFinalRef.current}${interim}`.trimEnd();
        mergeContent(form, { [fillTranscript]: preview });
      };

      r.onerror = (ev: SpeechRecognitionErrorEvent) => {
        if (ev.error === 'not-allowed') {
          void message.warning('음성 인식(실시간 자막) 권한이 거부되었습니다. 녹음만 계속됩니다.');
        }
        if (ev.error === 'no-speech' || ev.error === 'aborted') return;
      };

      r.onend = () => {
        if (!wantLiveCaptionRef.current || recognitionRef.current !== r) return;
        try {
          r.start();
        } catch {
          // 세션 종료 직후 등 — 무시
        }
      };

      try {
        r.start();
        setLiveCaptionMode('live');
      } catch {
        setLiveCaptionMode('unsupported');
        recognitionRef.current = null;
        void message.info('실시간 자막을 시작하지 못했습니다. 녹음 종료 후 AI 받아쓰기만 사용됩니다.');
      }
    },
    [form, lang, message],
  );

  const startRecording = async () => {
    if (!cfg?.fillTranscript || !cfg.fillSummary) {
      message.error('양식 설정(fillTranscript, fillSummary)이 없어 녹음을 시작할 수 없습니다.');
      return;
    }
    const mime = pickRecorderMime();
    if (!mime) {
      message.error('이 브라우저에서는 녹음 형식(webm 등)을 지원하지 않습니다.');
      return;
    }
    cancelInFlight();
    setLiveCaptionMode('off');
    setLastRecordingDownload(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const rec = new MediaRecorder(stream, { mimeType: mime });
      recorderRef.current = rec;
      rec.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      rec.onerror = () => {
        message.error('녹음 중 오류가 발생했습니다.');
        setRecording(false);
        stopLiveSpeech();
        stopStream();
      };
      rec.start(1000);
      setRecording(true);
      startLiveSpeechIfSupported(cfg.fillTranscript, cfg.fillSummary);
    } catch {
      message.warning('마이크 권한이 필요합니다. 브라우저 설정에서 마이크를 허용한 뒤 다시 시도해 주세요.');
      stopLiveSpeech();
      stopStream();
      setRecording(false);
      setLiveCaptionMode('off');
    }
  };

  const finishRecordingAndTranscribe = async () => {
    const rec = recorderRef.current;
    if (!rec || rec.state === 'inactive') {
      setRecording(false);
      stopLiveSpeech();
      setLiveCaptionMode('off');
      stopStream();
      return;
    }
    if (!cfg?.fillTranscript || !cfg.fillSummary) return;

    wantLiveCaptionRef.current = false;
    stopLiveSpeech();
    setLiveCaptionMode('off');

    const done = new Promise<Blob>((resolve, reject) => {
      rec.onstop = () => {
        try {
          const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
          resolve(blob);
        } catch (e) {
          reject(e);
        }
      };
    });
    try {
      rec.stop();
    } catch {
      setRecording(false);
      stopStream();
      return;
    }
    setRecording(false);
    stopStream();
    recorderRef.current = null;

    let audioBlob: Blob;
    try {
      audioBlob = await done;
    } catch {
      message.error('녹음 데이터를 만들지 못했습니다.');
      return;
    }
    if (!audioBlob.size) {
      message.warning('녹음된 음성이 없습니다.');
      onPendingAudioBlobChange(null);
      setLastRecordingDownload(null);
      return;
    }

    const maxBytes = 25 * 1024 * 1024;
    if (audioBlob.size > maxBytes) {
      message.error('녹음 파일이 25MB를 넘습니다. 더 짧게 녹음해 주세요.');
      onPendingAudioBlobChange(null);
      setLastRecordingDownload(null);
      return;
    }

    const downloadName = `meeting_${Date.now()}.webm`;
    setLastRecordingDownload({ blob: audioBlob, fileName: downloadName });

    onPendingAudioBlobChange(cfg.attachAudio === true ? audioBlob : null);

    const ac = new AbortController();
    abortRef.current = ac;
    setPhase('transcribe');
    try {
      const { transcript, summary } = await transcribeMeetingAudio(audioBlob, lang, ac.signal);
      mergeContent(form, {
        [cfg.fillTranscript]: transcript,
        [cfg.fillSummary]: summary,
      });
      message.success('받아쓰기와 회의록 초안을 채웠습니다. 필요하면 수정한 뒤 저장하세요.');
    } catch (e) {
      if (axios.isCancel(e) || ac.signal.aborted) {
        message.info('받아쓰기를 취소했습니다.');
        onPendingAudioBlobChange(null);
      } else {
        const status = (e as Error & { status?: number }).status ?? 0;
        const msg = (e as Error).message;
        message.error(transcribeErrorMessage(status, msg || '받아쓰기에 실패했습니다.'));
      }
    } finally {
      abortRef.current = null;
      setPhase('idle');
    }
  };

  const downloadLastRecording = () => {
    if (!lastRecordingDownload) return;
    const { blob, fileName } = lastRecordingDownload;
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const resummarize = async () => {
    if (!cfg?.fillTranscript || !cfg.fillSummary) return;
    const content = (form.getFieldValue('content') ?? {}) as Record<string, unknown>;
    const raw = content[cfg.fillTranscript];
    const transcript = typeof raw === 'string' ? raw.trim() : '';
    if (!transcript) {
      message.warning('원문 받아쓰기 필드에 텍스트를 입력한 뒤 다시 시도해 주세요.');
      return;
    }
    cancelInFlight();
    const ac = new AbortController();
    abortRef.current = ac;
    setPhase('resummarize');
    try {
      const { summary } = await summarizeMeetingTranscript(transcript, ac.signal);
      mergeContent(form, { [cfg.fillSummary]: summary });
      message.success('회의록을 다시 정리했습니다.');
    } catch (e) {
      if (axios.isCancel(e) || ac.signal.aborted) {
        message.info('요청을 취소했습니다.');
      } else {
        const status = (e as Error & { status?: number }).status ?? 0;
        message.error(transcribeErrorMessage(status, (e as Error).message || '정리에 실패했습니다.'));
      }
    } finally {
      abortRef.current = null;
      setPhase('idle');
    }
  };

  if (field.type !== 'ai_transcribe') return null;

  if (!cfg?.fillTranscript || !cfg.fillSummary) {
    return (
      <Typography.Text type="danger">
        녹음 받아쓰기 필드에 fillTranscript / fillSummary 설정이 필요합니다.
      </Typography.Text>
    );
  }

  const busy = phase !== 'idle';
  const phaseLabel =
    phase === 'transcribe'
      ? '받아쓰기 및 회의록 정리 중입니다. 10초 이상 걸릴 수 있습니다.'
      : phase === 'resummarize'
        ? '회의록 다시 정리 중...'
        : '';

  return (
    <div className="tw-flex tw-flex-col tw-gap-2">
      <Space wrap>
        {!recording ? (
          <Button type="primary" onClick={() => void startRecording()} disabled={busy}>
            녹음 시작
          </Button>
        ) : (
          <Button danger onClick={() => void finishRecordingAndTranscribe()} disabled={busy}>
            녹음 종료 및 받아쓰기
          </Button>
        )}
        <Button onClick={() => void resummarize()} disabled={recording || busy} loading={phase === 'resummarize'}>
          AI 회의록 다시 받기
        </Button>
        {phase === 'transcribe' || phase === 'resummarize' ? (
          <Button onClick={cancelInFlight}>취소</Button>
        ) : null}
        {lastRecordingDownload && !recording ? (
          <Button icon={<DownloadOutlined />} onClick={downloadLastRecording}>
            녹음 파일 다운로드
          </Button>
        ) : null}
      </Space>
      {lastRecordingDownload && !recording ? (
        <Typography.Text type="secondary" className="tw-text-xs">
          {lastRecordingDownload.fileName} ({formatApprovalAttachmentBytes(lastRecordingDownload.blob.size)})
        </Typography.Text>
      ) : null}
      {recording && liveCaptionMode === 'live' ? (
        <Typography.Text type="secondary" className="tw-text-xs">
          브라우저 실시간 자막이 원문 칸에 임시로 표시됩니다. 정확한 내용은 종료 후 AI가 다시 채웁니다. Chrome·Edge 사용을 권장합니다.
        </Typography.Text>
      ) : null}
      {recording && liveCaptionMode === 'unsupported' ? (
        <Typography.Text type="secondary" className="tw-text-xs">
          실시간 자막을 사용할 수 없습니다. 녹음 종료 후 Whisper 기반 AI가 원문과 회의록을 채웁니다.
        </Typography.Text>
      ) : null}
      {cfg.attachAudio ? (
        <Typography.Text type="secondary" className="tw-text-xs">
          저장 시 녹음 파일(webm)이 결재 첨부로 함께 올라갑니다. 서버에서 webm이 허용되기 전에는 첨부만 실패할 수 있습니다.
        </Typography.Text>
      ) : null}
      {busy ? (
        <Space>
          <Spin size="small" />
          <Typography.Text type="secondary">{phaseLabel}</Typography.Text>
        </Space>
      ) : null}
    </div>
  );
}
