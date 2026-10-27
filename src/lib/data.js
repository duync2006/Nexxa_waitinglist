export const TOTAL_SLOTS = 1000;

export const TIERS = [
  { key: 'gold', label: 'GOLD', from: 1, to: 200, value: 100000, group: 'Cổ phiếu nhóm VN30', fg: '#7A5600', bg: '#FFF3D1', bar: '#D69A00' },
  { key: 'silver', label: 'SILVER', from: 201, to: 400, value: 60000, group: 'Cổ phiếu top 30–50', fg: '#3F4A5A', bg: '#ECEFF3', bar: '#8A94A6' },
  { key: 'copper', label: 'COPPER', from: 401, to: 1000, value: 40000, group: 'Cổ phiếu ngoài top 50', fg: '#8C3F1A', bg: '#FBE8DD', bar: '#C0612F' }
];

const S = (s) => s.split(';').map((p) => { const [t, n] = p.split('|'); return { t, n }; });

export const STOCKS = {
  gold: S('ACB|Ngân hàng Á Châu;BID|BIDV;BSR|Lọc hóa dầu Bình Sơn;CTG|VietinBank;FPT|Tập đoàn FPT;GAS|PV GAS;GVR|Cao su Việt Nam;HDB|HDBank;HPG|Hòa Phát;LPB|LPBank;MBB|MB Bank;MCH|Masan Consumer;MSN|Masan Group;MWG|Thế Giới Di Động;SAB|Sabeco;SHB|Ngân hàng SHB;SSB|SeABank;SSI|Chứng khoán SSI;STB|Sacombank;TCB|Techcombank;TCX|Chứng khoán Techcom;VCB|Vietcombank;VHM|Vinhomes;VIB|Ngân hàng VIB;VIC|Vingroup;VJC|Vietjet Air;VNM|Vinamilk;VPB|VPBank;VPL|Vinpearl;VRE|Vincom Retail'),
  silver: S('PLX|Petrolimex;TPB|TPBank;BCM|Becamex IDC;GEE|Gelex Electric;EIB|Eximbank;MSB|Ngân hàng MSB;REE|Cơ điện lạnh REE;DGC|Hóa chất Đức Giang;POW|PV Power;VCI|Chứng khoán Vietcap'),
  copper: S('PNJ|Vàng bạc Phú Nhuận;KDH|Nhà Khang Điền;DXG|Đất Xanh;VND|Chứng khoán VNDirect;HCM|Chứng khoán HSC;DPM|Đạm Phú Mỹ;VHC|Vĩnh Hoàn;FRT|FPT Retail;NLG|Nam Long;KBC|Đô thị Kinh Bắc')
};

export const STOCK_SOURCE = {
  gold: 'Theo rổ VN30 hiệu lực từ 03/08/2026 (HOSE)',
  silver: 'Danh mục dự kiến · Nexxa công bố bản chính thức trước khi phân bổ',
  copper: 'Danh mục dự kiến · Nexxa công bố bản chính thức trước khi phân bổ'
};

export const tierOfRank = (rank) => TIERS.find((t) => rank >= t.from && rank <= t.to) || null;

// Hai pool trong màn hình Reserve. VIP = nhóm VN30 (hạng GOLD); Standard = các hạng còn lại.
export const POOLS = [
  { key: 'vip', label: 'VIP', desc: 'Cổ phiếu nhóm VN30', tiers: ['gold'] },
  { key: 'standard', label: 'Standard', desc: 'Cổ phiếu top 30–100', tiers: ['silver', 'copper'] }
];

// Danh sách mã có thể nhận, dùng chung cho UI và kiểm tra phía server
export const RESERVABLE = Object.fromEntries(
  POOLS.map((p) => [p.key, p.tiers.flatMap((k) => STOCKS[k])])
);

// Thứ tự mã phổ biến của từng pool, hiển thị trước khi người dùng bấm "Xem thêm".
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
