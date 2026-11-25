import * as reserve from '../services/reserve.service.js';

// Nhận quà Reserve: danh tính lấy từ token phiên (req.user), không tin email trong body.
export async function save(req, res) {
  const { tickers, totalValue, budget } = await reserve.saveSelection(req.user, req.body?.tickers);
  res.json({ ok: true, tickers, totalValue, budget });
}

// Quyền chọn + bảng giá cho màn hình Reserve. Không token (hoặc token hết hạn) thì trả bản
// xem thử (preview: true) để người chưa đăng ký vẫn xem được danh mục.
export async function options(req, res) {
  res.json(await reserve.getOptions(req.user));
}
