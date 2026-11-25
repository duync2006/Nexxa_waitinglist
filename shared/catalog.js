// Nguồn dùng chung cho cả frontend lẫn server: số suất, danh mục cổ phiếu, hai pool Reserve.
// Trước đây server import thẳng src/lib/data.js (phụ thuộc ngược vào source frontend) và
// TOTAL_SLOTS được khai báo hai nơi độc lập — sửa một nơi là lệch. Giờ cả hai cùng đọc từ đây.

// Hai đường vào VIP chạy SONG SONG, mỗi đường 1.000 suất, và CÓ THỂ chồng lên nhau:
//   1. FIRST_SLOTS — 1.000 người đăng ký đầu tiên (joinIndex 1..1.000), chắc chắn bất kể điểm.
//   2. TOTAL_SLOTS — Top 1.000 theo điểm, xếp trên TOÀN BỘ người đăng ký, kể cả người First.
// Thuộc cả hai thì quyền lợi cộng dồn (xem entitlementOf). Tên TOTAL_SLOTS giữ nguyên vì
// /api/catalog và /api/stats đã trả về key `totalSlots` — đổi tên là vỡ client cũ.
export const FIRST_SLOTS = 1000;
export const TOTAL_SLOTS = 1000;
// Số suất nhóm Standard. Chỉ dùng để hiển thị; server chưa chặn đăng ký khi vượt quá.
export const STANDARD_SLOTS = 9000;

// Người đăng ký sớm: joinIndex tăng đều 1 theo thứ tự đăng ký (bộ đếm Counter 'users').
export const isEarlyJoin = (joinIndex) => joinIndex <= FIRST_SLOTS;

// Hạng Top (xếp trên toàn bộ user) nằm trong 1..TOTAL_SLOTS.
export const isTopRank = (rank) => rank != null && rank <= TOTAL_SLOTS;

const S = (s) => s.split(';').map((p) => { const [t, n] = p.split('|'); return { t, n }; });

export const STOCKS = {
  gold: S('ACB|Ngân hàng Á Châu;BID|BIDV;BSR|Lọc hóa dầu Bình Sơn;CTG|VietinBank;FPT|Tập đoàn FPT;GAS|PV GAS;GVR|Cao su Việt Nam;HDB|HDBank;HPG|Hòa Phát;LPB|LPBank;MBB|MB Bank;MCH|Masan Consumer;MSN|Masan Group;MWG|Thế Giới Di Động;SAB|Sabeco;SHB|Ngân hàng SHB;SSB|SeABank;SSI|Chứng khoán SSI;STB|Sacombank;TCB|Techcombank;TCX|Chứng khoán Techcom;VCB|Vietcombank;VHM|Vinhomes;VIB|Ngân hàng VIB;VIC|Vingroup;VJC|Vietjet Air;VNM|Vinamilk;VPB|VPBank;VPL|Vinpearl;VRE|Vincom Retail'),
  silver: S('PLX|Petrolimex;TPB|TPBank;BCM|Becamex IDC;GEE|Gelex Electric;EIB|Eximbank;MSB|Ngân hàng MSB;REE|Cơ điện lạnh REE;DGC|Hóa chất Đức Giang;POW|PV Power;VCI|Chứng khoán Vietcap'),
  copper: S('PNJ|Vàng bạc Phú Nhuận;KDH|Nhà Khang Điền;DXG|Đất Xanh;VND|Chứng khoán VNDirect;HCM|Chứng khoán HSC;DPM|Đạm Phú Mỹ;VHC|Vĩnh Hoàn;FRT|FPT Retail;NLG|Nam Long;KBC|Đô thị Kinh Bắc')
};

// Hai pool trong màn hình Reserve. VIP = nhóm VN30 (hạng GOLD); Standard = các hạng còn lại.
export const POOLS = [
  { key: 'vip', label: 'VIP', desc: 'Cổ phiếu nhóm VN30', tiers: ['gold'] },
  { key: 'standard', label: 'Standard', desc: 'Cổ phiếu top 30–100', tiers: ['silver', 'copper'] }
];

// Danh sách mã có thể nhận, dùng chung cho UI và kiểm tra phía server
export const RESERVABLE = Object.fromEntries(
  POOLS.map((p) => [p.key, p.tiers.flatMap((k) => STOCKS[k])])
);

// Server chỉ cần biết mã nào hợp lệ, không cần tên công ty
export const RESERVABLE_TICKERS = new Set(Object.values(RESERVABLE).flat().map((s) => s.t));

// Tra nhóm của một mã. Hai pool không có mã nào trùng nhau nên map này là 1-1.
export const POOL_OF_TICKER = Object.fromEntries(
  POOLS.flatMap((p) => RESERVABLE[p.key].map((s) => [s.t, p.key]))
);

// Dạng lưu xuống field `groupType` của collection `prices`: 'VIP' | 'STANDARD'.
// Suy ra từ POOL_OF_TICKER chứ không chép tay thành bảng thứ hai — thêm/bớt mã trong
// STOCKS là nó tự đúng theo, không có chuyện hai nơi lệch nhau.
export const groupTypeOfTicker = (ticker) => POOL_OF_TICKER[ticker]?.toUpperCase() ?? null;

// Tên ngắn của từng mã. Nguồn giá trả tên pháp lý đầy đủ và đó mới là thứ lưu xuống
// `prices.companyName`; bảng này chỉ dùng khi nguồn không có tên (giá demo), và làm dữ
// liệu dự phòng cho frontend lúc API chưa trả về.
export const NAME_OF_TICKER = Object.fromEntries(
  Object.values(RESERVABLE).flat().map((s) => [s.t, s.n])
);

// Ngân sách từng suất. Thuộc cả First lẫn Top thì cộng dồn: FIRST_BUDGET + TOP_BUDGET,
// chọn chung một giỏ. Không thuộc suất nào thì REST_BUDGET và chỉ được nhóm Standard.
export const FIRST_BUDGET = 100000;
export const TOP_BUDGET = 100000;
export const REST_BUDGET = 50000;

// Hai bậc hiển thị cho /api/catalog và style ở frontend. Ngân sách của bậc 'top' là mức
// MỘT suất; người có cả hai suất được nhiều hơn — con số thật luôn lấy từ entitlementOf.
export const ENTITLEMENTS = [
  { key: 'top', label: 'VIP', budget: FIRST_BUDGET, pools: ['vip', 'standard'] },
  { key: 'rest', label: 'Tiêu chuẩn', budget: REST_BUDGET, pools: ['standard'] }
];

// early: thuộc First 1.000. inTop: đang (hoặc đã chốt) ở hạng 1..TOTAL_SLOTS của Top.
export const isVip = ({ early, inTop }) => Boolean(early) || Boolean(inTop);

export const entitlementOf = ({ early, inTop }) => {
  const [top, rest] = ENTITLEMENTS;
  if (!isVip({ early, inTop })) return { key: rest.key, label: rest.label, budget: REST_BUDGET, pools: [...rest.pools] };
  return {
    key: top.key,
    label: top.label,
    budget: (early ? FIRST_BUDGET : 0) + (inTop ? TOP_BUDGET : 0),
    pools: [...top.pools]
  };
};
