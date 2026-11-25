import { fmt } from '../lib/format.js';

// Khối khan hiếm ở hero: hai vòng cho hai đường vào VIP.
//   First 1.000 — 1.000 người đăng ký đầu tiên, chắc chắn VIP.
//   Top 1.000   — 1.000 người điểm cao nhất trong số đăng ký từ #1.001 trở đi.
// Số suất còn lại do /api/stats tính sẵn (firstRemaining, topRemaining), component không
// tự suy luật. Suất Top về 0 khi nhóm đua đủ 1.000 người — thứ hạng bên trong vẫn đổi theo điểm.
//
// Mỗi vòng: số ở giữa là suất ĐÃ ĐĂNG KÝ / tổng suất. Vòng mảnh bên trong luôn đầy, cung
// dày bên ngoài dài bằng % suất đã đăng ký (bắt đầu ở 12 giờ, chạy theo chiều kim đồng hồ),
// khớp với số ở giữa — cung dài dần tới khi khép kín vòng là hết suất.

// Hệ toạ độ SVG 120×120. Cung ngoài r=54 nét 8 (phủ 50→58), vòng trong r=44 — khe ~5 đơn vị
// giữa hai lớp là thứ tạo ra cảm giác "vòng lồng vòng" như mẫu.
const ARC_R = 54;
const INNER_R = 44;

function Ring({ label, hint, slots, left, tone }) {
  const remain = Math.min(slots, Math.max(0, left));
  const taken = slots - remain;
  // Cung theo đúng số ở giữa: % suất đã đăng ký. pathLength="100" nên phải quy ra phần trăm,
  // không truyền thẳng số người (237 người sẽ thành 237/100 → vòng luôn đầy).
  const raw = slots ? (taken / slots) * 100 : 0;
  // Đã có người đăng ký nhưng làm tròn ra gần 0 thì vẫn giữ một mẩu cung cho thấy được.
  const pct = taken > 0 ? Math.max(raw, 1.5) : 0;

  return (
    <figure
      className={`ring ring-${tone}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={slots}
      aria-valuenow={taken}
      aria-label={`Suất ${label}: đã đăng ký ${fmt(taken)} trên ${fmt(slots)}`}
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
          <b>{fmt(taken)}</b>
          <span>/ {fmt(slots)}</span>
        </div>
      </div>
      <figcaption>
        <span className="ring-label">{label}</span>
        <span className="ring-hint">{hint}</span>
      </figcaption>
    </figure>
  );
}

export default function Scarcity({ slots }) {
  return (
    <div className="scarcity">
      <div className="scarcity-rings">
        <Ring
          label={`First Signups`}
          // hint="Đăng ký sớm"
          slots={slots.firstSlots}
          left={slots.firstRemaining}
          tone="first"
        />
        <Ring
          label={`Top Referrals`}
          // hint="Theo điểm mời"
          slots={slots.topSlots}
          left={slots.topRemaining}
          tone="top"
        />
      </div>
    </div>
  );
}
