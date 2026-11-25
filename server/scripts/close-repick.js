// Cắt giỏ người không chọn lại sau REPICK_DEADLINE:  npm run close-repick
// Idempotent: chạy lại chỉ bỏ qua những người đã được cắt hoặc đã chọn lại.
import { connectDb, disconnectDb } from '../db/connect.js';
import { closeRepick } from '../services/finalize.service.js';

try {
  await connectDb();
  const r = await closeRepick();
  console.table({
    'Giỏ đã cắt': r.trimmed,
    'Giỏ rỗng sau khi cắt': r.emptied
  });
  if (r.emptied) {
    console.warn(`CẢNH BÁO: ${r.emptied} giỏ rỗng sau khi cắt (không còn mã nào hợp lệ):`);
    console.warn(r.emptiedEmails.join(', '));
  }
} catch (err) {
  console.error('Không cắt được giỏ:', err.message);
  process.exitCode = 1;
} finally {
  await disconnectDb();
}
