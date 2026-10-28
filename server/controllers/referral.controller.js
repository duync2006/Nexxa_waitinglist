// Link mời ngắn: /r/ABC123 → /?ref=ABC123
// Cố ý GIỮ GET dù mọi API khác đã chuyển sang POST: đây là link người dùng bấm trong
// trình duyệt, mà điều hướng trình duyệt luôn gửi GET. Đổi sang POST là link mời chết.
// Dùng đường dẫn tương đối '../' để chạy đúng cả ở /r/... (dev) lẫn /waitlist/r/... (nginx bỏ prefix /waitlist)
export function redirectToSignup(req, res) {
  res.redirect(302, '../?ref=' + encodeURIComponent(req.params.code));
}
