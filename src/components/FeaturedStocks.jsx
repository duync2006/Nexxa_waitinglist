import { useEffect, useRef } from 'react';
import { POOL_STOCKS } from '../lib/data.js';

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

// Tốc độ trượt tính bằng px/giây, giữ đúng cảm giác của bản CSS animation cũ.
const SPEED = 130;
// Sau khi nhấc tay, chờ quán tính cuộn của trình duyệt lắng xuống rồi mới chạy tiếp,
// nếu không thì hai bên cùng đẩy scrollLeft và chuyển động bị giật.
const RESUME_DELAY = 1200;

export default function FeaturedStocks() {
  const scrollRef = useRef(null);
  const trackRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    const track = trackRef.current;
    if (!el || !track) return undefined;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    let paused = false;
    let resumeTimer = 0;
    let raf = 0;
    let last = performance.now();

    const pause = () => {
      paused = true;
      clearTimeout(resumeTimer);
    };
    const resumeLater = () => {
      clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => { paused = false; }, RESUME_DELAY);
    };

    const step = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      if (!paused) {
        // Đo bề rộng nhóm mỗi khung hình thay vì tính sẵn: số mã, bề rộng thẻ hay gap đổi
        // thì điểm nối vẫn khớp, không phải sửa lại phép tính ở chỗ khác.
        const groupWidth = track.firstElementChild?.getBoundingClientRect().width ?? 0;
        if (groupWidth > 0) {
          let next = el.scrollLeft + SPEED * dt;
          if (next >= groupWidth) next -= groupWidth;
          el.scrollLeft = next;
        }
      }

      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    // Chạm để dừng, nhấc tay thì chạy lại. Dùng pointer event nên phủ cả chuột lẫn ngón tay,
    // và không dựa vào :hover — trên màn hình cảm ứng :hover bám dính sau khi chạm.
    el.addEventListener('pointerdown', pause);
    el.addEventListener('pointerup', resumeLater);
    el.addEventListener('pointercancel', resumeLater);
    el.addEventListener('touchstart', pause, { passive: true });
    el.addEventListener('touchend', resumeLater, { passive: true });
    el.addEventListener('focusin', pause);
    el.addEventListener('focusout', resumeLater);

    const hoverable = window.matchMedia('(hover: hover) and (pointer: fine)');
    const onEnter = () => { if (hoverable.matches) pause(); };
    const onLeave = () => { if (hoverable.matches) resumeLater(); };
    el.addEventListener('pointerenter', onEnter);
    el.addEventListener('pointerleave', onLeave);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(resumeTimer);
      el.removeEventListener('pointerdown', pause);
      el.removeEventListener('pointerup', resumeLater);
      el.removeEventListener('pointercancel', resumeLater);
      el.removeEventListener('touchstart', pause);
      el.removeEventListener('touchend', resumeLater);
      el.removeEventListener('focusin', pause);
      el.removeEventListener('focusout', resumeLater);
      el.removeEventListener('pointerenter', onEnter);
      el.removeEventListener('pointerleave', onLeave);
    };
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
                <div key={s.t} className="featured-item">
                  {s.pool === 'vip' && <span className="chip-tag">VIP</span>}
                  <span className="featured-t">{s.t}</span>
                  <span className="featured-n">{s.n}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
