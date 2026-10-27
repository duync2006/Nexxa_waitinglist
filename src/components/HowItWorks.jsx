const REWARDS = [
  { title: '1.000 Người Đăng Ký Đầu Tiên', body: 'Thưởng cổ phiếu VIP' },
  { title: 'TOP 1.000 Người Giới Thiệu', body: 'Thưởng cổ phiếu VIP' },
  { title: 'Danh Sách Chờ TIÊU CHUẨN', body: 'Thưởng cổ phiếu tiêu chuẩn' },
  { title: 'Giới Thiệu', body: 'Giới thiệu nhiều, lên TOP nhanh' },
  { title: 'Quỹ Thưởng Tăng Dần', body: 'Càng đông, thưởng càng lớn' },
  { title: 'Chuỗi Hàng Tháng', body: 'Mua 1+ cổ phiếu, tặng 1 cổ phiếu' },
  { title: 'Hạn Chế Cổ Phiếu Thưởng', body: 'Nắm giữ cổ phiếu thưởng 1 năm' },
  { title: 'Xác Minh', body: 'Hoàn tất đăng ký và eKYC' },
  { title: 'Thời Điểm Thưởng', body: 'Thưởng bắt đầu sau khi ra mắt' },
  { title: 'Điều Kiện', body: 'Áp dụng điều khoản chương trình' }
];

export default function HowItWorks() {
  return (
    <section className="container section section-last">
      <h2 className="h2">CHƯƠNG TRÌNH THƯỞNG</h2>
      <ul className="reward-list">
        {REWARDS.map((r) => (
          <li key={r.title} className="reward">
            <span className="reward-title">{r.title}</span>
            <span className="reward-body">{r.body}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
