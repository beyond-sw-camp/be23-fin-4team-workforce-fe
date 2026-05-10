import { SettingOutlined } from '@ant-design/icons';
import { Button, Popover, Radio } from 'antd';

export type OrgChartLayoutDirection = 'vertical' | 'horizontal';
export type OrgChartMemberCountMode = 'subtree' | 'direct';

export type OrgChartViewSettings = {
  layoutDirection: OrgChartLayoutDirection;
  memberCountMode: OrgChartMemberCountMode;
};

type OrgChartViewSettingsPopoverProps = {
  value: OrgChartViewSettings;
  onChange: (next: OrgChartViewSettings) => void;
};

export function OrgChartViewSettingsPopover({ value, onChange }: OrgChartViewSettingsPopoverProps) {
  const content = (
    <div className="tw-w-[min(92vw,300px)] tw-space-y-5 tw-py-0.5">
      <section>
        <div className="tw-mb-2 tw-text-xs tw-font-semibold tw-tracking-wide tw-text-slate-500">정렬 방식</div>
        <Radio.Group
          value={value.layoutDirection}
          onChange={(e) => onChange({ ...value, layoutDirection: e.target.value as OrgChartLayoutDirection })}
          className="tw-flex tw-w-full tw-flex-col tw-gap-2 [&_.ant-radio-wrapper]:tw-mr-0 [&_.ant-radio-wrapper]:tw-w-full [&_.ant-radio-wrapper]:tw-rounded-lg [&_.ant-radio-wrapper]:tw-border [&_.ant-radio-wrapper]:tw-border-slate-200 [&_.ant-radio-wrapper]:tw-px-3 [&_.ant-radio-wrapper]:tw-py-2 [&_.ant-radio-wrapper]:tw-transition-colors [&_.ant-radio-wrapper-checked]:tw-border-[#2563eb] [&_.ant-radio-wrapper-checked]:tw-bg-[#eff6ff]"
        >
          <Radio value="horizontal" className="!tw-items-start">
            <span className="tw-flex tw-flex-col tw-gap-0.5 tw-text-left">
              <span className="tw-text-sm tw-font-semibold tw-text-slate-900">옆으로</span>
              <span className="tw-text-xs tw-font-normal tw-text-slate-500">접는 트리 목록</span>
            </span>
          </Radio>
          <Radio value="vertical" className="!tw-items-start">
            <span className="tw-flex tw-flex-col tw-gap-0.5 tw-text-left">
              <span className="tw-text-sm tw-font-semibold tw-text-slate-900">아래로</span>
              <span className="tw-text-xs tw-font-normal tw-text-slate-500">카드형 계층, 드래그 이동·확대</span>
            </span>
          </Radio>
        </Radio.Group>
      </section>

      <section>
        <div className="tw-mb-2 tw-text-xs tw-font-semibold tw-tracking-wide tw-text-slate-500">구성원 숫자 표기</div>
        <Radio.Group
          value={value.memberCountMode}
          onChange={(e) => onChange({ ...value, memberCountMode: e.target.value as OrgChartMemberCountMode })}
          className="tw-flex tw-w-full tw-flex-col tw-gap-2 [&_.ant-radio-wrapper]:tw-mr-0 [&_.ant-radio-wrapper]:tw-w-full [&_.ant-radio-wrapper]:tw-rounded-lg [&_.ant-radio-wrapper]:tw-border [&_.ant-radio-wrapper]:tw-border-slate-200 [&_.ant-radio-wrapper]:tw-px-3 [&_.ant-radio-wrapper]:tw-py-2 [&_.ant-radio-wrapper]:tw-transition-colors [&_.ant-radio-wrapper-checked]:tw-border-[#2563eb] [&_.ant-radio-wrapper-checked]:tw-bg-[#eff6ff]"
        >
          <Radio value="subtree" className="!tw-items-start">
            <span className="tw-flex tw-flex-col tw-gap-0.5 tw-text-left">
              <span className="tw-text-sm tw-font-semibold tw-text-slate-900">하위 조직 포함</span>
              <span className="tw-text-xs tw-font-normal tw-text-slate-500">하위 소속 인원까지 합산</span>
            </span>
          </Radio>
          <Radio value="direct" className="!tw-items-start">
            <span className="tw-flex tw-flex-col tw-gap-0.5 tw-text-left">
              <span className="tw-text-sm tw-font-semibold tw-text-slate-900">직속 조직만</span>
              <span className="tw-text-xs tw-font-normal tw-text-slate-500">해당 조직 직속 인원만</span>
            </span>
          </Radio>
        </Radio.Group>
      </section>
    </div>
  );

  return (
    <Popover
      content={content}
      trigger="click"
      placement="bottomRight"
      overlayClassName="[&_.ant-popover-inner]:tw-p-4"
    >
      <Button
        type="text"
        className="!tw-inline-flex !tw-h-8 !tw-items-center !tw-justify-center !tw-gap-1.5 !tw-rounded-md !tw-border !tw-border-slate-200 !tw-bg-white !tw-px-2.5 !tw-text-slate-700 hover:!tw-border-slate-300 hover:!tw-bg-slate-50 hover:!tw-text-slate-900"
        aria-label="뷰 설정"
      >
        <SettingOutlined className="!tw-text-sm" />
        <span className="tw-text-xs tw-font-semibold">뷰 설정</span>
      </Button>
    </Popover>
  );
}
