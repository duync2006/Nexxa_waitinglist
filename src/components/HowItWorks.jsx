const STEPS = [
  { n: '01', title: 'Nhập email', body: 'Chỉ cần email, không cần mật khẩu.' },
  { n: '02', title: 'Xác thực mã OTP', body: 'Nhập mã 6 số gửi tới email để giữ chỗ.' },
  { n: '03', title: 'Xem hạng & mời bạn', body: 'Mỗi bạn đăng ký qua link của bạn giúp bạn tăng 10 bậc.' }
];

export default function HowItWorks() {
  return (
    <section className="container section section-last">
      <h2 className="h2">Cách hoạt động</h2>
      <div className="steps">
        {STEPS.map((s) => (
          <div key={s.n} className="step">
            <span className="step-n">{s.n}</span>
            <span className="step-title">{s.title}</span>
            <span className="muted">{s.body}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
