// Những thứ server cũng cần nằm ở shared/catalog.js; re-export lại để các component
// vẫn import từ '../lib/data.js' như cũ.
export { TOTAL_SLOTS, STOCKS, POOLS, RESERVABLE, ENTITLEMENTS, entitlementOfRank } from '../../shared/catalog.js';
import { POOLS, RESERVABLE, ENTITLEMENTS, entitlementOfRank } from '../../shared/catalog.js';

// Màu hiển thị cho hai bậc quyền lợi. Phần luật (ngân sách, nhóm được chọn) nằm ở
// shared/catalog.js vì server cũng cần; ở đây chỉ thêm phần trang trí của giao diện.
const ENTITLEMENT_STYLE = {
  top: { group: 'Cổ phiếu VIP (VN30) và Standard', fg: '#7A5600', bg: '#FFF3D1', bar: '#D69A00' },
  rest: { group: 'Cổ phiếu nhóm Standard', fg: '#3F4A5A', bg: '#ECEFF3', bar: '#8A94A6' }
};

export const TIER_VIEWS = ENTITLEMENTS.map((e) => ({ ...e, ...ENTITLEMENT_STYLE[e.key] }));

// Luôn trả về một bậc — không còn trường hợp "ngoài top 1.000 thì không có quà".
export const tierOfRank = (rank) => TIER_VIEWS.find((t) => t.key === entitlementOfRank(rank).key);

export const STOCK_SOURCE = {
  gold: 'Theo rổ VN30 hiệu lực từ 03/08/2026 (HOSE)',
  silver: 'Danh mục dự kiến · Nexxa công bố bản chính thức trước khi phân bổ',
  copper: 'Danh mục dự kiến · Nexxa công bố bản chính thức trước khi phân bổ'
};

// Thứ tự mã phổ biến của từng pool, hiển thị trước khi người dùng cuộn xuống.
// VIP dùng đúng danh sách blue-chip trong FeaturedStocks; Standard là các mã tên tuổi dễ nhận ra.
const POPULAR_TICKERS = {
  vip: ['VCB', 'VIC', 'VHM', 'VNM', 'HPG', 'FPT', 'MWG', 'TCB', 'MSN', 'VPB', 'GAS', 'SSI'],
  standard: ['PNJ', 'PLX', 'TPB', 'REE', 'HCM', 'VND', 'POW', 'FRT']
};

// Mỗi pool tách thành { popular, rest }: popular theo đúng thứ tự trên, rest giữ thứ tự gốc.
// Mã nào trong POPULAR_TICKERS không còn trong pool thì bị bỏ qua, không làm vỡ danh sách.
export const POOL_STOCKS = Object.fromEntries(
  POOLS.map((p) => {
    const all = RESERVABLE[p.key];
    const popular = (POPULAR_TICKERS[p.key] || []).map((t) => all.find((s) => s.t === t)).filter(Boolean);
    const inPopular = new Set(popular.map((s) => s.t));
    return [p.key, { popular, rest: all.filter((s) => !inPopular.has(s.t)) }];
  })
);
