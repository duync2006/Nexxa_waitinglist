// BASE_URL = '/waitlist/' khi build, '/' khi dev → bỏ dấu '/' cuối để ghép với '/api/...'
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

// Phiên đăng nhập sống ở sessionStorage: theo từng tab, đóng tab là mất. Mọi thao tác bọc
// try/catch vì trình duyệt có thể chặn storage (chế độ riêng tư, tắt cookie).
const SESSION_KEY = 'nexxa_session';
export const session = {
  get() { try { return sessionStorage.getItem(SESSION_KEY) || ''; } catch { return ''; } },
  set(token) { try { sessionStorage.setItem(SESSION_KEY, token); } catch { /* bỏ qua */ } },
  clear() { try { sessionStorage.removeItem(SESSION_KEY); } catch { /* bỏ qua */ } }
};

// Mọi API đều là POST, kể cả những API chỉ đọc như /api/stats.
async function call(path, body = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = session.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  let data = {};
  try { data = await res.json(); } catch { /* bỏ qua */ }
  if (!res.ok) {
    // 401: token hết hạn hoặc không còn trong DB. Xoá token và báo App về form đăng ký.
    if (res.status === 401) {
      session.clear();
      window.dispatchEvent(new Event('nexxa:logout'));
    }
    // Giữ nguyên body lỗi để caller đọc được, ví dụ 400 kèm wrongPool
    const err = new Error(data.error || 'Có lỗi xảy ra. Vui lòng thử lại.');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  stats: () => call('/api/stats'),
  leaderboard: (page = 1) => call('/api/leaderboard', { page }),
  firstList: (page = 1) => call('/api/leaderboard/first', { page }),
  // Danh mục cổ phiếu, nhóm, số suất, bậc quà. Công khai, không phụ thuộc người dùng.
  catalog: () => call('/api/catalog'),
  requestOtp: (email, ref) => call('/api/waitlist/request-otp', { email, ref }),
  check: (email) => call('/api/waitlist/check', { email }),
  verify: async (email, otp) => {
    const res = await call('/api/waitlist/verify', { email, otp });
    if (res.token) session.set(res.token);
    return res;
  },
  me: () => call('/api/waitlist/me'),
  logout: async () => {
    try { return await call('/api/waitlist/logout'); } finally { session.clear(); }
  },
  reserve: (tickers) => call('/api/reserve', { tickers }),
  // Không có token -> server trả bản xem thử (preview: true)
  reserveOptions: () => call('/api/reserve/options')
};
