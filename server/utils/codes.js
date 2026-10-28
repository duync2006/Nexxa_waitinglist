import crypto from 'node:crypto';

// Bỏ các ký tự dễ nhìn nhầm khi chép tay: I, O, 0, 1
const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const hashOtp = (code) => crypto.createHash('sha256').update(code).digest('hex');

export const randomOtp = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

export const randomRefCode = () =>
  Array.from(crypto.randomBytes(6), (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join('');
