import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Asia/Seoul');

export const kst = (s?: string | null) => 
  s ? dayjs.utc(s).tz('Asia/Seoul') : dayjs();