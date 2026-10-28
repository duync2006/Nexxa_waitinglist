import * as reserve from '../services/reserve.service.js';
import { normalizeEmail, requireEmail } from '../utils/email.js';

// Nhận quà Reserve: chỉ email đã đăng ký waitlist mới được ghi nhận lựa chọn
export async function save(req, res) {
  const email = requireEmail(req.body?.email, 'Email chưa đúng định dạng.');
  const { tickers, totalValue, budget } = await reserve.saveSelection(email, req.body?.tickers);
  res.json({ ok: true, tickers, totalValue, budget });
}

// Quyền chọn + bảng giá cho màn hình Reserve. Email là tuỳ chọn: bỏ trống thì trả bản
// xem thử (preview: true) để người chưa đăng ký vẫn xem được danh mục.
export async function options(req, res) {
  const email = normalizeEmail(req.body?.email);
  res.json(await reserve.getOptions(email));
}
