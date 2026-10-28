// Nạp dữ liệu demo để xem tay màn hình Reserve. CHỈ chạy trên database _test.
//
//   node --env-file=.env.test server/scripts/seed-demo.js
//
// Tạo: bảng giá giả, một user trong top 1.000 và một user sau top 1.000.
import { env } from '../config/env.js';
import { connectDb, disconnectDb } from '../db/connect.js';
import { Price, User } from '../models/index.js';
import { RESERVABLE, TOTAL_SLOTS } from '../../shared/catalog.js';
import { DEMO_PRICES } from '../services/demo-prices.js';

if (!env.mongoDb.endsWith('_test')) {
  throw new Error(`Script này chỉ chạy trên database _test, không phải "${env.mongoDb}".`);
}

await connectDb();
await Promise.all([User.deleteMany({}), Price.deleteMany({})]);

// Dùng chung bảng giá demo với `PRICE_SOURCE=demo npm run prices`, để xem tay và chạy
// script ra cùng một kết quả. Mã nào thiếu trong bảng demo thì báo rõ chứ không điền bừa.
const now = new Date();
const all = Object.values(RESERVABLE).flat().map((s) => s.t);
const missing = all.filter((t) => !(t in DEMO_PRICES));
if (missing.length) {
  throw new Error(`Bảng giá demo thiếu ${missing.length} mã: ${missing.join(', ')}`);
}
await Price.insertMany(
  all.map((t) => ({ _id: t, price: DEMO_PRICES[t], updatedAt: now, source: 'demo' }))
);

function user(n, email) {
  return {
    email,
    refCode: `D${String(n).padStart(5, '0')}`,
    joinIndex: n,
    score: n,
    invites: 0,
    referrer: null,
    referredBy: null,
    referees: [],
    createdAt: now
  };
}

const fillers = [];
for (let n = 1; n <= TOTAL_SLOTS; n++) fillers.push(user(n, `u${n}@demo.local`));
await User.insertMany(fillers);
await User.create(user(TOTAL_SLOTS + 1, 'ngoai-top@demo.local'));

console.log(`Đã nạp ${all.length} giá và ${TOTAL_SLOTS + 1} user.`);
console.log('  top 1.000      : u500@demo.local');
console.log('  sau top 1.000  : ngoai-top@demo.local');
await disconnectDb();
