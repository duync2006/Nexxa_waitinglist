import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../app.js';
import { Counter, User } from '../models/index.js';
import { FIRST_SLOTS } from '../../shared/catalog.js';
import { getCampaign, invitesOpen, phaseOf } from '../config/campaign.js';
import { authed, joinViaApi, resetDb, seedPrices, setupDb, teardownDb } from './helpers/db.js';

const app = createApp();

before(setupDb);
after(teardownDb);
beforeEach(async () => {
  await resetDb();
  await seedPrices();
});

// campaign.js đọc process.env ở MỖI lần gọi, nên từng ca tự đặt biến rồi trả lại như cũ.
const VARS = ['TOP_START', 'TOP_DEADLINE', 'REPICK_DEADLINE'];
const saved = Object.fromEntries(VARS.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of VARS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const HOUR = 60 * 60 * 1000;
const iso = (ms) => new Date(Date.now() + ms).toISOString();
const unset = () => VARS.forEach((k) => delete process.env[k]);

describe('Đồng hồ campaign', () => {
  it('thiếu TOP_DEADLINE thì phase open', () => {
    unset();

    assert.deepEqual(getCampaign(), { topStart: null, topDeadline: null, repickDeadline: null });
    assert.equal(phaseOf(null), 'open');
    assert.equal(phaseOf({ final: { budget: 100000 } }), 'open');
    assert.equal(invitesOpen(), true);
  });

  it('trước TOP_DEADLINE thì open và còn cộng lượt mời', () => {
    unset();
    process.env.TOP_DEADLINE = iso(HOUR);

    assert.equal(phaseOf({}), 'open');
    assert.equal(invitesOpen(), true);
  });

  it('sau deadline chưa finalize thì frozen', () => {
    unset();
    process.env.TOP_DEADLINE = iso(-HOUR);
    process.env.REPICK_DEADLINE = iso(HOUR);

    assert.equal(phaseOf({}), 'frozen');
    assert.equal(phaseOf(null), 'frozen');
    assert.equal(invitesOpen(), false);
  });

  it('có final và trước REPICK_DEADLINE thì repick', () => {
    unset();
    process.env.TOP_DEADLINE = iso(-HOUR);
    process.env.REPICK_DEADLINE = iso(HOUR);

    assert.equal(phaseOf({ final: { budget: 50000 } }), 'repick');
  });

  it('có final mà không có REPICK_DEADLINE thì vẫn repick', () => {
    unset();
    process.env.TOP_DEADLINE = iso(-HOUR);

    assert.equal(phaseOf({ final: { budget: 50000 } }), 'repick');
  });

  it('sau REPICK_DEADLINE thì closed', () => {
    unset();
    process.env.TOP_DEADLINE = iso(-2 * HOUR);
    process.env.REPICK_DEADLINE = iso(-HOUR);

    assert.equal(phaseOf({ final: { budget: 50000 } }), 'closed');
    // Chưa finalize thì vẫn là frozen, kể cả khi đã qua REPICK_DEADLINE.
    assert.equal(phaseOf({}), 'frozen');
  });

  it('nhận tham số now thay cho giờ hiện tại', () => {
    unset();
    process.env.TOP_DEADLINE = '2027-01-01T00:00:00+07:00';
    process.env.REPICK_DEADLINE = '2027-01-08T00:00:00+07:00';
    const user = { final: { budget: 100000 } };

    assert.equal(phaseOf(user, new Date('2026-12-31T16:59:59Z')), 'open');
    assert.equal(phaseOf(user, new Date('2026-12-31T17:00:00Z')), 'repick');
    assert.equal(phaseOf(user, new Date('2027-01-07T17:00:00Z')), 'closed');
    assert.equal(invitesOpen(new Date('2026-12-31T17:00:00Z')), false);
  });

  it('REPICK_DEADLINE trước TOP_DEADLINE thì getCampaign ném lỗi', () => {
    unset();
    process.env.TOP_DEADLINE = '2027-01-08T00:00:00+07:00';
    process.env.REPICK_DEADLINE = '2027-01-01T00:00:00+07:00';

    assert.throws(() => getCampaign(), /REPICK_DEADLINE phải sau TOP_DEADLINE/);
  });

  it('REPICK_DEADLINE bằng TOP_DEADLINE cũng ném lỗi', () => {
    unset();
    process.env.TOP_DEADLINE = '2027-01-01T00:00:00+07:00';
    process.env.REPICK_DEADLINE = '2027-01-01T00:00:00+07:00';

    assert.throws(() => getCampaign(), /REPICK_DEADLINE phải sau TOP_DEADLINE/);
  });

  it('có REPICK_DEADLINE mà thiếu TOP_DEADLINE thì ném lỗi', () => {
    unset();
    process.env.REPICK_DEADLINE = '2027-01-01T00:00:00+07:00';

    assert.throws(() => getCampaign(), /TOP_DEADLINE/);
  });

  it('ngày sai định dạng thì ném lỗi nêu tên biến', () => {
    unset();
    process.env.TOP_DEADLINE = 'thứ hai tuần sau';
    assert.throws(() => getCampaign(), /^Error: TOP_DEADLINE không phải ngày hợp lệ: thứ hai tuần sau/);

    unset();
    process.env.TOP_START = '2027-13-45';
    assert.throws(() => getCampaign(), /TOP_START không phải ngày hợp lệ/);
  });

  it('ngày thiếu múi giờ thì ném lỗi, tránh lệch theo giờ máy chủ', () => {
    unset();
    process.env.TOP_DEADLINE = '2027-01-01T00:00:00';

    assert.throws(() => getCampaign(), /TOP_DEADLINE không phải ngày hợp lệ/);
  });

  it('trả Date cho cả ba mốc', () => {
    unset();
    process.env.TOP_START = '2026-12-01T00:00:00+07:00';
    process.env.TOP_DEADLINE = '2027-01-01T00:00:00+07:00';
    process.env.REPICK_DEADLINE = '2027-01-08T00:00:00Z';

    const c = getCampaign();

    assert.equal(c.topStart.toISOString(), '2026-11-30T17:00:00.000Z');
    assert.equal(c.topDeadline.toISOString(), '2026-12-31T17:00:00.000Z');
    assert.equal(c.repickDeadline.toISOString(), '2027-01-08T00:00:00.000Z');
  });
});

describe('Sau TOP_DEADLINE', () => {
  it('sau deadline join qua ref không cộng invites nhưng vẫn lưu referrer', async () => {
    unset();
    const inviter = await joinViaApi(request, app, 'inviter@test.local');
    process.env.TOP_DEADLINE = iso(-HOUR);

    const res = await joinViaApi(request, app, 'moi@test.local', inviter.body.profile.refCode);

    assert.equal(res.status, 200);
    const a = await User.findOne({ email: 'inviter@test.local' });
    const b = await User.findOne({ email: 'moi@test.local' });
    assert.equal(a.invites, 0);
    assert.equal(a.score, a.joinIndex, 'score cũng không được cộng');
    assert.deepEqual(a.referees.map(String), [String(b._id)]);
    assert.equal(String(b.referrer), String(a._id));
    assert.equal(b.referredBy, a.refCode);
  });

  it('reserve khi frozen thì 423', async () => {
    unset();
    const { token } = (await joinViaApi(request, app, 'a@test.local')).body;
    // Đăng ký TRƯỚC deadline (nếu không sẽ là người đăng ký muộn, không bị frozen).
    await User.updateOne({ email: 'a@test.local' }, { $set: { createdAt: new Date(Date.now() - 2 * HOUR) } });
    process.env.TOP_DEADLINE = iso(-HOUR);

    const res = await authed(request(app).post('/api/reserve'), token).send({ tickers: ['VCB'] });

    assert.equal(res.status, 423);
    assert.equal(res.body.error, 'Đang chốt kết quả Top 1.000. Vui lòng quay lại sau.');
    const saved = await User.findOne({ email: 'a@test.local' }).lean();
    assert.equal(saved.reservation, undefined);
  });

  it('reserve khi closed thì 423', async () => {
    unset();
    const { token } = (await joinViaApi(request, app, 'a@test.local')).body;
    await User.updateOne(
      { email: 'a@test.local' },
      { $set: { final: { early: true, topRank: 1, inTop: true, budget: 200000, pools: ['vip', 'standard'], finalizedAt: new Date(), needsRepick: false } } }
    );
    process.env.TOP_DEADLINE = iso(-2 * HOUR);
    process.env.REPICK_DEADLINE = iso(-HOUR);

    const res = await authed(request(app).post('/api/reserve'), token).send({ tickers: ['VCB'] });

    assert.equal(res.status, 423);
    assert.equal(res.body.error, 'Đã hết hạn chọn cổ phiếu.');
  });

  it('giai đoạn repick dùng quyền lợi đã chốt và ghi final.repickedAt', async () => {
    unset();
    const { token } = (await joinViaApi(request, app, 'a@test.local')).body;
    // Quyền lợi chốt khác hẳn quyền lợi tính theo hạng hiện tại (First + Top = 200.000đ).
    await User.updateOne(
      { email: 'a@test.local' },
      { $set: { final: { early: false, topRank: 1500, inTop: false, budget: 50000, pools: ['standard'], finalizedAt: new Date(), needsRepick: true } } }
    );
    process.env.TOP_DEADLINE = iso(-HOUR);
    process.env.REPICK_DEADLINE = iso(HOUR);

    const vip = await authed(request(app).post('/api/reserve'), token).send({ tickers: ['VCB'] });
    assert.equal(vip.status, 400);
    assert.deepEqual(vip.body.wrongPool, ['VCB']);

    const ok = await authed(request(app).post('/api/reserve'), token).send({ tickers: ['PNJ', 'PLX'] });
    assert.equal(ok.status, 200, ok.body.error);
    assert.equal(ok.body.budget, 50000);

    const saved = await User.findOne({ email: 'a@test.local' }).lean();
    assert.deepEqual(saved.reservation.tickers, ['PNJ', 'PLX']);
    assert.ok(saved.final.repickedAt instanceof Date);
    assert.equal(saved.final.budget, 50000, 'ghi giỏ không được làm mất phần đã chốt');
  });

  it('người không cần chọn lại thì không bị ghi repickedAt', async () => {
    unset();
    const { token } = (await joinViaApi(request, app, 'a@test.local')).body;
    await User.updateOne(
      { email: 'a@test.local' },
      { $set: { final: { early: true, topRank: 1, inTop: true, budget: 200000, pools: ['vip', 'standard'], finalizedAt: new Date(), needsRepick: false } } }
    );
    process.env.TOP_DEADLINE = iso(-HOUR);

    const res = await authed(request(app).post('/api/reserve'), token).send({ tickers: ['VCB'] });

    assert.equal(res.status, 200, res.body.error);
    const saved = await User.findOne({ email: 'a@test.local' }).lean();
    assert.equal(saved.final.repickedAt, undefined);
  });

  it('người đăng ký sau deadline (chưa finalize) không bị frozen, được 50.000đ standard và chọn được', async () => {
    unset();
    process.env.TOP_DEADLINE = iso(-HOUR);
    process.env.REPICK_DEADLINE = iso(HOUR);
    // Hết suất First: người này là #1.001, đăng ký sau khi cuộc đua đã khép nên không có
    // lượt mời nào được tính, không có hạng Top.
    await Counter.updateOne({ _id: 'users' }, { $set: { seq: FIRST_SLOTS } }, { upsert: true });

    const joined = await joinViaApi(request, app, 'muon@test.local');
    const { profile, token } = joined.body;

    assert.equal(profile.early, false);
    assert.equal(profile.rank, null);
    assert.equal(profile.inTop, false);
    assert.equal(profile.vip, false);
    assert.equal(profile.budget, 50000);

    const opts = await authed(request(app).post('/api/reserve/options'), token);
    assert.equal(opts.body.phase, 'repick');
    assert.equal(opts.body.inTop, false);
    assert.equal(opts.body.budget, 50000);
    assert.deepEqual(opts.body.pools, ['standard']);

    const vip = await authed(request(app).post('/api/reserve'), token).send({ tickers: ['VCB'] });
    assert.equal(vip.status, 400);

    const ok = await authed(request(app).post('/api/reserve'), token).send({ tickers: ['PNJ'] });
    assert.equal(ok.status, 200, ok.body.error);
    const saved = await User.findOne({ email: 'muon@test.local' }).lean();
    assert.deepEqual(saved.reservation.tickers, ['PNJ']);
    assert.equal(saved.final, undefined, 'không được tự sinh final cho người đăng ký muộn');
  });

  it('người đăng ký sau deadline vẫn còn suất First thì được 100.000đ', async () => {
    unset();
    process.env.TOP_DEADLINE = iso(-HOUR);

    const { profile, token } = (await joinViaApi(request, app, 'muon@test.local')).body;

    assert.equal(profile.early, true);
    assert.equal(profile.inTop, false);
    assert.equal(profile.budget, 100000, 'chỉ suất First, không cộng Top');

    const res = await authed(request(app).post('/api/reserve'), token).send({ tickers: ['VCB', 'FPT'] });
    assert.equal(res.status, 200, res.body.error);
    assert.equal(res.body.budget, 100000);
  });

  it('sau REPICK_DEADLINE người đăng ký muộn cũng closed', async () => {
    unset();
    process.env.TOP_DEADLINE = iso(-2 * HOUR);
    process.env.REPICK_DEADLINE = iso(-HOUR);

    const { token } = (await joinViaApi(request, app, 'muon@test.local')).body;
    const user = await User.findOne({ email: 'muon@test.local' });

    assert.equal(phaseOf(user), 'closed');
    const res = await authed(request(app).post('/api/reserve'), token).send({ tickers: ['PNJ'] });
    assert.equal(res.status, 423);
    assert.equal(res.body.error, 'Đã hết hạn chọn cổ phiếu.');
  });

  it('người đăng ký trước deadline mà chưa finalize vẫn frozen', () => {
    unset();
    const topDeadline = new Date(Date.now() - HOUR);
    process.env.TOP_DEADLINE = topDeadline.toISOString();

    assert.equal(phaseOf({ createdAt: new Date(topDeadline.getTime() - 1) }), 'frozen');
    assert.equal(phaseOf({ createdAt: topDeadline }), 'repick');
  });

  it('options trả phase và quyền lợi đã chốt', async () => {
    unset();
    const { token } = (await joinViaApi(request, app, 'a@test.local')).body;
    await User.updateOne(
      { email: 'a@test.local' },
      { $set: { final: { early: false, topRank: 1500, inTop: false, budget: 50000, pools: ['standard'], finalizedAt: new Date(), needsRepick: true } } }
    );
    process.env.TOP_DEADLINE = iso(-HOUR);

    const res = await authed(request(app).post('/api/reserve/options'), token);

    assert.equal(res.body.phase, 'repick');
    assert.equal(res.body.inTop, false);
    assert.equal(res.body.rank, 1500);
    assert.equal(res.body.budget, 50000);
    assert.deepEqual(res.body.pools, ['standard']);
  });
});

// profile (/me) và /reserve/options cùng trả phase, needsRepick, repickDeadline để frontend
// hiện đúng thông báo: đang chốt, phải chọn lại trước hạn, hay đã hết hạn.
describe('phase, needsRepick, repickDeadline trong profile và options', () => {
  const FINAL = { early: false, topRank: 1500, inTop: false, budget: 50000, pools: ['standard'], finalizedAt: new Date() };
  const both = async (token) => {
    const me = await authed(request(app).post('/api/waitlist/me'), token);
    const opts = await authed(request(app).post('/api/reserve/options'), token);
    assert.equal(me.status, 200, me.body.error);
    assert.equal(opts.status, 200, opts.body.error);
    return [me.body, opts.body];
  };
  const pick = (b) => ({ phase: b.phase, needsRepick: b.needsRepick, repickDeadline: b.repickDeadline });

  it('user bình thường trước deadline: open, không cần chọn lại, chưa có hạn chọn lại', async () => {
    unset();
    const { token } = (await joinViaApi(request, app, 'a@test.local')).body;

    for (const body of await both(token)) {
      assert.deepEqual(pick(body), { phase: 'open', needsRepick: false, repickDeadline: null });
    }
  });

  it('user đăng ký trước deadline chưa finalize: frozen', async () => {
    unset();
    const { token } = (await joinViaApi(request, app, 'a@test.local')).body;
    await User.updateOne({ email: 'a@test.local' }, { $set: { createdAt: new Date(Date.now() - 2 * HOUR) } });
    const repick = iso(HOUR);
    process.env.TOP_DEADLINE = iso(-HOUR);
    process.env.REPICK_DEADLINE = repick;

    for (const body of await both(token)) {
      assert.deepEqual(pick(body), { phase: 'frozen', needsRepick: false, repickDeadline: repick });
    }
  });

  it('user needsRepick chưa chọn lại: repick + needsRepick; chọn lại xong thì hết needsRepick', async () => {
    unset();
    const { token } = (await joinViaApi(request, app, 'a@test.local')).body;
    await User.updateOne({ email: 'a@test.local' }, { $set: { final: { ...FINAL, needsRepick: true } } });
    const repick = iso(HOUR);
    process.env.TOP_DEADLINE = iso(-HOUR);
    process.env.REPICK_DEADLINE = repick;

    for (const body of await both(token)) {
      assert.deepEqual(pick(body), { phase: 'repick', needsRepick: true, repickDeadline: repick });
    }

    const ok = await authed(request(app).post('/api/reserve'), token).send({ tickers: ['PNJ'] });
    assert.equal(ok.status, 200, ok.body.error);
    for (const body of await both(token)) {
      assert.equal(body.needsRepick, false);
    }
  });

  it('user needsRepick đã bị tự cắt giỏ thì không còn needsRepick', async () => {
    unset();
    const { token } = (await joinViaApi(request, app, 'a@test.local')).body;
    await User.updateOne(
      { email: 'a@test.local' },
      { $set: { final: { ...FINAL, needsRepick: true, autoTrimmedAt: new Date() } } }
    );
    process.env.TOP_DEADLINE = iso(-2 * HOUR);
    process.env.REPICK_DEADLINE = iso(-HOUR);

    for (const body of await both(token)) {
      assert.equal(body.phase, 'closed');
      assert.equal(body.needsRepick, false);
    }
  });

  it('người đăng ký muộn: repick, không needsRepick', async () => {
    unset();
    const repick = iso(HOUR);
    process.env.TOP_DEADLINE = iso(-HOUR);
    process.env.REPICK_DEADLINE = repick;
    const { token } = (await joinViaApi(request, app, 'muon@test.local')).body;

    for (const body of await both(token)) {
      assert.deepEqual(pick(body), { phase: 'repick', needsRepick: false, repickDeadline: repick });
    }
  });

  it('bản xem thử (không token) cũng có đủ ba field', async () => {
    unset();
    const res = await request(app).post('/api/reserve/options');
    assert.deepEqual(pick(res.body), { phase: 'open', needsRepick: false, repickDeadline: null });
  });
});
