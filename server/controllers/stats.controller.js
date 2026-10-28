import * as waitlist from '../services/waitlist.service.js';

// Thống kê công khai: số người đã xác thực, suất còn lại
export async function getStats(_req, res) {
  res.json(await waitlist.getStats());
}
