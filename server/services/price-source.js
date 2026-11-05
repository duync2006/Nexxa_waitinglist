import { NAME_OF_TICKER, RESERVABLE_TICKERS } from '../../shared/catalog.js';
import { DEMO_PRICES } from './demo-prices.js';

// ========================= CHỖ DUY NHẤT BIẾT VỀ NHÀ CUNG CẤP GIÁ =========================
//
// Đang dùng Nexxa Stock API. Đổi nhà cung cấp thì chỉ sửa fetchPrices trong file này,
// không file nào khác biết nguồn giá đến từ đâu.
//
//   Gửi:   POST <PRICE_API_URL>, header x-api-key, body { symbols: ['VCB', 'FPT', ...] }
//   Nhận:  { data: [{ symbol: 'VCB', name: '...', price: 54800, ... }], notFound: ['DUY'] }
//   Trả:   object { VCB: { price: 54800, companyName: '...' }, ... }  — giá VNĐ/cổ phiếu
//
// Quy tắc:
//   - Mã nào nguồn không có thì BỎ QUA (đừng trả 0): price.service.js giữ lại giá cũ
//     trong snapshot thay vì ghi đè bằng số sai.
//   - Nguồn chết thì NÉM LỖI, KHÔNG trả về {} — trả rỗng sẽ làm màn hình Reserve của
//     mọi người trống trơn mà không ai biết tại sao.
//   - Khoá/URL đọc từ .env, không hardcode và không dán vào code.
//
// ========================================================================================

// Bật nguồn demo bằng PRICE_SOURCE=demo. Phải khai báo tường minh: mặc định vẫn là ném lỗi,
// để không có chuyện production âm thầm chạy bằng giá bịa.
const useDemo = process.env.PRICE_SOURCE === 'demo';

// Tên nguồn, ghi vào field `source` của từng dòng giá để sau này truy được số liệu từ đâu.
export const SOURCE_NAME = useDemo ? 'demo' : process.env.PRICE_SOURCE_NAME || 'chua-cau-hinh';

// Hết thời gian chờ thì coi như nguồn chết. 20 giây dư cho 50 mã trong một request.
const TIMEOUT_MS = 20_000;

export async function fetchPrices(tickers) {
  if (useDemo) {
    console.warn('[prices] ĐANG DÙNG GIÁ DEMO (PRICE_SOURCE=demo) — không phải giá thị trường.');
    // Nguồn demo không có tên công ty; mượn tên ngắn trong catalog để màn hình dev vẫn đọc được.
    return Object.fromEntries(
      tickers
        .filter((t) => t in DEMO_PRICES)
        .map((t) => [t, { price: DEMO_PRICES[t], companyName: NAME_OF_TICKER[t] ?? null }])
    );
  }

  const url = process.env.PRICE_API_URL;
  if (!url) {
    throw new Error(
      'Chưa cấu hình nguồn giá. Khai báo PRICE_API_URL (và PRICE_API_KEY) trong .env. ' +
        'Chưa có nhà cung cấp thì chạy `npm run prices:demo` vào database _test.'
    );
  }

  // POST { symbols: [...] } -> { data: [{ symbol, name, exchange, type, price, ... }], notFound: [...] }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.PRICE_API_KEY ? { 'x-api-key': process.env.PRICE_API_KEY } : {})
    },
    body: JSON.stringify({ symbols: tickers }),
    // Không có timeout thì một kết nối treo sẽ giữ cron job chạy mãi, và lần chạy hôm sau
    // chồng lên lần hôm nay. Thà hỏng dứt khoát rồi giữ snapshot cũ.
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });

  if (!res.ok) {
    // Đọc body để thông báo lỗi nói được nguyên nhân (sai khoá, sai định dạng…), không
    // chỉ trơ ra mỗi con số HTTP.
    const detail = await res.text().catch(() => '');
    throw new Error(`Nguồn giá trả về HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
  }

  const json = await res.json();
  if (!Array.isArray(json?.data)) {
    throw new Error('Nguồn giá trả về dữ liệu không đúng hình dạng (thiếu mảng `data`).');
  }

  // notFound là chuyện đáng biết chứ không phải lỗi: giá cũ của những mã đó vẫn được giữ.
  if (Array.isArray(json.notFound) && json.notFound.length) {
    console.warn(`[prices] Nguồn không có ${json.notFound.length} mã: ${json.notFound.join(', ')}`);
  }

  // Bỏ qua dòng có giá vô nghĩa thay vì trả 0 — price.service.js sẽ giữ giá cũ cho mã đó.
  return Object.fromEntries(
    json.data
      .filter((r) => r?.symbol && Number.isFinite(Number(r.price)) && Number(r.price) > 0)
      .map((r) => [
        String(r.symbol).toUpperCase(),
        // companyName đi kèm giá vì nó đến từ cùng một response. Nguồn không trả tên thì
        // để null, price.service.js sẽ giữ nguyên tên cũ trong snapshot.
        { price: Number(r.price), companyName: r.name ? String(r.name).trim() : null }
      ])
  );
}

// Danh sách mã cần lấy giá: đúng những mã người dùng có thể chọn, không nhiều hơn.
export const tickersToFetch = () => [...RESERVABLE_TICKERS].sort();
