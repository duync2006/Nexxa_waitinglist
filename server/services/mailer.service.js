// Gửi mã OTP. Mặc định chỉ in ra console để dev/test.
// Để gửi email thật: cài nodemailer (hoặc SDK của Resend/SendGrid/SES) và thay phần thân hàm.
export async function sendOtpEmail(email, code) {
  console.log(`[mailer] OTP cho ${email}: ${code}`);
  // Ví dụ với nodemailer:
  // await transporter.sendMail({
  //   from: 'Nexxa <no-reply@nexxa.asia>',
  //   to: email,
  //   subject: `Mã xác thực Nexxa: ${code}`,
  //   text: `Mã xác thực waitlist Nexxa của bạn là ${code}. Mã có hiệu lực trong 10 phút.`
  // });
}

// Báo cho người có giỏ không còn vừa quyền lợi đã chốt: phải chọn lại trước repickDeadline.
// Mặc định chỉ in ra console, giống sendOtpEmail.
export async function sendRepickEmail(email, { budget, pools, repickDeadline }) {
  const han = repickDeadline ? repickDeadline.toISOString() : 'chưa đặt hạn';
  console.log(
    `[mailer] Chọn lại giỏ cho ${email}: ngân sách ${budget}đ, nhóm ${pools.join('+')}, hạn ${han}`
  );
}
