import { POOL_OF_TICKER, TOTAL_SLOTS, entitlementOf, isEarlyJoin } from '../../shared/catalog.js';
import { getCampaign } from '../config/campaign.js';
import { User } from '../models/index.js';
import { NUMBERED, RANK_ORDER } from './waitlist.service.js';
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
  const result = { total: 0, first: 0, top: 0, both: 0, needsRepick: 0, skipped: 0, mailFailed: [] };
  const cursor = User.find({ ...NUMBERED, createdAt: { $lt: topDeadline } })
    .sort(RANK_ORDER)
    .select('email joinIndex final reservation')
    .lean()
    .cursor();

  let ops = [];
  let emails = [];
  const flush = async () => {
    if (!ops.length) return;
    await User.bulkWrite(ops, { ordered: false });
    // Gửi mail SAU khi đã ghi: lỗi gửi không làm mất bản chốt, và chạy lại không gửi trùng
    // vì user đã có final.
    // Lỗi gửi mail không được làm dừng run: chạy lại sẽ bỏ qua user đã có final nên mail
    // sẽ mất hẳn. Ghi lại để operator gửi tay.
    for (const [email, info] of emails) {
      try {
        await notify(email, info);
      } catch (err) {
        console.error(`[finalize] Gửi mail chọn lại cho ${email} lỗi: ${err.message}`);
        result.mailFailed.push(email);
      }
    }
    ops = [];
    emails = [];
  };

  let position = 0;
  for await (const u of cursor) {
    position += 1;
    result.total += 1;
    if (u.final) {
      result.skipped += 1;
      continue;
    }

    const early = isEarlyJoin(u.joinIndex);
    const inTop = position <= TOTAL_SLOTS;
    const { budget, pools } = entitlementOf({ early, inTop });

    const locked = Object.fromEntries((u.reservation?.lockedPrices ?? []).map((p) => [p.ticker, p.price]));
    const priceOf = (t) => locked[t] ?? prices[t];
    const tickers = u.reservation?.tickers ?? [];
    const needsRepick = !basketFits(tickers, priceOf, { budget, pools });

    const final = { early, topRank: position, inTop, budget, pools, finalizedAt: now, needsRepick };
    ops.push({
      // Điều kiện final chưa có: hai lần chạy song song không ghi đè nhau.
      updateOne: { filter: { _id: u._id, final: { $exists: false } }, update: { $set: { final } } }
    });
    if (needsRepick) {
      emails.push([u.email, { budget, pools, repickDeadline }]);
      result.needsRepick += 1;
    }
    if (early) result.first += 1;
    if (inTop) result.top += 1;
    if (early && inTop) result.both += 1;

    if (ops.length >= BATCH) await flush();
  }
  await flush();
  return result;
}
