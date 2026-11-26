import { env } from '../config/env.js';
import * as otpService from '../services/otp.service.js';
import * as waitlist from '../services/waitlist.service.js';
import { sendOtpEmail } from '../services/mailer.service.js';
import { normalizeEmail, requireEmail } from '../utils/email.js';
import { createSession, destroySession } from '../services/session.service.js';
import { bearerToken } from '../middlewares/session.middleware.js';
import { badGateway } from '../utils/app-error.js';

// Kiểm tra một email đã tham gia waitlist chưa. Chỉ trả `exists`, không lộ profile:
// muốn xem profile phải xác thực OTP rồi dùng token phiên (/me).
export async function check(req, res) {
  const email = requireEmail(req.body?.email);
  const user = await waitlist.findByEmail(email);
  if (!user) return res.json({ exists: false });
  res.json({ exists: true });
}

// Bước 1: nhập email → gửi OTP
export async function requestOtp(req, res) {
  const email = requireEmail(req.body?.email);
  const code = await otpService.issue(email, req.body?.ref);

  try {
    await sendOtpEmail(email, code);
  } catch (err) {
    console.error('[mailer] lỗi gửi mail:', err);
    throw badGateway('Không gửi được email lúc này. Vui lòng thử lại.');
  }

  // Ở môi trường dev, trả mã về luôn để test nhanh.
  res.json({ ok: true, ...(env.isProd ? {} : { devOtp: code }) });
}

// Bước 2: xác thực OTP → tạo chỗ trong waitlist, trả về profile kèm token phiên.
// Email đã đăng ký vẫn được 200 (alreadyRegistered) và nhận token mới.
export async function verify(req, res) {
  // Cố ý KHÔNG kiểm định dạng email ở đây: email sai thì không có bản ghi OTP nào khớp,
  // và người dùng nhận đúng thông báo "Mã đã hết hạn" như bản cũ.
  const email = normalizeEmail(req.body?.email);
  const { ref } = await otpService.verify(email, req.body?.otp);

  const { user, created } = await waitlist.join(email, ref);
  const profile = await waitlist.toProfile(user);
  const token = await createSession(user._id);
  res.json(created ? { profile, token } : { profile, token, alreadyRegistered: true });
}

export async function me(req, res) {
  res.json(await waitlist.toProfile(req.user));
}

export async function logout(req, res) {
  await destroySession(bearerToken(req));
  res.json({ ok: true });
}
