import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../app.js';
import { Price, User } from '../models/index.js';
import { FIRST_SLOTS, RESERVABLE, TOTAL_SLOTS, groupTypeOfTicker } from '../../shared/catalog.js';
import { checkBudgetFeasibility, getPriceTable, refreshPrices } from '../services/price.service.js';
import { createSession } from '../services/session.service.js';
import { authed, resetDb, seedPrices, setupDb, teardownDb } from './helpers/db.js';

const app = createApp();

before(setupDb);
after(teardownDb);
beforeEach(async () => {
  await resetDb();
  await seedPrices();
});

// Tạo user trực tiếp trong DB: đi qua API thì 1.000 user mất vài phút, mà ở đây chỉ cần
// invites và joinIndex đúng để rankOf tính ra hạng mong muốn.
// Mặc định tạo từ người #FIRST_SLOTS+1 (không thuộc First); ca nào cần người First thì tự
// truyền startIndex.
const AFTER_FIRST = FIRST_SLOTS + 1;
async function makeUsers(count, { startIndex = AFTER_FIRST, invites = 0 } = {}) {
  const docs = [];
  for (let i = 0; i < count; i++) {
    const n = startIndex + i;
    docs.push({
      email: `u${n}@test.local`,
      refCode: `T${String(n).padStart(5, '0')}`,
      joinIndex: n,
      score: n,
      invites,
      referrer: null,
      referredBy: null,
      referees: [],
      createdAt: new Date()
    });
  }
  await User.insertMany(docs);
  return docs;
}

// Tạo đúng `rank - 1` người đứng trên (không thuộc First) rồi trả về email của người ở hạng `rank`.
async function userAtRank(rank) {
  if (rank > 1) await makeUsers(rank - 1);
  const [me] = await makeUsers(1, { startIndex: AFTER_FIRST + rank - 1 });
  return me.email;
}

// Cấp token phiên cho user tạo thẳng trong DB rồi gọi API bằng token đó.
const tokenOf = async (email) => createSession((await User.findOne({ email }))._id);
const options = async (email) => authed(request(app).post('/api/reserve/options'), await tokenOf(email));
const reserve = async (email, tickers) =>
  authed(request(app).post('/api/reserve'), await tokenOf(email)).send({ tickers });

describe('Luật quyền lợi: First và Top song song, cộng dồn', () => {
  it('chỉ First (hạng > 1000) được 100.000đ', async () => {
    const [early] = await makeUsers(1, { startIndex: 1, invites: 0 });
    // 1.000 người vào sau nhưng mỗi người mời được 1 bạn: đẩy người #1 xuống hạng 1.001.
    await makeUsers(TOTAL_SLOTS, { invites: 1 });

    const res = await options(early.email);

    assert.equal(res.status, 200);
    assert.equal(res.body.early, true);
    assert.equal(res.body.rank, TOTAL_SLOTS + 1);
    assert.equal(res.body.inTop, false);
    assert.equal(res.body.budget, 100000);
    assert.deepEqual(res.body.pools, ['vip', 'standard']);
  });

  it('chỉ Top được 100.000đ', async () => {
    const email = await userAtRank(TOTAL_SLOTS);

    const res = await options(email);

    assert.equal(res.status, 200);
    assert.equal(res.body.early, false);
    assert.equal(res.body.rank, TOTAL_SLOTS);
    assert.equal(res.body.inTop, true);
    assert.equal(res.body.budget, 100000);
    assert.deepEqual(res.body.pools, ['vip', 'standard']);
    assert.equal(res.body.preview, false);
    assert.equal(res.body.phase, 'open');
  });

  it('First và Top được 200.000đ', async () => {
    const [both] = await makeUsers(1, { startIndex: FIRST_SLOTS }); // người đăng ký thứ 1.000

    const res = await options(both.email);

    assert.equal(res.body.early, true);
    assert.equal(res.body.inTop, true);
    assert.equal(res.body.budget, 200000);
    assert.deepEqual(res.body.pools, ['vip', 'standard']);
  });

  it('First và Top chọn chung một giỏ tới 200.000đ', async () => {
    const [both] = await makeUsers(1, { startIndex: 1 });
    const tickers = ['VCB', 'FPT', 'HPG', 'MBB', 'ACB', 'PNJ', 'PLX', 'TPB', 'REE', 'DGC'];

    const res = await reserve(both.email, tickers);

    assert.equal(res.status, 200, res.body.error);
    assert.equal(res.body.totalValue, 200000);
    assert.equal(res.body.budget, 200000);
  });

  it('không thuộc nhóm nào được 50.000đ, chỉ standard', async () => {
    // Đủ First 1.000, đều 0 điểm: họ chiếm kín Top 1.000, người #1.001 rơi xuống hạng 1.001.
    await makeUsers(FIRST_SLOTS, { startIndex: 1 });
    const [late] = await makeUsers(1, { startIndex: FIRST_SLOTS + 1 });

    const res = await options(late.email);

    assert.equal(res.body.early, false);
    assert.equal(res.body.rank, TOTAL_SLOTS + 1);
    assert.equal(res.body.inTop, false);
    assert.equal(res.body.budget, 50000);
    assert.deepEqual(res.body.pools, ['standard']);
  });

  it('First có hạng Top là số, không còn null', async () => {
    const [early] = await makeUsers(1, { startIndex: 1, invites: 0 });
    await makeUsers(3, { invites: 2 });

    const res = await options(early.email);

    assert.equal(res.body.early, true);
    assert.equal(res.body.rank, 4);
  });
});

describe('POST /api/reserve/options', () => {
  it(`hạng ${TOTAL_SLOTS + 1} chỉ được 50.000đ và nhóm Standard`, async () => {
    const email = await userAtRank(TOTAL_SLOTS + 1);

    const res = await options(email);

    assert.equal(res.body.rank, TOTAL_SLOTS + 1);
    assert.equal(res.body.budget, 50000);
    assert.deepEqual(res.body.pools, ['standard']);
  });

  it('bậc Standard không nhận được giá của mã VIP', async () => {
    const email = await userAtRank(TOTAL_SLOTS + 1);

    const res = await options(email);

    assert.equal(res.body.prices.VCB, undefined, 'rò giá mã VIP cho người không được chọn');
    assert.equal(typeof res.body.prices.PNJ, 'number');
  });

  it('không token thì trả bản xem thử với mức 100.000đ, cả hai nhóm', async () => {
    const res = await request(app).post('/api/reserve/options').send({});

    assert.equal(res.body.preview, true);
    assert.equal(res.body.rank, null);
    assert.equal(res.body.inTop, false);
    assert.equal(res.body.phase, 'open');
    assert.equal(res.body.budget, 100000);
    assert.deepEqual(res.body.pools, ['vip', 'standard']);
  });

  it('token sai cũng chỉ là bản xem thử, không phải lỗi', async () => {
    const res = await authed(request(app).post('/api/reserve/options'), 'token-gia');

    assert.equal(res.status, 200);
    assert.equal(res.body.preview, true);
  });

  it('trả lại lựa chọn đã ghi nhận để sửa', async () => {
    const email = await userAtRank(5);
    await reserve(email, ['VCB']);

    const res = await options(email);

    assert.deepEqual(res.body.selected, ['VCB']);
  });
});

describe('Quyền lợi tính theo hạng hiện tại, không chốt ở lần Reserve đầu', () => {
  it('hạng trôi xuống quá 1.000 thì ngân sách và nhóm tính lại theo hạng mới', async () => {
    const email = await userAtRank(3);
    const first = await reserve(email, ['VCB']);
    assert.equal(first.status, 200);
    assert.equal(first.body.budget, 100000);

    // Đẩy user xuống dưới hạng 1.000: thêm 1.200 người nhiều điểm hơn.
    await makeUsers(1200, { startIndex: 10000, invites: 1 });

    const res = await options(email);

    assert.equal(res.body.rank, 1203);
    assert.equal(res.body.inTop, false);
    assert.equal(res.body.budget, 50000);
    assert.deepEqual(res.body.pools, ['standard']);
    assert.equal(res.body.locked, undefined, 'không còn khái niệm chốt ở lần Reserve đầu');
  });

  it('hạng đã trôi thì không chọn được mã VIP nữa', async () => {
    const email = await userAtRank(3);
    await reserve(email, ['VCB']);
    await makeUsers(1200, { startIndex: 10000, invites: 1 });

    const res = await reserve(email, ['VCB', 'PNJ']);

    assert.equal(res.status, 400);
    assert.deepEqual(res.body.wrongPool, ['VCB']);
  });

  it('reservation.budget kiểu cũ không còn được tôn trọng', async () => {
    const email = await userAtRank(TOTAL_SLOTS + 1);
    await User.updateOne(
      { email },
      { $set: { reservation: { tickers: ['VCB'], lockedRank: 3, budget: 100000, allowedPools: ['vip', 'standard'] } } }
    );

    const res = await options(email);

    assert.equal(res.body.rank, TOTAL_SLOTS + 1);
    assert.equal(res.body.budget, 50000);
    assert.deepEqual(res.body.pools, ['standard']);
  });

  it('giá đã chốt được giữ nguyên dù snapshot đổi', async () => {
    const email = await userAtRank(3);
    await reserve(email, ['VCB']);

    // Giá VCB tăng vọt sau khi đã chọn
    await Price.updateOne({ _id: 'VCB' }, { $set: { price: 95000 } });

    const res = await reserve(email, ['VCB', 'FPT']);

    assert.equal(res.status, 200, res.body.error);
    assert.equal(res.body.totalValue, 40000, 'phải dùng giá đã đông cứng, không phải giá mới');
  });
});

describe('Ngân sách và nhóm khi Reserve', () => {
  it('tổng vượt ngân sách thì 400 kèm con số', async () => {
    const email = await userAtRank(TOTAL_SLOTS + 1); // ngân sách 50.000đ, mỗi mã 20.000đ

    const res = await reserve(email, ['PNJ', 'PLX', 'TPB']);

    assert.equal(res.status, 400);
    assert.match(res.body.error, /vượt ngân sách/);
    assert.equal(res.body.budget, 50000);
    assert.equal(res.body.totalValue, 60000);
  });

  it('bậc Standard chọn mã VIP thì 400 và nêu đích danh mã', async () => {
    const email = await userAtRank(TOTAL_SLOTS + 1);

    const res = await reserve(email, ['PNJ', 'VCB']);

    assert.equal(res.status, 400);
    assert.deepEqual(res.body.wrongPool, ['VCB']);
    assert.match(res.body.error, /VCB/);
  });

  it('thiếu giá trong snapshot thì 503, không âm thầm tính sai tổng', async () => {
    const email = await userAtRank(5);
    await Price.deleteOne({ _id: 'FPT' });

    const res = await reserve(email, ['VCB', 'FPT']);

    assert.equal(res.status, 503);
    assert.deepEqual(res.body.missing, ['FPT']);
  });

  it('reservation lưu giỏ, giá đã chốt và tổng; không ghi quyền lợi kiểu cũ', async () => {
    const email = await userAtRank(5);

    await reserve(email, ['VCB', 'FPT']);

    const saved = await User.findOne({ email }).lean();
    assert.deepEqual(saved.reservation.tickers, ['VCB', 'FPT']);
    assert.equal(saved.reservation.totalValue, 40000);
    assert.deepEqual(
      saved.reservation.lockedPrices.map((r) => r.ticker).sort(),
      ['FPT', 'VCB']
    );
    assert.equal(saved.reservation.lockedRank, undefined);
    assert.equal(saved.reservation.budget, undefined);
    assert.equal(saved.reservation.allowedPools, undefined);
  });
});

describe('Bảng giá', () => {
  it('mọi mã trong RESERVABLE đều có giá trong snapshot', async () => {
    const table = await getPriceTable();
    const all = Object.values(RESERVABLE).flat().map((s) => s.t);
    const missing = all.filter((t) => typeof table[t] !== 'number');

    assert.deepEqual(missing, [], `thiếu giá cho: ${missing.join(', ')}`);
  });

  it('nguồn giá chết thì giữ nguyên snapshot cũ', async () => {
    const before = await getPriceTable();
    // Adapter chưa cấu hình (không có PRICE_API_URL trong .env.test) nên refreshPrices ném lỗi.
    await assert.rejects(refreshPrices(), /Chưa cấu hình nguồn giá|chưa được hiện thực hoá/);

    assert.deepEqual(await getPriceTable(), before, 'snapshot bị thay đổi khi nguồn chết');
  });

  it('mọi mã đều phân được về đúng một nhóm VIP hoặc STANDARD', () => {
    const all = Object.values(RESERVABLE).flat().map((s) => s.t);
    const groups = all.map(groupTypeOfTicker);

    assert.deepEqual([...new Set(groups)].sort(), ['STANDARD', 'VIP']);
    assert.equal(groups.filter((g) => g === 'VIP').length, RESERVABLE.vip.length);
    assert.equal(groups.filter((g) => g === 'STANDARD').length, RESERVABLE.standard.length);
    // Mã lạ không được âm thầm rơi vào một nhóm nào đó
    assert.equal(groupTypeOfTicker('KHONGCO'), null);
  });

  it('groupType ngoài hai giá trị cho phép thì bị model từ chối', async () => {
    await assert.rejects(
      Price.create({ _id: 'ZZZ', price: 1000, updatedAt: new Date(), groupType: 'PREMIUM' }),
      /groupType/
    );
  });

  it('phát hiện được bậc quyền lợi không mua nổi mã nào', async () => {
    // Mọi mã Standard đắt hơn ngân sách 50.000đ của bậc sau top 1.000.
    await Price.updateMany({}, { $set: { price: 60000 } });

    const report = await checkBudgetFeasibility();
    const rest = report.find((r) => r.key === 'rest');

    assert.equal(rest.ok, false, 'không phát hiện được: bậc rest hết đường chọn mã');
    assert.equal(rest.cheapest, 60000);
    assert.equal(report.find((r) => r.key === 'top').ok, true);
  });
});
