import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { POOL_STOCKS } from '../lib/data.js';
import { vnd } from '../lib/format.js';
import { useMarquee } from '../lib/useMarquee.js';

// Danh sách lấy thẳng từ hai pool Reserve, cùng nguồn với ReserveModal: mã phổ biến xếp
// trước, phần còn lại nối sau. Trước đây đây là một mảng chép tay riêng, nên thêm/bớt mã
// trong catalog xong carousel vẫn hiện danh sách cũ.
const stocksOfPool = (key) => {
  const { popular, rest } = POOL_STOCKS[key];
  return [...popular, ...rest].map((s) => ({ ...s, pool: key }));
};

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

const FEATURED = mixByRatio(stocksOfPool('vip'), stocksOfPool('standard'));

// Tốc độ trượt tính bằng px/giây. Chậm hơn bản cũ (130) vì mỗi thẻ giờ có thêm dòng giá —
// nhiều chữ hơn để đọc thì phải cho mắt thêm thời gian trước khi thẻ trôi khỏi khung.
const SPEED = 105;

export default function FeaturedStocks() {
  const { scrollRef, trackRef } = useMarquee(SPEED);
  const [prices, setPrices] = useState({});

  // Giá lấy từ bảng giá của server, cùng nguồn với ReserveModal — không chép tay vào đây,
  // nếu không dải trượt sẽ quảng cáo một mức giá còn màn chọn quà lại tính mức khác.
  // Gọi ở chế độ xem thử (không email) nên người chưa đăng ký vẫn thấy giá.
  useEffect(() => {
    let alive = true;
    api.reserveOptions()
      .then((o) => { if (alive) setPrices(o.prices ?? {}); })
      .catch(() => { /* không có giá thì thẻ vẫn hiện mã và tên */ });
    return () => { alive = false; };
  }, []);

  return (
    <div className="featured">
      <div className="featured-head">
        {/* <span className="featured-title">Cổ phiếu nổi tiếng trên HOSE</span> */}
        {/* <span className="muted-13">Vuốt ngang để xem →</span> */}
      </div>
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
              {FEATURED.map((s) => (
                // title vì .featured-n cắt tên dài bằng ellipsis để mọi thẻ cao bằng nhau
                <div key={s.t} className="featured-item" title={s.n}>
                  {s.pool === 'vip' && <span className="chip-tag">VIP</span>}
                  <span className="featured-t">{s.t}</span>
                  <span className="featured-n">{s.n}</span>
                  <span className="featured-p">
                    {typeof prices[s.t] === 'number' ? vnd(prices[s.t]) : '—'}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
