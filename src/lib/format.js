export const fmt = (n) => Number(n).toLocaleString('vi-VN');
export const vnd = (n) => fmt(n) + 'đ';

export function money(v) {
  if (v >= 1e9) return (v / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + ' tỷ đ';
  if (v >= 1e6) return (v / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + ' triệu đ';
  return fmt(Math.round(v)) + 'đ';
}

export function axisMoney(v) {
  if (v === 0) return '0';
  if (v >= 1e9) return (v / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + ' tỷ';
  if (v >= 1e6) return (v / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + 'tr';
  return (v / 1e3).toLocaleString('vi-VN', { maximumFractionDigits: 0 }) + 'k';
}
