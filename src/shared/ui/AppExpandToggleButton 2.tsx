import type {MouseEvent} from 'react';

type Props = {
    expanded: boolean;
    onToggle: (e: MouseEvent<HTMLButtonElement>) => void;
    ariaLabelExpand?: string;
    ariaLabelCollapse?: string;
};

/**
 * 앱 공통 "드릴다운 토글" 버튼.
 *
 * AntD Table 의 기본 expandIcon (+/-) 과 동일한 시각을 재현한다.
 * Table 바깥(Card 리스트 등)에서도 같은 토글을 쓰고 싶을 때 사용.
 * 디자인 기준: 진행도 관리 Table 의 기본 expand 아이콘.
 */
export function AppExpandToggleButton({
    expanded,
    onToggle,
    ariaLabelExpand = '펼치기',
    ariaLabelCollapse = '접기',
}: Props) {
    return (
        <button
            type="button"
            onClick={onToggle}
            aria-label={expanded ? ariaLabelCollapse : ariaLabelExpand}
            aria-expanded={expanded}
            className={[
                'tw-inline-flex tw-items-center tw-justify-center',
                'tw-size-[17px] tw-rounded-[2px]',
                'tw-border tw-border-solid tw-border-gray-300',
                'tw-bg-white tw-text-gray-500',
                'tw-font-mono tw-text-[12px] tw-leading-none',
                'tw-transition-colors',
                'hover:tw-border-blue-500 hover:tw-text-blue-500',
            ].join(' ')}
        >
            <span aria-hidden="true">{expanded ? '−' : '+'}</span>
        </button>
    );
}
