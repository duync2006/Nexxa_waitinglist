// Nạp dữ liệu DEMO cho hero và trang Phần thưởng. Toàn bộ là dữ liệu bịa, KHÔNG phải người thật.
//
//   npm run seed:demo        # nạp vào database nexxa_waitlist_demo (riêng, không đụng dev/test)
//   npm run dev:demo         # chạy app trên đúng database demo đó
//
// Script XOÁ SẠCH users/otps/sessions/counters/prices trước khi nạp, nên chỉ chạy được trên
// database có tên kết thúc bằng _demo hoặc _test.
//
// ── Kịch bản: "Ngày thứ 12 của chiến dịch" ─────────────────────────────────────────────
//   • 352 người đã đăng ký (joinIndex 1..352), tất cả đều nằm trong First 1.000
//     → vòng First: 1.000 − 352 = 648 Remaining.
//   • 157 người đã mời được ít nhất 1 bạn → có mặt trên bảng xếp hạng Top
//     → vòng Top: 1.000 − 157 = 843 Remaining. Chưa đủ 1.000 người đua nên chưa có ngưỡng
//       (topCutoff = null): ai mời được 1 bạn là vào Top.
//   • 195 người còn lại chưa mời ai: chỉ có suất First (100.000đ), không có hạng Top.
//   • Phân bố lượt mời của 157 người đua (tổng 284 lượt mời = 284 người đăng ký qua link mời):
//       1 người 14 · 1 người 11 · 1 người 9 · 2 người 7 · 3 người 5 · 6 người 4
//       12 người 3 · 30 người 2 · 101 người 1
//     68 người còn lại tự đăng ký (không qua link mời).
//   • Thời điểm đăng ký trải đều 12 ngày, dồn nhiều hơn về cuối (có người vừa đăng ký trong
//     24 giờ qua để dải "vừa tham gia" chạy).
//   • Quan hệ mời là thật: referrer/referredBy/referees khớp nhau, và người mời luôn đăng ký
//     trước người được mời — đúng như dữ liệu sinh ra từ luồng /r/:code.
//
// Tài khoản demo để đăng nhập (nhập email → mã OTP in ở console server, môi trường dev):
//   an.nguyen@example.com     — First + Top hạng #1 (14 lượt mời), 200.000đ
//   minh.tran@example.com     — First + Top, 1 lượt mời, hạng cuối bảng
//   lan.pham@example.com      — chỉ First, chưa mời ai (rank null), 100.000đ
import { env } from '../config/env.js';
import { connectDb, disconnectDb } from '../db/connect.js';
import { Counter, Otp, Price, Session, User } from '../models/index.js';
import { NAME_OF_TICKER, RESERVABLE, groupTypeOfTicker } from '../../shared/catalog.js';
import { DEMO_PRICES } from '../services/demo-prices.js';

if (!/_(demo|test)$/.test(env.mongoDb)) {
  throw new Error(
    `seed-demo XOÁ SẠCH dữ liệu nên chỉ chạy trên database *_demo hoặc *_test, không phải "${env.mongoDb}". ` +
      'Dùng `npm run seed:demo`.'
  );
}

// ── Thông số kịch bản ────────────────────────────────────────────────────────────────
const TOTAL_USERS = 352;
// [số lượt mời, số người] — tổng số người phải là 157.
const INVITE_PLAN = [[14, 1], [11, 1], [9, 1], [7, 2], [5, 3], [4, 6], [3, 12], [2, 30], [1, 101]];
// const INVITE_PLAN = [[14, 1], [11, 1], [9, 1], [7, 2], [5, 3]]
// , [4, 6], [3, 12], [2, 30], [1, 101]];
const CAMPAIGN_DAYS = 12;
const LAST_JOIN_AGO_MS = 3 * 60 * 1000; // người mới nhất đăng ký 3 phút trước

// Ngẫu nhiên có hạt giống: chạy lại bao nhiêu lần cũng ra đúng một bộ dữ liệu.
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261126);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

// ── Email giả ────────────────────────────────────────────────────────────────────────
// Chỉ dùng tên miền dành riêng cho ví dụ (RFC 2606: example.com/.net/.org) để không trùng
// hộp thư của ai thật.
const GIVEN = ['an', 'binh', 'chi', 'dung', 'giang', 'ha', 'hai', 'hieu', 'hoa', 'hung', 'huong', 'khanh', 'khoa',
  'lan', 'linh', 'long', 'mai', 'minh', 'my', 'nam', 'ngoc', 'nhung', 'phong', 'phuong', 'quan', 'quang', 'son',
  'tam', 'thao', 'thu', 'trang', 'trung', 'tuan', 'tu', 'van', 'viet', 'vy', 'yen'];
const FAMILY = ['nguyen', 'tran', 'le', 'pham', 'hoang', 'huynh', 'phan', 'vu', 'vo', 'dang', 'bui', 'do', 'ho', 'ngo', 'duong', 'ly'];
const DOMAINS = ['example.com', 'example.net', 'example.org'];
const NAMED = {
  hero: 'an.nguyen@example.com',
  edge: 'minh.tran@example.com',
  firstOnly: 'lan.pham@example.com'
};

const usedEmails = new Set(Object.values(NAMED));
function fakeEmail() {
  for (;;) {
    const style = rand();
    const g = pick(GIVEN);
    const f = pick(FAMILY);
    const local = style < 0.4 ? `${g}.${f}` : style < 0.75 ? `${f}${g}${Math.floor(rand() * 99)}` : `${g}${f}${1985 + Math.floor(rand() * 20)}`;
    const email = `${local}@${pick(DOMAINS)}`;
    if (!usedEmails.has(email)) {
      usedEmails.add(email);
      return email;
    }
  }
}

// ── Ai mời, mời bao nhiêu ────────────────────────────────────────────────────────────
// Chọn 157 joinIndex làm người đua. Người mời nhiều thường là người vào sớm, nên các suất
// lớn rơi vào 40 người đầu; suất 1–2 lượt rải khắp, nhưng không quá muộn để còn người sau
// đăng ký qua link của họ.
const quotas = INVITE_PLAN.flatMap(([invites, people]) => Array(people).fill(invites));
const inviterCount = quotas.length;
const TOTAL_INVITES = quotas.reduce((a, b) => a + b, 0);
if (inviterCount !== 157) throw new Error(`INVITE_PLAN phải có đúng 157 người, đang là ${inviterCount}`);

const chosen = new Set();
const quotaOf = new Map(); // joinIndex -> số lượt mời phải đạt
function assign(quota, lo, hi) {
  for (;;) {
    const j = lo + Math.floor(rand() * (hi - lo + 1));
    if (!chosen.has(j)) {
      chosen.add(j);
      quotaOf.set(j, quota);
      return;
    }
  }
}
// Người mời lớn nhất là tài khoản demo #1 (joinIndex 1).
chosen.add(1);
quotaOf.set(1, quotas[0]);
for (const q of quotas.slice(1)) {
  if (q >= 4) assign(q, 2, 40);
  else if (q >= 2) assign(q, 2, 260);
  else assign(q, 2, 320);
}

// ── Ghép người được mời với người mời ─────────────────────────────────────────────────
// Duyệt theo thứ tự đăng ký. Mỗi người mới hoặc tự đăng ký, hoặc đăng ký qua link của một
// người đã vào TRƯỚC và còn "suất mời". Ưu tiên người sắp hết chỗ trống phía sau (vào muộn)
// để không ai bị dư lượt mời ở cuối.
const referrerOf = new Map(); // joinIndex người được mời -> joinIndex người mời
let organicLeft = TOTAL_USERS - 1 - TOTAL_INVITES; // người #1 luôn tự đăng ký
const open = []; // người mời đã đăng ký và còn suất
for (let j = 2; j <= TOTAL_USERS; j++) {
  if (quotaOf.has(j - 1)) open.push({ j: j - 1, left: quotaOf.get(j - 1) });
  const pending = open.reduce((n, o) => n + o.left, 0);
  const usersLeft = TOTAL_USERS - j + 1;
  // Bắt buộc phải là người được mời nếu số suất còn lại đã bằng số người còn lại.
  const mustRefer = pending + [...quotaOf.entries()].filter(([k]) => k >= j).reduce((n, [, q]) => n + q, 0) >= usersLeft;
  const goOrganic = organicLeft > 0 && !mustRefer && (pending === 0 || rand() < organicLeft / usersLeft);
  if (goOrganic || pending === 0) {
    organicLeft -= 1;
    continue;
  }
  // Nửa số lần chọn người mời vào muộn nhất (gấp nhất), nửa còn lại chọn theo trọng số suất.
  let target;
  if (rand() < 0.5) {
    target = open.reduce((a, b) => (b.j > a.j ? b : a));
  } else {
    let r = rand() * pending;
    target = open.find((o) => (r -= o.left) < 0) ?? open[open.length - 1];
  }
  referrerOf.set(j, target.j);
  target.left -= 1;
  if (target.left === 0) open.splice(open.indexOf(target), 1);
}

// ── Dựng document ────────────────────────────────────────────────────────────────────
const now = Date.now();
const start = now - CAMPAIGN_DAYS * 24 * 60 * 60 * 1000;
// Đăng ký dồn về cuối chiến dịch: t^0.7 trải đều nhưng dày dần về hiện tại.
const joinedAt = (j) => new Date(start + Math.pow((j - 1) / (TOTAL_USERS - 1), 0.7) * (now - LAST_JOIN_AGO_MS - start));

const emailOf = new Map();
emailOf.set(1, NAMED.hero);
// Người đua có đúng 1 lượt mời và vào muộn nhất -> hạng cuối bảng.
const singleInviters = [...quotaOf.entries()].filter(([, q]) => q === 1).map(([j]) => j);
emailOf.set(Math.max(...singleInviters), NAMED.edge);
// Một người vào sớm, chưa mời ai.
const firstOnlyIndex = [...Array(60).keys()].map((i) => i + 1).find((j) => !quotaOf.has(j));
emailOf.set(firstOnlyIndex, NAMED.firstOnly);
for (let j = 1; j <= TOTAL_USERS; j++) if (!emailOf.has(j)) emailOf.set(j, fakeEmail());

const refCodeOf = (j) => `DM${String(j).padStart(4, '0')}`;
const users = [];
for (let j = 1; j <= TOTAL_USERS; j++) {
  const invites = quotaOf.get(j) ?? 0;
  users.push({
    email: emailOf.get(j),
    refCode: refCodeOf(j),
    joinIndex: j,
    score: j - 10 * invites, // field cũ, vẫn ghi cho khớp hình dạng document thật
    invites,
    referrer: null, // điền sau khi có _id
    referredBy: referrerOf.has(j) ? refCodeOf(referrerOf.get(j)) : null,
    referees: [],
    createdAt: joinedAt(j)
  });
}

// ── Kiểm tra kịch bản trước khi ghi ──────────────────────────────────────────────────
const racers = users.filter((u) => u.invites >= 1).length;
const referred = users.filter((u) => u.referredBy).length;
const counted = new Map();
for (const [, inviter] of referrerOf) counted.set(inviter, (counted.get(inviter) ?? 0) + 1);
const mismatch = [...quotaOf].filter(([j, q]) => counted.get(j) !== q);
if (racers !== 157 || referred !== TOTAL_INVITES || mismatch.length) {
  throw new Error(`Kịch bản lệch: racers=${racers}, referred=${referred}/${TOTAL_INVITES}, sai quota=${mismatch.length}`);
}

// ── Ghi DB ───────────────────────────────────────────────────────────────────────────
await connectDb();
await Promise.all([
  User.deleteMany({}), Otp.deleteMany({}), Session.deleteMany({}), Counter.deleteMany({}), Price.deleteMany({})
]);

const priced = new Date();
const tickers = Object.values(RESERVABLE).flat().map((s) => s.t);
const missing = tickers.filter((t) => !(t in DEMO_PRICES));
if (missing.length) throw new Error(`Bảng giá demo thiếu ${missing.length} mã: ${missing.join(', ')}`);
await Price.insertMany(tickers.map((t) => ({
  _id: t,
  price: DEMO_PRICES[t],
  updatedAt: priced,
  source: 'demo',
  groupType: groupTypeOfTicker(t),
  companyName: NAME_OF_TICKER[t] ?? null,
  companyShortName: NAME_OF_TICKER[t] ?? null
})));

const inserted = await User.insertMany(users);
const idOf = new Map(inserted.map((u) => [u.joinIndex, u._id]));
const refereesOf = new Map();
for (const [j, inviter] of referrerOf) {
  if (!refereesOf.has(inviter)) refereesOf.set(inviter, []);
  refereesOf.get(inviter).push(idOf.get(j));
}
await User.bulkWrite([
  ...[...referrerOf].map(([j, inviter]) => ({
    updateOne: { filter: { _id: idOf.get(j) }, update: { $set: { referrer: idOf.get(inviter) } } }
  })),
  ...[...refereesOf].map(([inviter, ids]) => ({
    updateOne: { filter: { _id: idOf.get(inviter) }, update: { $set: { referees: ids } } }
  }))
]);
// Bộ đếm phải bằng người cuối cùng, để người đăng ký thật tiếp theo nhận số #353.
await Counter.updateOne({ _id: 'users' }, { $set: { seq: TOTAL_USERS } }, { upsert: true });

const last24h = users.filter((u) => u.createdAt.getTime() >= now - 24 * 60 * 60 * 1000).length;
const edgeRank = users
  .filter((u) => u.invites >= 1)
  .sort((a, b) => b.invites - a.invites || a.joinIndex - b.joinIndex)
  .findIndex((u) => u.email === NAMED.edge) + 1;

console.log(`\nĐã nạp kịch bản demo vào "${env.mongoDb}":`);
console.table({
  'Người đăng ký': TOTAL_USERS,
  'First còn lại': 1000 - TOTAL_USERS,
  'Trên bảng Top (đã mời ≥ 1)': racers,
  'Top còn lại': 1000 - racers,
  'Đăng ký qua link mời': referred,
  'Đăng ký trong 24h qua': last24h,
  'Mã cổ phiếu có giá': tickers.length
});
console.log('Tài khoản demo (OTP in ở console server):');
console.log(`  ${NAMED.hero.padEnd(26)} First + Top #1, 14 lượt mời, 200.000đ`);
console.log(`  ${NAMED.edge.padEnd(26)} First + Top #${edgeRank}, 1 lượt mời, 200.000đ`);
console.log(`  ${NAMED.firstOnly.padEnd(26)} chỉ First (#${firstOnlyIndex}), chưa mời ai, 100.000đ`);
await disconnectDb();
