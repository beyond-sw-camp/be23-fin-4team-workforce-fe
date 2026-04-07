import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Card, Form, Input, Radio, Space, Typography } from 'antd';
import { Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { useAuth } from '@/features/auth/useAuth';
import type { UpdateMyInfoPayload, YnFlag } from '@/features/member/api/memberApi';
import { memberApi } from '@/features/member/api/memberApi';
import { AddressSearchField } from '@/shared/ui/AddressSearchField';
import { AppButton } from '@/shared/ui/AppButton';

type FormValues = {
  phoneNumber: string;
  phonePublicYn: YnFlag;
  emergencyContact: string;
  address: string;
  detailAddress: string;
  addressPublicYn: YnFlag;
  bank: string;
  bankAccount: string;
  extensionNumber: string;
  telNumber: string;
};

const FORM_KEYS: (keyof FormValues)[] = [
  'phoneNumber',
  'phonePublicYn',
  'emergencyContact',
  'address',
  'detailAddress',
  'addressPublicYn',
  'bank',
  'bankAccount',
  'extensionNumber',
  'telNumber',
];

function memberToFormValues(member: Awaited<ReturnType<typeof memberApi.detail>>): FormValues {
  return {
    phoneNumber: member.phoneNumber ?? '',
    phonePublicYn: member.phonePublicYn ?? 'YES',
    emergencyContact: member.emergencyContact ?? '',
    address: member.address ?? '',
    detailAddress: member.detailAddress ?? '',
    addressPublicYn: member.addressPublicYn ?? 'YES',
    bank: member.bank ?? '',
    bankAccount: member.bankAccount ?? '',
    extensionNumber: member.extensionNumber ?? '',
    telNumber: member.telNumber ?? '',
  };
}

function buildUpdatePayload(values: FormValues, initial: FormValues): UpdateMyInfoPayload {
  const payload: UpdateMyInfoPayload = {};
  /** 폼 기본값이 YES라 초기·현재가 같아도 null을 보내면 DB가 갱신되지 않는 경우가 있어 항상 명시 전송 */
  payload.phonePublicYn = values.phonePublicYn;
  payload.addressPublicYn = values.addressPublicYn;

  const otherKeys = FORM_KEYS.filter((k) => k !== 'phonePublicYn' && k !== 'addressPublicYn');
  for (const k of otherKeys) {
    const next = values[k];
    const prev = initial[k];
    if (next === prev) {
      (payload as Record<string, unknown>)[k] = null;
      continue;
    }
    if (typeof next === 'string') {
      (payload as Record<string, unknown>)[k] = next.trim();
    } else {
      (payload as Record<string, unknown>)[k] = next;
    }
  }
  return payload;
}

export function MyProfileEditPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { user, refreshAuth } = useAuth();
  const navigate = useNavigate();
  const [form] = Form.useForm<FormValues>();
  const id = user?.id?.trim();
  const initialRef = useRef<FormValues | null>(null);

  const { data: member, isLoading } = useQuery({
    queryKey: ['member', 'detail', id],
    queryFn: () => memberApi.detail(id!),
    enabled: Boolean(id),
  });

  useEffect(() => {
    if (!member) return;
    const fv = memberToFormValues(member);
    form.setFieldsValue(fv);
    initialRef.current = fv;
  }, [member, form]);

  const updateM = useMutation({
    mutationFn: (payload: UpdateMyInfoPayload) => memberApi.updateMe(payload),
    onSuccess: async () => {
      message.success('내 정보가 저장되었습니다.');
      await queryClient.invalidateQueries({ queryKey: ['member', 'detail', id] });
      await refreshAuth();
      await navigate({ to: '/app/me' });
    },
    onError: (e: Error) => message.error(e.message || '저장에 실패했습니다.'),
  });

  if (!id) {
    return (
      <Typography.Text type="secondary">로그인 정보를 확인할 수 없습니다.</Typography.Text>
    );
  }

  if (isLoading || !member) {
    return <Typography.Text type="secondary">불러오는 중…</Typography.Text>;
  }

  const onFinish = (values: FormValues) => {
    const initial = initialRef.current ?? memberToFormValues(member);
    const payload = buildUpdatePayload(values, initial);
    void updateM.mutateAsync(payload);
  };

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div>
        <Link
          to="/app/me"
          className="tw-mb-2 tw-inline-block tw-text-sm tw-text-[#2563EB] tw-no-underline hover:tw-underline"
        >
          ← 마이페이지
        </Link>
        <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
          내 정보 수정
        </Typography.Title>
        <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
          PUT /member/my-info — Authorization·<code className="tw-text-xs">X-User-UUID</code> 는 클라이언트에서 자동
          설정됩니다.
        </Typography.Paragraph>
        <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-xs">
          비밀번호 정책: 영문·숫자·특수문자 조합 8자 이상 (비밀번호 변경 화면에서 적용)
        </Typography.Paragraph>
      </div>

      <Card className="tw-border-slate-200/80 tw-shadow-sm">
        <Alert
          type="info"
          showIcon
          className="tw-mb-5 tw-rounded-xl"
          message="저장 방식·공개 범위"
          description={
            <ul className="tw-mb-0 tw-list-inside tw-list-disc tw-space-y-1 tw-text-sm tw-text-slate-600">
              <li>
                수정하지 않을 필드는 <code className="tw-text-xs">null</code> 로 보내면 기존 값이 유지됩니다.
              </li>
              <li>
                <strong>연락처 공개</strong>: YES — 다른 직원이 내 연락처를 볼 수 있음 / NO — 본인만 볼 수 있음
              </li>
              <li>
                <strong>주소 공개</strong>: YES — 다른 직원이 내 주소를 볼 수 있음 / NO — 본인만 볼 수 있음
              </li>
              <li>
                <strong>비상연락처·은행·계좌</strong>: 본인 조회 시에만 노출되는 민감 정보이며, 다른 직원 프로필 조회 시에는
                노출되지 않습니다.
              </li>
            </ul>
          }
        />
        <Form<FormValues> form={form} layout="vertical" onFinish={onFinish}>
          <Typography.Text strong className="tw-mb-2 tw-block">
            연락처
          </Typography.Text>
          <Form.Item name="phoneNumber" label="휴대폰 번호">
            <Input placeholder="010-0000-0000" />
          </Form.Item>
          <Form.Item
            name="phonePublicYn"
            label="연락처 공개 (phonePublicYn)"
            extra={
              <Typography.Text type="secondary" className="tw-text-xs">
                YES: 다른 직원에게 연락처 표시 · NO: 본인만 조회 가능
              </Typography.Text>
            }
          >
            <Radio.Group>
              <Radio value="YES">YES · 공개</Radio>
              <Radio value="NO">NO · 본인만</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item name="extensionNumber" label="내선번호">
            <Input placeholder="1234" />
          </Form.Item>
          <Form.Item name="telNumber" label="직통번호">
            <Input placeholder="02-0000-0000" />
          </Form.Item>
          <Form.Item
            name="emergencyContact"
            label="비상연락처"
            extra={
              <Typography.Text type="secondary" className="tw-text-xs">
                본인 마이페이지에서만 노출 · 타인 프로필 조회 시 비노출
              </Typography.Text>
            }
          >
            <Input placeholder="비상 시 연락 가능한 번호" />
          </Form.Item>

          <Typography.Text strong className="tw-mb-2 tw-mt-4 tw-block">
            주소
          </Typography.Text>
          <Form.Item name="address" label="주소" rules={[{ required: true, message: '주소를 입력해 주세요.' }]}>
            <AddressSearchField />
          </Form.Item>
          <Form.Item
            name="detailAddress"
            label="상세 주소"
            rules={[{ required: true, message: '상세 주소를 입력해 주세요.' }]}
            extra={
              <Typography.Text type="secondary" className="tw-text-xs">
                건물 동·층·호수 등 (예: 6층, 301호)
              </Typography.Text>
            }
          >
            <Input size="large" placeholder="예: 6층, 301호" />
          </Form.Item>
          <Form.Item
            name="addressPublicYn"
            label="주소 공개 (addressPublicYn)"
            extra={
              <Typography.Text type="secondary" className="tw-text-xs">
                YES: 다른 직원에게 주소 표시 · NO: 본인만 조회 가능
              </Typography.Text>
            }
          >
            <Radio.Group>
              <Radio value="YES">YES · 공개</Radio>
              <Radio value="NO">NO · 본인만</Radio>
            </Radio.Group>
          </Form.Item>

          <Typography.Text strong className="tw-mb-2 tw-mt-4 tw-block">
            급여 계좌
          </Typography.Text>
          <Typography.Paragraph type="secondary" className="!tw-mb-3 !tw-text-xs">
            은행·계좌번호는 본인 조회 시에만 노출됩니다. 다른 직원이 내 프로필을 볼 때는 표시되지 않습니다.
          </Typography.Paragraph>
          <Form.Item name="bank" label="은행 (bank)">
            <Input placeholder="은행명" />
          </Form.Item>
          <Form.Item name="bankAccount" label="계좌번호 (bankAccount)">
            <Input placeholder="계좌번호" />
          </Form.Item>

          <Form.Item>
            <AppButton htmlType="submit" loading={updateM.isPending}>
              저장
            </AppButton>
          </Form.Item>
        </Form>
      </Card>
    </Space>
  );
}
