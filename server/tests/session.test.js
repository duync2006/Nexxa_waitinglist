import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../app.js';
import { Session } from '../models/index.js';
import { authed, joinViaApi, resetDb, setupDb, teardownDb } from './helpers/db.js';

const app = createApp();

before(setupDb);
after(teardownDb);
beforeEach(resetDb);

describe('token phiên', () => {
  it('verify trả token và profile', async () => {
    const res = await joinViaApi(request, app, 'a@test.local');

    assert.equal(res.status, 200);
    assert.equal(typeof res.body.token, 'string');
    assert.ok(res.body.token.length >= 40);
    assert.equal(res.body.profile.email, 'a@test.local');
  });

  it('token gốc không được lưu vào DB', async () => {
    const res = await joinViaApi(request, app, 'a@test.local');

    assert.equal(await Session.countDocuments({ hash: res.body.token }), 0);
    assert.equal(await Session.countDocuments({}), 1);
  });

  it('email đã đăng ký xác thực lại thì 200 kèm token mới', async () => {
    const first = await joinViaApi(request, app, 'a@test.local');

    const res = await joinViaApi(request, app, 'a@test.local');

    assert.equal(res.status, 200);
    assert.equal(res.body.alreadyRegistered, true);
    assert.notEqual(res.body.token, first.body.token);
    assert.equal(res.body.profile.joinIndex, 1);
  });

  it('check không trả profile', async () => {
    await joinViaApi(request, app, 'a@test.local');

    const res = await request(app).post('/api/waitlist/check').send({ email: 'a@test.local' });

    assert.deepEqual(res.body, { exists: true });
  });

  it('/me không token thì 401', async () => {
    const res = await request(app).post('/api/waitlist/me');

    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'Phiên đăng nhập đã hết hạn. Vui lòng xác thực lại email.');
  });

  it('/me có token thì trả profile đúng email', async () => {
    const { body } = await joinViaApi(request, app, 'a@test.local');

    const res = await authed(request(app).post('/api/waitlist/me'), body.token);

    assert.equal(res.status, 200);
    assert.equal(res.body.email, 'a@test.local');
  });

  it('logout xong token cũ thì 401', async () => {
    const { body } = await joinViaApi(request, app, 'a@test.local');

    const out = await authed(request(app).post('/api/waitlist/logout'), body.token);
    assert.deepEqual(out.body, { ok: true });

    const res = await authed(request(app).post('/api/waitlist/me'), body.token);
    assert.equal(res.status, 401);
  });

  it('session hết hạn thì 401', async () => {
    const { body } = await joinViaApi(request, app, 'a@test.local');
    await Session.updateOne({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });

    const res = await authed(request(app).post('/api/waitlist/me'), body.token);

    assert.equal(res.status, 401);
  });
});
