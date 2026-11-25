import { ENTITLEMENTS, entitlementOf, isEarlyJoin, isTopRank } from '../../shared/catalog.js';
import { phaseOf } from '../config/campaign.js';
import { rankOf } from './waitlist.service.js';

// Quyền chọn cổ phiếu của một user: nhóm nào được chọn, ngân sách bao nhiêu, và giai đoạn
// hiện tại của campaign (phase) để biết giỏ có được ghi không.
//
// First 1.000 và Top 1.000 chạy song song, thuộc cả hai thì cộng dồn. Luật nằm ở
// shared/catalog.js (entitlementOf).
//
// Đã finalize (có user.final) thì trả đúng bản đã chốt. Chưa thì tính theo hạng HIỆN TẠI
// mỗi lần đọc — không còn chốt ở lần Reserve đầu tiên, reservation.budget/allowedPools/
// lockedRank cũ bị bỏ qua.
export async function getEntitlement(user, now = new Date()) {
  const phase = phaseOf(user, now);
  const final = user?.final;
  if (final) {
    return {
      rank: final.topRank ?? null,
      early: Boolean(final.early),
      inTop: Boolean(final.inTop),
      budget: final.budget,
      pools: [...(final.pools ?? [])],
      phase
    };
  }

  const early = isEarlyJoin(user?.joinIndex);
  const rank = await rankOf(user);
  const inTop = isTopRank(rank);
  const e = entitlementOf({ early, inTop });
  return { rank, early, inTop, budget: e.budget, pools: e.pools, phase };
}

// Bản xem thử cho người chưa đăng nhập: tạm áp mức một suất VIP (100.000đ, cả hai nhóm) để
// họ thấy được toàn bộ danh mục. Lúc bấm Nhận vẫn phải có token phiên.
// phase theo phaseOf(null): 'open' trước TOP_DEADLINE, sau đó 'frozen' — người đăng ký mới
// lúc này cũng chưa có final nên đúng là giỏ của họ đang bị khoá.
export function previewEntitlement(now = new Date()) {
  const best = ENTITLEMENTS[0];
  return {
    rank: null,
    early: false,
    inTop: false,
    budget: best.budget,
    pools: [...best.pools],
    phase: phaseOf(null, now),
    preview: true
  };
}
