import { useCatalog } from '../lib/catalog.jsx';
import { useMarquee } from '../lib/useMarquee.js';
import { vnd } from '../lib/format.js';

// Trộn hai nhóm theo đúng tỉ lệ số lượng thay vì xen kẽ 1-1. VIP có 30 mã còn Standard 20,
// nên xen kẽ 1-1 sẽ hết Standard ở giữa đường và 10 mã VIP cuối dồn thành một cụm toàn tag.
const mixByRatio = (a, b) => {
  const out = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (j >= b.length) out.push(a[i++]);
    else if (i >= a.length) out.push(b[j++]);
    else if ((i + 1) / a.length <= (j + 1) / b.length) out.push(a[i++]);
    else out.push(b[j++]);
  }
  return out;
};

// Tốc độ trượt tính bằng px/giây. KHÔNG hạ xuống dưới 60: mỗi khung hình khi đó nhích chưa
// tới 1px, mà Safari trên iOS làm tròn scrollLeft về số nguyên nên chuyển động thành giật
// từng nấc. Xem chú thích trong useMarquee.js.
const SPEED = 105;

export default function FeaturedStocks() {
  const { scrollRef, trackRef } = useMarquee(SPEED);
  // Danh mục và giá cùng đến từ /api/catalog. Trước đây component này tự gọi
  // /api/reserve/options chỉ để lấy giá, trùng với lần gọi của ReserveModal.
  const { poolStocks } = useCatalog();

  const featured = mixByRatio(
    [...(poolStocks.vip?.popular ?? []), ...(poolStocks.vip?.rest ?? [])],
    [...(poolStocks.standard?.popular ?? []), ...(poolStocks.standard?.rest ?? [])]
  );

  if (featured.length === 0) return null;

  return (
    <div className="featured">
      <div className="featured-head" />
      {/* Lớp bọc này chỉ để đeo mask mép mờ. Mask PHẢI nằm ngoài khung cuộn: trên iOS,
          mask-image ép phần tử thành một composited layer riêng, mà khung cuộn chứa track
          rộng 16.000px nên WebKit phải vẽ layer đó theo tile. JS đẩy scrollLeft mỗi khung
          hình thì Safari không kịp vẽ tile phía trước và để lại một mảng trống chạy qua.
          Đeo mask lên lớp bọc thì layer bị mask chỉ rộng bằng màn hình. */}
      <div className="featured-mask">
        <div
          className="featured-scroll"
          ref={scrollRef}
          role="region"
          aria-label="Danh sách cổ phiếu nổi tiếng"
          tabIndex={0}
        >
          <div className="featured-track" ref={trackRef}>
            {/* Hai nhóm giống nhau để vòng lặp liền mạch; nhóm sau ẩn với trình đọc màn hình */}
            {[false, true].map((hidden) => (
              <div key={String(hidden)} className="featured-group" aria-hidden={hidden || undefined}>
                {featured.map((s) => (
                  // title để xem tên đầy đủ khi tên dài quá 3 dòng của .featured-n
                  <div key={s.t} className="featured-item" title={s.n ?? s.t}>
                    {s.pool === 'vip' && <span className="chip-tag">VIP</span>}
                    <span className="featured-t">{s.t}</span>
                    <span className="featured-n">{s.n ?? ''}</span>
                    <span className="featured-p">
                      {typeof s.price === 'number' ? vnd(s.price) : '—'}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
