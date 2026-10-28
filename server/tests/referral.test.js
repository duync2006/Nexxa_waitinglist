import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../app.js';
import { BOOST } from '../config/constants.js';
import { User } from '../models/index.js';
import { joinViaApi, resetDb, setupDb, teardownDb } from './helpers/db.js';

const app = createApp();

before(setupDb);
after(teardownDb);
beforeEach(resetDb);

describe('Cộng điểm cho người mời', () => {
  it('mời được một người thì invites +1 và score -10', async () => {
    const inviter = await joinViaApi(request, app, 'inviter@test.local');

    await joinViaApi(request, app, 'moi@test.local', inviter.body.refCode);

    const saved = await User.findOne({ email: 'inviter@test.local' });
    assert.equal(saved.invites, 1);
    // joinIndex 1 - BOOST * 1 invites = -9
    assert.equal(saved.score, saved.joinIndex - BOOST);
  });

  it('ghi quan hệ đủ hai chiều: referrer của người được mời và referees của người mời', async () => {
    const inviter = await joinViaApi(request, app, 'inviter@test.local');
    await joinViaApi(request, app, 'moi@test.local', inviter.body.refCode);

    const a = await User.findOne({ email: 'inviter@test.local' });
    const b = await User.findOne({ email: 'moi@test.local' });

    assert.equal(String(b.referrer), String(a._id));
    assert.equal(b.referredBy, a.refCode);
    assert.deepEqual(a.referees.map(String), [String(b._id)]);
  });

  it('người mời vượt lên trên những người đăng ký trước mình', async () => {
    // u1 đăng ký đầu tiên VÀ mời được 1 người  -> score 1 - 10 = -9
    const u1 = await joinViaApi(request, app, 'u1@test.local');
    await joinViaApi(request, app, 'cua-u1@test.local', u1.body.refCode);
    // u2, u3 đăng ký, không mời ai            -> score 3, 4
    for (const n of [2, 3]) await joinViaApi(request, app, `u${n}@test.local`);

    const late = await joinViaApi(request, app, 'late@test.local'); // joinIndex 5, score 5
    assert.equal(late.body.rank, 5); // sau u1 (-9), cua-u1 (2), u2 (3), u3 (4)

    await joinViaApi(request, app, 'moi@test.local', late.body.refCode);

    // score 5 - 10 = -5: vượt qua u2 và u3, nhưng vẫn sau u1 vì -9 < -5.
    // Trừ 10 ĐIỂM, không phải nhảy 10 HẠNG — leo được bao nhiêu hạng tuỳ vào
    // có bao nhiêu người nằm trong khoảng điểm đó.
    const res = await request(app).post('/api/waitlist/check').send({ email: 'late@test.local' });
    assert.equal(res.body.profile.rank, 2);
  });

  it('mời nhiều người thì điểm cộng dồn', async () => {
    const inviter = await joinViaApi(request, app, 'inviter@test.local');

    for (const n of [1, 2, 3]) await joinViaApi(request, app, `moi${n}@test.local`, inviter.body.refCode);

    const saved = await User.findOne({ email: 'inviter@test.local' });
    assert.equal(saved.invites, 3);
    assert.equal(saved.score, saved.joinIndex - BOOST * 3);
    assert.equal(saved.referees.length, 3);
  });

  it('tự mời chính mình không được tính', async () => {
    const me = await joinViaApi(request, app, 'me@test.local');
    const before = await User.findOne({ email: 'me@test.local' });

    // Đăng ký lại bằng chính refCode của mình — rơi vào nhánh 409
    await joinViaApi(request, app, 'me@test.local', me.body.refCode);

    const after = await User.findOne({ email: 'me@test.local' });
    assert.equal(after.invites, before.invites);
    assert.equal(after.score, before.score);
    assert.deepEqual(after.referees, []);
  });

  it('refCode không tồn tại thì bỏ qua, vẫn đăng ký bình thường', async () => {
    const res = await joinViaApi(request, app, 'a@test.local', 'KHONGCO');

    assert.equal(res.status, 200);
    const saved = await User.findOne({ email: 'a@test.local' });
    assert.equal(saved.referrer, null);
    assert.equal(saved.referredBy, null);
  });

  it('người được mời không được cộng điểm, chỉ người mời', async () => {
    const inviter = await joinViaApi(request, app, 'inviter@test.local');
    await joinViaApi(request, app, 'moi@test.local', inviter.body.refCode);

    const invitee = await User.findOne({ email: 'moi@test.local' });
    assert.equal(invitee.invites, 0);
    assert.equal(invitee.score, invitee.joinIndex);
  });
});

describe('GET /r/:code', () => {
  it('vẫn phải là GET dù mọi API khác đã chuyển sang POST', async () => {
    // Đây là link người dùng bấm trong trình duyệt; điều hướng trình duyệt luôn gửi GET.
    assert.equal((await request(app).get('/r/ABC123')).status, 302);
    assert.equal((await request(app).post('/r/ABC123')).status, 404);
  });

  it('chuyển hướng về form đăng ký bằng đường dẫn tương đối', async () => {
    const res = await request(app).get('/r/ABC123');

    assert.equal(res.status, 302);
    assert.equal(res.headers.location, '../?ref=ABC123');
  });

  it('mã hoá ký tự đặc biệt trong mã mời', async () => {
    const res = await request(app).get('/r/' + encodeURIComponent('a b&c'));

    assert.equal(res.headers.location, '../?ref=a%20b%26c');
  });
});
