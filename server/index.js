import { env } from './config/env.js';
import { connectDb } from './db/connect.js';
import { createApp } from './app.js';
import { warnIfBudgetInfeasible, warnIfSnapshotStale } from './services/price.service.js';

// Kết nối MongoDB trước, lỗi kết nối thì thoát để container/PM2 khởi động lại
try {
  await connectDb();
} catch (err) {
  console.error('[db] không kết nối được MongoDB:', err);
  process.exit(1);
}

// Chỉ cảnh báo, không chặn khởi động: thiếu bảng giá chỉ làm Reserve trả 503,
// còn đăng ký / OTP / thống kê vẫn phải chạy.
await warnIfSnapshotStale();
await warnIfBudgetInfeasible();

createApp().listen(env.port, () => {
  console.log(
    `Nexxa waitlist server chạy tại http://localhost:${env.port}` +
      (env.isProd ? '' : ' (API — giao diện dev ở http://localhost:5173)')
  );
});
