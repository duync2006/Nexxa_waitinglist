import { BOOST, LEADERBOARD_PAGE_SIZE, POINTS_PER_INVITE } from '../config/constants.js';
import { TOTAL_SLOTS } from '../../shared/catalog.js';
import { User, nextJoinIndex } from '../models/index.js';
import { randomRefCode } from '../utils/codes.js';
import { maskEmail } from '../utils/mask.js';

export const findByEmail = (email) => User.findOne({ email });

export const findByRefCode = (code) => User.findOne({ refCode: String(code || '').toUpperCase() });

export const countUsers = () => User.countDocuments({});

const DAY_MS = 24 * 60 * 60 * 1000;

// Số người đăng ký trong 24h qua. Chạy trên index { createdAt: -1 }.
export const countRecent = (since = new Date(Date.now() - DAY_MS)) =>
  User.countDocuments({ createdAt: { $gte: since } });

// Bao nhiêu người gần nhất đẩy ra dải chạy ngang. 12 là đủ để dải không lặp lộ liễu trên
// màn rộng, mà vẫn không biến API công khai thành bản trích danh sách người dùng.
const RECENT_JOINS = 12;

// Người đăng ký gần nhất, email đã che. Sắp theo createdAt nên chạy trên index
// { createdAt: -1 } đã có sẵn cho last24h — không cần thêm index.
export async function listRecentJoins(limit = RECENT_JOINS) {
  const users = await User.find({}).sort({ createdAt: -1 }).limit(limit).select('email createdAt').lean();
  // .select() chỉ lấy đúng hai trường: tránh lỡ tay trả nguyên document ra ngoài sau này.
  return users.map((u) => ({ masked: maskEmail(u.email), at: u.createdAt }));
}

// Điểm = số lượt mời × POINTS_PER_INVITE. Không lưu riêng: suy ra từ invites nên không bao
// giờ lệch nhau, và sắp theo invites cũng chính là sắp theo điểm.
export const pointsOf = (invites) => (invites || 0) * POINTS_PER_INVITE;

// Thứ tự xếp hạng: điểm cao trước, bằng điểm thì ai đăng ký trước đứng trên.
// Chạy trên index { invites: -1, joinIndex: 1 }. Phải khớp với rankOf bên dưới.
export const RANK_ORDER = { invites: -1, joinIndex: 1 };

// Bảng xếp hạng công khai, phân trang. Chỉ trả email đã che.
// cutoff = điểm của người đứng hạng TOTAL_SLOTS (ngưỡng VIP); null khi chưa đủ người.
// page vượt quá số trang thì trả top rỗng chứ không báo lỗi.
export async function getLeaderboard(page = 1, pageSize = LEADERBOARD_PAGE_SIZE) {
  const p = Number.isInteger(page) && page > 0 ? page : 1;
  const skip = (p - 1) * pageSize;
  const [rows, total, edge] = await Promise.all([
    User.find({}).sort(RANK_ORDER).skip(skip).limit(pageSize).select('email invites').lean(),
    countUsers(),
    User.find({}).sort(RANK_ORDER).skip(TOTAL_SLOTS - 1).limit(1).select('invites').lean()
  ]);
  return {
    top: rows.map((u, i) => ({ rank: skip + i + 1, masked: maskEmail(u.email), points: pointsOf(u.invites) })),
    page: p,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    cutoff: edge.length ? pointsOf(edge[0].invites) : null
  };
}

export async function getStats() {
  // last24h cho trang biết TỐC ĐỘ lấp suất, không chỉ số suất còn lại: "còn 989" là tĩnh,
  // "37 người đăng ký hôm qua" mới nói lên bao giờ hết.
  // recent đi ké luôn request này: trang đã gọi /api/stats mỗi 30 giây rồi, thêm một
  // endpoint riêng cho ticker là nhân đôi số request mà không được gì.
  const [registered, last24h, recent] = await Promise.all([
    countUsers(),
    countRecent(),
    listRecentJoins()
  ]);
  return {
    registered,
    totalSlots: TOTAL_SLOTS,
    remaining: Math.max(0, TOTAL_SLOTS - registered),
    last24h,
    recent
  };
}

// Hạng = số người đứng trên + 1. Đứng trên nghĩa là nhiều điểm (lượt mời) hơn, hoặc bằng
// điểm nhưng đăng ký trước. Phải khớp đúng RANK_ORDER của bảng xếp hạng.
export async function rankOf(user) {
  const invites = user.invites || 0;
  const ahead = await User.countDocuments({
    $or: [
      { invites: { $gt: invites } },
      { invites, joinIndex: { $lt: user.joinIndex } }
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

  // Cộng điểm cho người mời: +1 lượt mời (= +10 điểm), ghi _id người được mời. score cũ
  // vẫn được cập nhật để dữ liệu nhất quán, dù không còn dùng để xếp hạng.
  // Cả ba nằm trong MỘT lệnh update nên invites và referees không bao giờ lệch nhau.
  if (user.referrer) {
    await User.updateOne(
      { _id: user.referrer },
      { $inc: { invites: 1, score: -BOOST }, $push: { referees: user._id } }
    );
  }

  return { user, created: true };
}
