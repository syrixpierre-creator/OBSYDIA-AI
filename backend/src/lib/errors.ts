export class AppError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message?: string, details?: unknown) {
    super(message || code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (code = "bad_request", message?: string, details?: unknown) => new AppError(400, code, message, details);
export const unauthorized = (code = "unauthorized", message?: string) => new AppError(401, code, message);
export const forbidden = (code = "forbidden", message?: string) => new AppError(403, code, message);
export const notFound = (code = "not_found", message?: string) => new AppError(404, code, message);
export const conflict = (code = "conflict", message?: string) => new AppError(409, code, message);
export const paymentRequired = (code = "insufficient_tokens", message?: string, details?: unknown) =>
  new AppError(402, code, message, details);
export const tooMany = (code = "rate_limited", message?: string) => new AppError(429, code, message);
export const unavailable = (code = "service_unavailable", message?: string) => new AppError(503, code, message);
