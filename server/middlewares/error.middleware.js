import { AppError } from '../utils/app-error.js';

// AppError mang sẵn mã HTTP và các field phụ (retryAfter, alreadyRegistered, profile…).
// Lỗi khác là lỗi ngoài dự tính: ghi log đầy đủ ở server, trả ra ngoài câu chung chung.
export function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message, ...err.extra });
  }
  console.error('[server] lỗi:', err);
  res.status(500).json({ error: 'Lỗi máy chủ. Vui lòng thử lại.' });
}
