// Chốt Top 1.000 sau TOP_DEADLINE:  npm run finalize
// Idempotent: chạy lại chỉ bỏ qua những người đã chốt.
import { connectDb, disconnectDb } from '../db/connect.js';
import { finalizeTop } from '../services/finalize.service.js';

try {
  await connectDb();
  const r = await finalizeTop();
  console.table({
    'Tổng số người xét': r.total,
    'Người First (lần này chốt)': r.first,
    'Người Top (lần này chốt)': r.top,
    'Người cộng dồn (First + Top)': r.both,
    'Giỏ phải chọn lại (lần này chốt)': r.needsRepick,
    'Đã chốt từ trước (bỏ qua)': r.skipped
  });
  // Các dòng trên chỉ là phần LẦN CHẠY NÀY ghi được. Con số chuẩn để đối soát là đếm lại từ DB.
  console.log(`Tổng số người inTop trong DB (con số chuẩn): ${r.inTopTotal}`);
  if (r.mailFailed.length) {
    console.error(`Gửi mail lỗi cho ${r.mailFailed.length} người, cần gửi tay:`);
    console.error(r.mailFailed.join(', '));
    process.exitCode = 1;
  }
} catch (err) {
  console.error('Không chốt được Top:', err.message);
  process.exitCode = 1;
} finally {
  await disconnectDb();
}
