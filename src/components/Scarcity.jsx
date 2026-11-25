import { fmt } from '../lib/format.js';
import { useCountdown, countdownText } from '../lib/useCountdown.js';

// Khối khan hiếm ở hero: hai vòng cho hai đường vào VIP.
//   First 1.000 — 1.000 người đăng ký đầu tiên, chắc chắn VIP.
//   Top 1.000   — 1.000 người điểm cao nhất trong số người đã mời ít nhất 1 bạn.
// Số suất còn lại do /api/stats tính sẵn (firstRemaining, topRemaining), component không
// tự suy luật. Suất Top về 0 khi nhóm đua đủ 1.000 người — thứ hạng bên trong vẫn đổi theo điểm.
//
// Mỗi vòng: vòng mảnh bên trong luôn đầy, cung dày bên ngoài dài bằng % suất CÒN LẠI
// (bắt đầu ở 12 giờ, chạy theo chiều kim đồng hồ). Cung ngắn dần khi suất cạn — người xem
// thấy "sắp hết" mà không cần đọc số.

// Hệ toạ độ SVG 120×120. Cung ngoài r=54 nét 8 (phủ 50→58), vòng trong r=44 — khe ~5 đơn vị
// giữa hai lớp là thứ tạo ra cảm giác "vòng lồng vòng" như mẫu.
const ARC_R = 54;
const INNER_R = 44;

// Ring có hai chế độ. Mặc định: giữa vòng là số suất còn lại. Truyền `center` (vòng Top khi hết
// suất): giữa vòng là dòng chính + dòng ghi chú (tuỳ chọn) + dòng phụ, cung theo `fraction`
// (0..1) thay cho % suất.
function Ring({ label, hint, slots, left, tone, center, fraction }) {
  const remain = Math.min(slots, Math.max(0, left));
  const raw = center ? Math.min(1, Math.max(0, fraction)) * 100 : slots ? (remain / slots) * 100 : 0;
  // Còn suất nhưng làm tròn ra gần 0 thì vẫn giữ một mẩu cung, nếu không vòng trông như đã hết.
  const pct = center ? raw : remain > 0 ? Math.max(raw, 1.5) : 0;

  return (
    <figure
      className={`ring ring-${tone}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={slots}
      aria-valuenow={remain}
      aria-label={center
        ? [`${label}:`, center.main, center.note, center.sub].filter(Boolean).join(' ')
        : `Suất ${label}: còn ${fmt(remain)} trên ${fmt(slots)}`}
    >
      <div className="ring-dial">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle className="ring-inner" cx="60" cy="60" r={INNER_R} />
          {pct > 0 && (
            <circle
              className="ring-arc"
              cx="60"
              cy="60"
              r={ARC_R}
              pathLength="100"
              style={{ strokeDasharray: `${pct} 100` }}
            />
          )}
        </svg>
        <div className="ring-value">
          {center ? (
            <>
              <b className="ring-center-main">{center.main}</b>
              {center.note && <span className="ring-center-note">{center.note}</span>}
              {center.sub && <span>{center.sub}</span>}
            </>
          ) : (
            <>
              <b>{fmt(remain)}</b>
              <span>/ {fmt(slots)}</span>
            </>
          )}
        </div>
      </div>
      <figcaption>
        <span className="ring-label">{label}</span>
        <span className="ring-hint">{hint}</span>
      </figcaption>
    </figure>
  );
}

// Vòng Top khi hết suất: hiện ngưỡng điểm và đếm ngược tới deadline. Cung = phần thời gian còn
// lại (deadline − now) / (deadline − topStart); thiếu topStart thì đầy; sau deadline thì rỗng.
// Đơn vị là "điểm", không viết tắt "đ" — ngay cạnh giá cổ phiếu, "đ" đọc thành đồng.
// Sau deadline chỉ còn ngưỡng đã chốt + "Đã chốt": lượt mời không còn cộng điểm nên không
// được mời người xem "mời 1 bạn để vào Top" nữa.
// Chữ giữa vòng phải vừa vòng trong (~59px ở dial 80px): "Mời 1 bạn" một dòng, "để vào Top"
// xuống dòng ghi chú, không nhồi cả câu vào một dòng.
function useTopClosing(slots) {
  const cd = useCountdown(slots.topDeadline);
  if (slots.topRemaining > 0) return null;
  const cutoff = slots.topCutoff;
  const ended = Boolean(cd?.ended);
  const invite = cutoff === 0 && !ended;
  const main = invite ? 'Mời 1 bạn' : cutoff != null ? `≥ ${fmt(cutoff)} điểm` : '';
  const note = invite ? 'để vào Top' : '';
  if (!cd) return { center: { main, note, sub: '' }, fraction: 1 };
  const start = slots.topStart ? Date.parse(slots.topStart) : NaN;
  const total = cd.target - start;
  const fraction = cd.ended ? 0 : Number.isFinite(total) && total > 0 ? cd.msLeft / total : 1;
  return { center: { main, note, sub: countdownText(cd) }, fraction };
}

export default function Scarcity({ slots }) {
  const closing = useTopClosing(slots);
  return (
    <div className="scarcity">
      <div className="scarcity-rings">
        <Ring
          label={`First ${fmt(slots.firstSlots)}`}
          hint="Đăng ký sớm"
          slots={slots.firstSlots}
          left={slots.firstRemaining}
          tone="first"
        />
        <Ring
          label={`Top ${fmt(slots.topSlots)}`}
          hint="Theo điểm mời"
          slots={slots.topSlots}
          left={slots.topRemaining}
          tone="top"
          center={closing?.center}
          fraction={closing?.fraction}
        />
      </div>
    </div>
  );
}
