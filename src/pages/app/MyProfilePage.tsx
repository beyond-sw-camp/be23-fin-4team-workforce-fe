import { EditOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Alert, Avatar, Button, Card, Descriptions, Space, Typography, Upload } from 'antd';
import { Link } from '@tanstack/react-router';
import { useAuth } from '@/features/auth/useAuth';
import { esgApi } from '@/features/esg/api/esgApi';
import { memberApi, normalizeYnFlag } from '@/features/member/api/memberApi';
import { EMPLOYMENT_TYPE_KO } from '@/app/locale/app-ko';
import { AppButton } from '@/shared/ui/AppButton';

const PROFILE_ACCEPT = '.jpg,.jpeg,.png,.gif,image/jpeg,image/png,image/gif';

function isAllowedProfileImage(file: File): boolean {
  const okType = ['image/jpeg', 'image/png', 'image/gif'].includes(file.type);
  const okName = /\.(jpe?g|png|gif)$/i.test(file.name);
  return okType || okName;
}

function displayText(v: string | null | undefined, emptyLabel = '—') {
  if (v == null || String(v).trim() === '') return emptyLabel;
  return v;
}

/** 연락처·주소 공개 여부 — 조회 화면에는 YES / NO 로 표시 */
function ynPublicLabel(v: unknown): string {
  const n = normalizeYnFlag(v);
  if (n === 'YES') return 'YES';
  if (n === 'NO') return 'NO';
  return '—';
}

export function MyProfilePage() {
  const { message } = App.useApp();
  const { user, refreshAuth } = useAuth();
  const queryClient = useQueryClient();
  const id = user?.id?.trim();

  const { data: member, isLoading } = useQuery({
    queryKey: ['member', 'detail', id],
    queryFn: () => memberApi.detail(id!),
    enabled: Boolean(id),
  });

  const { data: esgCfg } = useQuery({
    queryKey: ['esg', 'config'],
    queryFn: () => esgApi.getConfig(),
    staleTime: 60_000,
  });

  const esgEnabled = esgCfg?.esgEnabledYn === 'YES';

  const uploadM = useMutation({
    mutationFn: (file: File) => memberApi.uploadProfileImage(file),
    onSuccess: async () => {
      message.success('프로필 이미지가 업로드되었습니다.');
      await refreshAuth();
      await queryClient.invalidateQueries({ queryKey: ['member', 'detail', id] });
    },
    onError: (e: Error) => message.error(e.message || '업로드에 실패했습니다.'),
  });

  const deleteImgM = useMutation({
    mutationFn: () => memberApi.deleteProfileImage(),
    onSuccess: async () => {
      message.success('프로필 이미지가 삭제되었습니다.');
      await refreshAuth();
      await queryClient.invalidateQueries({ queryKey: ['member', 'detail', id] });
    },
    onError: (e: Error) => message.error(e.message || '삭제에 실패했습니다.'),
  });

  if (!id) {
    return (
      <Alert type="warning" showIcon message="로그인 정보에서 회원 ID를 찾을 수 없습니다." className="tw-rounded-xl" />
    );
  }

  if (isLoading) {
    return <Typography.Text type="secondary">불러오는 중…</Typography.Text>;
  }

  if (!member) {
    return <Alert type="warning" showIcon message="내 정보를 불러오지 못했습니다." className="tw-rounded-xl" />;
  }

  const profileSrc = member.profileUrl?.trim() || undefined;
  const initial = member.name?.trim()?.slice(0, 1)?.toUpperCase() || '?';

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div className="tw-flex tw-flex-wrap tw-items-start tw-justify-between tw-gap-3">
        <div>
          <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
            마이페이지
          </Typography.Title>
          <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
            GET /member/detail — 본인 조회 시 연락처·주소·계좌 등 전체가 표시됩니다. 프로필 URL이 없으면 이니셜 아바타를
            씁니다.
          </Typography.Paragraph>
        </div>
        <Link to="/app/me/edit">
          <AppButton variant="secondary" icon={<EditOutlined />}>
            내 정보 수정
          </AppButton>
        </Link>
      </div>

      <Card className="tw-border-slate-200/80 tw-shadow-sm" title="프로필 이미지">
        <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-6">
          <Avatar
            size={96}
            src={profileSrc}
            className={
              profileSrc
                ? '[&_img]:tw-object-cover tw-shrink-0'
                : 'tw-shrink-0 tw-bg-slate-100 tw-text-2xl tw-font-bold tw-text-[#2563EB]'
            }
          >
            {!profileSrc ? initial : null}
          </Avatar>
          <Space wrap>
            <Upload
              accept={PROFILE_ACCEPT}
              showUploadList={false}
              beforeUpload={(file) => {
                if (!isAllowedProfileImage(file)) {
                  message.error('jpg, jpeg, png, gif 형식만 업로드할 수 있습니다.');
                  return false;
                }
                void uploadM.mutateAsync(file);
                return false;
              }}
            >
              <Button type="primary" loading={uploadM.isPending}>
                이미지 업로드
              </Button>
            </Upload>
            <Button danger loading={deleteImgM.isPending} onClick={() => void deleteImgM.mutateAsync()}>
              이미지 삭제
            </Button>
          </Space>
        </div>
      </Card>

      {esgEnabled && (
        <Card className="tw-border-slate-200/80 tw-shadow-sm" title="ESG">
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="ESG 점수">
              {member.esgScore != null && Number.isFinite(Number(member.esgScore))
                ? Number(member.esgScore).toLocaleString('ko-KR', { maximumFractionDigits: 2 })
                : '—'}
            </Descriptions.Item>
          </Descriptions>
        </Card>
      )}

      <Card className="tw-border-slate-200/80 tw-shadow-sm">
        <Descriptions bordered column={1} size="small">
          <Descriptions.Item label="이름">{member.name}</Descriptions.Item>
          <Descriptions.Item label="회사 이메일">{member.email}</Descriptions.Item>
          <Descriptions.Item label="사번">{member.sabun}</Descriptions.Item>
          <Descriptions.Item label="입사일">{member.joinDate}</Descriptions.Item>
          <Descriptions.Item label="고용 형태">
            {EMPLOYMENT_TYPE_KO[member.employmentType] ?? member.employmentType}
          </Descriptions.Item>
          <Descriptions.Item label="조직">{member.organizationName ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="직급">{member.jobGradeName ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="직책">{member.jobTitleName ?? '—'}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card className="tw-border-slate-200/80 tw-shadow-sm" title="연락처">
        <Descriptions bordered column={1} size="small">
          <Descriptions.Item label="휴대폰">
            {displayText(
              member.phoneNumber,
              normalizeYnFlag(member.phonePublicYn) === 'NO' ? '비공개' : '—',
            )}
          </Descriptions.Item>
          <Descriptions.Item label="연락처 공개">{ynPublicLabel(member.phonePublicYn)}</Descriptions.Item>
          <Descriptions.Item label="내선번호">{displayText(member.extensionNumber)}</Descriptions.Item>
          <Descriptions.Item label="직통번호">{displayText(member.telNumber)}</Descriptions.Item>
          <Descriptions.Item label="비상연락처">{displayText(member.emergencyContact)}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card className="tw-border-slate-200/80 tw-shadow-sm" title="주소">
        <Descriptions bordered column={1} size="small">
          <Descriptions.Item label="주소">
            {displayText(
              member.address,
              normalizeYnFlag(member.addressPublicYn) === 'NO' ? '비공개' : '—',
            )}
          </Descriptions.Item>
          <Descriptions.Item label="상세 주소">{displayText(member.detailAddress)}</Descriptions.Item>
          <Descriptions.Item label="주소 공개">{ynPublicLabel(member.addressPublicYn)}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card className="tw-border-slate-200/80 tw-shadow-sm" title="급여 계좌 (본인 조회 시에만 노출)">
        <Descriptions bordered column={1} size="small">
          <Descriptions.Item label="은행">{displayText(member.bank)}</Descriptions.Item>
          <Descriptions.Item label="계좌번호">{displayText(member.bankAccount)}</Descriptions.Item>
        </Descriptions>
      </Card>
    </Space>
  );
}
