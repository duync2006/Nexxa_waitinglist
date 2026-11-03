// Che email trước khi đẩy ra API công khai. Phải che ở đây chứ không ở trình duyệt:
// trả email đầy đủ rồi che bằng CSS/JS thì bất kỳ ai mở tab Network cũng đọc được hết.
const BULLET = '•';

// Số dấu chấm CỐ ĐỊNH, không theo độ dài phần bị che — nếu chấm nhiều ít theo độ dài thật
// thì mỗi dòng ticker lại tiết lộ chính xác email dài bao nhiêu ký tự.
const DOTS = BULLET.repeat(5);

function maskLocal(local) {
  // Quá ngắn thì không đủ chỗ giữ 2 đầu 1 cuối mà vẫn còn gì để che — giữ ít lại.
  if (local.length <= 2) return local.slice(0, 1) + BULLET;
  if (local.length <= 4) return local.slice(0, 1) + BULLET.repeat(2) + local.slice(-1);
  return local.slice(0, 2) + DOTS + local.slice(-1);
}

// 'nguyenvana@gmail.com' -> 'ng•••••a@gmail.com'. Giữ nguyên domain: người đọc nhận ra ngay
// đây là email thật của người thật, đó mới là lý do dải này có sức thuyết phục.
export function maskEmail(email) {
  const at = String(email || '').lastIndexOf('@');
  if (at <= 0) return maskLocal(String(email || ''));
  return maskLocal(email.slice(0, at)) + email.slice(at);
}
