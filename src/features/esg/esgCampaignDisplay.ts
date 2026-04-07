import type { EsgCampaign } from '@/features/esg/api/esgApi';
import { formatActivityDateTime, resolveEsgCategoryDisplay } from '@/features/esg/esgActivityDisplay';

const CAMPAIGN_STATUS_KO: Record<string, string> = {
  ACTIVE: '진행',
  CLOSED: '종료',
};

/** 백엔드 EsgCampaignResDto — esgCampaignId 우선 */
export function pickCampaignId(row: EsgCampaign): string {
  const r = row as Record<string, unknown>;
  const keys = [
    'esgCampaignId',
    'esg_campaign_id',
    'campaignId',
    'id',
    'campaign_id',
  ];
  for (const k of keys) {
    const v = r[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return '';
}

export function formatCampaignStatusKo(status: unknown): string {
  if (status == null || status === '') return '—';
  const key = String(status).trim().toUpperCase();
  return CAMPAIGN_STATUS_KO[key] ?? String(status);
}

export function resolveCampaignCategoryDisplay(row: EsgCampaign): string {
  return resolveEsgCategoryDisplay(row as Record<string, unknown>);
}

export function formatCampaignDateRange(row: EsgCampaign): string {
  const r = row as Record<string, unknown>;
  const s = r.startDate ?? r.start_date;
  const e = r.endDate ?? r.end_date;
  const fs =
    typeof s === 'string' && s.trim()
      ? s.trim().slice(0, 10)
      : typeof s === 'number'
        ? String(s)
        : '';
  const fe =
    typeof e === 'string' && e.trim()
      ? e.trim().slice(0, 10)
      : typeof e === 'number'
        ? String(e)
        : '';
  if (!fs && !fe) return '—';
  if (fs && fe) return `${fs} ~ ${fe}`;
  return fs || fe;
}

export function formatCampaignCreatedAt(row: EsgCampaign): string {
  return formatActivityDateTime((row as Record<string, unknown>).createdAt);
}
