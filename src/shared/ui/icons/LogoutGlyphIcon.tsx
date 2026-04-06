type Props = {
  className?: string;
};

/** 문(ㄱ자 프레임) 밖으로 나가는 화살표 — 레퍼런스형 로그아웃 라인 아이콘 */
export function LogoutGlyphIcon({ className }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M5 4.5v15M5 4.5h8M5 19.5h8"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 12h7.5m0 0-2.5-2.5M19.5 12l-2.5 2.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
