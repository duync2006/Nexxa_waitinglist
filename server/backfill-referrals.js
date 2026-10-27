// Điền hai field referrer / referees cho các user đã có sẵn trong DB.
// Nguồn sự thật là referredBy (refCode của người mời) — chạy lại nhiều lần vẫn an toàn.
//
//   node --env-file=.env server/backfill-referrals.js           # chạy thử, không ghi gì
//   node --env-file=.env server/backfill-referrals.js --apply   # ghi thật
import { MongoClient } from 'mongodb';

const apply = process.argv.includes('--apply');

const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017');
await client.connect();
const db = client.db(process.env.MONGODB_DB || 'nexxa_waitlist');
const users = db.collection('users');

const all = await users.find({}).sort({ joinIndex: 1 }).toArray();
const byRefCode = new Map(all.map((u) => [u.refCode, u]));

const ops = [];
const warnings = [];

for (const u of all) {
  const inviter = u.referredBy ? byRefCode.get(u.referredBy) : null;
  if (u.referredBy && !inviter) {
    warnings.push(`${u.email}: referredBy="${u.referredBy}" không khớp refCode nào, đặt referrer = null`);
  }
  const referrer = inviter && !inviter._id.equals(u._id) ? inviter._id : null;
  const referees = all.filter((o) => o.referredBy && o.referredBy === u.refCode && !o._id.equals(u._id)).map((o) => o._id);

  if (u.invites !== referees.length) {
    warnings.push(`${u.email}: invites=${u.invites} nhưng tìm thấy ${referees.length} người được mời — giữ nguyên invites và score`);
  }

  // Thiếu field khác với field có giá trị null/[] — user cũ chưa có field vẫn phải được ghi.
  const has = (k) => Object.prototype.hasOwnProperty.call(u, k);
  const same =
    has('referrer') && has('referees') &&
    String(u.referrer ?? null) === String(referrer) &&
    JSON.stringify(u.referees.map(String)) === JSON.stringify(referees.map(String));
  if (same) continue;

  ops.push({ updateOne: { filter: { _id: u._id }, update: { $set: { referrer, referees } } } });
  console.log(`  #${u.joinIndex} ${u.email}`);
  console.log(`      referrer: ${u.referrer ?? '(chưa có)'} -> ${referrer}`);
  console.log(`      referees: ${JSON.stringify((u.referees ?? []).map(String))} -> ${JSON.stringify(referees.map(String))}`);
}

if (warnings.length) {
  console.log('\nCảnh báo:');
  for (const w of warnings) console.log('  - ' + w);
}

if (ops.length === 0) {
  console.log('\nKhông có gì phải đổi.');
} else if (apply) {
  const res = await users.bulkWrite(ops);
  console.log(`\nĐã cập nhật ${res.modifiedCount}/${all.length} user.`);
} else {
  console.log(`\nChạy thử: ${ops.length}/${all.length} user sẽ đổi. Thêm --apply để ghi thật.`);
}

await client.close();
