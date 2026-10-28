// Chuyển dữ liệu cũ từ data/db.json sang MongoDB. Chạy một lần:
//   node --env-file=.env server/scripts/migrate-json-to-mongo.js [đường dẫn db.json]
// Chạy lại nhiều lần vẫn an toàn (upsert theo email).
import fs from 'node:fs';
import path from 'node:path';
import { BOOST } from '../config/constants.js';
import { connectDb, disconnectDb } from '../db/connect.js';
import { User, Counter } from '../models/index.js';

const file = path.resolve(process.argv[2] || 'data/db.json');
const old = JSON.parse(fs.readFileSync(file, 'utf8'));

await connectDb();

if (old.users.length) {
  // Lượt 1: ghi user, để MongoDB tự cấp _id. Không gán _id tay — lần chạy thứ hai
  // sẽ lỗi vì replaceOne không cho đổi _id của document đã tồn tại.
  await User.bulkWrite(
    old.users.map((u) => ({
      replaceOne: {
        filter: { email: u.email },
        replacement: {
          ...u,
          score: u.joinIndex - BOOST * u.invites,
          referredBy: u.referredBy ?? null,
          referrer: null,
          referees: [],
          createdAt: new Date(u.createdAt)
        },
        upsert: true
      }
    }))
  );

  // Lượt 2: giờ đã có _id thật thì mới nối được quan hệ referrer/referees.
  // Bản migrate cũ bỏ qua hẳn hai field này.
  const saved = await User.find({}).lean();
  const byRefCode = new Map(saved.map((u) => [u.refCode, u]));

  const links = saved.map((u) => {
    const inviter = u.referredBy ? byRefCode.get(u.referredBy) : null;
    const referrer = inviter && !inviter._id.equals(u._id) ? inviter._id : null;
    const referees = saved
      .filter((o) => o.referredBy === u.refCode && !o._id.equals(u._id))
      .map((o) => o._id);
    return { updateOne: { filter: { _id: u._id }, update: { $set: { referrer, referees } } } };
  });

  if (links.length) await User.bulkWrite(links);
}

// Bộ đếm joinIndex tiếp tục từ số lớn nhất đã có
const maxJoin = Math.max(0, ...old.users.map((u) => u.joinIndex));
await Counter.updateOne({ _id: 'users' }, { $max: { seq: maxJoin } }, { upsert: true });

console.log(`Đã import ${old.users.length} user từ ${file}. OTP cũ bỏ qua (chỉ tồn tại 10 phút).`);
await disconnectDb();
