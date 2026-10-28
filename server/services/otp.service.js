import { MAX_ATTEMPTS, OTP_TTL_MS, RESEND_COOLDOWN_MS } from '../config/constants.js';
import { Otp } from '../models/index.js';
import { hashOtp, randomOtp } from '../utils/codes.js';
import { badRequest, tooMany } from '../utils/app-error.js';

// Phát mã mới cho email. Ném 429 nếu vừa gửi chưa quá 60 giây.
// Trả về mã gốc để caller gửi mail — mã gốc không bao giờ được lưu xuống DB.
export async function issue(email, ref) {
  const prev = await Otp.findOne({ email });
  if (prev) {
    const elapsed = Date.now() - prev.sentAt.getTime();
    if (elapsed < RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
      throw tooMany(`Vui lòng đợi ${wait} giây trước khi gửi lại mã.`, { retryAfter: wait });
    }
  }

  const code = randomOtp();
  await Otp.findOneAndReplace(
    { email },
    {
      email,
      hash: hashOtp(code),
      sentAt: new Date(),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
      attempts: 0,
      ref: ref ? String(ref).slice(0, 16) : null
    },
    { upsert: true }
  );

  return code;
}

// Kiểm tra mã. Đúng thì xoá bản ghi và trả về refCode người mời đã gắn lúc gửi mã.
export async function verify(email, rawOtp) {
  const otp = String(rawOtp || '').replace(/\D/g, '');
  const record = await Otp.findOne({ email });

  if (!record || Date.now() > record.expiresAt.getTime()) {
    throw badRequest('Mã đã hết hạn. Vui lòng bấm "Gửi lại mã".');
  }
  if (record.attempts >= MAX_ATTEMPTS) {
    throw tooMany('Nhập sai quá nhiều lần. Vui lòng gửi lại mã mới.');
  }
  if (otp.length !== 6 || hashOtp(otp) !== record.hash) {
    await Otp.updateOne({ email }, { $inc: { attempts: 1 } });
    throw badRequest('Mã OTP không đúng. Vui lòng kiểm tra lại.');
  }

  await Otp.deleteOne({ email });
  return { ref: record.ref };
}
