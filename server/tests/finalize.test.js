import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { User } from '../models/index.js';
import { basketFits, finalizeTop } from '../services/finalize.service.js';
import { resetDb, seedPrices, setupDb, teardownDb } from './helpers/db.js';

before(setupDb);
after(teardownDb);
beforeEach(async () => {
  await resetDb();
  await seedPrices();
});

const VARS = ['TOP_START', 'TOP_DEADLINE', 'REPICK_DEADLINE'];
const saved = Object.fromEntries(VARS.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of VARS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const HOUR = 60 * 60 * 1000;
const PAST = new Date(Date.now() - 2 * HOUR); // đăng ký trước deadline
const setDeadline = () => {
  process.env.TOP_DEADLINE = new Date(Date.now() - HOUR).toISOString();
};
const quiet = { notify: async () => {} };

// Tạo n user joinIndex 1..n. invitesOf(j) quyết định điểm; extra(j) ghi đè/bổ sung field.
const seed = (n, invitesOf = () => 0, extra = () => ({})) =>
  User.insertMany(
    Array.from({ length: n }, (_, i) => {
      const j = i + 1;
      return {
        email: `u${j}@test.local`,
        refCode: `FN${String(j).padStart(5, '0')}`,
        joinIndex: j,
        score: j,
        invites: invitesOf(j),
        createdAt: PAST,
        ...extra(j)
      };
    })
  );

const basket = (tickers, price = 20000) => ({
  reservation: { tickers, lockedPrices: tickers.map((ticker) => ({ ticker, price })) }
});
const byJoin = (j) => User.findOne({ joinIndex: j }).lean();

describe('basketFits', () => {
  const std = { budget: 100000, pools: ['standard'] };
  const both = { budget: 100000, pools: ['vip', 'standard'] };

  it('giỏ rỗng thì vừa', () => assert.equal(basketFits([], () => undefined, std), true));
  it('trong ngân sách thì vừa', () => assert.equal(basketFits(['PNJ', 'KDH'], () => 50000, std), true));
  it('đúng bằng ngân sách thì vừa', () => assert.equal(basketFits(['PNJ', 'KDH'], () => 50000, std), true));
  it('vượt ngân sách thì không vừa', () => assert.equal(basketFits(['PNJ', 'KDH', 'DXG'], () => 40000, std), false));
  it('mã ngoài pools thì không vừa', () => assert.equal(basketFits(['VCB'], () => 1, std), false));
  it('mã vip vừa khi pools có vip', () => assert.equal(basketFits(['VCB'], () => 1, both), true));
  it('mã không có giá thì không vừa', () => assert.equal(basketFits(['PNJ'], () => undefined, std), false));
});

describe('finalizeTop', () => {
  it('trước deadline thì ném lỗi', async () => {
    process.env.TOP_DEADLINE = new Date(Date.now() + HOUR).toISOString();
    await assert.rejects(() => finalizeTop(), /Chưa tới TOP_DEADLINE/);
  });

  it('không có deadline thì ném lỗi', async () => {
    delete process.env.TOP_DEADLINE;
    await assert.rejects(() => finalizeTop(), /Chưa tới TOP_DEADLINE/);
  });

  it('chốt đúng 1.000 người inTop khi có 1.005 user', async () => {
    setDeadline();
    await seed(1005);
    const r = await finalizeTop(new Date(), quiet);

    assert.equal(r.total, 1005);
    assert.equal(r.top, 1000);
    assert.equal(await User.countDocuments({ 'final.inTop': true }), 1000);
    assert.equal(await User.countDocuments({ final: { $exists: true } }), 1005);
    assert.equal((await byJoin(1)).final.topRank, 1);
    assert.equal((await byJoin(1005)).final.inTop, false);
    assert.equal((await byJoin(1005)).final.budget, 50000);
  });

  it('dưới 1.000 user thì tất cả inTop', async () => {
    setDeadline();
    await seed(7);
    const r = await finalizeTop(new Date(), quiet);

    assert.equal(await User.countDocuments({ 'final.inTop': true }), 7);
    assert.equal(r.top, 7);
    assert.equal(r.first, 7);
    assert.equal(r.both, 7);
    assert.equal((await byJoin(3)).final.budget, 200000);
  });

  it('chạy lại lần hai không đổi gì, skipped = total', async () => {
    setDeadline();
    await seed(12, (j) => j % 3);
    await finalizeTop(new Date(), quiet);
    const before = await User.find().sort({ joinIndex: 1 }).lean();
    const r = await finalizeTop(new Date(), quiet);
    const after = await User.find().sort({ joinIndex: 1 }).lean();

    assert.equal(r.total, 12);
    assert.equal(r.skipped, 12);
    assert.deepEqual(after, before);
  });

  it('người Top bị đẩy ra có giỏ chứa VCB thì needsRepick và có email', async () => {
    setDeadline();
    // joinIndex 1..1000 có 1 điểm; 1001..1005 có 0 -> hạng 1001..1005, không First, không Top.
    await seed(1005, (j) => (j <= 1000 ? 1 : 0), (j) => (j === 1001 ? basket(['VCB']) : {}));
    const calls = [];
    const r = await finalizeTop(new Date(), {
      notify: async (email, info) => {
        calls.push({ email, info });
      }
    });

    const u = await byJoin(1001);
    assert.equal(u.final.inTop, false);
    assert.equal(u.final.needsRepick, true);
    assert.equal(r.needsRepick, 1);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].email, 'u1001@test.local');
    assert.equal(calls[0].info.budget, 50000);
    assert.deepEqual(calls[0].info.pools, ['standard']);
    assert.equal(calls[0].info.repickDeadline, null);
  });

  it('người First bị đẩy khỏi Top có giỏ 100k thì không needsRepick', async () => {
    setDeadline();
    // joinIndex 1..5 (First) có 0 điểm -> rớt khỏi Top, vẫn còn suất First 100.000đ.
    await seed(1005, (j) => (j <= 5 ? 0 : 1), (j) => (j === 3 ? basket(['VCB', 'FPT', 'HPG', 'MWG', 'VNM']) : {}));
    let n = 0;
    const r = await finalizeTop(new Date(), { notify: async () => { n++; } });

    const u = await byJoin(3);
    assert.equal(u.final.early, true);
    assert.equal(u.final.inTop, false);
    assert.equal(u.final.budget, 100000);
    assert.ok(!u.final.needsRepick);
    assert.equal(r.needsRepick, 0);
    assert.equal(n, 0);
  });

  it('người chưa chọn giỏ thì không needsRepick, không email', async () => {
    setDeadline();
    await seed(1005, (j) => (j <= 1000 ? 1 : 0));
    let n = 0;
    const r = await finalizeTop(new Date(), { notify: async () => { n++; } });

    assert.equal(r.needsRepick, 0);
    assert.equal(n, 0);
    assert.ok(!(await byJoin(1003)).final.needsRepick);
  });

  it('giá lấy từ lockedPrices trước, thiếu thì lấy snapshot', async () => {
    setDeadline();
    // Snapshot 20.000đ/mã. Người ngoài có ngân sách 50.000đ.
    await seed(1003, (j) => (j <= 1000 ? 1 : 0), (j) => {
      if (j === 1001) return basket(['PNJ', 'KDH'], 30000); // 60k > 50k
      if (j === 1002) return { reservation: { tickers: ['PNJ', 'KDH'], lockedPrices: [{ ticker: 'PNJ', price: 10000 }] } }; // 10k + 20k
      return {};
    });
    await finalizeTop(new Date(), quiet);

    assert.equal((await byJoin(1001)).final.needsRepick, true);
    assert.ok(!(await byJoin(1002)).final.needsRepick);
  });

  it('người đăng ký sau deadline không được xếp hạng và không có final', async () => {
    setDeadline();
    await seed(3);
    await User.create({
      email: 'late@test.local', refCode: 'LATE01', joinIndex: 4, score: 4, invites: 99,
      createdAt: new Date(Date.now() - 1000)
    });
    const r = await finalizeTop(new Date(), quiet);

    const late = await byJoin(4);
    assert.equal(late.final, undefined);
    assert.equal(r.total, 3);
    assert.equal(await User.countDocuments({ 'final.inTop': true }), 3);
    assert.equal((await byJoin(1)).final.topRank, 1);
  });
});
