import dayjs from 'dayjs';

type SeasonOptionSource = {
  seasonId?: string | null;
  seasonName?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  resultsPublishedAt?: string | null;
  submittedAt?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
};

const UNKNOWN_SEASON = 'UNKNOWN';

export function pickDefaultSeasonFilter<T extends SeasonOptionSource>(items: T[], today = dayjs()) {
  const candidates = items
    .map((item) => {
      const seasonId = item.seasonId ?? UNKNOWN_SEASON;
      const start = parseDate(item.startDate) ?? inferSeasonStart(item.seasonName);
      const end = parseDate(item.endDate) ?? inferSeasonEnd(item.seasonName);
      const anchor =
        parseDate(item.resultsPublishedAt) ??
        parseDate(item.submittedAt) ??
        parseDate(item.updatedAt) ??
        parseDate(item.createdAt) ??
        start ??
        end;

      return { seasonId, start, end, anchor };
    })
    .filter((item) => item.seasonId !== UNKNOWN_SEASON);

  if (candidates.length === 0) return 'ALL';

  const current = candidates
    .filter((item) => item.start && item.end && isBetweenInclusive(today, item.start, item.end))
    .sort((a, b) => Math.abs(today.diff(a.start, 'day')) - Math.abs(today.diff(b.start, 'day')))[0];
  if (current) return current.seasonId;

  const closest = [...candidates].sort((a, b) => {
    const aDistance = distanceFromToday(today, a);
    const bDistance = distanceFromToday(today, b);
    if (aDistance !== bDistance) return aDistance - bDistance;
    return (b.anchor?.valueOf() ?? 0) - (a.anchor?.valueOf() ?? 0);
  })[0];

  return closest?.seasonId ?? 'ALL';
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed : null;
}

function inferSeasonStart(name?: string | null) {
  const year = extractYear(name);
  return year ? dayjs(`${year}-01-01`) : null;
}

function inferSeasonEnd(name?: string | null) {
  const year = extractYear(name);
  return year ? dayjs(`${year}-12-31`) : null;
}

function extractYear(name?: string | null) {
  const match = name?.match(/20\d{2}/);
  return match ? Number(match[0]) : null;
}

function isBetweenInclusive(today: dayjs.Dayjs, start: dayjs.Dayjs, end: dayjs.Dayjs) {
  return !today.isBefore(start, 'day') && !today.isAfter(end, 'day');
}

function distanceFromToday(today: dayjs.Dayjs, item: { start: dayjs.Dayjs | null; end: dayjs.Dayjs | null; anchor: dayjs.Dayjs | null }) {
  const distances = [item.start, item.end, item.anchor]
    .filter((value): value is dayjs.Dayjs => Boolean(value))
    .map((value) => Math.abs(today.diff(value, 'day')));
  return distances.length > 0 ? Math.min(...distances) : Number.MAX_SAFE_INTEGER;
}
