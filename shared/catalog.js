// Nguồn dùng chung cho cả frontend lẫn server: số suất, danh mục cổ phiếu, hai pool Reserve.
// Trước đây server import thẳng src/lib/data.js (phụ thuộc ngược vào source frontend) và
// TOTAL_SLOTS được khai báo hai nơi độc lập — sửa một nơi là lệch. Giờ cả hai cùng đọc từ đây.

export const TOTAL_SLOTS = 1000;

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

// Quyền chọn cổ phiếu theo hạng trong waitlist. Thay cho bảng TIERS cũ
// (GOLD/SILVER/COPPER với ba mức tiền khác nhau).
export const ENTITLEMENTS = [
  { key: 'top', label: 'Top 1.000', budget: 100000, pools: ['vip', 'standard'] },
  { key: 'rest', label: 'Sau top 1.000', budget: 50000, pools: ['standard'] }
];

export const entitlementOfRank = (rank) =>
  rank <= TOTAL_SLOTS ? ENTITLEMENTS[0] : ENTITLEMENTS[1];
