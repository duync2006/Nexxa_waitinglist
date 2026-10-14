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
