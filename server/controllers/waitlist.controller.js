import { env } from '../config/env.js';
import * as otpService from '../services/otp.service.js';
import * as waitlist from '../services/waitlist.service.js';
import { sendOtpEmail } from '../services/mailer.service.js';
import { normalizeEmail, requireEmail } from '../utils/email.js';
import { badGateway, conflict } from '../utils/app-error.js';

// Kiểm tra một email đã tham gia waitlist chưa. Frontend gọi trước khi gửi OTP;
// email đã có thì hiện luôn kết quả hiện tại thay vì bắt xác thực lại.
export async function check(req, res) {
  const email = requireEmail(req.body?.email);
  const user = await waitlist.findByEmail(email);
  if (!user) return res.json({ exists: false });
  res.json({ exists: true, profile: await waitlist.toProfile(user) });
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

// Bước 2: xác thực OTP → tạo chỗ trong waitlist, trả về hạng
export async function verify(req, res) {
  // Cố ý KHÔNG kiểm định dạng email ở đây: email sai thì không có bản ghi OTP nào khớp,
  // và người dùng nhận đúng thông báo "Mã đã hết hạn" như bản cũ.
  const email = normalizeEmail(req.body?.email);
  const { ref } = await otpService.verify(email, req.body?.otp);

  const { user, created } = await waitlist.join(email, ref);
  const profile = await waitlist.toProfile(user);
  if (!created) {
    throw conflict('Email này đã tham gia waitlist.', { alreadyRegistered: true, profile });
  }
  res.json(profile);
}
