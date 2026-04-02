export type ApiFieldError = {
  field: string;
  message: string;
};

export type ApiError = {
  status: number;
  code?: string;
  message: string;
  traceId?: string;
  fieldErrors?: ApiFieldError[];
};
