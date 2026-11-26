import { useEffect, useState } from 'react';

// Đếm ngược tới một mốc ISO. Dưới 1 ngày thì nhảy mỗi giây (để hiện HH:MM:SS), còn lại mỗi phút.
// Trả null khi không có mốc; ended = true sau mốc.
export function useCountdown(iso) {
  const target = iso ? Date.parse(iso) : NaN;
  const [now, setNow] = useState(() => Date.now());
  const valid = Number.isFinite(target);
  const msLeft = valid ? target - now : 0;
  const fast = valid && msLeft > 0 && msLeft < 86400000;
  useEffect(() => {
    if (!valid || msLeft <= 0) return undefined;
    const t = setInterval(() => setNow(Date.now()), fast ? 1000 : 60000);
    return () => clearInterval(t);
  }, [valid, fast, msLeft <= 0]);
  if (!valid) return null;
  return { target, msLeft: Math.max(0, msLeft), ended: msLeft <= 0, days: Math.floor(Math.max(0, msLeft) / 86400000) };
}

export function hms(ms) {
  const s = Math.floor(Math.max(0, ms) / 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

// Chữ đếm ngược dùng chung: 'còn N ngày' hoặc HH:MM:SS khi còn dưới 1 ngày.
export function countdownText(cd) {
  if (!cd) return '';
  if (cd.ended) return 'Đã chốt';
  return cd.msLeft < 86400000 ? hms(cd.msLeft) : `còn ${cd.days} ngày`;
}
