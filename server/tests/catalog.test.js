import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../app.js';
import { Price } from '../models/index.js';
import { RESERVABLE, TOTAL_SLOTS } from '../../shared/catalog.js';
import { resetDb, seedPrices, setupDb, teardownDb } from './helpers/db.js';

const app = createApp();

before(setupDb);
after(teardownDb);
beforeEach(resetDb);

describe('POST /api/catalog', () => {
  it('trả về danh mục đủ để frontend dựng giao diện', async () => {
    await seedPrices();

    const res = await request(app).post('/api/catalog');

    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.body).sort(), ['entitlements', 'pools', 'stocks', 'totalSlots']);
    assert.equal(res.body.totalSlots, TOTAL_SLOTS);
    assert.equal(res.body.pools.length, 2);
    assert.deepEqual(res.body.pools.map((p) => p.groupType), ['VIP', 'STANDARD']);
    assert.equal(res.body.entitlements.length, 2);
  });

  it('mỗi mã có đủ mã, tên, nhóm và giá', async () => {
    await seedPrices({ VCB: 90000 });

    const { stocks } = (await request(app).post('/api/catalog')).body;
    const vcb = stocks.find((s) => s.t === 'VCB');

    assert.deepEqual(vcb, {
      t: 'VCB',
      n: 'Công ty VCB',
      pool: 'vip',
      groupType: 'VIP',
      price: 90000
    });
  });

  it('phân đúng số mã về hai nhóm', async () => {
    await seedPrices();

    const { stocks } = (await request(app).post('/api/catalog')).body;

    assert.equal(stocks.filter((s) => s.pool === 'vip').length, RESERVABLE.vip.length);
    assert.equal(stocks.filter((s) => s.pool === 'standard').length, RESERVABLE.standard.length);
  });

  it('danh sách mã lấy từ collection prices, không phải từ catalog tĩnh', async () => {
    await seedPrices();
    await Price.deleteOne({ _id: 'VCB' });

    const { stocks } = (await request(app).post('/api/catalog')).body;

    assert.equal(stocks.find((s) => s.t === 'VCB'), undefined, 'mã đã xoá khỏi DB vẫn xuất hiện');
    assert.equal(stocks.length, RESERVABLE.vip.length + RESERVABLE.standard.length - 1);
  });

  it('dòng ghi trước khi có groupType vẫn được suy ra nhóm, không biến mất', async () => {
    await seedPrices();
    await Price.updateOne({ _id: 'VCB' }, { $unset: { groupType: '' } });

    const { stocks } = (await request(app).post('/api/catalog')).body;

    assert.equal(stocks.find((s) => s.t === 'VCB')?.groupType, 'VIP');
  });

  it('chưa có bảng giá thì trả danh mục rỗng chứ không lỗi', async () => {
    const res = await request(app).post('/api/catalog');

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.stocks, []);
    // totalSlots và bậc quà không phụ thuộc bảng giá nên vẫn phải có
    assert.equal(res.body.totalSlots, TOTAL_SLOTS);
  });
});
