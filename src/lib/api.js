// BASE_URL = '/waitlist/' khi build, '/' khi dev → bỏ dấu '/' cuối để ghép với '/api/...'
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

// Mọi API đều là POST, kể cả những API chỉ đọc như /api/stats.
async function call(path, body = {}) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  let data = {};
  try { data = await res.json(); } catch { /* bỏ qua */ }
  if (!res.ok) {
    // Giữ nguyên body lỗi để caller đọc được, ví dụ 409 kèm profile của email đã đăng ký
    const err = new Error(data.error || 'Có lỗi xảy ra. Vui lòng thử lại.');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  stats: () => call('/api/stats'),
  requestOtp: (email, ref) => call('/api/waitlist/request-otp', { email, ref }),
  check: (email) => call('/api/waitlist/check', { email }),
  verify: (email, otp) => call('/api/waitlist/verify', { email, otp }),
  reserve: (email, tickers) => call('/api/reserve', { email, tickers }),
  // email rỗng -> server trả bản xem thử (preview: true)
  reserveOptions: (email) => call('/api/reserve/options', { email })
};
