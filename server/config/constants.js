export const OTP_TTL_MS = 10 * 60 * 1000;      // mã sống 10 phút
export const RESEND_COOLDOWN_MS = 60 * 1000;   // chờ 60s mới gửi lại được
export const MAX_ATTEMPTS = 5;                 // sai quá 5 lần thì phải xin mã mới
export const MAX_EMAIL_LENGTH = 254;           // giới hạn độ dài email theo RFC 5321
export const MAX_RESERVE_TICKERS = 100;

// Mỗi lượt mời thành công = người mời được trừ 10 điểm.
// score = joinIndex - BOOST * invites; score càng nhỏ hạng càng cao, bằng điểm thì ai vào trước đứng trên.
// joinIndex tăng đều 1 mỗi người đăng ký, nên trừ 10 điểm ≈ vượt qua 10 người không mời ai.
export const BOOST = 10;

// Snapshot giá cũ hơn mốc này thì server ghi cảnh báo lúc khởi động (không chặn khởi động).
export const PRICE_MAX_AGE_MS = 48 * 60 * 60 * 1000;
