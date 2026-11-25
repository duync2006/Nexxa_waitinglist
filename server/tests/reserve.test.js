import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../app.js';
import { User } from '../models/index.js';
import { authed, joinViaApi, resetDb, seedPrices, setupDb, teardownDb } from './helpers/db.js';

const app = createApp();

before(setupDb);
after(teardownDb);
beforeEach(async () => {
  await resetDb();
  // Reserve đọc snapshot giá, không có giá là 503 — mọi ca đều cần bảng giá.
  await seedPrices();
});

describe('POST /api/reserve', () => {
  it('không token thì 401', async () => {
    const res = await request(app).post('/api/reserve').send({ tickers: ['VCB'] });

    assert.equal(res.status, 401);
  });

  it('token của A không ghi được giỏ của B dù body gửi email B', async () => {
    const a = await joinViaApi(request, app, 'a@test.local');
    await joinViaApi(request, app, 'b@test.local');

    const res = await authed(request(app).post('/api/reserve'), a.body.token).send({ email: 'b@test.local', tickers: ['VCB'] });

    assert.equal(res.status, 200);
    const b = await User.findOne({ email: 'b@test.local' }).lean();
    assert.equal(b.reservation?.tickers, undefined);
    const aDoc = await User.findOne({ email: 'a@test.local' }).lean();
    assert.deepEqual(aDoc.reservation.tickers, ['VCB']);
  });

  it('không chọn mã nào thì 400', async () => {
    const tok = (await joinViaApi(request, app, 'a@test.local')).body.token;

    const res = await authed(request(app).post('/api/reserve'), tok).send({ tickers: [] });

    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Vui lòng chọn ít nhất một mã cổ phiếu.');
  });

  it('mã không thuộc danh sách Reserve thì 400', async () => {
    const tok = (await joinViaApi(request, app, 'a@test.local')).body.token;

    const res = await authed(request(app).post('/api/reserve'), tok).send({ tickers: ['VCB', 'KHONGCO'] });

    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Có mã cổ phiếu không thuộc danh sách Reserve.');
  });

  it('ghi nhận lựa chọn hợp lệ', async () => {
    const tok = (await joinViaApi(request, app, 'a@test.local')).body.token;

    const res = await authed(request(app).post('/api/reserve'), tok).send({ tickers: ['VCB', 'FPT'] });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true, tickers: ['VCB', 'FPT'], totalValue: 40000, budget: 100000 });
    const saved = await User.findOne({ email: 'a@test.local' });
    assert.deepEqual(saved.reservation.tickers, ['VCB', 'FPT']);
    assert.ok(saved.reservation.updatedAt instanceof Date);
  });

  it('mã viết thường vẫn nhận, và mã trùng bị gộp lại', async () => {
    const tok = (await joinViaApi(request, app, 'a@test.local')).body.token;

    const res = await authed(request(app).post('/api/reserve'), tok).send({ tickers: ['vcb', 'VCB', 'fpt'] });

    assert.deepEqual(res.body.tickers, ['VCB', 'FPT']);
  });

  it('chọn lại thì ghi đè lựa chọn cũ', async () => {
    const tok = (await joinViaApi(request, app, 'a@test.local')).body.token;
    await authed(request(app).post('/api/reserve'), tok).send({ tickers: ['VCB', 'FPT'] });

    await authed(request(app).post('/api/reserve'), tok).send({ tickers: ['HPG'] });

    const saved = await User.findOne({ email: 'a@test.local' });
    assert.deepEqual(saved.reservation.tickers, ['HPG']);
  });

  it('ghi reservation không làm mất các field khác của user', async () => {
    // Bẫy strict của Mongoose: field không khai báo trong schema sẽ bị xoá khi ghi.
    const inviter = await joinViaApi(request, app, 'inviter@test.local');
    const tok = (await joinViaApi(request, app, 'a@test.local', inviter.body.profile.refCode)).body.token;

    await authed(request(app).post('/api/reserve'), tok).send({ tickers: ['VCB'] });

    const saved = await User.findOne({ email: 'a@test.local' }).lean();
    for (const field of ['email', 'refCode', 'joinIndex', 'score', 'invites', 'referrer', 'referredBy', 'referees', 'createdAt', 'reservation']) {
      assert.ok(field in saved, `mất field ${field} sau khi ghi reservation`);
    }
    assert.equal(saved.referredBy, inviter.body.profile.refCode);
  });
});

describe('POST /api/reserve/options', () => {
  it('không token trả preview: true', async () => {
    const res = await request(app).post('/api/reserve/options').send({});

    assert.equal(res.status, 200);
    assert.equal(res.body.preview, true);
  });

  it('có token trả preview: false', async () => {
    const a = await joinViaApi(request, app, 'a@test.local');

    const res = await authed(request(app).post('/api/reserve/options'), a.body.token).send({});

    assert.equal(res.body.preview, false);
  });
});
