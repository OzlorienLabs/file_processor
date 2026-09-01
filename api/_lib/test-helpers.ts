import type { ApiResponse } from './http';

export interface RecordedResponse extends ApiResponse {
  body: string;
  headers: Record<string, string>;
}

export function fakeResponse(): RecordedResponse {
  const headers: Record<string, string> = {};
  const res: RecordedResponse = {
    statusCode: 0,
    headers,
    body: '',
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
    end: (chunk?: string) => {
      res.body = chunk ?? '';
    },
  };
  return res;
}
