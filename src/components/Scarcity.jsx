import { fmt } from '../lib/format.js';

// Khối khan hiếm đặt ngay dưới dòng giá trị ở hero. Trước đây đây là cái pill 13px màu xám
// nằm cạnh nút đổi theme trên header — đúng con số mạnh nhất trang nhưng để ở chỗ yếu nhất,
// và người đọc xong hero không hề nhìn thấy nó.
export default function Scarcity({ registered, total, last24h }) {
  const taken = Math.min(Math.max(0, registered), total);
  const remaining = total - taken;
  const pct = total ? (taken / total) * 100 : 0;

  return (
    <div className="scarcity">
      <p className="scarcity-line">
        <span className="scarcity-num">Còn {fmt(remaining)}</span>
        <span className="scarcity-of">trên {fmt(total)} suất</span>
      </p>
      <div
        className="bar scarcity-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={taken}
        aria-label={`Đã có ${fmt(taken)} trên ${fmt(total)} suất được nhận`}
      >
        {/* Bề rộng tối thiểu 2px: ở những ngày đầu taken/total làm tròn ra 0% và thanh
            trông như hỏng, trong khi thực tế đã có người đăng ký. */}
        <div className="bar-fill" style={{ width: pct > 0 ? `max(2px, ${pct}%)` : 0 }} />
      </div>
      {last24h > 0 && (
        <p className="scarcity-rate">{fmt(last24h)} người đăng ký trong 24 giờ qua</p>
      )}
    </div>
  );
}
