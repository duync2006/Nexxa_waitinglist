import { ENTITLEMENTS, POOLS, TOTAL_SLOTS, groupTypeOfTicker } from '../../shared/catalog.js';
import { Price } from '../models/index.js';

// Mọi thứ frontend cần để dựng giao diện: danh mục cổ phiếu, nhóm, số suất, bậc quà.
//
// Khác /api/reserve/options ở chỗ endpoint này KHÔNG phụ thuộc người dùng — nó mô tả
// chương trình, không mô tả quyền của ai. Options lọc danh mục theo hạng từng người, nên
// dải cổ phiếu ở hero không dùng được nó: người ngoài top 1.000 sẽ không thấy mã VIP nào.
//
// Nguồn danh sách mã là collection `prices`, không phải shared/catalog.js: thêm/bớt mã chỉ
// cần đổi dữ liệu, không phải build lại frontend. Hệ quả phải chấp nhận: mã chưa từng có
// dòng giá nào thì không xuất hiện — chạy `npm run prices` là nó có mặt.
export async function getCatalog() {
  const rows = await Price.find({}).sort({ _id: 1 }).lean();

  const stocks = rows.map((r) => {
    // groupType lấy từ DB. Dòng ghi trước khi có field này thì suy từ catalog thay vì bỏ
    // qua — thiếu nhóm là mã biến mất khỏi màn hình chọn quà, hỏng nặng hơn nhiều.
    const groupType = r.groupType ?? groupTypeOfTicker(r._id);
    return {
      t: r._id,
      n: r.companyName ?? null,
      pool: groupType ? groupType.toLowerCase() : null,
      groupType,
      price: typeof r.price === 'number' ? r.price : null
    };
  });

  return {
    totalSlots: TOTAL_SLOTS,
    entitlements: ENTITLEMENTS.map((e) => ({ ...e, pools: [...e.pools] })),
    pools: POOLS.map((p) => ({
      key: p.key,
      label: p.label,
      desc: p.desc,
      groupType: p.key.toUpperCase()
    })),
    // Mã không xác định được nhóm thì không trả ra: frontend không có chỗ nào đặt nó,
    // và để lọt sẽ thành một thẻ trống giữa dải cổ phiếu.
    stocks: stocks.filter((s) => s.pool)
  };
}
