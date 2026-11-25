import { POOL_OF_TICKER, TOTAL_SLOTS, entitlementOf, isEarlyJoin } from '../../shared/catalog.js';
import { getCampaign } from '../config/campaign.js';
import { User } from '../models/index.js';
import { NUMBERED, RANK_ORDER, inRace } from './waitlist.service.js';
import { getPriceTable } from './price.service.js';
import { sendRepickEmail } from './mailer.service.js';

// Giỏ có hợp lệ với quyền lợi không: mọi mã nằm trong pools, mọi mã có giá, tổng không vượt
// budget. Giỏ rỗng luôn hợp lệ.
export function basketFits(tickers, priceOf, { budget, pools }) {
  let total = 0;
  for (const t of tickers) {
    if (!pools.includes(POOL_OF_TICKER[t])) return false;
    const price = priceOf(t);
    if (typeof price !== 'number') return false;
    total += price;
  }
  return total <= budget;
}

// Giá của một mã cho user: giá đã khoá trong giỏ trước, thiếu thì lấy snapshot.
function priceOfUser(user, prices) {
  const locked = Object.fromEntries((user.reservation?.lockedPrices ?? []).map((p) => [p.ticker, p.price]));
  return (t) => locked[t] ?? prices[t];
}

const BATCH = 500;

// Chốt Top 1.000 sau TOP_DEADLINE. Idempotent: user đã có `final` bị bỏ qua (nhưng vẫn chiếm
// một vị trí trong bảng hạng, để hạng của người khác không đổi giữa các lần chạy).
// Chỉ xếp hạng người đăng ký TRƯỚC deadline; người đăng ký muộn đứng ngoài Top và không có
// `final` (quyền lợi của họ do luật "đăng ký muộn" tính trực tiếp).
// `notify` để test thay sendRepickEmail (ESM không cho mock named export).
export async function finalizeTop(now = new Date(), { notify = sendRepickEmail } = {}) {
  const { topDeadline, repickDeadline } = getCampaign();
  if (!topDeadline || now < topDeadline) throw new Error('Chưa tới TOP_DEADLINE');

  const prices = await getPriceTable();
  const result = {
    total: 0, first: 0, top: 0, both: 0, needsRepick: 0, skipped: 0, mailFailed: [], inTopTotal: 0
  };
  const cursor = User.find({ ...NUMBERED, createdAt: { $lt: topDeadline } })
    .sort(RANK_ORDER)
    .select('email joinIndex invites final reservation')
    .lean()
    .cursor();

  // Mỗi phần tử: { u, final }. Ghi theo lô nhưng TỪNG user một lệnh updateOne có điều kiện
  // `final` chưa có, chạy song song trong lô. Không dùng bulkWrite vì nó chỉ trả tổng số
  // matched của cả lô: một lần chạy khác chen vào chốt trước vài người thì không biết là ai,
  // và sẽ đếm trùng lẫn gửi mail trùng cho họ.
  let batch = [];
  const flush = async () => {
    if (!batch.length) return;
    const writes = await Promise.all(
      batch.map(({ u, final }) =>
        User.updateOne({ _id: u._id, final: { $exists: false } }, { $set: { final } })
      )
    );
    const mine = batch.filter((_, i) => writes[i].matchedCount === 1);
    // Người bị lần chạy khác chốt trước: lần này không ghi gì cho họ, tính là bỏ qua.
    result.skipped += batch.length - mine.length;
    for (const { final } of mine) {
      if (final.early) result.first += 1;
      if (final.inTop) result.top += 1;
      if (final.early && final.inTop) result.both += 1;
      if (final.needsRepick) result.needsRepick += 1;
    }
    // Gửi mail SAU khi đã ghi, và chỉ cho người mà CHÍNH lần chạy này ghi được: lỗi gửi
    // không làm mất bản chốt, chạy lại hay chạy song song cũng không gửi trùng.
    // Lỗi gửi mail không được làm dừng run: chạy lại sẽ bỏ qua user đã có final nên mail
    // sẽ mất hẳn. Ghi lại để operator gửi tay.
    for (const { u, final } of mine) {
      if (!final.needsRepick) continue;
      try {
        await notify(u.email, { budget: final.budget, pools: final.pools, repickDeadline });
      } catch (err) {
        console.error(`[finalize] Gửi mail chọn lại cho ${u.email} lỗi: ${err.message}`);
        result.mailFailed.push(u.email);
      }
    }
    batch = [];
  };

  let position = 0;
  for await (const u of cursor) {
    position += 1;
    result.total += 1;
    if (u.final) {
      result.skipped += 1;
      continue;
    }

    // Sắp theo invites giảm dần nên toàn bộ nhóm đua (đã mời >= 1 bạn) đứng trước: `position`
    // của họ chính là hạng Top. Người chưa mời ai không có hạng và không vào Top.
    const early = isEarlyJoin(u.joinIndex);
    const racing = inRace(u.invites);
    const inTop = racing && position <= TOTAL_SLOTS;
    const { budget, pools } = entitlementOf({ early, inTop });

    const priceOf = priceOfUser(u, prices);
    const tickers = u.reservation?.tickers ?? [];
    const needsRepick = !basketFits(tickers, priceOf, { budget, pools });

    batch.push({ u, final: { early, topRank: racing ? position : null, inTop, budget, pools, finalizedAt: now, needsRepick } });
    if (batch.length >= BATCH) await flush();
  }
  await flush();
  // Con số chuẩn để đối soát: đếm lại từ DB, không cộng dồn từ các lần chạy (chạy lại hay
  // chạy song song thì `top` của một lần chỉ là phần lần đó ghi được).
  result.inTopTotal = await User.countDocuments({ 'final.inTop': true });
  return result;
}

// Cắt giỏ theo đúng thứ tự đã chọn: giữ mã thuộc pools, có giá và cộng thêm vẫn <= budget.
// Mã không giữ được thì bỏ và đi tiếp xét mã sau (một mã đắt không chặn mã rẻ hơn phía sau).
export function trimBasket(tickers, priceOf, { budget, pools }) {
  const kept = [];
  let total = 0;
  for (const t of tickers) {
    if (!pools.includes(POOL_OF_TICKER[t])) continue;
    const price = priceOf(t);
    if (typeof price !== 'number') continue;
    if (total + price > budget) continue;
    total += price;
    kept.push(t);
  }
  return kept;
}

// Sau REPICK_DEADLINE: tự cắt giỏ của người cần chọn lại mà không chọn lại.
// Idempotent: chỉ xử lý user chưa repickedAt và chưa autoTrimmedAt.
export async function closeRepick(now = new Date()) {
  const { repickDeadline } = getCampaign();
  if (!repickDeadline || now < repickDeadline) throw new Error('Chưa tới REPICK_DEADLINE');

  const prices = await getPriceTable();
  const result = { trimmed: 0, emptied: 0, emptiedEmails: [] };
  const cursor = User.find({
    'final.needsRepick': true,
    'final.repickedAt': { $exists: false },
    'final.autoTrimmedAt': { $exists: false }
  })
    .select('email final reservation')
    .lean()
    .cursor();

  let ops = [];
  const flush = async () => {
    if (!ops.length) return;
    await User.bulkWrite(ops, { ordered: false });
    ops = [];
  };

  for await (const u of cursor) {
    const priceOf = priceOfUser(u, prices);
    const kept = trimBasket(u.reservation?.tickers ?? [], priceOf, u.final);
    const totalValue = kept.reduce((sum, t) => sum + priceOf(t), 0);
    // Mọi mã giữ lại phải có giá khoá: bổ sung giá snapshot cho mã chưa có trong lockedPrices.
    const lockedPrices = u.reservation?.lockedPrices ?? [];
    const have = new Set(lockedPrices.map((p) => p.ticker));
    const added = kept.filter((t) => !have.has(t)).map((ticker) => ({ ticker, price: priceOf(ticker) }));

    const $set = {
      'reservation.tickers': kept,
      'reservation.totalValue': totalValue,
      'reservation.updatedAt': now,
      'final.autoTrimmedAt': now
    };
    if (added.length) $set['reservation.lockedPrices'] = [...lockedPrices, ...added];
    ops.push({
      // Điều kiện lặp lại để một lần chọn lại xen vào giữa không bị ghi đè.
      updateOne: {
        filter: {
          _id: u._id,
          'final.repickedAt': { $exists: false },
          'final.autoTrimmedAt': { $exists: false }
        },
        update: { $set }
      }
    });
    result.trimmed += 1;
    if (!kept.length) {
      result.emptied += 1;
      result.emptiedEmails.push(u.email);
    }
    if (ops.length >= BATCH) await flush();
  }
  await flush();
  return result;
}
