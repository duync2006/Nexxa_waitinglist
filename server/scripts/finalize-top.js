// Chốt Top 1.000 sau TOP_DEADLINE:  npm run finalize
// Idempotent: chạy lại chỉ bỏ qua những người đã chốt.
import { connectDb, disconnectDb } from '../db/connect.js';
import { finalizeTop } from '../services/finalize.service.js';

try {
  await connectDb();
  const r = await finalizeTop();
  console.table({
    'Tổng số người xét': r.total,
    'Người First': r.first,
    'Người Top': r.top,
    'Người cộng dồn (First + Top)': r.both,
    'Giỏ phải chọn lại': r.needsRepick,
    'Đã chốt từ trước (bỏ qua)': r.skipped
  });
} catch (err) {
  console.error('Không chốt được Top:', err.message);
  process.exitCode = 1;
} finally {
  await disconnectDb();
}
