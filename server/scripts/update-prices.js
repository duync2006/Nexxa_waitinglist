// Làm mới snapshot giá trong collection `prices`.
//
//   node --env-file=.env server/scripts/update-prices.js      # hoặc: npm run prices
//
// Lên lịch bằng OS, không thêm dependency cron:
//   Linux/macOS (crontab -e), 7h05 mỗi ngày:
//     5 7 * * *  cd /duong/dan/Nexxa_waitlist && npm run prices >> logs/prices.log 2>&1
//   Windows (Task Scheduler):
//     schtasks /Create /SC DAILY /ST 07:05 /TN NexxaPrices ^
//       /TR "cmd /c cd /d D:\example\Nexxa_waitlist && npm run prices"
import { env } from '../config/env.js';
import { connectDb, disconnectDb } from '../db/connect.js';
import { refreshPrices, snapshotAge, warnIfBudgetInfeasible } from '../services/price.service.js';
import { SOURCE_NAME } from '../services/price-source.js';

// CHỐT CHẶN: giá demo là số bịa, không được phép rơi vào DB thật. Muốn nạp demo thì trỏ
// vào database _test (vd. `node --env-file=.env.test server/scripts/update-prices.js`).
if (SOURCE_NAME === 'demo' && !env.mongoDb.endsWith('_test')) {
  console.error(
    `Từ chối ghi giá demo vào database "${env.mongoDb}". Giá demo chỉ được nạp vào database ` +
      'có tên kết thúc bằng _test. Dùng: node --env-file=.env.test server/scripts/update-prices.js'
  );
  process.exit(1);
}

await connectDb();

try {
  const { updated, total, missing } = await refreshPrices();
  console.log(`Đã cập nhật giá ${updated}/${total} mã.`);
  if (missing.length) {
    console.log(`Nguồn không có giá cho ${missing.length} mã (giữ giá cũ): ${missing.join(', ')}`);
  }
  // Giá mới có thể làm một bậc quyền lợi không mua nổi mã nào — báo ngay ở đây,
  // đừng để phát hiện qua phản ánh của người dùng.
  await warnIfBudgetInfeasible();
} catch (err) {
  // Nguồn chết không phải lý do để xoá snapshot: báo lỗi, nói rõ snapshot cũ vẫn còn dùng được.
  const age = await snapshotAge();
  console.error('Không làm mới được giá:', err.message);
  if (age === null) {
    console.error('Snapshot hiện đang RỖNG — màn hình Reserve sẽ trả lỗi 503 cho mọi người.');
  } else {
    console.error(`Giữ nguyên snapshot cũ (${Math.round(age / 3600000)} giờ tuổi), Reserve vẫn chạy bình thường.`);
  }
  await disconnectDb();
  process.exit(1);
}

await disconnectDb();
