export const OTP_TTL_MS = 10 * 60 * 1000;      // mã sống 10 phút
export const RESEND_COOLDOWN_MS = 60 * 1000;   // chờ 60s mới gửi lại được
export const MAX_ATTEMPTS = 5;                 // sai quá 5 lần thì phải xin mã mới
export const MAX_EMAIL_LENGTH = 254;           // giới hạn độ dài email theo RFC 5321
export const MAX_RESERVE_TICKERS = 100;

// Mỗi lượt mời thành công = +10 điểm. Hạng xếp theo điểm (= invites × POINTS_PER_INVITE),
// điểm cao đứng trên, bằng điểm thì ai đăng ký trước (joinIndex nhỏ hơn) đứng trên.
export const POINTS_PER_INVITE = 10;

// Field `score` cũ (joinIndex - BOOST * invites) vẫn được ghi để document giữ nguyên hình
// dạng, nhưng KHÔNG còn dùng để xếp hạng nữa.
export const BOOST = 10;

// Snapshot giá cũ hơn mốc này thì server ghi cảnh báo lúc khởi động (không chặn khởi động).
export const PRICE_MAX_AGE_MS = 48 * 60 * 60 * 1000;

// Số dòng mỗi trang của bảng xếp hạng công khai.
export const LEADERBOARD_PAGE_SIZE = 7;
