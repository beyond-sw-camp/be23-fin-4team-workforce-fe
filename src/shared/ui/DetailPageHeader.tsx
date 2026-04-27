import { LeftOutlined, ShareAltOutlined } from '@ant-design/icons';
import { Button, message } from 'antd';
import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useCallback } from 'react';

export type DetailPageHeaderProps = {
  /** 목록 등 상위 화면 경로 */
  backTo?: string;
  backLabel?: string;
  onBackClick?: () => void;
  hideBack?: boolean;
  /** 메인 제목 */
  title?: string;
  /** 제목 아래 보조 문구(선택) */
  subtitle?: ReactNode;
  /** 공유 버튼 노출 여부(권한·환경 등에 따라 상위에서 제어) */
  showShare?: boolean;
  /** Web Share / 복사에 사용할 제목 */
  shareTitle?: string;
  /** 공유 시 부가 설명(선택) */
  shareText?: string;
};

export function DetailPageHeader({
  backTo = '/app/members',
  backLabel = '구성원 목록',
  onBackClick,
  hideBack = false,
  title = '구성원 상세 정보',
  subtitle,
  showShare = true,
  shareTitle,
  shareText,
}: DetailPageHeaderProps) {
  const handleShare = useCallback(async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const t = (shareTitle ?? document.title ?? title).trim() || title;
    const text = shareText?.trim();

    if (navigator.share) {
      try {
        await navigator.share({
          title: t,
          ...(text ? { text } : {}),
          url,
        });
        return;
      } catch (e) {
        const err = e as { name?: string };
        if (err?.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      message.success('페이지 링크를 복사했습니다.');
    } catch {
      message.error('링크를 복사하지 못했습니다.');
    }
  }, [shareText, shareTitle, title]);

  return (
    <header className="tw-mb-8 tw-w-full">
      {!hideBack ? (
        onBackClick ? (
          <button
            type="button"
            onClick={onBackClick}
            className="tw-mb-1 tw-inline-flex tw-w-fit tw-items-center tw-gap-1 tw-border-0 tw-bg-transparent tw-p-0 tw-text-sm tw-font-medium tw-text-slate-500 tw-transition-colors hover:tw-text-slate-700"
          >
            <LeftOutlined className="tw-text-[12px] tw-text-slate-400" aria-hidden />
            {backLabel}
          </button>
        ) : (
          <Link
            to={backTo}
            className="tw-mb-1 tw-inline-flex tw-w-fit tw-items-center tw-gap-1 tw-text-sm tw-font-medium tw-text-slate-500 tw-no-underline tw-transition-colors hover:tw-text-slate-700"
          >
            <LeftOutlined className="tw-text-[12px] tw-text-slate-400" aria-hidden />
            {backLabel}
          </Link>
        )
      ) : null}

      <div className="tw-flex tw-w-full tw-items-start tw-justify-between tw-gap-4">
        <h1 className="tw-m-0 tw-min-w-0 tw-flex-1 tw-text-2xl tw-font-bold tw-leading-tight tw-tracking-tight tw-text-[#1e3a5f] sm:tw-text-[26px]">
          {title}
        </h1>
        {showShare ? (
          <Button
            type="default"
            icon={<ShareAltOutlined className="tw-text-slate-600" />}
            onClick={() => void handleShare()}
            className="tw-shrink-0 !tw-h-10 !tw-w-10 !tw-min-h-10 !tw-min-w-10 !tw-rounded-xl !tw-border !tw-border-slate-200 !tw-bg-white !tw-text-slate-600 !tw-shadow-sm !tw-transition-all !tw-duration-200 hover:!tw-border-slate-300 hover:!tw-bg-slate-50 hover:!tw-text-slate-900 active:!tw-scale-95"
            aria-label="이 페이지 공유"
            title="공유"
          />
        ) : null}
      </div>

      {subtitle ? <div className="tw-mt-2 tw-max-w-2xl">{subtitle}</div> : null}
    </header>
  );
}
