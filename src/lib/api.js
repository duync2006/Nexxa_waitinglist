// BASE_URL = '/waitlist/' khi build, '/' khi dev → bỏ dấu '/' cuối để ghép với '/api/...'
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

async function call(path, body) {
  const res = await fetch(BASE + path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  let data = {};
  try { data = await res.json(); } catch { /* bỏ qua */ }
  if (!res.ok) throw new Error(data.error || 'Có lỗi xảy ra. Vui lòng thử lại.');
  return data;
}

export const api = {
  stats: () => call('/api/stats'),
  requestOtp: (email, ref) => call('/api/waitlist/request-otp', { email, ref }),
  verify: (email, otp) => call('/api/waitlist/verify', { email, otp })
};
