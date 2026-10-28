import { PRICE_MAX_AGE_MS } from '../config/constants.js';
import { ENTITLEMENTS, RESERVABLE } from '../../shared/catalog.js';
import { Price } from '../models/index.js';
import { unavailable } from '../utils/app-error.js';
import { fetchPrices, tickersToFetch, SOURCE_NAME } from './price-source.js';

// Reserve LUÔN đọc snapshot trong collection `prices`, không bao giờ gọi nhà cung cấp:
// nguồn chết thì snapshot cũ vẫn dùng được, và giá không nhảy giữa lúc người dùng đang chọn.

export async function getPriceTable() {
  const rows = await Price.find({}).lean();
  return Object.fromEntries(rows.map((r) => [r._id, r.price]));
}

// Lấy giá cho đúng những mã cần, thiếu mã nào thì 503 thay vì âm thầm tính sai tổng.
export function requirePrices(tickers, table) {
  const missing = tickers.filter((t) => typeof table[t] !== 'number');
  if (missing.length) {
    throw unavailable(
      `Chưa có giá cho ${missing.join(', ')}. Vui lòng thử lại sau ít phút.`,
      { missing }
    );
  }
  return Object.fromEntries(tickers.map((t) => [t, table[t]]));
}

// Tuổi của snapshot (ms) tính theo dòng cũ nhất, null nếu chưa có dòng nào.
export async function snapshotAge() {
  const oldest = await Price.findOne({}).sort({ updatedAt: 1 }).lean();
  if (!oldest) return null;
  return Date.now() - new Date(oldest.updatedAt).getTime();
}

// Ghi cảnh báo lúc khởi động, KHÔNG chặn khởi động: thiếu giá chỉ làm Reserve trả 503,
// các luồng còn lại (đăng ký, OTP, thống kê) vẫn phải chạy.
export async function warnIfSnapshotStale() {
  const age = await snapshotAge();
  if (age === null) {
    console.warn('[prices] CHƯA CÓ bảng giá nào. Chạy `npm run prices` trước khi mở màn hình Reserve.');
    return;
  }
  if (age > PRICE_MAX_AGE_MS) {
    const hours = Math.round(age / 3600000);
    console.warn(`[prices] Bảng giá đã cũ ${hours} giờ. Chạy lại \`npm run prices\`.`);
  }
}

// RỦI RO ĐÃ BIẾT: ngân sách 50.000đ có thể không mua nổi mã Standard nào — nhiều blue-chip
// VN giao dịch trên mức đó. Khi điều này xảy ra, nhóm sau top 1.000 mở màn hình Reserve ra
// và thấy mọi mã đều bị làm mờ. Hàm này phát hiện và báo động; cách xử lý (nâng ngân sách,
// cho cổ phần lẻ, hay quy ra tiền mặt) là quyết định kinh doanh, không phải của code.
export async function checkBudgetFeasibility() {
  const table = await getPriceTable();
  const out = [];
  for (const e of ENTITLEMENTS) {
    const tickers = e.pools.flatMap((key) => RESERVABLE[key] ?? []).map((s) => s.t);
    const prices = tickers.map((t) => table[t]).filter((v) => typeof v === 'number');
    const cheapest = prices.length ? Math.min(...prices) : null;
    out.push({ key: e.key, label: e.label, budget: e.budget, cheapest, ok: cheapest !== null && cheapest <= e.budget });
  }
  return out;
}

export async function warnIfBudgetInfeasible() {
  for (const r of await checkBudgetFeasibility()) {
    if (r.cheapest === null) continue; // chưa có giá — warnIfSnapshotStale đã báo
    if (!r.ok) {
      console.warn(
        `[prices] CẢNH BÁO: bậc "${r.label}" có ngân sách ${r.budget.toLocaleString('vi-VN')}đ nhưng mã rẻ nhất ` +
          `trong nhóm được phép giá ${r.cheapest.toLocaleString('vi-VN')}đ — nhóm này không chọn được mã nào.`
      );
    }
  }
}

// Gọi nguồn rồi upsert vào snapshot. Nguồn chết thì GIỮ NGUYÊN snapshot cũ và ném lỗi
// lên cho caller (script) in ra — tuyệt đối không xoá dữ liệu đang có.
export async function refreshPrices() {
  const tickers = tickersToFetch();
  const prices = await fetchPrices(tickers);

  const now = new Date();
  const ops = [];
  const missing = [];
  for (const t of tickers) {
    const price = Number(prices[t]);
    // Mã nguồn không trả về (hoặc trả số vô nghĩa) thì bỏ qua để giữ giá cũ.
    if (!Number.isFinite(price) || price <= 0) {
      missing.push(t);
      continue;
    }
    ops.push({
      updateOne: {
        filter: { _id: t },
        update: { $set: { price, updatedAt: now, source: SOURCE_NAME } },
        upsert: true
      }
    });
  }

  if (ops.length === 0) {
    throw new Error('Nguồn giá không trả về mã nào hợp lệ — giữ nguyên snapshot cũ.');
  }

  const res = await Price.bulkWrite(ops);
  return { updated: ops.length, total: tickers.length, missing, res };
}
