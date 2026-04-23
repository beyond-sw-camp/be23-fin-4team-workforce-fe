import { UploadOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Form, Input, Modal, Select, Typography, Upload } from 'antd';
import { useEffect, useState } from 'react';
import { esgApi } from '@/features/esg/api/esgApi';
import { esgCardLinkButtonClass, esgOutlinedAccentClass, esgPrimaryButtonClass } from '@/features/esg/esgUiTokens';

const ACCEPT = '.pdf,.doc,.docx,.txt,.jpg,.jpeg,.png';
const MAX_BYTES = 10 * 1024 * 1024;

const CAT_KO: Record<string, string> = { E: '환경', S: '사회', G: '지배구조' };

type Props = {
  open: boolean;
  onClose: () => void;
  /** 제목 클릭 등으로 열 때 미리 선택할 활동 양식 ID */
  initialSubjectId?: string | null;
};

export function EsgActivitySubmitModal({ open, onClose, initialSubjectId }: Props) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [form] = Form.useForm<{ subjectId: string; verificationContent?: string }>();

  const {
    data: subjects = [],
    isLoading: subLoading,
    isError: subError,
    error: subErrorObj,
    refetch: refetchSubjects,
  } = useQuery({
    queryKey: ['esg', 'subjects'],
    queryFn: () => esgApi.listSubjects(),
    enabled: open,
  });

  useEffect(() => {
    if (!open) {
      form.resetFields();
      setFile(null);
    }
  }, [open, form]);

  useEffect(() => {
    if (!open) return;
    const id = initialSubjectId?.trim();
    if (!id || !subjects.some((s) => s.subjectId === id)) return;
    form.setFieldValue('subjectId', id);
  }, [open, initialSubjectId, subjects, form]);

  const submitM = useMutation({
    mutationFn: async () => {
      const v = await form.validateFields();
      const text = v.verificationContent?.trim() ?? '';
      if (!text && !file) {
        throw new Error('증빙 설명 또는 첨부 파일 중 하나는 입력해 주세요.');
      }
      return esgApi.submitActivity({
        subjectId: v.subjectId,
        verificationContent: text || undefined,
        file,
      });
    },
    onSuccess: () => {
      message.success('활동이 제출되었습니다.');
      form.resetFields();
      setFile(null);
      void qc.invalidateQueries({ queryKey: ['esg', 'activities', 'my'] });
      onClose();
    },
    onError: (e: Error) => message.error(e.message || '제출에 실패했습니다.'),
  });

  return (
    <>
      {!open ? <Form form={form} preserve={false} className="tw-hidden" aria-hidden /> : null}
      <Modal
        title="활동 제출"
        open={open}
        onCancel={onClose}
        width={520}
        destroyOnHidden
        footer={
          <div className="tw-flex tw-justify-end tw-gap-2">
            <Button onClick={onClose}>취소</Button>
            <Button
              type="primary"
              className={esgPrimaryButtonClass}
              loading={submitM.isPending}
              onClick={() => void submitM.mutate()}
            >
              제출
            </Button>
          </div>
        }
      >
        {subError && (
        <Alert
          type="error"
          showIcon
          className="tw-mb-4"
          message="활동 양식 목록을 불러오지 못했습니다."
          description={subErrorObj instanceof Error ? subErrorObj.message : String(subErrorObj)}
          action={
            <Button size="small" type="link" className={esgCardLinkButtonClass} onClick={() => void refetchSubjects()}>
              다시 시도
            </Button>
          }
        />
        )}
        <Form form={form} layout="vertical" className="tw-max-w-full">
        <Form.Item
          name="subjectId"
          label="활동 양식"
          rules={[
            {
              validator: (_, value) => {
                if (value != null && String(value).trim() !== '') {
                  return Promise.resolve();
                }
                return Promise.reject(new Error('활동 양식을 선택해 주세요.'));
              },
            },
          ]}
        >
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            loading={subLoading}
            placeholder="활동 양식 선택"
            options={subjects
              .filter((s) => s.subjectId.trim() !== '')
              .map((s) => ({
                value: s.subjectId,
                label: `${s.title || '(제목 없음)'} (${CAT_KO[s.category] ?? s.category}, ${s.defaultPoints}P)`,
              }))}
          />
        </Form.Item>
        <Form.Item
          name="verificationContent"
          label="증빙 설명"
          extra="증빙 설명과 첨부 파일 중 하나 이상 필수입니다."
        >
          <Input.TextArea rows={3} placeholder="활동 내용을 간단히 적어 주세요." maxLength={2000} />
        </Form.Item>
        <Form.Item label="첨부 파일 (선택)">
          <Upload
            accept={ACCEPT}
            maxCount={1}
            beforeUpload={(f) => {
              if (f.size > MAX_BYTES) {
                message.error('10MB 이하만 업로드할 수 있습니다.');
                return Upload.LIST_IGNORE;
              }
              setFile(f);
              return false;
            }}
            onRemove={() => setFile(null)}
          >
            <Button icon={<UploadOutlined />} className={esgOutlinedAccentClass}>
              파일 선택
            </Button>
          </Upload>
          <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-2 !tw-text-xs">
            pdf, docx, txt, jpg, png · 최대 10MB
          </Typography.Paragraph>
        </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
