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
