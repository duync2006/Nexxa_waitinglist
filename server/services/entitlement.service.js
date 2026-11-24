import { ENTITLEMENTS, entitlementOf, isEarlyJoin } from '../../shared/catalog.js';
import { rankOf } from './waitlist.service.js';

// Quyền chọn cổ phiếu của một user: nhóm nào được chọn và ngân sách bao nhiêu.
//
// VIP nếu thuộc First 1.000 (đăng ký sớm) HOẶC lọt Top 1.000 của nhóm đua; còn lại là
// Tiêu chuẩn. Luật nằm ở shared/catalog.js (entitlementOf).
//
// Chốt ở lần Reserve ĐẦU TIÊN (reservation.budget đã có) và không đổi nữa — hạng trôi
// về sau không làm người dùng mất quyền đã được hứa. Thiếu reservation.budget nghĩa là
// chưa chốt, lúc đó tính theo hạng hiện tại.
export async function getEntitlement(user) {
  const early = isEarlyJoin(user?.joinIndex);
  const saved = user?.reservation;
  if (saved && typeof saved.budget === 'number') {
    return {
      rank: saved.lockedRank ?? null,
      early,
      budget: saved.budget,
      pools: [...(saved.allowedPools ?? [])],
      locked: true
    };
  }

  const rank = await rankOf(user);
  const e = entitlementOf({ early, rank });
  return { rank, early, budget: e.budget, pools: [...e.pools], locked: false };
}

// Bản xem thử cho người chưa đăng ký: tạm áp mức cao nhất để họ thấy được toàn bộ
// danh mục. Lúc bấm Nhận vẫn bị chặn vì email chưa có trong waitlist.
export function previewEntitlement() {
  const best = ENTITLEMENTS[0];
  return { rank: null, early: false, budget: best.budget, pools: [...best.pools], locked: false, preview: true };
}
