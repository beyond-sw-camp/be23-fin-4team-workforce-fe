import { theme } from 'antd';

const BRAND_PRIMARY = '#2563EB';
const BRAND_TEXT = '#0F172A';
const BRAND_BG = '#F8FAFC';
const BRAND_FONT_FAMILY =
  "'Pretendard Variable', 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans KR', sans-serif";

export const antdTheme = {
  algorithm: theme.defaultAlgorithm,
  token: {
    colorPrimary: BRAND_PRIMARY,
    borderRadius: 14,
    borderRadiusLG: 18,
    fontSize: 14,
    colorText: BRAND_TEXT,
    colorTextSecondary: '#64748b',
    colorBgLayout: BRAND_BG,
    controlHeight: 44,
    fontFamily: BRAND_FONT_FAMILY,
  },
  components: {
    Menu: {
      itemBorderRadius: 10,
      itemMarginInline: 10,
      itemMarginBlock: 2,
      itemHeight: 40,
      itemPaddingInline: 14,
      itemColor: '#64748b',
      itemHoverColor: '#0f172a',
      itemSelectedColor: BRAND_PRIMARY,
      itemBg: 'transparent',
      itemHoverBg: '#f1f5f9',
      itemSelectedBg: 'rgba(37, 99, 235, 0.12)',
      subMenuItemBg: 'transparent',
    },
    Layout: {
      headerBg: '#ffffff',
      headerPadding: '0 24px',
      bodyBg: BRAND_BG,
      siderBg: '#ffffff',
    },
    Button: {
      fontWeight: 700,
      borderRadius: 16,
      controlHeight: 46,
      defaultBg: '#ffffff',
      defaultBorderColor: '#e2e8f0',
      defaultColor: '#334155',
      defaultHoverBg: '#f8fafc',
      defaultHoverBorderColor: '#cbd5e1',
      defaultHoverColor: '#0f172a',
      primaryShadow: '0 12px 24px rgba(37, 99, 235, 0.18)',
      defaultShadow: '0 6px 16px rgba(15, 23, 42, 0.06)',
    },
  },
};
