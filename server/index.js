import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { store, connectStore } from './store.js';
import { sendOtpEmail } from './mailer.js';
import { RESERVABLE } from '../src/lib/data.js';

const PORT = Number(process.env.PORT) || 3001;
const IS_PROD = process.env.NODE_ENV === 'production';
const TOTAL_SLOTS = 1000;
const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const app = express();
app.use(express.json({ limit: '10kb' }));

const normEmail = (v) => String(v || '').trim().toLowerCase();
const hash = (code) => crypto.createHash('sha256').update(code).digest('hex');

// Bọc handler async để lỗi MongoDB được chuyển tới middleware xử lý lỗi (Express 4 không tự làm việc này)
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

async function profile(user) {
  return {
    email: user.email,
    rank: await store.rankOf(user),
    registered: await store.countUsers(),
    refCode: user.refCode,
    invites: user.invites
  };
}

// Thống kê công khai: số người đã xác thực, suất còn lại
app.get('/api/stats', wrap(async (_req, res) => {
  const registered = await store.countUsers();
  res.json({ registered, totalSlots: TOTAL_SLOTS, remaining: Math.max(0, TOTAL_SLOTS - registered) });
}));

// Kiểm tra một email đã tham gia waitlist chưa. Frontend gọi trước khi gửi OTP;
// email đã có thì hiện luôn kết quả hiện tại thay vì bắt xác thực lại.
app.get('/api/waitlist/check', wrap(async (req, res) => {
  const email = normEmail(req.query?.email);
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return res.status(400).json({ error: 'Email chưa đúng định dạng. Vui lòng kiểm tra lại.' });
  }
  const user = await store.findUser(email);
  if (!user) return res.json({ exists: false });
  res.json({ exists: true, profile: await profile(user) });
}));

// Bước 1: nhập email → gửi OTP
app.post('/api/waitlist/request-otp', wrap(async (req, res) => {
  const email = normEmail(req.body?.email);
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return res.status(400).json({ error: 'Email chưa đúng định dạng. Vui lòng kiểm tra lại.' });
  }

  const prev = await store.getOtp(email);
  if (prev && Date.now() - prev.sentAt.getTime() < RESEND_COOLDOWN_MS) {
    const wait = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - prev.sentAt.getTime())) / 1000);
    return res.status(429).json({ error: `Vui lòng đợi ${wait} giây trước khi gửi lại mã.`, retryAfter: wait });
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  await store.setOtp(email, {
    hash: hash(code),
    sentAt: new Date(),
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
    attempts: 0,
    ref: req.body?.ref ? String(req.body.ref).slice(0, 16) : null
  });

  try {
    await sendOtpEmail(email, code);
  } catch (err) {
    console.error('[mailer] lỗi gửi mail:', err);
    return res.status(502).json({ error: 'Không gửi được email lúc này. Vui lòng thử lại.' });
  }

  // Ở môi trường dev, trả mã về luôn để test nhanh.
  res.json({ ok: true, ...(IS_PROD ? {} : { devOtp: code }) });
}));

// Bước 2: xác thực OTP → tạo chỗ trong waitlist, trả về hạng
app.post('/api/waitlist/verify', wrap(async (req, res) => {
  const email = normEmail(req.body?.email);
  const otp = String(req.body?.otp || '').replace(/\D/g, '');
  const rec = await store.getOtp(email);

  if (!rec || Date.now() > rec.expiresAt.getTime()) {
    return res.status(400).json({ error: 'Mã đã hết hạn. Vui lòng bấm "Gửi lại mã".' });
  }
  if (rec.attempts >= MAX_ATTEMPTS) {
    return res.status(429).json({ error: 'Nhập sai quá nhiều lần. Vui lòng gửi lại mã mới.' });
  }
  if (otp.length !== 6 || hash(otp) !== rec.hash) {
    await store.setOtp(email, { ...rec, attempts: rec.attempts + 1 });
    return res.status(400).json({ error: 'Mã OTP không đúng. Vui lòng kiểm tra lại.' });
  }

  await store.clearOtp(email);
  const { user, created } = await store.createUser(email, rec.ref);
  const current = await profile(user);
  if (!created) {
    return res.status(409).json({
      error: 'Email này đã tham gia waitlist.',
      alreadyRegistered: true,
      profile: current
    });
  }
  res.json(current);
}));

// Nhận quà Reserve: chỉ email đã đăng ký waitlist mới được ghi nhận lựa chọn
app.post('/api/reserve', wrap(async (req, res) => {
  const email = normEmail(req.body?.email);
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return res.status(400).json({ error: 'Email chưa đúng định dạng.' });
  }
  const user = await store.findUser(email);
  if (!user) {
    return res.status(403).json({ error: 'Email này chưa tham gia waitlist. Vui lòng đăng ký trước khi nhận quà.' });
  }

  const requested = Array.isArray(req.body?.tickers) ? [...new Set(req.body.tickers.map((t) => String(t).toUpperCase()))] : [];
  if (requested.length === 0 || requested.length > 100) {
    return res.status(400).json({ error: 'Vui lòng chọn ít nhất một mã cổ phiếu.' });
  }
  const allowed = new Set(Object.values(RESERVABLE).flat().map((s) => s.t));
  if (requested.some((t) => !allowed.has(t))) {
    return res.status(400).json({ error: 'Có mã cổ phiếu không thuộc danh sách Reserve.' });
  }

  await store.saveReservation(email, requested);
  res.json({ ok: true, tickers: requested });
}));

// Link mời ngắn: /r/ABC123 → /?ref=ABC123
// Dùng đường dẫn tương đối '../' để chạy đúng cả ở /r/... (dev) lẫn /waitlist/r/... (nginx bỏ prefix /waitlist)
app.get('/r/:code', (req, res) => {
  res.redirect(302, '../?ref=' + encodeURIComponent(req.params.code));
});

// Production: phục vụ bản build React
const dist = path.resolve('dist');
if (IS_PROD && fs.existsSync(dist)) {
  app.use(express.static(dist, { maxAge: '1h', index: false }));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, _req, res, _next) => {
  console.error('[server] lỗi:', err);
  res.status(500).json({ error: 'Lỗi máy chủ. Vui lòng thử lại.' });
});

// Kết nối MongoDB trước, lỗi kết nối thì thoát để container/PM2 khởi động lại
connectStore()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Nexxa waitlist server chạy tại http://localhost:${PORT}` + (IS_PROD ? '' : ' (API — giao diện dev ở http://localhost:5173)'));
    });
  })
  .catch((err) => {
    console.error('[store] không kết nối được MongoDB:', err);
    process.exit(1);
  });
