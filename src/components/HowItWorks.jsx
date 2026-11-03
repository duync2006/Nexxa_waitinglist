// Nội dung giữ nguyên từng chữ, chỉ thêm `group` để biết mỗi dòng thuộc tầng nào. Trước đây
// cả 10 mục đổ vào một danh sách phẳng cùng cỡ chữ cùng kiểu ô, nên "1.000 người đăng ký đầu
// tiên được cổ phiếu VIP" nằm ngang hàng với "áp dụng điều khoản chương trình".
const REWARDS = [
  { title: '1.000 Người Đăng Ký Đầu Tiên', body: 'Thưởng cổ phiếu VIP', group: 'reward', tier: 'vip' },
  { title: 'TOP 1.000 Người Giới Thiệu', body: 'Thưởng cổ phiếu VIP', group: 'reward', tier: 'vip' },
  { title: 'Danh Sách Chờ TIÊU CHUẨN', body: 'Thưởng cổ phiếu tiêu chuẩn', group: 'reward', tier: 'std' },
  { title: 'Giới Thiệu', body: 'Giới thiệu nhiều, lên TOP nhanh', group: 'how' },
  { title: 'Quỹ Thưởng Tăng Dần', body: 'Càng đông, thưởng càng lớn', group: 'how' },
  { title: 'Chuỗi Hàng Tháng', body: 'Mua cổ phiếu, tặng cổ phiếu thưởng', group: 'how' },
  { title: 'Hạn Chế Cổ Phiếu Thưởng', body: 'Nắm giữ cổ phiếu thưởng 1 năm', group: 'term' },
  { title: 'Xác Minh', body: 'Hoàn tất đăng ký và eKYC', group: 'term' },
  { title: 'Thời Điểm Thưởng', body: 'Thưởng bắt đầu sau khi ra mắt', group: 'term' },
  { title: 'Điều Kiện', body: 'Áp dụng điều khoản chương trình', group: 'term' }
];

const byGroup = (g) => REWARDS.filter((r) => r.group === g);

// Chip "Thưởng cổ phiếu VIP" chỉ cần hai chữ cuối: cột bên phải của mọi dòng đều là phần
// thưởng rồi, lặp lại "Thưởng" ở từng dòng là ba lần nói cùng một từ trong một bảng.
const giftLabel = (body) => {
  const s = body.replace(/^Thưởng\s+/, '');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export default function HowItWorks() {
  return (
    <section className="container section section-last">
      <h2 className="h2">Chương trình thưởng</h2>

      {/* Bảng "ai → được gì": mỗi dòng một vế, phần thưởng là chip màu bên phải. Chip vàng
          dùng đúng --tag-bg/--tag-ink của tag VIP trên dải cổ phiếu, nên người đọc đã thấy
          màu đó ở hero sẽ nhận ra VIP ở đây mà không cần đọc chữ. */}
      <ul className="reward-table">
        {byGroup('reward').map((r) => (
          <li key={r.title} className="reward-row">
            <span className="reward-who">{r.title}</span>
            <span className={`reward-gift reward-gift-${r.tier}`}>{giftLabel(r.body)}</span>
          </li>
        ))}
      </ul>

      {/* Cơ chế: không phải phần thưởng nên không vào bảng, nhưng cũng không phải điều khoản
          nên không xuống chân khối. Chip viền nhẹ là tầng giữa. */}
      <ul className="reward-how">
        {byGroup('how').map((r) => (
          <li key={r.title} className="reward-chip">
            <span className="reward-chip-t">{r.title}</span>
            <span className="reward-chip-b">{r.body}</span>
          </li>
        ))}
      </ul>

      {/* Bốn mục điều kiện gộp một dòng chân khối, nhãn lấy luôn từ mục "Điều Kiện" —
          không mục nào bị bỏ chữ, chỉ bớt bốn cái tiêu đề không mang thông tin. */}
      <p className="reward-terms">
        <strong>Điều kiện</strong>
        {byGroup('term').map((r) => r.body).join(' · ')}
      </p>
    </section>
  );
}
