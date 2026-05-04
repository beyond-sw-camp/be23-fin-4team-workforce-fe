import { Card, Image, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useMemo } from 'react';
import type { ContractParty } from '@/features/contracts/api/contractTemplateApi';

function partyRoleLabel(role: string): string {
  const r = role.toUpperCase();
  if (r === 'EMPLOYEE') return '직원';
  if (r === 'COMPANY') return '회사';
  return role.trim() || '당사자';
}

function signStatusTag(signStatus: string) {
  const s = signStatus.toUpperCase();
  if (s === 'SIGNED') return <Tag color="success">서명 완료</Tag>;
  if (s === 'REJECTED') return <Tag color="error">거절</Tag>;
  if (s === 'CANCELED') return <Tag color="default">회수</Tag>;
  if (s === 'PENDING' || s === 'WAITING' || s === 'UNSIGNED' || s === 'NOT_SIGNED') {
    return <Tag>미서명</Tag>;
  }
  return <Tag>{signStatus || '—'}</Tag>;
}

function formatSignedAt(iso: string | null): string {
  if (!iso?.trim()) return '—';
  const d = dayjs(iso);
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : iso;
}

type Props = {
  parties: ContractParty[];
};

export function ContractPartySignaturesCard({ parties }: Props) {
  const ordered = useMemo(() => {
    const rank = (role: string) => {
      const r = role.toUpperCase();
      if (r === 'EMPLOYEE') return 0;
      if (r === 'COMPANY') return 1;
      return 2;
    };
    return [...parties].sort((a, b) => rank(a.partyRole) - rank(b.partyRole));
  }, [parties]);

  if (!ordered.length) {
    return (
      <Card size="small" title="서명">
        <Typography.Text type="secondary">당사자(서명) 정보가 없습니다.</Typography.Text>
      </Card>
    );
  }

  return (
    <Card size="small" title="서명">
      <div className="tw-space-y-5">
        {ordered.map((p) => (
          <div
            key={p.partyId}
            className="tw-border-b tw-border-solid tw-border-slate-100 tw-pb-4 last:tw-border-b-0 last:tw-pb-0"
          >
            <div className="tw-mb-2 tw-flex tw-flex-wrap tw-items-center tw-gap-2">
              <Typography.Text strong>{partyRoleLabel(p.partyRole)}</Typography.Text>
              {signStatusTag(p.signStatus)}
              <Typography.Text type="secondary" className="tw-text-xs">
                서명일시: {formatSignedAt(p.signedAt)}
              </Typography.Text>
            </div>
            {p.rejectReason?.trim() && String(p.signStatus).toUpperCase() === 'REJECTED' ? (
              <Typography.Paragraph type="secondary" className="!tw-mb-2 tw-text-sm tw-whitespace-pre-wrap">
                거절 사유: {p.rejectReason.trim()}
              </Typography.Paragraph>
            ) : null}
            {p.signatureImageUrl?.trim() ? (
              <div className="tw-mt-2 tw-rounded-lg tw-border tw-border-slate-200 tw-bg-slate-50 tw-p-2 tw-inline-block tw-max-w-full">
                <Image
                  src={p.signatureImageUrl.trim()}
                  alt={`${partyRoleLabel(p.partyRole)} 서명`}
                  className="tw-max-h-40 tw-max-w-full tw-object-contain"
                  style={{ maxHeight: 160 }}
                  preview={{ mask: '확대' }}
                />
              </div>
            ) : (
              <Typography.Text type="secondary" className="tw-text-sm">
                등록된 서명 이미지가 없습니다.
              </Typography.Text>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
