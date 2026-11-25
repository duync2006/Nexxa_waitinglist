import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { User } from '../models/index.js';
import { basketFits, closeRepick, finalizeTop, trimBasket } from '../services/finalize.service.js';
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
  it('trong ngân sách thì vừa', () => assert.equal(basketFits(['PNJ', 'KDH'], () => 40000, std), true));
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
    assert.equal(r.inTopTotal, 1000, 'con số inTop đếm lại từ DB sau khi chạy');
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
    assert.equal(r.top, 0, 'lần chạy lại không chốt ai nên không đếm ai');
    assert.equal(r.inTopTotal, 12, 'nhưng con số từ DB vẫn đúng');
    assert.deepEqual(after, before);
  });

  it('nhiều lần chạy song song: mỗi người chỉ được đếm và gửi mail đúng một lần', async () => {
    setDeadline();
    // Giỏ 300.000đ vượt cả ngân sách cộng dồn 200.000đ -> ai cũng phải chọn lại.
    await seed(6, () => 0, () => basket(['VCB', 'FPT', 'HPG'], 100000));
    const mails = [];
    const notify = async (email) => { mails.push(email); };
    const runs = await Promise.all([1, 2, 3].map(() => finalizeTop(new Date(), { notify })));

    assert.equal(await User.countDocuments({ final: { $exists: true } }), 6);
    assert.deepEqual([...mails].sort(), Array.from({ length: 6 }, (_, i) => `u${i + 1}@test.local`).sort());
    const sum = (k) => runs.reduce((n, r) => n + r[k], 0);
    assert.equal(sum('needsRepick'), 6);
    assert.equal(sum('top'), 6);
    assert.equal(sum('first'), 6);
    assert.equal(sum('both'), 6);
    // Người đã bị lần chạy khác chốt trước thì tính là bỏ qua.
    assert.equal(sum('skipped'), 3 * 6 - 6);
    for (const r of runs) assert.equal(r.inTopTotal, 6);
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

  it('notify lỗi với một người thì vẫn chốt hết và ghi vào mailFailed', async () => {
    setDeadline();
    await seed(1005, (j) => (j <= 1000 ? 1 : 0), (j) => (j >= 1001 && j <= 1003 ? basket(['VCB']) : {}));
    const sent = [];
    const r = await finalizeTop(new Date(), {
      notify: async (email) => {
        if (email === 'u1002@test.local') throw new Error('smtp chết');
        sent.push(email);
      }
    });

    assert.equal(await User.countDocuments({ final: { $exists: true } }), 1005);
    assert.equal(r.needsRepick, 3);
    assert.deepEqual(r.mailFailed, ['u1002@test.local']);
    assert.deepEqual(sent.sort(), ['u1001@test.local', 'u1003@test.local']);
  });
});

describe('trimBasket', () => {
  const std = { budget: 50000, pools: ['standard'] };
  it('cắt giữ đúng thứ tự, không vượt 50.000đ, bỏ mã VIP', () => {
    assert.deepEqual(trimBasket(['VCB', 'PLX', 'TPB', 'REE'], () => 20000, std), ['PLX', 'TPB']);
  });
  it('mã không có giá thì bị loại, mã sau vẫn được xét', () => {
    const priceOf = (t) => (t === 'PLX' ? undefined : 20000);
    assert.deepEqual(trimBasket(['PLX', 'TPB'], priceOf, std), ['TPB']);
  });
  it('mã vượt ngân sách bị bỏ nhưng đi tiếp xét mã rẻ hơn phía sau', () => {
    const priceOf = (t) => (t === 'PLX' ? 60000 : 20000);
    assert.deepEqual(trimBasket(['PLX', 'TPB'], priceOf, std), ['TPB']);
  });
});

describe('closeRepick', () => {
  const setDeadlines = () => {
    process.env.TOP_DEADLINE = new Date(Date.now() - 3 * HOUR).toISOString();
    process.env.REPICK_DEADLINE = new Date(Date.now() - HOUR).toISOString();
  };
  const finalOf = (extra = {}) => ({
    early: false, topRank: 1001, inTop: false, budget: 50000, pools: ['standard'],
    finalizedAt: PAST, needsRepick: true, ...extra
  });
  const repickUser = (j, tickers, lockedPrices, extra = {}) => ({
    reservation: { tickers, lockedPrices },
    final: finalOf(extra)
  });

  it('cắt giữ đúng thứ tự, ghi totalValue và autoTrimmedAt', async () => {
    setDeadlines();
    await seed(1, () => 0, (j) => repickUser(j, ['VCB', 'PLX', 'TPB', 'REE'], [
      { ticker: 'VCB', price: 20000 }, { ticker: 'PLX', price: 20000 },
      { ticker: 'TPB', price: 20000 }, { ticker: 'REE', price: 20000 }
    ]));
    const r = await closeRepick();
    const u = await byJoin(1);

    assert.equal(r.trimmed, 1);
    assert.equal(r.emptied, 0);
    assert.deepEqual(u.reservation.tickers, ['PLX', 'TPB']);
    assert.equal(u.reservation.totalValue, 40000);
    assert.ok(u.final.autoTrimmedAt);
    assert.equal(u.reservation.lockedPrices.length, 4);
  });

  it('mã không có giá ở cả lockedPrices lẫn snapshot thì bị loại', async () => {
    setDeadlines();
    await seed(1, () => 0, (j) => repickUser(j, ['ZZZZ', 'PLX'], [{ ticker: 'PLX', price: 20000 }]));
    await closeRepick();
    assert.deepEqual((await byJoin(1)).reservation.tickers, ['PLX']);
  });

  it('mã thiếu trong lockedPrices được bổ sung giá snapshot', async () => {
    setDeadlines();
    await seed(1, () => 0, (j) => repickUser(j, ['PLX', 'TPB'], [{ ticker: 'PLX', price: 10000 }]));
    await closeRepick();
    const u = await byJoin(1);
    assert.deepEqual(u.reservation.tickers, ['PLX', 'TPB']);
    assert.equal(u.reservation.totalValue, 30000); // 10k (khoá) + 20k (snapshot)
    assert.deepEqual(u.reservation.lockedPrices.map((p) => p.ticker).sort(), ['PLX', 'TPB']);
  });

  it('giỏ cắt xong rỗng thì tính vào emptied và liệt kê email', async () => {
    setDeadlines();
    await seed(1, () => 0, (j) => repickUser(j, ['VCB'], [{ ticker: 'VCB', price: 20000 }]));
    const r = await closeRepick();
    const u = await byJoin(1);

    assert.equal(r.trimmed, 1);
    assert.equal(r.emptied, 1);
    assert.deepEqual(r.emptiedEmails, ['u1@test.local']);
    assert.deepEqual(u.reservation.tickers, []);
    assert.equal(u.reservation.totalValue, 0);
  });

  it('người đã repickedAt thì không bị cắt', async () => {
    setDeadlines();
    await seed(1, () => 0, (j) => repickUser(j, ['VCB', 'PLX'], [
      { ticker: 'VCB', price: 20000 }, { ticker: 'PLX', price: 20000 }
    ], { repickedAt: PAST }));
    const r = await closeRepick();
    const u = await byJoin(1);

    assert.equal(r.trimmed, 0);
    assert.deepEqual(u.reservation.tickers, ['VCB', 'PLX']);
    assert.ok(!u.final.autoTrimmedAt);
  });

  it('người không needsRepick thì không bị cắt', async () => {
    setDeadlines();
    await seed(1, () => 0, (j) => repickUser(j, ['PLX'], [{ ticker: 'PLX', price: 20000 }], { needsRepick: false }));
    const r = await closeRepick();
    assert.equal(r.trimmed, 0);
    assert.ok(!(await byJoin(1)).final.autoTrimmedAt);
  });

  it('chạy lại lần hai không cắt lần nữa', async () => {
    setDeadlines();
    await seed(1, () => 0, (j) => repickUser(j, ['VCB', 'PLX'], [
      { ticker: 'VCB', price: 20000 }, { ticker: 'PLX', price: 20000 }
    ]));
    await closeRepick();
    const before = await byJoin(1);
    const r = await closeRepick();

    assert.equal(r.trimmed, 0);
    assert.deepEqual(await byJoin(1), before);
  });

  it('trước REPICK_DEADLINE thì ném lỗi', async () => {
    process.env.TOP_DEADLINE = new Date(Date.now() - 3 * HOUR).toISOString();
    process.env.REPICK_DEADLINE = new Date(Date.now() + HOUR).toISOString();
    await assert.rejects(() => closeRepick(), /Chưa tới REPICK_DEADLINE/);
  });

  it('không có REPICK_DEADLINE thì ném lỗi', async () => {
    delete process.env.TOP_DEADLINE;
    delete process.env.REPICK_DEADLINE;
    await assert.rejects(() => closeRepick(), /Chưa tới REPICK_DEADLINE/);
  });
});
