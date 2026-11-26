import crypto from 'node:crypto';
import { SESSION_TTL_MS } from '../config/constants.js';
import { Session, User } from '../models/index.js';
import { hashOtp } from '../utils/codes.js';

// Cùng một hàm băm SHA-256 với mã OTP: DB chỉ giữ hash, không giữ token gốc.
const hashToken = hashOtp;

export async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = new Date();
  await Session.create({
    hash: hashToken(token),
    userId,
    createdAt: now,
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS)
  });
  return token;
}

// Trả null khi token sai, hết hạn (kể cả khi TTL index chưa kịp xoá) hoặc user đã mất.
export async function userFromToken(token) {
  if (!token || typeof token !== 'string') return null;
  const session = await Session.findOne({ hash: hashToken(token), expiresAt: { $gt: new Date() } });
  if (!session) return null;
  return User.findById(session.userId);
}

export async function destroySession(token) {
  if (!token || typeof token !== 'string') return;
  await Session.deleteOne({ hash: hashToken(token) });
}
