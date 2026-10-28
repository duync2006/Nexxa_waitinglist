import { MAX_EMAIL_LENGTH } from '../config/constants.js';
import { badRequest } from './app-error.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

export const isValidEmail = (email) => EMAIL_RE.test(email) && email.length <= MAX_EMAIL_LENGTH;

// Chuẩn hoá rồi kiểm tra luôn — ba route trước đây lặp lại đúng đoạn này.
// `message` tách riêng vì /api/reserve dùng câu ngắn hơn hai route waitlist.
export function requireEmail(value, message = 'Email chưa đúng định dạng. Vui lòng kiểm tra lại.') {
  const email = normalizeEmail(value);
  if (!isValidEmail(email)) throw badRequest(message);
  return email;
}
