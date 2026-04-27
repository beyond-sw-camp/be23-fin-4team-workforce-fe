import { z } from 'zod';

export const membersSearchSchema = z.object({
  page: z.number().catch(1),
  pageSize: z.number().catch(20),
  keyword: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export type MembersSearch = z.infer<typeof membersSearchSchema>;

export type Member = {
  id: string;
  name: string;
  email: string;
  department: string;
  /** 사번 — 백엔드 필드명이 `sabun` / `employeeNumber` 등으로 올 수 있음 */
  sabun?: string;
  status: 'ACTIVE' | 'DORMANT' | 'LEAVE';
};
