import { RESERVABLE_TICKERS } from '../../shared/catalog.js';
import { DEMO_PRICES } from './demo-prices.js';

// ========================= CHỖ DUY NHẤT BIẾT VỀ NHÀ CUNG CẤP GIÁ =========================
//
// ĐIỀN NGUỒN CỦA BẠN VÀO HÀM fetchPrices DƯỚI ĐÂY.
//
//   Nhận:  mảng mã  ['VCB', 'FPT', ...]
//   Trả:   object   { VCB: 62000, FPT: 48000, ... }   — đơn vị VNĐ, một cổ phiếu
//
// Quy tắc:
//   - Mã nào nguồn không có thì BỎ QUA (đừng trả 0): price.service.js giữ lại giá cũ
//     trong snapshot thay vì ghi đè bằng số sai.
//   - Chưa cấu hình thì ném lỗi rõ ràng, KHÔNG trả về {} — snapshot rỗng sẽ làm
//     màn hình Reserve của mọi người trống trơn mà không ai biết tại sao.
//   - Khoá/URL đọc từ .env, không hardcode và không dán vào code.
//
// ========================================================================================

// Bật nguồn demo bằng PRICE_SOURCE=demo. Phải khai báo tường minh: mặc định vẫn là ném lỗi,
// để không có chuyện production âm thầm chạy bằng giá bịa.
const useDemo = process.env.PRICE_SOURCE === 'demo';

// Tên nguồn, ghi vào field `source` của từng dòng giá để sau này truy được số liệu từ đâu.
export const SOURCE_NAME = useDemo ? 'demo' : process.env.PRICE_SOURCE_NAME || 'chua-cau-hinh';

export async function fetchPrices(tickers) {
  if (useDemo) {
    console.warn('[prices] ĐANG DÙNG GIÁ DEMO (PRICE_SOURCE=demo) — không phải giá thị trường.');
    return Object.fromEntries(tickers.filter((t) => t in DEMO_PRICES).map((t) => [t, DEMO_PRICES[t]]));
  }

  const url = process.env.PRICE_API_URL;
  if (!url) {
    throw new Error(
      'Chưa cấu hình nguồn giá. Khai báo PRICE_API_URL (và PRICE_API_KEY nếu cần) trong .env, ' +
        'rồi hiện thực hoá fetchPrices trong server/services/price-source.js.'
    );
  }

  // ----- VÍ DỤ MẪU, SỬA LẠI CHO ĐÚNG NGUỒN CỦA BẠN -----
  // const res = await fetch(`${url}?symbols=${tickers.join(',')}`, {
  //   headers: process.env.PRICE_API_KEY ? { Authorization: `Bearer ${process.env.PRICE_API_KEY}` } : {}
  // });
  // if (!res.ok) throw new Error(`Nguồn giá trả về HTTP ${res.status}`);
  // const json = await res.json();
  // return Object.fromEntries(json.data.map((r) => [r.symbol, Number(r.price)]));
  // ------------------------------------------------------

  throw new Error(
    'fetchPrices chưa được hiện thực hoá. Mở server/services/price-source.js và điền phần gọi API của bạn.'
  );
}

// Danh sách mã cần lấy giá: đúng những mã người dùng có thể chọn, không nhiều hơn.
export const tickersToFetch = () => [...RESERVABLE_TICKERS].sort();
