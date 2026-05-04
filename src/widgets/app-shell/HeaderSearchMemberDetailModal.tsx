import { useQuery } from '@tanstack/react-query';
import { Avatar, Descriptions, Spin, Typography } from 'antd';
import { AppSingleActionModal } from '@/shared/ui/AppSingleActionModal';
import { EMPLOYMENT_TYPE_KO } from '@/app/locale/app-ko';
import { memberApi } from '@/features/member/api/memberApi';
import {
  displayAddressByPublicYn,
  displayDetailAddressByPublicYn,
  displayPhoneByPublicYn,
} from '@/features/member/lib/memberPrivateFieldDisplay';

function displayText(v: string | null | undefined, emptyLabel = '—') {
  if (v == null || String(v).trim() === '') return emptyLabel;
  return v;
}

const descClass =
  '[&_.ant-descriptions-item-label]:tw-min-w-[7.5rem] [&_.ant-descriptions-item-label]:tw-whitespace-nowrap';

function SectionTitle({ children }: { children: string }) {
  return (
    <div className="tw-mt-1 tw-text-xs tw-font-semibold tw-tracking-wide tw-text-slate-500">{children}</div>
  );
}

/** 헤더 검색에서 직원 선택 시 — MemberDetailResDto 에 맞춰 표시 가능한 필드 노출(재직·계정·역할 제외) */
export function HeaderSearchMemberDetailModal({
  open,
  memberId,
  onClose,
}: {
  open: boolean;
  memberId: string | null;
  onClose: () => void;
}) {
  const { data: member, isLoading, isError } = useQuery({
    queryKey: ['member', 'detail', memberId],
    queryFn: () => memberApi.detail(memberId!),
    enabled: open && Boolean(memberId),
    staleTime: 30_000,
  });

  return (
    <AppSingleActionModal
      title="구성원 정보"
      open={open}
      onClose={onClose}
      onSubmit={onClose}
      submitText="닫기"
      width={600}
      destroyOnHidden
    >
      <div className="tw-max-h-[min(78vh,720px)] tw-overflow-y-auto tw-px-5 tw-py-4">
      {!memberId ? null : isLoading ? (
        <div className="tw-flex tw-min-h-[200px] tw-items-center tw-justify-center tw-py-8">
          <Spin />
        </div>
      ) : isError || !member ? (
        <Typography.Text type="danger" className="tw-text-sm">
          구성원 정보를 불러오지 못했습니다.
        </Typography.Text>
      ) : (
        <div className="tw-flex tw-flex-col tw-gap-4 tw-pt-1">
          <div className="tw-flex tw-flex-col tw-items-center tw-gap-2 tw-rounded-xl tw-border tw-border-slate-200 tw-bg-slate-50/50 tw-px-3 tw-py-4">
            <Avatar
              src={member.profileUrl || undefined}
              size={72}
              className={member.profileUrl ? '[&_img]:tw-object-cover' : 'tw-bg-slate-200 tw-text-slate-600'}
            >
              {(member.name?.[0] ?? '?').toUpperCase()}
            </Avatar>
            <div className="tw-text-center">
              <div className="tw-text-base tw-font-semibold tw-text-slate-900">{member.name}</div>
              <div className="tw-mt-0.5 tw-truncate tw-text-xs tw-text-slate-500" title={member.email}>
                {member.email}
              </div>
            </div>
          </div>

          <SectionTitle>기본</SectionTitle>
          <Descriptions bordered column={1} size="small" className={descClass}>
            <Descriptions.Item label="사번">{displayText(member.sabun)}</Descriptions.Item>
            <Descriptions.Item label="입사일">{displayText(member.joinDate)}</Descriptions.Item>
            <Descriptions.Item label="고용 형태">
              {EMPLOYMENT_TYPE_KO[member.employmentType] ?? member.employmentType}
            </Descriptions.Item>
            <Descriptions.Item label="조직">{member.organizationName ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="직급">{member.jobGradeName ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="직책">{member.jobTitleName ?? '—'}</Descriptions.Item>
          </Descriptions>

          <SectionTitle>업무 연락</SectionTitle>
          <Descriptions bordered column={1} size="small" className={descClass}>
            <Descriptions.Item label="내선번호">{displayText(member.extensionNumber)}</Descriptions.Item>
            <Descriptions.Item label="직통번호">{displayText(member.telNumber)}</Descriptions.Item>
          </Descriptions>

          <SectionTitle>연락처</SectionTitle>
          <Descriptions bordered column={1} size="small" className={descClass}>
            <Descriptions.Item label="휴대폰">
              {displayPhoneByPublicYn(member.phoneNumber, member.phonePublicYn)}
            </Descriptions.Item>
          </Descriptions>

          <SectionTitle>주소</SectionTitle>
          <Descriptions bordered column={1} size="small" className={descClass}>
            <Descriptions.Item label="주소">
              {displayAddressByPublicYn(member.address, member.addressPublicYn)}
            </Descriptions.Item>
            <Descriptions.Item label="상세 주소">
              {displayDetailAddressByPublicYn(member.detailAddress, member.addressPublicYn)}
            </Descriptions.Item>
          </Descriptions>

          {(member.emergencyContact?.trim() ||
            (member.esgScore != null && Number.isFinite(Number(member.esgScore)))) && (
            <>
              <SectionTitle>기타</SectionTitle>
              <Descriptions bordered column={1} size="small" className={descClass}>
                {member.emergencyContact?.trim() ? (
                  <Descriptions.Item label="비상연락처">{member.emergencyContact}</Descriptions.Item>
                ) : null}
                {member.esgScore != null && Number.isFinite(Number(member.esgScore)) ? (
                  <Descriptions.Item label="ESG 점수">
                    {Number(member.esgScore).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}
                  </Descriptions.Item>
                ) : null}
              </Descriptions>
            </>
          )}
        </div>
      )}
      </div>
    </AppSingleActionModal>
  );
}
