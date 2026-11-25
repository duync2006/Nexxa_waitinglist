import { unauthorized } from '../utils/app-error.js';
import { userFromToken } from '../services/session.service.js';

export const SESSION_EXPIRED_MESSAGE = 'Phiên đăng nhập đã hết hạn. Vui lòng xác thực lại email.';

// Lấy token từ header `Authorization: Bearer <token>`; không có thì trả chuỗi rỗng.
export function bearerToken(req) {
  const match = /^Bearer\s+(\S+)$/i.exec(req.get('Authorization') || '');
  return match ? match[1] : '';
}

export async function requireSession(req, _res, next) {
  try {
    const user = await userFromToken(bearerToken(req));
    if (!user) throw unauthorized(SESSION_EXPIRED_MESSAGE);
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

// Gắn req.user (có thể null), không bao giờ ném lỗi.
export async function optionalSession(req, _res, next) {
  try {
    req.user = (await userFromToken(bearerToken(req))) || null;
  } catch {
    req.user = null;
  }
  next();
}
