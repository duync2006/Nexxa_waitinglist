// Danh sách mã blue-chip phổ biến trên HOSE (chỉ tên và ngành, không kèm giá).
const FEATURED = [
  { t: 'VCB', n: 'Vietcombank', s: 'Ngân hàng' },
  { t: 'VIC', n: 'Vingroup', s: 'Bất động sản' },
  { t: 'VHM', n: 'Vinhomes', s: 'Bất động sản' },
  { t: 'VNM', n: 'Vinamilk', s: 'Đồ uống' },
  { t: 'HPG', n: 'Hòa Phát', s: 'Thép' },
  { t: 'FPT', n: 'FPT Corp', s: 'Công nghệ' },
  { t: 'MWG', n: 'Thế Giới Di Động', s: 'Bán lẻ' },
  { t: 'TCB', n: 'Techcombank', s: 'Ngân hàng' },
  { t: 'MSN', n: 'Masan Group', s: 'Tiêu dùng' },
  { t: 'VPB', n: 'VPBank', s: 'Ngân hàng' },
  { t: 'GAS', n: 'PV Gas', s: 'Dầu khí' },
  { t: 'SSI', n: 'Chứng khoán SSI', s: 'Chứng khoán' }
];

export default function FeaturedStocks() {
  return (
    <div className="featured">
      <div className="featured-head">
        {/* <span className="featured-title">Cổ phiếu nổi tiếng trên HOSE</span> */}
        {/* <span className="muted-13">Vuốt ngang để xem →</span> */}
      </div>
      <div className="featured-scroll" role="region" aria-label="Danh sách cổ phiếu nổi tiếng">
        <div className="featured-track">
          {/* Hai nhóm giống nhau để vòng lặp liền mạch; nhóm sau ẩn với trình đọc màn hình */}
          {[false, true].map((hidden) => (
            <div key={String(hidden)} className="featured-group" aria-hidden={hidden || undefined}>
              {FEATURED.map((s) => (
                <div key={s.t} className="featured-item">
                  <span className="featured-t">{s.t}</span>
                  <span className="featured-n">{s.n}</span>
                  <span className="featured-s">{s.s}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
