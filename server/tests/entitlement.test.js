import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../app.js';
import { Price, User } from '../models/index.js';
import { RESERVABLE, TOTAL_SLOTS } from '../../shared/catalog.js';
import { checkBudgetFeasibility, getPriceTable, refreshPrices } from '../services/price.service.js';
import { resetDb, seedPrices, setupDb, teardownDb } from './helpers/db.js';

const app = createApp();

before(setupDb);
after(teardownDb);
beforeEach(async () => {
  await resetDb();
  await seedPrices();
});

// Tạo user trực tiếp trong DB: đi qua API thì 1.000 user mất vài phút, mà ở đây chỉ cần
// score và joinIndex đúng để rankOf tính ra hạng mong muốn.
async function makeUsers(count, { startIndex = 1, score } = {}) {
  const docs = [];
  for (let i = 0; i < count; i++) {
    const n = startIndex + i;
    docs.push({
      email: `u${n}@test.local`,
      refCode: `T${String(n).padStart(5, '0')}`,
      joinIndex: n,
      score: score === undefined ? n : score(n),
      invites: 0,
      referrer: null,
      referredBy: null,
      referees: [],
      createdAt: new Date()
    });
  }
  await User.insertMany(docs);
  return docs;
}

// Tạo đúng `rank - 1` người đứng trên rồi trả về email của người ở hạng `rank`.
async function userAtRank(rank) {
  if (rank > 1) await makeUsers(rank - 1);
  const [me] = await makeUsers(1, { startIndex: rank });
  return me.email;
}

const options = (email) => request(app).post('/api/reserve/options').send({ email });

describe('POST /api/reserve/options', () => {
  it(`hạng ${TOTAL_SLOTS} được 100.000đ và cả hai nhóm`, async () => {
    const email = await userAtRank(TOTAL_SLOTS);

    const res = await options(email);

    assert.equal(res.status, 200);
    assert.equal(res.body.rank, TOTAL_SLOTS);
    assert.equal(res.body.budget, 100000);
    assert.deepEqual(res.body.pools, ['vip', 'standard']);
    assert.equal(res.body.locked, false);
    assert.equal(res.body.preview, false);
  });

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

  it('email rỗng thì trả bản xem thử với mức cao nhất', async () => {
    const res = await options('');

    assert.equal(res.body.preview, true);
    assert.equal(res.body.rank, null);
    assert.equal(res.body.budget, 100000);
    assert.deepEqual(res.body.pools, ['vip', 'standard']);
  });

  it('email chưa đăng ký cũng chỉ là bản xem thử, không phải lỗi', async () => {
    const res = await options('nguoi-la@test.local');

    assert.equal(res.status, 200);
    assert.equal(res.body.preview, true);
  });

  it('trả lại lựa chọn đã ghi nhận để sửa', async () => {
    const email = await userAtRank(5);
    await request(app).post('/api/reserve').send({ email, tickers: ['VCB'] });

    const res = await options(email);

    assert.deepEqual(res.body.selected, ['VCB']);
  });
});

describe('Chốt quyền lợi ở lần Reserve đầu tiên', () => {
  it('hạng trôi xuống quá 1.000 vẫn giữ ngân sách và nhóm đã chốt', async () => {
    const email = await userAtRank(3);
    const first = await request(app).post('/api/reserve').send({ email, tickers: ['VCB'] });
    assert.equal(first.status, 200);
    assert.equal(first.body.budget, 100000);

    // Đẩy user xuống dưới hạng 1.000: thêm 1.200 người có score nhỏ hơn.
    await makeUsers(1200, { startIndex: 10000, score: (n) => -n });

    const res = await options(email);

    assert.equal(res.body.locked, true);
    assert.equal(res.body.budget, 100000);
    assert.deepEqual(res.body.pools, ['vip', 'standard']);
    assert.equal(res.body.rank, 3, 'lockedRank phải là hạng lúc chốt, không phải hạng hiện tại');
  });

  it('vẫn chọn được mã VIP sau khi hạng đã trôi', async () => {
    const email = await userAtRank(3);
    await request(app).post('/api/reserve').send({ email, tickers: ['VCB'] });
    await makeUsers(1200, { startIndex: 10000, score: (n) => -n });

    const res = await request(app).post('/api/reserve').send({ email, tickers: ['FPT', 'HPG'] });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.tickers, ['FPT', 'HPG']);
  });

  it('giá đã chốt được giữ nguyên dù snapshot đổi', async () => {
    const email = await userAtRank(3);
    await request(app).post('/api/reserve').send({ email, tickers: ['VCB'] });

    // Giá VCB tăng vọt sau khi đã chốt
    await Price.updateOne({ _id: 'VCB' }, { $set: { price: 95000 } });

    const res = await request(app).post('/api/reserve').send({ email, tickers: ['VCB', 'FPT'] });

    assert.equal(res.status, 200, res.body.error);
    assert.equal(res.body.totalValue, 40000, 'phải dùng giá đã đông cứng, không phải giá mới');
  });
});

describe('Ngân sách và nhóm khi Reserve', () => {
  it('tổng vượt ngân sách thì 400 kèm con số', async () => {
    const email = await userAtRank(TOTAL_SLOTS + 1); // ngân sách 50.000đ, mỗi mã 20.000đ

    const res = await request(app).post('/api/reserve').send({ email, tickers: ['PNJ', 'PLX', 'TPB'] });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /vượt ngân sách/);
    assert.equal(res.body.budget, 50000);
    assert.equal(res.body.totalValue, 60000);
  });

  it('bậc Standard chọn mã VIP thì 400 và nêu đích danh mã', async () => {
    const email = await userAtRank(TOTAL_SLOTS + 1);

    const res = await request(app).post('/api/reserve').send({ email, tickers: ['PNJ', 'VCB'] });

    assert.equal(res.status, 400);
    assert.deepEqual(res.body.wrongPool, ['VCB']);
    assert.match(res.body.error, /VCB/);
  });

  it('thiếu giá trong snapshot thì 503, không âm thầm tính sai tổng', async () => {
    const email = await userAtRank(5);
    await Price.deleteOne({ _id: 'FPT' });

    const res = await request(app).post('/api/reserve').send({ email, tickers: ['VCB', 'FPT'] });

    assert.equal(res.status, 503);
    assert.deepEqual(res.body.missing, ['FPT']);
  });

  it('reservation lưu lại đủ phần đã chốt', async () => {
    const email = await userAtRank(5);

    await request(app).post('/api/reserve').send({ email, tickers: ['VCB', 'FPT'] });

    const saved = await User.findOne({ email }).lean();
    assert.equal(saved.reservation.lockedRank, 5);
    assert.equal(saved.reservation.budget, 100000);
    assert.deepEqual(saved.reservation.allowedPools, ['vip', 'standard']);
    assert.equal(saved.reservation.totalValue, 40000);
    assert.deepEqual(
      saved.reservation.lockedPrices.map((r) => r.ticker).sort(),
      ['FPT', 'VCB']
    );
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
