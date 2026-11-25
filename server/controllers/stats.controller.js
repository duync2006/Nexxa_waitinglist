import * as waitlist from '../services/waitlist.service.js';

// Thống kê công khai: số người đã xác thực, suất còn lại
export async function getStats(_req, res) {
  res.json(await waitlist.getStats());
}

// Bảng xếp hạng công khai, body: { page } (mặc định 1).
export async function getLeaderboard(req, res) {
  res.json(await waitlist.getLeaderboard(Number(req.body?.page) || 1));
}

// Danh sách First 1.000 công khai, body: { page } (mặc định 1).
export async function getFirstList(req, res) {
  res.json(await waitlist.getFirstList(Number(req.body?.page) || 1));
}
