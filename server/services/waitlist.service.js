import { BOOST } from '../config/constants.js';
import { TOTAL_SLOTS } from '../../shared/catalog.js';
import { User, nextJoinIndex } from '../models/index.js';
import { randomRefCode } from '../utils/codes.js';

export const findByEmail = (email) => User.findOne({ email });

export const findByRefCode = (code) => User.findOne({ refCode: String(code || '').toUpperCase() });

export const countUsers = () => User.countDocuments({});

export async function getStats() {
  const registered = await countUsers();
  return { registered, totalSlots: TOTAL_SLOTS, remaining: Math.max(0, TOTAL_SLOTS - registered) };
}

// Hạng = số người đứng trên + 1. Đứng trên nghĩa là score nhỏ hơn, hoặc bằng score
// nhưng đăng ký trước. Chạy trên index { score: 1, joinIndex: 1 }.
export async function rankOf(user) {
  const ahead = await User.countDocuments({
    $or: [
      { score: { $lt: user.score } },
      { score: user.score, joinIndex: { $lt: user.joinIndex } }
    ]
  });
  return ahead + 1;
}

// Hình dạng này frontend đang đọc trực tiếp — đổi key là vỡ giao diện.
export async function toProfile(user) {
  return {
    email: user.email,
    rank: await rankOf(user),
    registered: await countUsers(),
    refCode: user.refCode,
    invites: user.invites
  };
}

async function uniqueRefCode() {
  for (;;) {
    const code = randomRefCode();
    if (!(await User.exists({ refCode: code }))) return code;
  }
}

// Trả về { user, created }. created=false nghĩa là email đã đăng ký từ trước — caller
// quyết định trả 409 hay không, service không biết gì về HTTP.
export async function join(email, referredByCode) {
  const existing = await findByEmail(email);
  if (existing) return { user: existing, created: false };

  const inviter = referredByCode ? await findByRefCode(referredByCode) : null;
  // Tự mời chính mình thì không tính
  const validInviter = inviter && inviter.email !== email ? inviter : null;

  const joinIndex = await nextJoinIndex();
  let user;
  try {
    user = await User.create({
      email,
      refCode: await uniqueRefCode(),
      joinIndex,
      score: joinIndex,
      invites: 0,
      referrer: validInviter ? validInviter._id : null,
      referredBy: validInviter ? validInviter.refCode : null,
      referees: [],
      createdAt: new Date()
    });
  } catch (err) {
    // Hai request cùng email chạy song song: unique index chặn cái thứ hai.
    if (err.code === 11000) {
      const dup = await findByEmail(email);
      if (dup) return { user: dup, created: false };
    }
    throw err;
  }

  // Cộng điểm cho người mời: +1 lượt mời, -10 điểm, và ghi _id người được mời.
  // Cả ba nằm trong MỘT lệnh update nên invites và referees không bao giờ lệch nhau.
  if (user.referrer) {
    await User.updateOne(
      { _id: user.referrer },
      { $inc: { invites: 1, score: -BOOST }, $push: { referees: user._id } }
    );
  }

  return { user, created: true };
}
