// Lưu trữ bằng MongoDB. Cấu hình qua biến môi trường:
//   MONGODB_URI (mặc định mongodb://localhost:27017)
//   MONGODB_DB  (mặc định nexxa_waitlist)
import crypto from 'node:crypto';
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const MONGODB_DB = process.env.MONGODB_DB || 'nexxa_waitlist';
console.log('[store] kết nối MongoDB:', MONGODB_URI, 'DB:', MONGODB_DB);
// Mỗi lượt mời thành công = +10 bậc cho người mời.
// score = joinIndex - BOOST * invites; hạng càng nhỏ càng cao, cùng score thì ai đăng ký trước đứng trên.
const BOOST = 10;

const client = new MongoClient(MONGODB_URI);
const db = client.db(MONGODB_DB);
const users = db.collection('users');
const otps = db.collection('otps');
const counters = db.collection('counters');

const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

async function newRefCode() {
  for (;;) {
    const code = Array.from(crypto.randomBytes(6), (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join('');
    if (!(await users.findOne({ refCode: code }, { projection: { _id: 1 } }))) return code;
  }
}

// Số thứ tự đăng ký tăng dần, atomic qua collection counters.
async function nextJoinIndex() {
  const doc = await counters.findOneAndUpdate(
    { _id: 'users' },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  return doc.seq;
}

export async function connectStore() {
  await client.connect();
  await users.createIndexes([
    { key: { email: 1 }, unique: true },
    { key: { refCode: 1 }, unique: true },
    { key: { score: 1, joinIndex: 1 } }
  ]);
  await otps.createIndexes([
    { key: { email: 1 }, unique: true },
    // MongoDB tự xóa OTP sau khi hết hạn
    { key: { expiresAt: 1 }, expireAfterSeconds: 0 }
  ]);
}

export const store = {
  findUser: (email) => users.findOne({ email }),
  findByRef: (code) => users.findOne({ refCode: String(code || '').toUpperCase() }),
  countUsers: () => users.countDocuments({}),

  // Trả về { user, created }. created=false nghĩa là email đã đăng ký từ trước, không tạo trùng.
  async createUser(email, referredBy) {
    const existing = await store.findUser(email);
    if (existing) return { user: existing, created: false };

    const inviter = referredBy ? await store.findByRef(referredBy) : null;
    const validInviter = inviter && inviter.email !== email ? inviter : null;
    const joinIndex = await nextJoinIndex();
    const user = {
      email,
      refCode: await newRefCode(),
      joinIndex,
      score: joinIndex,
      invites: 0,
      // referrer giữ _id của người mời, referredBy giữ refCode của họ cho dễ tra bằng mắt
      referrer: validInviter ? validInviter._id : null,
      referredBy: validInviter ? validInviter.refCode : null,
      // _id của những người đăng ký qua link mời của user này
      referees: [],
      createdAt: new Date()
    };

    try {
      await users.insertOne(user);
    } catch (err) {
      // Hai request cùng email chạy song song: unique index chặn, trả về bản ghi đã có
      if (err.code === 11000) {
        const dup = await store.findUser(email);
        if (dup) return { user: dup, created: false };
      }
      throw err;
    }

    // insertOne gán _id vào user, nên tới đây đã có id để ghi vào referees của người mời
    if (user.referrer) {
      await users.updateOne(
        { _id: user.referrer },
        { $inc: { invites: 1, score: -BOOST }, $push: { referees: user._id } }
      );
    }
    return { user, created: true };
  },

  // Hạng = số người có score nhỏ hơn, hoặc bằng score nhưng đăng ký trước, cộng 1.
  async rankOf(user) {
    const ahead = await users.countDocuments({
      $or: [
        { score: { $lt: user.score } },
        { score: user.score, joinIndex: { $lt: user.joinIndex } }
      ]
    });
    return ahead + 1;
  },

  getOtp: (email) => otps.findOne({ email }),
  setOtp(email, record) {
    const { _id, ...fields } = record;
    return otps.replaceOne({ email }, { ...fields, email }, { upsert: true });
  },
  clearOtp: (email) => otps.deleteOne({ email }),

  // Ghi nhận các mã đã chọn Reserve cho user (ghi đè lựa chọn trước đó)
  saveReservation: (email, tickers) =>
    users.updateOne({ email }, { $set: { reservation: { tickers, updatedAt: new Date() } } })
};
