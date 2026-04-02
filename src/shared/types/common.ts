export type PageParams = {
  page: number;
  pageSize: number;
};

export type SortOrder = 'asc' | 'desc';

export type ListResponse<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};
