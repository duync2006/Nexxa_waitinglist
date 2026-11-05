import { fmt } from '../lib/format.js';
import { STANDARD_SLOTS } from '../../shared/catalog.js';

// Khối khan hiếm đặt ngay dưới dòng giá trị ở hero. Trước đây đây là cái pill 13px màu xám
// nằm cạnh nút đổi theme trên header — đúng con số mạnh nhất trang nhưng để ở chỗ yếu nhất,
// và người đọc xong hero không hề nhìn thấy nó.
//
// `total` là số suất VIP (top 1.000 theo điểm). Hạng được xếp theo điểm chứ không theo thứ tự
// đăng ký, nhưng về SỐ LƯỢNG thì top 1.000 đầy ngay khi có 1.000 người, nên chỉ cần `registered`
// là suy ra được cả hai nhóm, không cần server trả thêm gì.
export default function Scarcity({ registered, total, last24h }) {
  const capacity = total + STANDARD_SLOTS;
  const taken = Math.min(Math.max(0, registered), capacity);
  const vipTaken = Math.min(taken, total);
  const standardTaken = taken - vipTaken;

  // Bề rộng tối thiểu 2px: ngày đầu pct làm tròn ra 0% và thanh trông như hỏng, trong khi
  // thực tế đã có người đăng ký.
  const fillWidth = (n, of) => {
    const pct = of ? (n / of) * 100 : 0;
    return pct > 0 ? `max(2px, ${pct}%)` : 0;
  };

  const rows = [
    { key: 'vip', label: 'VIP', hint: 'Top 1.000 theo điểm', slots: total, taken: vipTaken },
    { key: 'std', label: 'Standard', hint: 'Từ hạng #1.001', slots: STANDARD_SLOTS, taken: standardTaken }
  ];

  return (
    <div className="scarcity">
      <div className="scarcity-stack">
        {rows.map((r) => (
          <div key={r.key} className={`scarcity-row scarcity-seg-${r.key}`}>
            <div className="scarcity-row-head">
              <span className="scarcity-seg-label">{r.label}</span>
              <span className="scarcity-row-hint">{r.hint}</span>
              <span className="scarcity-row-left">
                <b>Còn {fmt(r.slots - r.taken)}</b> / {fmt(r.slots)}
              </span>
            </div>
            <div
              className="bar scarcity-seg-bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={r.slots}
              aria-valuenow={r.taken}
              aria-label={`Suất ${r.label}: đã có ${fmt(r.taken)} trên ${fmt(r.slots)}`}
            >
              <div className="bar-fill" style={{ width: fillWidth(r.taken, r.slots) }} />
            </div>
          </div>
        ))}
      </div>
      {last24h > 0 && (
        <p className="scarcity-rate">{fmt(last24h)} người đăng ký trong 24 giờ qua</p>
      )}
    </div>
  );
}
