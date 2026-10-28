export const fmt = (n) => Number(n).toLocaleString('vi-VN');
export const vnd = (n) => fmt(n) + 'đ';

// Hậu tố rút gọn M (triệu) / B (tỷ) cho biểu đồ và các ô KPI — số ở đây đổi liên tục khi kéo
// thanh trượt nên chữ phải ngắn, còn đơn vị VNĐ đã ghi một lần ở đầu biểu đồ.
export function money(v) {
  if (v >= 1e9) return (v / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + 'B';
  if (v >= 1e6) return (v / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + 'M';
  return fmt(Math.round(v)) + 'đ';
}

export function axisMoney(v) {
  if (v === 0) return '0';
  if (v >= 1e9) return (v / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + 'B';
  if (v >= 1e6) return (v / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + 'M';
  return (v / 1e3).toLocaleString('vi-VN', { maximumFractionDigits: 0 }) + 'K';
}
