// Danh mục cổ phiếu KHÔNG còn được đọc từ đây nữa — nó đến từ /api/catalog qua
// src/lib/catalog.jsx. File này chỉ giữ hai thứ server không có việc gì phải biết:
//
//   1. FALLBACK_CATALOG — bản sao dùng cho khung hình đầu tiên và cho lúc API chết.
//   2. Phần trang trí thuần giao diện: màu từng bậc quà, thứ tự mã hiển thị trước.
//
// Component nào cần danh mục thì gọi useCatalog(), đừng import thẳng từ đây.
import {
  ENTITLEMENTS,
  NAME_OF_TICKER,
  POOLS,
  RESERVABLE,
  TOTAL_SLOTS
} from '../../shared/catalog.js';

// Màu hiển thị cho hai bậc quyền lợi, khoá theo `key` của entitlement. Phần luật (ngân
// sách, nhóm được chọn) do server trả về; ở đây chỉ có màu sắc và câu mô tả.
export const ENTITLEMENT_STYLE = {
  top: { group: 'Cổ phiếu VIP (VN30) và Standard', fg: '#7A5600', bg: '#FFF3D1', bar: '#D69A00' },
  rest: { group: 'Cổ phiếu nhóm Standard', fg: '#3F4A5A', bg: '#ECEFF3', bar: '#8A94A6' }
};

export const STOCK_SOURCE = {
  gold: 'Theo rổ VN30 hiệu lực từ 03/08/2026 (HOSE)',
  silver: 'Danh mục dự kiến · Nexxa công bố bản chính thức trước khi phân bổ',
  copper: 'Danh mục dự kiến · Nexxa công bố bản chính thức trước khi phân bổ'
};

// Thứ tự mã phổ biến của từng nhóm, hiển thị trước khi người dùng cuộn xuống. Đây là
// quyết định trình bày, không phải dữ liệu — nên nó ở lại frontend chứ không lên server.
export const POPULAR_TICKERS = {
  vip: ['VCB', 'VIC', 'VHM', 'VNM', 'HPG', 'FPT', 'MWG', 'TCB', 'MSN', 'VPB', 'GAS', 'SSI'],
  standard: ['PNJ', 'PLX', 'TPB', 'REE', 'HCM', 'VND', 'POW', 'FRT']
};

// Dự phòng cho khung hình đầu tiên, đúng hình dạng /api/catalog trả về. Không có giá:
// giá chỉ sống ở server, thà hiện '—' còn hơn quảng cáo một con số có thể đã cũ hàng tuần.
export const FALLBACK_CATALOG = {
  totalSlots: TOTAL_SLOTS,
  entitlements: ENTITLEMENTS.map((e) => ({ ...e, pools: [...e.pools] })),
  pools: POOLS.map((p) => ({ key: p.key, label: p.label, desc: p.desc, groupType: p.key.toUpperCase() })),
  stocks: POOLS.flatMap((p) =>
    RESERVABLE[p.key].map((s) => ({
      t: s.t,
      n: NAME_OF_TICKER[s.t] ?? null,
      pool: p.key,
      groupType: p.key.toUpperCase(),
      price: null
    }))
  )
};
