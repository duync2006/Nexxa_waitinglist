import { env } from '../../config/env.js';
import { connectDb, disconnectDb } from '../../db/connect.js';
import { User, Otp, Counter, Price } from '../../models/index.js';
import { RESERVABLE } from '../../../shared/catalog.js';

// CHỐT CHẶN: test xoá sạch collection sau mỗi ca, nên tuyệt đối không được trỏ vào DB thật.
// Chỉ chấp nhận database có tên kết thúc bằng _test.
if (!env.mongoDb.endsWith('_test')) {
  throw new Error(
    `Test từ chối chạy trên database "${env.mongoDb}". ` +
      'Tên database phải kết thúc bằng _test. Kiểm tra lại .env.test (MONGODB_URI và MONGODB_DB).'
  );
}

export async function setupDb() {
  await connectDb({ quiet: true });
}

export async function teardownDb() {
  await disconnectDb();
}

export async function resetDb() {
  await Promise.all([User.deleteMany({}), Otp.deleteMany({}), Counter.deleteMany({}), Price.deleteMany({})]);
}

// Nạp bảng giá giả cho DB test. Reserve đọc snapshot nên không có bảng giá là 503 —
// mọi ca test về Reserve phải gọi hàm này trước.
//   seedPrices()                      -> mọi mã 20.000đ
//   seedPrices({ VCB: 90000 })        -> VCB 90.000đ, còn lại 20.000đ
//   seedPrices({}, { skip: ['FPT'] }) -> FPT không có giá, để thử nhánh 503
export async function seedPrices(overrides = {}, { base = 20000, skip = [] } = {}) {
  const now = new Date();
  const skipSet = new Set(skip);
  const rows = Object.values(RESERVABLE)
    .flat()
    .map((s) => s.t)
    .filter((t) => !skipSet.has(t))
    .map((t) => ({ _id: t, price: overrides[t] ?? base, updatedAt: now, source: 'test' }));
  await Price.insertMany(rows);
}

// Đưa một email qua trọn vòng request-otp → verify, trả về profile.
// devOtp chỉ có ở môi trường không phải production, đúng thứ test cần.
export async function joinViaApi(request, app, email, ref) {
  const otpRes = await request(app).post('/api/waitlist/request-otp').send({ email, ref });
  const verifyRes = await request(app)
    .post('/api/waitlist/verify')
    .send({ email, otp: otpRes.body.devOtp });
  return verifyRes;
}
