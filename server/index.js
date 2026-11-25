import { env } from './config/env.js';
import { getCampaign } from './config/campaign.js';
import { connectDb } from './db/connect.js';
import { createApp } from './app.js';
import { warnIfBudgetInfeasible, warnIfSnapshotStale } from './services/price.service.js';

// Đọc đồng hồ campaign ngay lúc khởi động: ngày sai định dạng hay REPICK_DEADLINE đứng
// trước TOP_DEADLINE thì getCampaign() ném lỗi và server dừng luôn, thay vì chạy tiếp rồi
// trả 500 ở mọi request đọc tới giai đoạn.
const campaign = getCampaign();
if (!campaign.topDeadline) {
  console.warn('[campaign] Chưa đặt TOP_DEADLINE: Top 1.000 chưa có hạn chốt, lượt mời được cộng mãi và giỏ không bị khoá.');
} else {
  console.log(
    `[campaign] TOP_DEADLINE ${campaign.topDeadline.toISOString()}` +
      (campaign.repickDeadline ? `, REPICK_DEADLINE ${campaign.repickDeadline.toISOString()}` : ', chưa đặt REPICK_DEADLINE')
  );
}

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
