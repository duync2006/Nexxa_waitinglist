import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../app.js';
import { User } from '../models/index.js';
import { joinViaApi, resetDb, seedPrices, setupDb, teardownDb } from './helpers/db.js';

const app = createApp();

before(setupDb);
after(teardownDb);
beforeEach(async () => {
  await resetDb();
  // Reserve đọc snapshot giá, không có giá là 503 — mọi ca đều cần bảng giá.
  await seedPrices();
});

describe('POST /api/reserve', () => {
  it('email sai định dạng thì 400', async () => {
    const res = await request(app).post('/api/reserve').send({ email: 'xxx', tickers: ['VCB'] });

    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Email chưa đúng định dạng.');
  });

  it('email chưa tham gia waitlist thì 403', async () => {
    const res = await request(app).post('/api/reserve').send({ email: 'chua@test.local', tickers: ['VCB'] });

    assert.equal(res.status, 403);
    assert.equal(res.body.error, 'Email này chưa tham gia waitlist. Vui lòng đăng ký trước khi nhận quà.');
  });

  it('không chọn mã nào thì 400', async () => {
    await joinViaApi(request, app, 'a@test.local');

    const res = await request(app).post('/api/reserve').send({ email: 'a@test.local', tickers: [] });

    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Vui lòng chọn ít nhất một mã cổ phiếu.');
  });

  it('mã không thuộc danh sách Reserve thì 400', async () => {
    await joinViaApi(request, app, 'a@test.local');

    const res = await request(app).post('/api/reserve').send({ email: 'a@test.local', tickers: ['VCB', 'KHONGCO'] });

    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Có mã cổ phiếu không thuộc danh sách Reserve.');
  });

  it('ghi nhận lựa chọn hợp lệ', async () => {
    await joinViaApi(request, app, 'a@test.local');

    const res = await request(app).post('/api/reserve').send({ email: 'a@test.local', tickers: ['VCB', 'FPT'] });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true, tickers: ['VCB', 'FPT'], totalValue: 40000, budget: 100000 });
    const saved = await User.findOne({ email: 'a@test.local' });
    assert.deepEqual(saved.reservation.tickers, ['VCB', 'FPT']);
    assert.ok(saved.reservation.updatedAt instanceof Date);
  });

  it('mã viết thường vẫn nhận, và mã trùng bị gộp lại', async () => {
    await joinViaApi(request, app, 'a@test.local');

    const res = await request(app).post('/api/reserve').send({ email: 'a@test.local', tickers: ['vcb', 'VCB', 'fpt'] });

    assert.deepEqual(res.body.tickers, ['VCB', 'FPT']);
  });

  it('chọn lại thì ghi đè lựa chọn cũ', async () => {
    await joinViaApi(request, app, 'a@test.local');
    await request(app).post('/api/reserve').send({ email: 'a@test.local', tickers: ['VCB', 'FPT'] });

    await request(app).post('/api/reserve').send({ email: 'a@test.local', tickers: ['HPG'] });

    const saved = await User.findOne({ email: 'a@test.local' });
    assert.deepEqual(saved.reservation.tickers, ['HPG']);
  });

  it('ghi reservation không làm mất các field khác của user', async () => {
    // Bẫy strict của Mongoose: field không khai báo trong schema sẽ bị xoá khi ghi.
    const inviter = await joinViaApi(request, app, 'inviter@test.local');
    await joinViaApi(request, app, 'a@test.local', inviter.body.refCode);

    await request(app).post('/api/reserve').send({ email: 'a@test.local', tickers: ['VCB'] });

    const saved = await User.findOne({ email: 'a@test.local' }).lean();
    for (const field of ['email', 'refCode', 'joinIndex', 'score', 'invites', 'referrer', 'referredBy', 'referees', 'createdAt', 'reservation']) {
      assert.ok(field in saved, `mất field ${field} sau khi ghi reservation`);
    }
    assert.equal(saved.referredBy, inviter.body.refCode);
  });
});
