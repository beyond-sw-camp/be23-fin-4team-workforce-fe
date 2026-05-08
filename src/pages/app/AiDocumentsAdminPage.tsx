import {
  DeleteOutlined,
  InboxOutlined } from '@ant-design/icons';
import { useMutation,
  useQuery,
  useQueryClient } from '@tanstack/react-query';
import { App,
  Card,
  Popconfirm,
  Space,
  Spin,
  Tooltip,
  Upload,
} from 'antd';
import type { UploadProps } from 'antd';
import dayjs from 'dayjs';
import { aiApi } from '@/features/ai/api/aiApi';
import { AppWorkspacePageTitle } from '@/shared/ui/AppWorkspacePageTitle';

import { AppDataTable } from '@/shared/ui/AppDataTable';

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT_EXT = /\.(pdf|docx|txt)$/i;

function validateFile(file: File): string | null {
  if (!ACCEPT_EXT.test(file.name)) {
    return '지원 형식은 pdf, docx, txt 입니다.';
  }
  if (file.size > MAX_BYTES) {
    return '파일 크기는 10MB 이하여야 합니다.';
  }
  return null;
}

export function AiDocumentsAdminPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['ai', 'documents'],
    queryFn: () => aiApi.listDocuments(),
  });

  const uploadM = useMutation({
    mutationFn: (file: File) => aiApi.uploadDocument(file),
    onSuccess: () => {
      message.success('문서가 업로드되었습니다.');
      void qc.invalidateQueries({ queryKey: ['ai', 'documents'] });
    },
    onError: (e: Error) => message.error(e.message || '업로드에 실패했습니다.'),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => aiApi.deleteDocument(id),
    onSuccess: () => {
      message.success('문서가 삭제되었습니다.');
      void qc.invalidateQueries({ queryKey: ['ai', 'documents'] });
    },
    onError: (e: Error) => message.error(e.message || '삭제에 실패했습니다.'),
  });

  const uploadProps: UploadProps = {
    name: 'file',
    multiple: false,
    showUploadList: false,
    disabled: uploadM.isPending,
    beforeUpload: (file) => {
      const err = validateFile(file as File);
      if (err) {
        message.warning(err);
        return false;
      }
      uploadM.mutate(file as File);
      return false;
    },
  };

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <AppWorkspacePageTitle
        className="!tw-mb-0"
        eyebrow="HR"
        title="HR 정책 문서 (AI)"
        subtitle="pdf, docx, txt만 업로드 가능하며 최대 10MB입니다. 업로드된 문서는 AI 비서 답변에 반영됩니다."
      />

      <Card className="tw-border-slate-200/80 tw-shadow-sm" title="문서 업로드">
        <Upload.Dragger {...uploadProps} accept=".pdf,.docx,.txt">
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">클릭하거나 파일을 여기로 끌어다 놓으세요</p>
          <p className="ant-upload-hint">pdf · docx · txt, 최대 10MB</p>
        </Upload.Dragger>
      </Card>

      <Card className="tw-border-slate-200/80 tw-shadow-sm" title="업로드된 문서">
        <Spin spinning={isLoading}>
          <AppDataTable
            size="small"
            rowKey="id"
            pagination={false}
            locale={{ emptyText: '등록된 문서가 없습니다.' }}
            dataSource={docs}
            columns={[
              {
                title: '문서명',
                dataIndex: 'documentName',
                key: 'documentName',
              },
              {
                title: '업로드 일시',
                dataIndex: 'createdAt',
                key: 'createdAt',
                width: 200,
                render: (v: string) => {
                  const d = dayjs(v);
                  return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : v;
                },
              },
              {
                title: '관리',
                key: 'actions',
                width: 100,
                render: (_: unknown, row: { id: string }) => (
                  <Popconfirm
                    title="이 문서를 삭제할까요?"
                    okText="삭제"
                    cancelText="취소"
                    okButtonProps={{ danger: true, loading: deleteM.isPending }}
                    onConfirm={() => deleteM.mutate(row.id)}
                  >
                    <Tooltip title="삭제">
                      <button
                        type="button"
                        aria-label="AI 문서 삭제"
                        className="tw-inline-flex tw-h-7 tw-w-7 tw-items-center tw-justify-center tw-rounded-lg tw-border-0 tw-bg-transparent tw-text-red-600 hover:tw-bg-red-50"
                      >
                        <DeleteOutlined />
                      </button>
                    </Tooltip>
                  </Popconfirm>
                ),
              },
            ]}
          />
        </Spin>
      </Card>
    </Space>
  );
}
