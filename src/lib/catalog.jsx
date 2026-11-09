import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { FALLBACK_CATALOG, ENTITLEMENT_STYLE, POPULAR_TICKERS } from './data.js';

// Danh mục cổ phiếu đến từ server (/api/catalog), không còn nằm trong bundle.
//
// Một context chứ không phải mỗi component tự gọi: trước đây FeaturedStocks và
// ReserveModal gọi /api/reserve/options hai lần riêng biệt cho cùng một bảng giá.
//
// FALLBACK_CATALOG vẫn được bundle và dùng ngay ở khung hình đầu tiên, rồi bị thay khi
// server trả về. Nếu không có nó, hero sẽ trống một nhịp mỗi lần mở trang — và API chết
// là trang không còn gì để mời người ta đăng ký.
const CatalogContext = createContext(null);

// Tách mỗi nhóm thành { popular, rest }: popular theo đúng thứ tự trong POPULAR_TICKERS,
// rest giữ thứ tự server trả về. Mã nào trong danh sách popular mà server không có thì
// bị bỏ qua, không làm vỡ danh sách.
function splitPopular(stocks) {
  const out = {};
  for (const [poolKey, wanted] of Object.entries(POPULAR_TICKERS)) {
    const all = stocks.filter((s) => s.pool === poolKey);
    const popular = wanted.map((t) => all.find((s) => s.t === t)).filter(Boolean);
    const inPopular = new Set(popular.map((s) => s.t));
    out[poolKey] = { popular, rest: all.filter((s) => !inPopular.has(s.t)) };
  }
  return out;
}

// Dựng mọi thứ component cần từ dữ liệu thô của server, tính một lần thay vì để từng
// component tự map lại — đó chính là cách bản cũ có bốn chỗ cùng quyết định VIP/Standard.
function shape(raw, ready) {
  const stocks = raw.stocks ?? [];
  const entitlements = raw.entitlements ?? [];

  const tierViews = entitlements.map((e) => ({ ...e, ...ENTITLEMENT_STYLE[e.key] }));
  const totalSlots = raw.totalSlots ?? 0;

  return {
    ready,
    totalSlots,
    pools: raw.pools ?? [],
    stocks,
    entitlements,
    tierViews,
    poolStocks: splitPopular(stocks),
    // Tra nhóm của một mã, thay cho việc mỗi component tự dựng lại map từ catalog.
    poolOfTicker: Object.fromEntries(stocks.map((s) => [s.t, s.pool])),
    stocksOfPools: (keys) => stocks.filter((s) => keys.includes(s.pool)),
    // Cùng luật với entitlementOfRank ở server: trong số suất thì bậc đầu, ngoài thì bậc
    // sau. Luôn trả về một bậc — không còn trường hợp "ngoài top 1.000 thì không có quà".
    tierOfRank: (rank) => (rank <= totalSlots ? tierViews[0] : tierViews[1] ?? tierViews[0])
  };
}

export function CatalogProvider({ children }) {
  const [raw, setRaw] = useState(null);

  useEffect(() => {
    let alive = true;
    api
      .catalog()
      .then((c) => {
        // Server trả danh mục rỗng (chưa chạy `npm run prices`) thì GIỮ dự phòng. Thay
        // bằng mảng rỗng là trang trắng trơn, tệ hơn hẳn so với danh mục hơi cũ.
        if (alive && c?.stocks?.length) setRaw(c);
      })
      .catch(() => { /* giữ dự phòng, trang vẫn dùng được */ });
    return () => { alive = false; };
  }, []);

  const value = useMemo(() => shape(raw ?? FALLBACK_CATALOG, Boolean(raw)), [raw]);

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  const ctx = useContext(CatalogContext);
  console.log("useCatalog ctx: ", ctx)
  if (!ctx) throw new Error('useCatalog phải nằm trong <CatalogProvider>.');
  return ctx;
}
