// Chuyển dữ liệu cũ từ data/db.json sang MongoDB. Chạy một lần:
//   node server/migrate-json-to-mongo.js [đường dẫn db.json]
// Chạy lại nhiều lần vẫn an toàn (upsert theo email).
import fs from 'node:fs';
import path from 'node:path';
import { MongoClient } from 'mongodb';

const BOOST = 10;
const file = path.resolve(process.argv[2] || 'data/db.json');
const old = JSON.parse(fs.readFileSync(file, 'utf8'));

const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017');
await client.connect();
const db = client.db(process.env.MONGODB_DB || 'nexxa_waitlist');

const users = db.collection('users');
await users.createIndexes([
  { key: { email: 1 }, unique: true },
  { key: { refCode: 1 }, unique: true },
  { key: { score: 1, joinIndex: 1 } }
]);

if (old.users.length) {
  await users.bulkWrite(
    old.users.map((u) => ({
      replaceOne: {
        filter: { email: u.email },
        replacement: {
          ...u,
          score: u.joinIndex - BOOST * u.invites,
          createdAt: new Date(u.createdAt)
        },
        upsert: true
      }
    }))
  );
}

// Bộ đếm joinIndex tiếp tục từ số lớn nhất đã có
const maxJoin = Math.max(0, ...old.users.map((u) => u.joinIndex));
await db.collection('counters').updateOne(
  { _id: 'users' },
  { $max: { seq: maxJoin } },
  { upsert: true }
);

console.log(`Đã import ${old.users.length} user từ ${file}. OTP cũ bỏ qua (chỉ tồn tại 10 phút).`);
await client.close();
