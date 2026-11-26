import { BOOST, LEADERBOARD_PAGE_SIZE, POINTS_PER_INVITE } from '../config/constants.js';
import { FIRST_SLOTS, TOTAL_SLOTS, entitlementOf, isEarlyJoin, isTopRank, isVip } from '../../shared/catalog.js';
import { getCampaign, invitesOpen, isLateRegistrant, phaseInfo } from '../config/campaign.js';
import { User, nextJoinIndex } from '../models/index.js';
import { randomRefCode } from '../utils/codes.js';
import { maskEmail } from '../utils/mask.js';

export const findByEmail = (email) => User.findOne({ email });

export const findByRefCode = (code) => User.findOne({ refCode: String(code || '').toUpperCase() });

// User đã được cấp joinIndex. join() tạo user trước rồi mới xin số, nên có một khoảnh khắc
// ngắn (hoặc mãi mãi nếu process chết giữa chừng) user chưa có số: không được tính vào
// xếp hạng hay thống kê.
export const NUMBERED = { joinIndex: { $exists: true } };

export const countUsers = () => User.countDocuments(NUMBERED);

const DAY_MS = 24 * 60 * 60 * 1000;

// Số người đăng ký trong 24h qua. Chạy trên index { createdAt: -1 }.
export const countRecent = (since = new Date(Date.now() - DAY_MS)) =>
  User.countDocuments({ ...NUMBERED, createdAt: { $gte: since } });

// Bao nhiêu người gần nhất đẩy ra dải chạy ngang. 12 là đủ để dải không lặp lộ liễu trên
// màn rộng, mà vẫn không biến API công khai thành bản trích danh sách người dùng.
const RECENT_JOINS = 12;

// Người đăng ký gần nhất, email đã che. Sắp theo createdAt nên chạy trên index
// { createdAt: -1 } đã có sẵn cho last24h — không cần thêm index.
export async function listRecentJoins(limit = RECENT_JOINS) {
  const users = await User.find(NUMBERED).sort({ createdAt: -1 }).limit(limit).select('email createdAt').lean();
  // .select() chỉ lấy đúng hai trường: tránh lỡ tay trả nguyên document ra ngoài sau này.
  return users.map((u) => ({ masked: maskEmail(u.email), at: u.createdAt }));
}

// Điểm = số lượt mời × POINTS_PER_INVITE. Không lưu riêng: suy ra từ invites nên không bao
// giờ lệch nhau, và sắp theo invites cũng chính là sắp theo điểm.
export const pointsOf = (invites) => (invites || 0) * POINTS_PER_INVITE;

// Thứ tự xếp hạng: điểm cao trước, bằng điểm thì ai đăng ký trước đứng trên.
// Chạy trên index { invites: -1, joinIndex: 1 }. Phải khớp với rankOf bên dưới.
export const RANK_ORDER = { invites: -1, joinIndex: 1 };

const EARLY_FILTER = { ...NUMBERED, joinIndex: { $lte: FIRST_SLOTS } };

// Nhóm đua Top: người đã mời được ít nhất MIN_TOP_INVITES bạn, kể cả người First. Người chưa
// mời ai không có hạng Top, không lên bảng và không chiếm suất — đăng ký sớm không đủ để vào Top.
export const MIN_TOP_INVITES = 1;
export const RACE = { ...NUMBERED, invites: { $gte: MIN_TOP_INVITES } };
export const inRace = (invites) => (invites || 0) >= MIN_TOP_INVITES;

const countRace = () => User.countDocuments(RACE);

// Điểm của người đứng hạng TOTAL_SLOTS trong nhóm đua = ngưỡng vào Top. null khi nhóm đua
// chưa đủ TOTAL_SLOTS người (lúc đó mời 1 bạn là chắc vào Top).
async function topCutoff() {
  const [edge] = await User.find(RACE).sort(RANK_ORDER).skip(TOTAL_SLOTS - 1).limit(1).select('invites').lean();
  return edge ? pointsOf(edge.invites) : null;
}

// Bảng xếp hạng Top công khai, phân trang, chỉ gồm nhóm đua (đã mời ít nhất 1 bạn, kể cả
// người First). Chỉ trả email đã che; `first` để frontend gắn huy hiệu First 1.000.
// page vượt quá số trang thì trả top rỗng chứ không báo lỗi.
export async function getLeaderboard(page = 1, pageSize = LEADERBOARD_PAGE_SIZE) {
  const p = Number.isInteger(page) && page > 0 ? page : 1;
  const skip = (p - 1) * pageSize;
  const [rows, total, cutoff] = await Promise.all([
    User.find(RACE).sort(RANK_ORDER).skip(skip).limit(pageSize).select('email invites joinIndex').lean(),
    countRace(),
    topCutoff()
  ]);
  return {
    top: rows.map((u, i) => ({
      rank: skip + i + 1,
      masked: maskEmail(u.email),
      points: pointsOf(u.invites),
      first: isEarlyJoin(u.joinIndex)
    })),
    page: p,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    cutoff
  };
}

// Số suất First còn lại = FIRST_SLOTS trừ số người đã có joinIndex <= FIRST_SLOTS.
const firstRemainingOf = (early) => Math.max(0, FIRST_SLOTS - early);

// Danh sách First 1.000 công khai: chỉ người có joinIndex <= FIRST_SLOTS, mới nhất trước.
// Chỉ trả email đã che, joinIndex và thời điểm đăng ký (`at`). page vượt quá thì rows rỗng.
export async function getFirstList(page = 1, pageSize = LEADERBOARD_PAGE_SIZE) {
  const p = Number.isInteger(page) && page > 0 ? page : 1;
  const skip = (p - 1) * pageSize;
  const [rows, total] = await Promise.all([
    User.find(EARLY_FILTER).sort({ joinIndex: -1 }).skip(skip).limit(pageSize).select('email joinIndex createdAt').lean(),
    User.countDocuments(EARLY_FILTER)
  ]);
  return {
    rows: rows.map((u) => ({ joinIndex: u.joinIndex, masked: maskEmail(u.email), at: u.createdAt })),
    page: p,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    firstRemaining: firstRemainingOf(total)
  };
}

const isoOrNull = (date) => (date ? date.toISOString() : null);

export async function getStats() {
  // last24h cho trang biết TỐC ĐỘ lấp suất, không chỉ số suất còn lại: "còn 989" là tĩnh,
  // "37 người đăng ký hôm qua" mới nói lên bao giờ hết.
  // recent đi ké luôn request này: trang đã gọi /api/stats mỗi 30 giây rồi, thêm một
  // endpoint riêng cho ticker là nhân đôi số request mà không được gì.
  const [registered, early, racers, last24h, recent, cutoff] = await Promise.all([
    countUsers(),
    User.countDocuments(EARLY_FILTER),
    countRace(),
    countRecent(),
    listRecentJoins(),
    topCutoff()
  ]);
  const { topStart, topDeadline } = getCampaign();
  const firstRemaining = firstRemainingOf(early);
  // Suất Top còn trống = 1.000 trừ số người đã mời ít nhất 1 bạn. Chừng nào còn suất thì
  // mời 1 bạn là vào Top; hết rồi thì phải vượt topCutoff.
  const topRemaining = Math.max(0, TOTAL_SLOTS - racers);
  return {
    registered,
    firstSlots: FIRST_SLOTS,
    firstRemaining,
    totalSlots: TOTAL_SLOTS,
    topRemaining,
    // Giữ để không vỡ client cũ. Hai nhóm giờ chồng lên nhau nên đây chỉ là tổng hai con
    // số còn lại, không phải số người còn vào được VIP.
    remaining: firstRemaining + topRemaining,
    topCutoff: cutoff,
    topStart: isoOrNull(topStart),
    topDeadline: isoOrNull(topDeadline),
    last24h,
    recent
  };
}

// Hạng Top = số người đứng trên + 1, đếm trong nhóm đua. Đứng trên nghĩa là nhiều điểm (lượt
// mời) hơn, hoặc bằng điểm nhưng đăng ký trước. Phải khớp đúng RANK_ORDER của bảng xếp hạng.
// Chưa mời ai thì không có hạng Top: trả null (kể cả người First).
export async function rankOf(user) {
  const invites = user.invites || 0;
  if (!inRace(invites)) return null;
  const ahead = await User.countDocuments({
    ...RACE,
    $or: [
      { invites: { $gt: invites } },
      { invites, joinIndex: { $lt: user.joinIndex } }
    ]
  });
  return ahead + 1;
}

// Hình dạng này frontend đang đọc trực tiếp — đổi key là vỡ giao diện.
//   early     — thuộc First 1.000
//   joinIndex — thứ tự đăng ký, hiển thị cho người đăng ký sớm ("người thứ #123")
//   rank      — hạng Top trong nhóm đua; null khi chưa mời được ai
//   inTop     — đang trong Top 1.000; sau finalize thì lấy theo bản đã chốt (user.final).
//               Người đăng ký sau TOP_DEADLINE luôn false — khớp với getEntitlement.
//   budget    — ngân sách chọn cổ phiếu: First + Top cộng dồn
//   vip       — early || inTop; server tự quyết, frontend không phải suy lại luật
//   phase, needsRepick, repickDeadline — xem phaseInfo (campaign.js); frontend dùng để ẩn lời
//               mời leo hạng sau deadline và nhắc người phải chọn lại giỏ trước hạn.
export async function toProfile(user) {
  const early = isEarlyJoin(user.joinIndex);
  const rank = await rankOf(user);
  const final = user.final;
  const inTop = final ? Boolean(final.inTop) : isTopRank(rank) && !isLateRegistrant(user);
  const budget = final ? final.budget : entitlementOf({ early, inTop }).budget;
  return {
    email: user.email,
    early,
    joinIndex: user.joinIndex,
    rank,
    inTop,
    budget,
    vip: isVip({ early, inTop }),
    registered: await countUsers(),
    refCode: user.refCode,
    invites: user.invites,
    ...phaseInfo(user)
  };
}

async function uniqueRefCode() {
  for (;;) {
    const code = randomRefCode();
    if (!(await User.exists({ refCode: code }))) return code;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// User đã tồn tại nhưng request đang cấp số cho nó có thể chưa xong. Đợi (tối đa ~500ms)
// tới khi có joinIndex; nếu người tạo thất bại và đã xoá user thì tra lại theo email.
// Hết cách thì ném lỗi, không trả user chưa có số.
async function waitForNumber(user, email) {
  if (user.joinIndex !== undefined && user.joinIndex !== null) return user;
  for (let i = 0; i < 10; i++) {
    await sleep(50);
    const fresh = await User.findById(user._id);
    if (!fresh) break;
    if (fresh.joinIndex !== undefined && fresh.joinIndex !== null) return fresh;
  }
  const byEmail = await findByEmail(email);
  if (byEmail && byEmail.joinIndex !== undefined && byEmail.joinIndex !== null) return byEmail;
  throw new Error('Không lấy được số thứ tự đăng ký cho email này');
}

// Trả về { user, created }. created=false nghĩa là email đã đăng ký từ trước — caller
// quyết định trả 409 hay không, service không biết gì về HTTP.
export async function join(email, referredByCode) {
  const existing = await findByEmail(email);
  if (existing) return { user: await waitForNumber(existing, email), created: false };

  const inviter = referredByCode ? await findByRefCode(referredByCode) : null;
  // Tự mời chính mình thì không tính
  const validInviter = inviter && inviter.email !== email ? inviter : null;

  // Tạo user TRƯỚC, xin số SAU: hai request cùng email chạy song song thì unique index chặn
  // cái thứ hai ngay ở bước create, nên không có số nào bị tiêu oan.
  let user;
  try {
    user = await User.create({
      email,
      refCode: await uniqueRefCode(),
      invites: 0,
      referrer: validInviter ? validInviter._id : null,
      referredBy: validInviter ? validInviter.refCode : null,
      referees: [],
      createdAt: new Date()
    });
  } catch (err) {
    if (err.code === 11000) {
      const dup = await findByEmail(email);
      if (dup) return { user: await waitForNumber(dup, email), created: false };
    }
    throw err;
  }

  try {
    const joinIndex = await nextJoinIndex();
    // score = joinIndex như cũ; field cũ nhưng vẫn ghi để dữ liệu nhất quán.
    await User.updateOne({ _id: user._id }, { $set: { joinIndex, score: joinIndex } });
    user.joinIndex = joinIndex;
    user.score = joinIndex;
  } catch (err) {
    // Không để lại user mồ côi không có số: xoá đi để người dùng đăng ký lại được.
    await User.deleteOne({ _id: user._id });
    throw err;
  }

  // Chỉ cộng lượt mời cho người mời SAU khi người được mời đã có số. +1 lượt mời
  // (= +10 điểm), ghi _id người được mời; score cũ vẫn cập nhật cho nhất quán.
  // Cả ba nằm trong MỘT lệnh update nên invites và referees không bao giờ lệch nhau.
  // Sau TOP_DEADLINE thì điểm đứng yên để chốt Top, nhưng quan hệ ai mời ai vẫn ghi đủ.
  if (user.referrer) {
    const update = { $push: { referees: user._id } };
    if (invitesOpen()) update.$inc = { invites: 1, score: -BOOST };
    await User.updateOne({ _id: user.referrer }, update);
  }

  return { user, created: true };
}
