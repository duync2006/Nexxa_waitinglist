import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../app.js';
import { MAX_ATTEMPTS } from '../config/constants.js';
import { Otp, User } from '../models/index.js';
import { joinViaApi, resetDb, setupDb, teardownDb } from './helpers/db.js';

const app = createApp();

before(setupDb);
after(teardownDb);
beforeEach(resetDb);

describe('GET /api/stats', () => {
  it('đếm số người đã xác thực và suất còn lại', async () => {
    await joinViaApi(request, app, 'a@test.local');

    const res = await request(app).post('/api/stats');

    assert.equal(res.status, 200);
    const { recent, ...counts } = res.body;
    assert.deepEqual(counts, { registered: 1, totalSlots: 1000, remaining: 999, last24h: 1 });
    assert.equal(recent.length, 1);
  });

  it('recent che khúc giữa email và không trả email gốc', async () => {
    await joinViaApi(request, app, 'nguyenvana@gmail.com');

    const res = await request(app).post('/api/stats');

    assert.deepEqual(res.body.recent.map((r) => r.masked), ['ng•••••a@gmail.com']);
    // Quan trọng hơn cả định dạng: email gốc không được nằm ở BẤT KỲ đâu trong response,
    // kể cả một trường thừa ai đó thêm vào sau này.
    assert.ok(!JSON.stringify(res.body).includes('nguyenvana'));
  });

  it('recent sắp người đăng ký mới nhất lên trước', async () => {
    await User.insertMany([
      { email: 'cu@test.local', refCode: 'OLD001', joinIndex: 1, score: 1, invites: 0, createdAt: new Date(Date.now() - 60_000) },
      { email: 'moi@test.local', refCode: 'NEW001', joinIndex: 2, score: 2, invites: 0, createdAt: new Date() }
    ]);

    const res = await request(app).post('/api/stats');

    // 'moi' đủ dài để giữ 1 đầu 1 cuối, 'cu' chỉ còn giữ nổi 1 ký tự
    assert.deepEqual(res.body.recent.map((r) => r.masked), ['m••i@test.local', 'c•@test.local']);
  });

  it('last24h chỉ đếm người đăng ký trong 24 giờ gần nhất', async () => {
    await joinViaApi(request, app, 'moi@test.local');
    // Người cũ: createdAt lùi 2 ngày nên nằm ngoài cửa sổ đếm
    await User.create({
      email: 'cu@test.local',
      refCode: 'OLD001',
      joinIndex: 2,
      score: 2,
      invites: 0,
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    });

    const res = await request(app).post('/api/stats');

    assert.equal(res.body.registered, 2);
    assert.equal(res.body.last24h, 1);
  });

  it('remaining không âm khi đã vượt quá tổng số suất', async () => {
    // Nhét thẳng 1001 user vào DB cho nhanh, không qua API
    await User.insertMany(
      Array.from({ length: 1001 }, (_, i) => ({
        email: `u${i}@test.local`,
        refCode: `CODE${String(i).padStart(3, '0')}`,
        joinIndex: i + 1,
        score: i + 1,
        invites: 0
      }))
    );

    const res = await request(app).post('/api/stats');

    assert.equal(res.body.registered, 1001);
    assert.equal(res.body.remaining, 0);
  });
});

describe('POST /api/waitlist/request-otp', () => {
  it('từ chối email sai định dạng', async () => {
    const res = await request(app).post('/api/waitlist/request-otp').send({ email: 'khong-phai-email' });

    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Email chưa đúng định dạng. Vui lòng kiểm tra lại.');
  });

  it('gửi lại trong vòng 60 giây thì bị chặn kèm retryAfter', async () => {
    await request(app).post('/api/waitlist/request-otp').send({ email: 'a@test.local' });

    const res = await request(app).post('/api/waitlist/request-otp').send({ email: 'a@test.local' });

    assert.equal(res.status, 429);
    assert.equal(res.body.retryAfter, 60);
    assert.match(res.body.error, /^Vui lòng đợi \d+ giây/);
  });

  it('quá thời gian chờ thì cấp mã mới và xoá số lần nhập sai', async () => {
    await request(app).post('/api/waitlist/request-otp').send({ email: 'a@test.local' });
    await Otp.updateOne({ email: 'a@test.local' }, { $set: { attempts: 3, sentAt: new Date(Date.now() - 61_000) } });

    const res = await request(app).post('/api/waitlist/request-otp').send({ email: 'a@test.local' });

    assert.equal(res.status, 200);
    assert.equal((await Otp.findOne({ email: 'a@test.local' })).attempts, 0);
  });

  it('không lưu mã gốc xuống DB, chỉ lưu hash', async () => {
    const res = await request(app).post('/api/waitlist/request-otp').send({ email: 'a@test.local' });

    const record = await Otp.findOne({ email: 'a@test.local' });
    assert.notEqual(record.hash, res.body.devOtp);
    assert.equal(record.hash.length, 64);
  });
});

describe('POST /api/waitlist/verify', () => {
  it('mã sai thì báo lỗi và tăng số lần nhập sai', async () => {
    await request(app).post('/api/waitlist/request-otp').send({ email: 'a@test.local' });

    const res = await request(app).post('/api/waitlist/verify').send({ email: 'a@test.local', otp: '000000' });

    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Mã OTP không đúng. Vui lòng kiểm tra lại.');
    assert.equal((await Otp.findOne({ email: 'a@test.local' })).attempts, 1);
  });

  it(`sai quá ${MAX_ATTEMPTS} lần thì phải xin mã mới`, async () => {
    await request(app).post('/api/waitlist/request-otp').send({ email: 'a@test.local' });
    await Otp.updateOne({ email: 'a@test.local' }, { $set: { attempts: MAX_ATTEMPTS } });

    const res = await request(app).post('/api/waitlist/verify').send({ email: 'a@test.local', otp: '000000' });

    assert.equal(res.status, 429);
    assert.equal(res.body.error, 'Nhập sai quá nhiều lần. Vui lòng gửi lại mã mới.');
  });

  it('mã hết hạn thì báo hết hạn', async () => {
    const otpRes = await request(app).post('/api/waitlist/request-otp').send({ email: 'a@test.local' });
    await Otp.updateOne({ email: 'a@test.local' }, { $set: { expiresAt: new Date(Date.now() - 1000) } });

    const res = await request(app).post('/api/waitlist/verify').send({ email: 'a@test.local', otp: otpRes.body.devOtp });

    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Mã đã hết hạn. Vui lòng bấm "Gửi lại mã".');
  });

  it('chưa từng xin mã thì cũng báo hết hạn', async () => {
    const res = await request(app).post('/api/waitlist/verify').send({ email: 'chua@test.local', otp: '123456' });

    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Mã đã hết hạn. Vui lòng bấm "Gửi lại mã".');
  });

  it('xác thực thành công trả về đúng hình dạng profile và xoá bản ghi OTP', async () => {
    const res = await joinViaApi(request, app, 'a@test.local');

    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.body).sort(), ['email', 'invites', 'rank', 'refCode', 'registered'].sort());
    assert.equal(res.body.email, 'a@test.local');
    assert.equal(res.body.rank, 1);
    assert.equal(res.body.invites, 0);
    assert.equal(res.body.refCode.length, 6);
    assert.equal(await Otp.countDocuments({ email: 'a@test.local' }), 0);
  });

  it('email đã đăng ký thì trả 409 kèm alreadyRegistered và profile hiện tại', async () => {
    await joinViaApi(request, app, 'a@test.local');

    const res = await joinViaApi(request, app, 'a@test.local');

    assert.equal(res.status, 409);
    assert.equal(res.body.error, 'Email này đã tham gia waitlist.');
    assert.equal(res.body.alreadyRegistered, true);
    assert.equal(res.body.profile.email, 'a@test.local');
    assert.equal(res.body.profile.rank, 1);
    assert.equal(await User.countDocuments({ email: 'a@test.local' }), 1);
  });

  it('5 request song song cùng email chỉ tạo đúng một user', async () => {
    const otpRes = await request(app).post('/api/waitlist/request-otp').send({ email: 'a@test.local' });
    const otp = otpRes.body.devOtp;

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app).post('/api/waitlist/verify').send({ email: 'a@test.local', otp })
      )
    );

    assert.equal(results.filter((r) => r.status === 200).length, 1);
    assert.equal(await User.countDocuments({ email: 'a@test.local' }), 1);
  });

  it('email viết hoa và có khoảng trắng vẫn khớp với lúc xin mã', async () => {
    const otpRes = await request(app).post('/api/waitlist/request-otp').send({ email: '  A@Test.Local  ' });

    const res = await request(app).post('/api/waitlist/verify').send({ email: 'a@test.local', otp: otpRes.body.devOtp });

    assert.equal(res.status, 200);
    assert.equal(res.body.email, 'a@test.local');
  });
});

describe('Mọi API đều là POST', () => {
  it('gọi bằng GET thì không còn route nào khớp', async () => {
    for (const path of ['/api/stats', '/api/waitlist/check', '/api/waitlist/request-otp', '/api/waitlist/verify', '/api/reserve']) {
      const res = await request(app).get(path);
      assert.equal(res.status, 404, `${path} vẫn trả lời GET`);
    }
  });
});

describe('POST /api/waitlist/check', () => {
  it('email sai định dạng thì 400', async () => {
    const res = await request(app).post('/api/waitlist/check').send({ email: 'khong-phai-email' });

    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Email chưa đúng định dạng. Vui lòng kiểm tra lại.');
  });

  it('email chưa đăng ký thì exists=false', async () => {
    const res = await request(app).post('/api/waitlist/check').send({ email: 'moi@test.local' });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { exists: false });
  });

  it('email đã đăng ký thì trả kèm profile hiện tại', async () => {
    const joined = await joinViaApi(request, app, 'a@test.local');

    const res = await request(app).post('/api/waitlist/check').send({ email: 'a@test.local' });

    assert.equal(res.body.exists, true);
    assert.deepEqual(res.body.profile, joined.body);
  });
});

describe('POST /api/leaderboard', () => {
  const seed = (n, invitesOf = () => 0) =>
    User.insertMany(Array.from({ length: n }, (_, i) => ({
      email: `user${i + 1}@test.local`, refCode: `LB${String(i + 1).padStart(4, '0')}`,
      joinIndex: i + 1, score: i + 1, invites: invitesOf(i + 1)
    })));

  it('xếp theo điểm, bằng điểm thì ai vào trước đứng trên; email được che', async () => {
    await User.insertMany([
      { email: 'anhnguyen@test.local', refCode: 'AAA001', joinIndex: 1, score: 1, invites: 0 },
      { email: 'binhtran@test.local', refCode: 'BBB001', joinIndex: 2, score: -28, invites: 3 },
      { email: 'cuongle@test.local', refCode: 'CCC001', joinIndex: 3, score: -27, invites: 3 }
    ]);

    const res = await request(app).post('/api/leaderboard');

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.top.map((r) => [r.rank, r.points]), [[1, 30], [2, 30], [3, 0]]);
    assert.equal(res.body.top[0].masked, 'bi•••••n@test.local');
    assert.equal(res.body.cutoff, null);
    assert.ok(!JSON.stringify(res.body).includes('binhtran'));
  });

  it('mỗi trang 7 người, page 2 tiếp nối hạng của page 1', async () => {
    await seed(10);

    const p1 = await request(app).post('/api/leaderboard').send({ page: 1 });
    const p2 = await request(app).post('/api/leaderboard').send({ page: 2 });

    assert.deepEqual(p1.body.top.map((r) => r.rank), [1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual(p2.body.top.map((r) => r.rank), [8, 9, 10]);
    assert.equal(p1.body.total, 10);
    assert.equal(p1.body.totalPages, 2);
  });

  it('page không hợp lệ thì về trang 1, vượt quá thì trả rỗng', async () => {
    await seed(3);

    const bad = await request(app).post('/api/leaderboard').send({ page: 'abc' });
    const far = await request(app).post('/api/leaderboard').send({ page: 99 });

    assert.equal(bad.body.page, 1);
    assert.equal(bad.body.top.length, 3);
    assert.deepEqual(far.body.top, []);
  });

  it('hạng trong profile khớp với bảng xếp hạng', async () => {
    await seed(5, (n) => (n === 4 ? 2 : 0));

    const res = await request(app).post('/api/waitlist/check').send({ email: 'user4@test.local' });

    assert.equal(res.body.profile.rank, 1);
  });
});
