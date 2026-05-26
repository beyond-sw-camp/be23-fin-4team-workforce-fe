import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Asia/Seoul');

export const kst = (s?: string | null) => 
  s ? dayjs.utc(s).tz('Asia/Seoul') : dayjs();

export const toKstTime = (s?: string | null, fmt = 'HH:mm') => 
  s ? dayjs.utc(s).tz('Asia/Seoul').format(fmt) : '';

export const toKstDateTime = (s?: string | null, fmt = 'YYYY-MM-DD HH:mm') => 
  s ? dayjs.utc(s).tz('Asia/Seoul').format(fmt) : '';