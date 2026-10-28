// Lỗi có mã HTTP kèm sẵn. Service ném ra, error.middleware.js dịch thành JSON.
// `extra` giữ các field đặc biệt mà frontend đang đọc: retryAfter (429),
// alreadyRegistered + profile (409) — xem src/lib/api.js và SignupCard.jsx.
export class AppError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.extra = extra;
  }
}

export const badRequest = (message, extra) => new AppError(400, message, extra);
export const forbidden = (message, extra) => new AppError(403, message, extra);
export const conflict = (message, extra) => new AppError(409, message, extra);
export const tooMany = (message, extra) => new AppError(429, message, extra);
export const badGateway = (message, extra) => new AppError(502, message, extra);
export const unavailable = (message, extra) => new AppError(503, message, extra);
