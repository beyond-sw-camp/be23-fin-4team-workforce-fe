/**
 * 결재선 선택 위젯 - 멤버 단위 단계별 추가/삭제, 직원이 자유롭게 결재자 선택
 * ApprovalsPage 의 결재선 UI 를 단순화한 재사용 컴포넌트
 * 조직 단위 추가는 미지원, 멤버 추가만 지원
 */
import { CloseOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Empty, List, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { memberApi } from '@/features/member/api/memberApi';
import { AppSearchBar } from '@/shared/ui';
import { AppSingleActionModal } from '@/shared/ui/AppSingleActionModal';

export type ApprovalLinePickerRow = {
  /** 클라이언트 식별자, drag 등에 활용 */
  id: string;
  stepOrder: number;
  approverMemberId: string;
  approverMemberPositionId: string;
  memberName: string;
  jobTitleName: string;
  organizationName: string;
};

type Props = {
  value: ApprovalLinePickerRow[];
  onChange: (rows: ApprovalLinePickerRow[]) => void;
  /** 본인은 결재선에 추가하지 못하도록 차단할 때 - 본인 memberId */
  excludeMemberId?: string;
};

export function ApprovalLinePicker({ value, onChange, excludeMemberId }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [keyword, setKeyword] = useState('');

  const memberQ = useQuery({
    queryKey: ['member', 'list-for-approvals', keyword],
    queryFn: () => memberApi.listMembersForApprovals({ keyword: keyword.trim() || undefined }),
    enabled: pickerOpen,
  });

  // 이미 결재선에 들어간 memberId 모음 - 중복 추가 방지
  const addedIds = useMemo(() => new Set(value.map((r) => r.approverMemberId)), [value]);

  // stepOrder 재정렬 - 항상 1부터 연속 번호 유지
  const renumber = (rows: ApprovalLinePickerRow[]): ApprovalLinePickerRow[] =>
    rows.map((r, idx) => ({ ...r, stepOrder: idx + 1 }));

  const handleAddMember = (m: {
    memberId: string;
    memberPositionId: string;
    name: string;
    organizationName: string;
    jobTitleName: string;
  }) => {
    if (addedIds.has(m.memberId)) return;
    if (excludeMemberId && m.memberId === excludeMemberId) return;

    const next: ApprovalLinePickerRow = {
      id: `${m.memberId}-${Date.now()}`,
      stepOrder: value.length + 1,
      approverMemberId: m.memberId,
      approverMemberPositionId: m.memberPositionId,
      memberName: m.name,
      jobTitleName: m.jobTitleName,
      organizationName: m.organizationName,
    };
    onChange(renumber([...value, next]));
  };

  const handleRemove = (id: string) => {
    onChange(renumber(value.filter((r) => r.id !== id)));
  };

  const handleMoveUp = (idx: number) => {
    if (idx === 0) return;
    const next = [...value];
    const current = next[idx];
    const previous = next[idx - 1];
    if (!current || !previous) return;
    next[idx - 1] = current;
    next[idx] = previous;
    onChange(renumber(next));
  };

  const handleMoveDown = (idx: number) => {
    if (idx === value.length - 1) return;
    const next = [...value];
    const current = next[idx];
    const target = next[idx + 1];
    if (!current || !target) return;
    next[idx] = target;
    next[idx + 1] = current;
    onChange(renumber(next));
  };

  return (
    <div className="tw-space-y-2">
      {/* 현재 결재선 - 단계별 row */}
      {value.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="결재선을 1명 이상 지정해 주세요."
        />
      ) : (
        <List
          size="small"
          bordered
          dataSource={value}
          renderItem={(row, idx) => (
            <List.Item
              actions={[
                <Button
                  key="up"
                  size="small"
                  type="text"
                  disabled={idx === 0}
                  onClick={() => handleMoveUp(idx)}
                >
                  ↑
                </Button>,
                <Button
                  key="down"
                  size="small"
                  type="text"
                  disabled={idx === value.length - 1}
                  onClick={() => handleMoveDown(idx)}
                >
                  ↓
                </Button>,
                <Button
                  key="remove"
                  size="small"
                  type="text"
                  danger
                  icon={<CloseOutlined />}
                  onClick={() => handleRemove(row.id)}
                />,
              ]}
            >
              <div className="tw-flex tw-items-center tw-gap-2">
                <Tag color="blue">{row.stepOrder}단계</Tag>
                <span className="tw-font-medium">{row.memberName}</span>
                <Typography.Text type="secondary" className="tw-text-xs">
                  {row.jobTitleName} · {row.organizationName}
                </Typography.Text>
              </div>
            </List.Item>
          )}
        />
      )}

      <Button icon={<PlusOutlined />} onClick={() => setPickerOpen(true)}>
        결재자 추가
      </Button>

      {/* 결재자 검색/선택 모달 */}
      <AppSingleActionModal
        open={pickerOpen}
        title="결재자 선택"
        onClose={() => setPickerOpen(false)}
        onSubmit={() => undefined}
        submitText="확인"
        customFooter={null}
        destroyOnHidden
        width={520}
      >
        <div className="tw-px-5 tw-py-4">
          <AppSearchBar
            placeholder="이름 / 부서 / 직급 검색"
            value={keyword}
            onValueChange={setKeyword}
            onSearch={setKeyword}
            ariaLabel="결재자 검색"
            className="tw-mb-3 tw-w-full"
          />
          <List
            size="small"
            bordered
            loading={memberQ.isLoading}
            dataSource={memberQ.data ?? []}
            locale={{ emptyText: '검색 결과가 없습니다.' }}
            style={{ maxHeight: 360, overflowY: 'auto' }}
            renderItem={(m) => {
              const already = addedIds.has(m.memberId);
              const isMe = excludeMemberId && m.memberId === excludeMemberId;
              const disabled = already || Boolean(isMe);
              return (
                <List.Item
                  actions={[
                    <Button
                      key="add"
                      size="small"
                      type="primary"
                      disabled={disabled}
                      onClick={() => handleAddMember(m)}
                    >
                      {already ? '추가됨' : isMe ? '본인' : '추가'}
                    </Button>,
                  ]}
                >
                  <div>
                    <div className="tw-font-medium">{m.name}</div>
                    <Typography.Text type="secondary" className="tw-text-xs">
                      {m.jobTitleName} · {m.organizationName}
                    </Typography.Text>
                  </div>
                </List.Item>
              );
            }}
          />
        </div>
      </AppSingleActionModal>
    </div>
  );
}
