import { ENTITLEMENTS, entitlementOfRank } from '../../shared/catalog.js';
import { rankOf } from './waitlist.service.js';

// Quyền chọn cổ phiếu của một user: nhóm nào được chọn và ngân sách bao nhiêu.
//
// Chốt ở lần Reserve ĐẦU TIÊN (reservation.budget đã có) và không đổi nữa — hạng trôi
// về sau không làm người dùng mất quyền đã được hứa. Thiếu reservation.budget nghĩa là
// chưa chốt, lúc đó tính theo hạng hiện tại.
export async function getEntitlement(user) {
  const saved = user?.reservation;
  if (saved && typeof saved.budget === 'number') {
    return {
      rank: saved.lockedRank ?? null,
      budget: saved.budget,
      pools: [...(saved.allowedPools ?? [])],
      locked: true
    };
  }

  const rank = await rankOf(user);
  const e = entitlementOfRank(rank);
  return { rank, budget: e.budget, pools: [...e.pools], locked: false };
}

// Bản xem thử cho người chưa đăng ký: tạm áp mức cao nhất để họ thấy được toàn bộ
// danh mục. Lúc bấm Nhận vẫn bị chặn vì email chưa có trong waitlist.
export function previewEntitlement() {
  const best = ENTITLEMENTS[0];
  return { rank: null, budget: best.budget, pools: [...best.pools], locked: false, preview: true };
}
