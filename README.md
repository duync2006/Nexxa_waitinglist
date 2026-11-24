# Nexxa Waitlist

Trang waitlist Nexxa: React (Vite) + server Express nhỏ xử lý email → OTP → xếp hạng → link mời.

## Chạy thử (dev)

```bash
npm install
npm run dev
```

- Giao diện: http://localhost:5173
- API: http://localhost:3001 (Vite tự proxy `/api` và `/r`)
- Ở chế độ dev, mã OTP được in ra terminal **và** hiện ngay dưới ô nhập OTP để test nhanh.

## Chạy production

```bash
npm run build
npm start          # mặc định cổng 3001, đổi bằng PORT=8080
```

Server Express vừa phục vụ API vừa phục vụ bản build trong `dist/`. Ở production, mã OTP **không** trả về trình duyệt.

## API

**Toàn bộ API dùng POST**, kể cả các API chỉ đọc. Tham số luôn nằm trong body JSON, không
dùng query string. Ngoại lệ duy nhất là `/r/:code`: đó là link người dùng bấm trong trình duyệt,
mà điều hướng trình duyệt luôn gửi GET, nên route này bắt buộc phải giữ GET.

| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/stats` | body `{}` → `{ registered, firstSlots, firstRemaining, totalSlots, topRemaining, remaining, last24h, recent }`. `remaining` = tổng suất VIP còn mở ở cả hai đường |
| POST | `/api/waitlist/check` | body `{ email }` → `{ exists: false }` hoặc `{ exists: true, profile }` — frontend gọi trước khi gửi OTP |
| POST | `/api/waitlist/request-otp` | body `{ email, ref? }` → gửi OTP 6 số (hết hạn 10 phút, gửi lại sau 60s) |
| POST | `/api/waitlist/verify` | body `{ email, otp }` → profile (tối đa 5 lần sai). Email đã đăng ký → 409 kèm `alreadyRegistered` và profile hiện tại |
| POST | `/api/reserve/options` | body `{ email? }` → `{ rank, early, budget, pools, locked, preview, selected, prices }`. Email rỗng → bản xem thử (`preview: true`) |
| POST | `/api/reserve` | body `{ email, tickers }` → `{ ok, tickers, totalValue, budget }`, ghi đè lựa chọn cũ |
| GET | `/r/:code` | Link mời ngắn, chuyển hướng về `/?ref=CODE`. **Giữ GET** — xem đoạn trên |

Có sẵn Postman collection: `docs/nexxa-waitlist.postman_collection.json`.

`profile` = `{ email, early, joinIndex, rank, vip, registered, refCode, invites }`.
`rank` là hạng trong nhóm đua, `null` với người thuộc First 1.000.

**Hai đường vào VIP (không chồng nhau, tối đa 2.000 suất):**

1. **First 1.000** — người có `joinIndex` 1..1.000 (1.000 người đăng ký đầu tiên) chắc chắn VIP,
   bất kể điểm. Họ đứng ngoài bảng xếp hạng.
2. **Top 1.000** — xếp riêng trong **nhóm đua** (`joinIndex > 1.000`): điểm (`invites × 10`) cao
   trước, bằng điểm thì ai đăng ký trước đứng trên. Hạng 1..1.000 của nhóm đua được VIP.

Bảng xếp hạng (`/api/leaderboard`) và ngưỡng `cutoff` chỉ tính nhóm đua.

## Luật chọn cổ phiếu Reserve

| Nhóm | Nhóm được chọn | Ngân sách |
|---|---|---|
| First 1.000 hoặc Top 1.000 nhóm đua | VIP (VN30) + Standard | 100.000đ |
| Còn lại | chỉ Standard | 50.000đ |

Luật nằm ở `shared/catalog.js` (`FIRST_SLOTS`, `TOTAL_SLOTS`, `ENTITLEMENTS`, `isVip`,
`entitlementOf`) để frontend và server dùng đúng một bảng.

**Chốt ở lần Reserve đầu tiên.** Lần Reserve đầu ghi `lockedRank`, `budget`, `allowedPools`,
`lockedPrices` và `totalValue` vào `user.reservation`. Hạng trôi về sau không làm người dùng mất
quyền đã được hứa. Giá cũng đông cứng cùng quyền lợi: nếu để giá trôi, người dùng sửa lại lựa chọn
vài tuần sau có thể thấy giỏ cũ vượt ngân sách dù không đổi gì. Mã mới chọn về sau lấy giá từ
snapshot hiện tại rồi đông cứng thêm vào.

Server kiểm cả ba điều kiện và từ chối kèm số cụ thể: mã phải thuộc nhóm được phép (400, nêu đích
danh mã), mã phải có giá trong snapshot (503), tổng không vượt ngân sách (400 kèm `totalValue` và
`budget`). Người chưa đăng ký vẫn xem được danh mục (`preview: true`, tạm áp mức cao nhất) nhưng
bị chặn 403 lúc bấm Nhận.

### Cắm nguồn giá cổ phiếu

Reserve **luôn đọc snapshot** trong collection `prices`, không bao giờ gọi nhà cung cấp lúc có
request: nguồn chết thì snapshot cũ vẫn dùng được, và giá không nhảy giữa lúc người dùng đang chọn.

**Chưa có nhà cung cấp giá?** Dùng bảng giá demo trong `server/services/demo-prices.js`:

```bash
npm run prices:demo
```

Lệnh này bật `PRICE_SOURCE=demo` và nạp vào database `_test` khai báo ở `.env.test`.
Giá demo là **số bịa cho giống thật về độ lớn, không phải giá thị trường**, nên:

- Nguồn demo chỉ chạy khi khai báo `PRICE_SOURCE=demo` — mặc định `npm run prices` vẫn ném lỗi
  "chưa cấu hình nguồn giá" thay vì âm thầm điền giá bịa.
- `update-prices.js` **từ chối ghi** giá demo vào database không kết thúc bằng `_test`, nên DB thật
  không bao giờ dính số bịa.

1. Khai báo `PRICE_SOURCE_NAME`, `PRICE_API_URL`, `PRICE_API_KEY` trong `.env` (xem `.env.example`).
2. Hiện thực hoá `fetchPrices(tickers)` trong `server/services/price-source.js` — đó là **chỗ duy
   nhất** biết về nhà cung cấp. Nhận mảng mã, trả `{ VCB: 62000, ... }` tính theo VNĐ một cổ phiếu.
   Mã nào nguồn không có thì bỏ qua (đừng trả `0`) để giữ giá cũ.
3. `npm run prices` để nạp snapshot. Nguồn chết → báo lỗi, exit 1, **giữ nguyên snapshot cũ**.

Lên lịch bằng OS, không thêm dependency cron:

```bash
# Linux/macOS — crontab -e, 7h05 mỗi ngày
5 7 * * *  cd /duong/dan/Nexxa_waitlist && npm run prices >> logs/prices.log 2>&1
```

```bat
rem Windows — Task Scheduler
schtasks /Create /SC DAILY /ST 07:05 /TN NexxaPrices ^
  /TR "cmd /c cd /d D:\example\Nexxa_waitlist && npm run prices"
```

Lúc khởi động, server **chỉ ghi cảnh báo** (không chặn khởi động) nếu snapshot rỗng, cũ hơn 48 giờ,
hoặc nếu một bậc quyền lợi không mua nổi mã nào — xem phần dưới.

### Rủi ro: 50.000đ có thể không mua nổi mã nào

Nhiều blue-chip VN giao dịch trên 50.000đ một cổ phiếu. Nếu mã Standard rẻ nhất đắt hơn ngân sách
50.000đ thì nhóm sau top 1.000 mở màn hình Reserve ra và thấy mọi mã đều bị làm mờ.

`checkBudgetFeasibility()` trong `server/services/price.service.js` phát hiện điều này; cảnh báo in
ra lúc khởi động server và sau mỗi lần `npm run prices`, kèm giá mã rẻ nhất. **Cách xử lý** (nâng
ngân sách, cho cổ phần lẻ, hay quy ra tiền mặt) là quyết định kinh doanh — code chỉ báo động.

## Trước khi lên thật

- **Gửi email:** sửa `server/services/mailer.service.js` (nodemailer, Resend, SendGrid, SES…). Hiện chỉ in OTP ra console.
- **Chống spam:** chưa có rate-limit. `/api/waitlist/check` hiện cho phép dò xem một email đã đăng ký chưa và lộ `refCode` của người khác — nên thêm giới hạn theo IP (vd. `express-rate-limit`) và captcha nếu cần.
- Thay `[ĐIỀU KHOẢN CHI TIẾT]` ở footer bằng nội dung thật.

## Cấu trúc

Server chia 4 tầng: **routes → controllers → services → models**. Controller chỉ đọc `req` và
trả `res`; mọi quy tắc nghiệp vụ nằm ở `services/` nên test được mà không cần dựng HTTP.

```
shared/
  catalog.js        TOTAL_SLOTS, danh mục cổ phiếu, 2 pool Reserve, ENTITLEMENTS — dùng chung FE lẫn BE

server/
  index.js          bootstrap: kết nối DB rồi listen
  app.js            createApp() — không listen, để test gọi bằng supertest
  config/           env (bắt buộc MONGODB_URI), hằng số (OTP, BOOST…)
  db/connect.js     mongoose.connect + tạo index
  models/           schema Mongoose: user, otp, counter, price
  services/         nghiệp vụ: waitlist (hạng, referral), otp, reserve, entitlement,
                    price (snapshot giá), price-source (adapter nhà cung cấp), mailer
  controllers/      đọc req → gọi service → trả res
  routes/           khai báo đường dẫn
  middlewares/      asyncHandler, error handler
  utils/            AppError, email, sinh mã
  scripts/          migrate-json-to-mongo, backfill-referrals, update-prices
  tests/            node:test + supertest

src/
  App.jsx
  components/       SignupCard, FeaturedStocks, ReserveModal, DcaCalculator, HowItWorks…
  lib/              data (re-export shared/catalog + phần riêng của UI), format, api
  styles.css
```

## Test

```bash
npm test
```

Chạy trên database riêng `nexxa_waitlist_test` khai báo trong `.env.test`. `server/tests/helpers/db.js`
**từ chối chạy nếu tên database không kết thúc bằng `_test`**, vì mỗi ca test đều xoá sạch collection.

Test chạy tuần tự (`--test-concurrency=1`) do các file dùng chung một database.

## Script bảo trì

```bash
npm run migrate      # nhập data/db.json cũ vào MongoDB (chạy lại nhiều lần vẫn an toàn)
npm run backfill     # điền referrer/referees cho user cũ — mặc định chạy thử
npm run backfill -- --apply
npm run prices       # làm mới snapshot giá cổ phiếu trong collection prices

# Dữ liệu demo để xem tay màn hình Reserve — chỉ chạy được trên database _test
node --env-file=.env.test server/scripts/seed-demo.js
```
