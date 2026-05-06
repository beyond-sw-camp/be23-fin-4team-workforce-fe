import { Spin } from 'antd';
import { useDisplayableContractImageUrl } from '@/features/contracts/lib/useDisplayableContractImageUrl';

type Props = {
  rawUrl: string;
  alt: string;
  className?: string;
};

/** member-chat 인증 다운로드 URL 등을 img에서 안전히 표시 */
export function ContractSignatureDisplayImage({ rawUrl, alt, className }: Props) {
  const { displaySrc, loading } = useDisplayableContractImageUrl(rawUrl);
  if (!rawUrl.trim()) return null;
  if (loading) {
    return (
      <span className="tw-inline-flex tw-items-center tw-justify-center tw-py-1">
        <Spin size="small" />
      </span>
    );
  }
  if (!displaySrc) return null;
  return <img src={displaySrc} alt={alt} className={className} />;
}
