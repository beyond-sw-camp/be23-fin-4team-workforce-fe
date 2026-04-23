/**
 * /app/attendance/ip-whitelist — 회사 출퇴근 허용 IP 관리 (시스템 관리자)
 * 등록된 IP 대역에서만 출퇴근 처리 가능. 목록 비어있으면 검증 비활성.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import type { CompanyIpWhitelist } from '@/features/salary-service/types';

const QK = ['salary', 'company-ip-whitelist'] as const;

type FormValues = {
  cidr: string;
  label?: string;
};

/** CIDR 형식 검증: "a.b.c.d" 또는 "a.b.c.d/n" */
const CIDR_REGEX =
  /^((25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(25[0-5]|2[0-4]\d|[01]?\d?\d)(\/(3[0-2]|[12]?\d))?$/;

export function AdminCompanyIpWhitelistPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CompanyIpWhitelist | null>(null);
  const [form] = Form.useForm<FormValues>();

  // 현재 클라이언트 IP 탐지 (https://api.ipify.org)
  const [detectedIp, setDetectedIp] = useState<string | null>(null);
  const detectIp = async () => {
    try {
      const res = await fetch('https://api.ipify.org?format=json');
      if (!res.ok) throw new Error('IP 탐지 실패');
      const body = (await res.json()) as { ip?: string };
      if (body.ip) {
        setDetectedIp(body.ip);
        return body.ip;
      }
    } catch {
      message.error('현재 IP 탐지에 실패했습니다. 직접 입력하세요.');
    }
    return null;
  };

  const listQ = useQuery({
    queryKey: QK,
    queryFn: () => attendanceApi.companyIpWhitelist.list(),
  });

  const createM = useMutation({
    mutationFn: (v: FormValues) =>
      attendanceApi.companyIpWhitelist.create({
        cidr: v.cidr.trim(),
        label: v.label?.trim() || null,
      }),
    onSuccess: () => {
      message.success('허용 IP 가 등록되었습니다.');
      setOpen(false);
      form.resetFields();
      void qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e: Error) => message.error(e.message || '등록에 실패했습니다.'),
  });

  const updateM = useMutation({
    mutationFn: (input: { id: string; v: FormValues }) =>
      attendanceApi.companyIpWhitelist.update(input.id, {
        cidr: input.v.cidr.trim(),
        label: input.v.label?.trim() || null,
      }),
    onSuccess: () => {
      message.success('허용 IP 가 수정되었습니다.');
      setOpen(false);
      setEditing(null);
      form.resetFields();
      void qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e: Error) => message.error(e.message || '수정에 실패했습니다.'),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => attendanceApi.companyIpWhitelist.delete(id),
    onSuccess: () => {
      message.success('삭제되었습니다.');
      void qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e: Error) => message.error(e.message || '삭제에 실패했습니다.'),
  });

  const columns = useMemo<ColumnsType<CompanyIpWhitelist>>(
    () => [
      {
        title: 'CIDR',
        dataIndex: 'cidr',
        key: 'cidr',
        width: 200,
        render: (v: string) => (
          <Typography.Text className="tw-font-mono">{v}</Typography.Text>
        ),
      },
      {
        title: '라벨',
        dataIndex: 'label',
        key: 'label',
        render: (v: string | null) =>
          v ? <span>{v}</span> : <Typography.Text type="secondary">—</Typography.Text>,
      },
      {
        title: '등록일',
        dataIndex: 'createdAt',
        key: 'createdAt',
        width: 180,
        render: (v: string | null) => v ?? '—',
      },
      {
        title: '작업',
        key: 'actions',
        width: 140,
        render: (_, record) => (
          <Space>
            <Button
              size="small"
              onClick={() => {
                setEditing(record);
                setOpen(true);
                form.setFieldsValue({
                  cidr: record.cidr ?? '',
                  label: record.label ?? '',
                });
              }}
            >
              수정
            </Button>
            <Popconfirm
              title="삭제하시겠어요?"
              okText="삭제"
              cancelText="취소"
              onConfirm={() =>
                record.companyIpWhitelistId && deleteM.mutate(record.companyIpWhitelistId)
              }
            >
              <Button size="small" danger>
                삭제
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [deleteM, form],
  );

  const onSubmit = (v: FormValues) => {
    if (editing?.companyIpWhitelistId) {
      updateM.mutate({ id: editing.companyIpWhitelistId, v });
    } else {
      createM.mutate(v);
    }
  };

  const list = listQ.data ?? [];
  const isEmpty = list.length === 0;

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div className="tw-flex tw-flex-wrap tw-items-end tw-justify-between tw-gap-3">
        <div>
          <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
            출퇴근 허용 IP 관리
          </Typography.Title>
          <Typography.Text type="secondary" className="tw-text-xs">
            등록된 IP 대역(CIDR)에서 접속한 경우에만 출퇴근(clock-in/clock-out) 처리가 허용됩니다.
            목록이 비어있으면 검증이 비활성화되어 모든 IP 가 허용됩니다.
          </Typography.Text>
        </div>
        <Space>
          <Button
            type="primary"
            onClick={() => {
              setEditing(null);
              form.resetFields();
              setOpen(true);
            }}
          >
            허용 IP 추가
          </Button>
        </Space>
      </div>

      {isEmpty && !listQ.isLoading && (
        <Alert
          type="warning"
          showIcon
          message="출퇴근 IP 검증이 비활성 상태입니다."
          description="하나 이상의 IP 대역을 등록하면 등록된 범위 외 접속이 출근 처리 시 차단됩니다."
        />
      )}

      <Card className="tw-border-slate-200/80 tw-shadow-sm">
        <Table<CompanyIpWhitelist>
          rowKey={(r) => r.companyIpWhitelistId ?? `${r.cidr}`}
          loading={listQ.isLoading}
          dataSource={list}
          columns={columns}
          pagination={{ pageSize: 20 }}
          size="middle"
          locale={{ emptyText: '등록된 허용 IP 가 없습니다. "허용 IP 추가" 로 등록하세요.' }}
        />
      </Card>

      <Modal
        open={open}
        onCancel={() => {
          setOpen(false);
          setEditing(null);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        confirmLoading={createM.isPending || updateM.isPending}
        okText={editing ? '수정' : '등록'}
        cancelText="취소"
        title={editing ? '허용 IP 수정' : '허용 IP 추가'}
        destroyOnClose
        width={520}
      >
        <Form<FormValues> form={form} layout="vertical" onFinish={onSubmit}>
          <Form.Item
            label="CIDR (허용 IP 대역)"
            name="cidr"
            rules={[
              { required: true, message: 'CIDR 을 입력하세요.' },
              {
                validator: async (_, value) => {
                  if (!value) return;
                  if (!CIDR_REGEX.test(String(value))) {
                    return Promise.reject(
                      new Error('올바른 CIDR 형식이 아닙니다. 예: 192.168.1.0/24 또는 203.0.113.5'),
                    );
                  }
                },
              },
            ]}
            extra={
              <Space size={4}>
                <Typography.Text type="secondary" className="!tw-text-xs">
                  예: 192.168.1.0/24 (대역), 203.0.113.5 (단일 IP)
                </Typography.Text>
                {detectedIp && (
                  <Typography.Text type="secondary" className="!tw-text-xs">
                    · 현재 내 IP: <span className="tw-font-mono">{detectedIp}</span>
                  </Typography.Text>
                )}
              </Space>
            }
          >
            <Input
              placeholder="예: 192.168.1.0/24"
              addonAfter={
                <Typography.Link
                  onClick={async () => {
                    const ip = await detectIp();
                    if (ip) {
                      form.setFieldValue('cidr', `${ip}/32`);
                    }
                  }}
                  className="!tw-text-xs"
                >
                  내 IP 채우기
                </Typography.Link>
              }
            />
          </Form.Item>

          <Form.Item label="라벨 (선택)" name="label" extra="구분용 설명. 예: 본사 1층, 제2사옥">
            <Input maxLength={100} placeholder="예: 본사" />
          </Form.Item>

          <Alert
            type="info"
            showIcon
            className="!tw-mt-3"
            message="CIDR 형식 설명"
            description={
              <ul className="!tw-mb-0 tw-text-xs tw-pl-4">
                <li>
                  <span className="tw-font-mono">192.168.1.0/24</span> : 192.168.1.0 ~ 192.168.1.255 (256개)
                </li>
                <li>
                  <span className="tw-font-mono">203.0.113.5/32</span> 또는{' '}
                  <span className="tw-font-mono">203.0.113.5</span> : 단일 IP
                </li>
                <li>
                  <span className="tw-font-mono">10.0.0.0/8</span> : 사설 A 클래스 전체
                </li>
              </ul>
            }
          />
        </Form>
      </Modal>
    </Space>
  );
}

