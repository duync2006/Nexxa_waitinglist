import mongoose from 'mongoose';
import { MAX_EMAIL_LENGTH } from '../config/constants.js';

const { Schema, model } = mongoose;

const otpSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, maxlength: MAX_EMAIL_LENGTH },

    // Chỉ lưu SHA-256 của mã, không lưu mã gốc
    hash: { type: String, required: true },

    sentAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },

    // Số lần nhập sai; vượt MAX_ATTEMPTS thì phải xin mã mới
    attempts: { type: Number, required: true, default: 0 },

    // refCode của người mời, giữ từ lúc gửi mã tới lúc xác thực thành công
    ref: { type: String, default: null }
  },
  { collection: 'otps', versionKey: false }
);

// MongoDB tự xoá document khi quá expiresAt
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Otp = model('Otp', otpSchema);
