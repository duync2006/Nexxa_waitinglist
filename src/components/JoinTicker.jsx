import { useMarquee } from '../lib/useMarquee.js';

// Chậm hơn dải cổ phiếu (105): mỗi mục ở đây là một email bị che, mắt phải dừng lại
// giải mã chứ không lướt qua như một mã chứng khoán bốn chữ cái.
const SPEED = 55;

// Lặp cho đủ dài. Với 3 người đăng ký, một nhóm chỉ rộng vài trăm px, mà useMarquee nối
// vòng bằng cách trừ đi bề rộng nhóm — nhóm hẹp hơn màn hình thì cuối dải hở một mảng trống.
const MIN_ITEMS = 8;

function repeatToFill(items) {
  if (items.length === 0) return items;
  const out = [];
  while (out.length < MIN_ITEMS) out.push(...items);
  return out;
}

// Email đã được che sẵn ở server (server/utils/mask.js). Không che ở đây: component này
// chỉ hiển thị thứ nó nhận được, và thứ nó nhận được không bao giờ là email đầy đủ.
export default function JoinTicker({ recent = [] }) {
  const { scrollRef, trackRef } = useMarquee(SPEED);
  const items = repeatToFill(recent);

  // Chưa ai đăng ký thì không có gì để chạy — một dải rỗng tự nó là một thông báo.
  if (items.length === 0) return null;

  return (
    // Nằm trong header (đã là .container) ở cột giữa, giữa logo và nút đổi theme.
    <div className="ticker-wrap">
      <div
        className="ticker"
        ref={scrollRef}
        role="region"
        aria-label="Người vừa tham gia waitlist"
        tabIndex={0}
      >
        <div className="ticker-track" ref={trackRef}>
          {/* Hai nhóm giống nhau để vòng lặp liền mạch; nhóm sau ẩn với trình đọc màn hình */}
          {[false, true].map((hidden) => (
            <div key={String(hidden)} className="ticker-group" aria-hidden={hidden || undefined}>
              {items.map((r, i) => (
                // key theo vị trí: danh sách đã nhân bản nên masked trùng nhau là chuyện thường
                <span key={`${r.masked}-${i}`} className="ticker-item">
                  <span className="ticker-dot" aria-hidden="true" />
                  <span className="ticker-email">{r.masked}</span>
                  <span className="ticker-verb">vừa tham gia</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
