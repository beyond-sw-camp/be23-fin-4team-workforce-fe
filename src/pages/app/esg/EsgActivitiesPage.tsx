import { UploadOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Form, Input, Select, Space, Table, Typography, Upload } from 'antd';
import { useMemo, useState } from 'react';
import type { EsgActivity } from '@/features/esg/api/esgApi';
import { esgApi } from '@/features/esg/api/esgApi';
import {
  formatActivityDateTime,
  formatActivityStatusKo,
  pickActivityId,
  resolveActivityCategoryDisplay,
  resolveActivityFileUrl,
  resolveActivitySubjectTitle,
  resolveEarnedPointsDisplay,
  resolveRejectReasonDisplay,
  resolveVerificationContent,
} from '@/features/esg/esgActivityDisplay';

const ACCEPT = '.pdf,.doc,.docx,.txt,.jpg,.jpeg,.png';
const MAX_BYTES = 10 * 1024 * 1024;

const CAT_KO: Record<string, string> = { E: '환경', S: '사회', G: '지배구조' };

export function EsgActivitiesPage() {
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
  });

  const { data: mine = [], isLoading: mineLoading } = useQuery({
    queryKey: ['esg', 'activities', 'my'],
    queryFn: () => esgApi.listMyActivities(),
  });

  const subjectTitleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of subjects) {
      if (s.subjectId.trim() !== '') {
        m.set(s.subjectId, s.title || '(제목 없음)');
      }
    }
    return m;
  }, [subjects]);

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
    },
    onError: (e: Error) => message.error(e.message || '제출에 실패했습니다.'),
  });

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
        ESG 활동 제출
      </Typography.Title>

      <Card className="tw-border-slate-200/80 tw-shadow-sm" title="새 활동">
        {subError && (
          <Alert
            type="error"
            showIcon
            className="tw-mb-4"
            message="활동 양식 목록을 불러오지 못했습니다."
            description={subErrorObj instanceof Error ? subErrorObj.message : String(subErrorObj)}
            action={
              <Button size="small" onClick={() => void refetchSubjects()}>
                다시 시도
              </Button>
            }
          />
        )}
        <Form form={form} layout="vertical" className="tw-max-w-xl">
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
              <Button icon={<UploadOutlined />}>파일 선택</Button>
            </Upload>
            <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-2 !tw-text-xs">
              pdf, docx, txt, jpg, png · 최대 10MB
            </Typography.Paragraph>
          </Form.Item>
          <Button type="primary" loading={submitM.isPending} onClick={() => void submitM.mutate()}>
            제출
          </Button>
        </Form>
      </Card>

      <Card className="tw-border-slate-200/80 tw-shadow-sm" title="내 활동">
        <Table<EsgActivity>
          rowKey={(r) => pickActivityId(r) || JSON.stringify(r)}
          loading={mineLoading}
          dataSource={mine}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 1480 }}
          columns={[
            {
              title: '상태',
              dataIndex: 'status',
              width: 100,
              render: (_: unknown, row) => formatActivityStatusKo((row as EsgActivity).status),
            },
            {
              title: 'ESG 분류',
              key: 'category',
              width: 200,
              ellipsis: true,
              render: (_, row) => resolveActivityCategoryDisplay(row),
            },
            {
              title: '활동 양식',
              key: 'subject',
              width: 160,
              ellipsis: true,
              render: (_, row) => resolveActivitySubjectTitle(row, subjectTitleById),
            },
            {
              title: '증빙',
              key: 'verification',
              width: 220,
              ellipsis: true,
              render: (_, row) => resolveVerificationContent(row),
            },
            {
              title: '첨부',
              key: 'file',
              width: 72,
              render: (_, row) => {
                const url = resolveActivityFileUrl(row);
                if (!url) {
                  return <Typography.Text type="secondary">—</Typography.Text>;
                }
                return (
                  <Typography.Link href={url} target="_blank" rel="noopener noreferrer">
                    열기
                  </Typography.Link>
                );
              },
            },
            {
              title: '적립',
              key: 'points',
              width: 72,
              render: (_, row) => resolveEarnedPointsDisplay(row),
            },
            {
              title: '반려 사유',
              key: 'reject',
              width: 160,
              ellipsis: true,
              render: (_, row) => resolveRejectReasonDisplay(row),
            },
            {
              title: '제출일',
              key: 'createdAt',
              width: 140,
              render: (_, row) => formatActivityDateTime((row as EsgActivity).createdAt),
            },
            {
              title: '승인일',
              key: 'approvedAt',
              width: 140,
              render: (_, row) => formatActivityDateTime((row as EsgActivity).approvedAt),
            },
          ]}
        />
      </Card>
    </Space>
  );
}
