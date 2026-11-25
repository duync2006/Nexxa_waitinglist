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
| POST | `/api/stats` | body `{}` → `{ registered, firstSlots, firstRemaining, totalSlots, topRemaining, remaining, topCutoff, topStart, topDeadline, last24h, recent }` |
| POST | `/api/leaderboard` | body `{ page? }` → bảng Top 1.000 xếp trên toàn bộ người đăng ký: `{ top: [{ rank, masked, points, first }], page, pageSize, total, totalPages, cutoff }` |
| POST | `/api/leaderboard/first` | body `{ page? }` → danh sách First 1.000 (chỉ để thông tin, mới nhất trước): `{ rows: [{ joinIndex, masked, at }], page, pageSize, total, totalPages, firstRemaining }` |
| POST | `/api/waitlist/check` | body `{ email }` → `{ exists }` (không còn trả profile) |
| POST | `/api/waitlist/request-otp` | body `{ email, ref? }` → gửi OTP 6 số (hết hạn 10 phút, gửi lại sau 60s) |
| POST | `/api/waitlist/verify` | body `{ email, otp }` → `{ profile, token }` (tối đa 5 lần sai). Email đã đăng ký → **200** kèm `alreadyRegistered: true` (đây là bước đăng nhập, không còn 409) |
| POST | `/api/waitlist/me` | **cần token** → `profile` |
| POST | `/api/waitlist/logout` | **cần token** → `{ ok: true }`, xoá phiên |
| POST | `/api/reserve/options` | token tuỳ chọn → `{ rank, early, inTop, budget, pools, phase, needsRepick, repickDeadline, preview, selected, prices }`. Không token → bản xem thử (`preview: true`) |
| POST | `/api/reserve` | **cần token**, body `{ tickers }` → `{ ok, tickers, totalValue, budget }`, ghi đè lựa chọn cũ. Danh tính lấy từ token, không đọc email trong body |
| GET | `/r/:code` | Link mời ngắn, chuyển hướng về `/?ref=CODE`. **Giữ GET** — xem đoạn trên |

**Token phiên.** `verify` trả `token`, client gửi lại bằng header `Authorization: Bearer <token>`. Token sống 12 giờ,
FE lưu ở `sessionStorage` (đóng tab là phải OTP lại). Thiếu hoặc sai token → **401**. Giỏ đang khoá → **423**.

Có sẵn Postman collection: `docs/nexxa-waitlist.postman_collection.json`. Request `Xác thực OTP` tự lưu token vào biến `token`.

`profile` = `{ email, early, joinIndex, rank, inTop, budget, vip, registered, refCode, invites, phase, needsRepick, repickDeadline }`.
`rank` là hạng Top trên toàn bộ người đăng ký, **ai cũng có** (kể cả First 1.000).

**Hai campaign chạy song song, có thể chồng nhau:**

1. **First 1.000** — người có `joinIndex` 1..1.000 (1.000 người đăng ký đầu tiên) chắc chắn có suất,
   bất kể điểm hay deadline.
2. **Top 1.000** — xếp **toàn bộ** người đăng ký (kể cả người First): điểm (`invites × 10`) cao
   trước, bằng điểm thì ai đăng ký trước đứng trên. Hạng 1..1.000 **tại `TOP_DEADLINE`** nhận quà Top.

Bảng xếp hạng (`/api/leaderboard`) và ngưỡng `cutoff` tính trên toàn bộ người đăng ký.

## Luật chọn cổ phiếu Reserve

| Trường hợp | Nhóm được chọn | Ngân sách |
|---|---|---|
| Chỉ First 1.000 | VIP (VN30) + Standard | 100.000đ |
| Chỉ Top 1.000 | VIP (VN30) + Standard | 100.000đ |
| Vừa First vừa Top | VIP (VN30) + Standard, chọn chung một giỏ | **200.000đ** (cộng dồn) |
| Không thuộc nhóm nào | chỉ Standard | 50.000đ |

Luật nằm ở `shared/catalog.js` (`FIRST_SLOTS`, `TOTAL_SLOTS`, `ENTITLEMENTS`, `isVip`,
`entitlementOf`) để frontend và server dùng đúng một bảng.

**Không còn chốt ở lần Reserve đầu tiên.** Trước `TOP_DEADLINE`, quyền lợi tính theo hạng **hiện tại** mỗi
lần đọc. Sau khi chạy `finalize`, quyền lợi lấy từ bản đã chốt `user.final`. Các field cũ
`reservation.lockedRank`, `budget`, `allowedPools` vẫn nằm trong schema nhưng không còn được ghi hay đọc.
`lockedPrices` **vẫn giữ**: mã đã chọn giữ giá lúc chọn, nếu để giá trôi thì người dùng sửa lại lựa chọn
vài tuần sau có thể thấy giỏ cũ vượt ngân sách dù không đổi gì. Mã mới chọn về sau lấy giá từ
snapshot hiện tại rồi đông cứng thêm vào.

Server kiểm các điều kiện và từ chối kèm số cụ thể: giỏ đang khoá (423), mã phải thuộc nhóm được phép
(400, nêu đích danh mã), mã phải có giá trong snapshot (503), tổng không vượt ngân sách (400 kèm
`totalValue` và `budget`). Người chưa đăng nhập vẫn xem được danh mục (`preview: true`, tạm áp 100.000đ,
cả hai nhóm) nhưng bị chặn 401 lúc bấm Nhận.

### Giai đoạn campaign

Ba biến môi trường trong `.env` (xem `.env.example`), đều **tuỳ chọn**, đều là ISO 8601 **có múi giờ**
(ví dụ `2026-12-31T23:59:59+07:00`). Thiếu múi giờ hoặc sai định dạng thì server **từ chối khởi động**.

| Biến | Ý nghĩa |
|---|---|
| `TOP_START` | Lúc mở campaign, chỉ dùng để vẽ cung đếm ngược ở hero |
| `TOP_DEADLINE` | Hết giờ đua Top: ngừng cộng lượt mời, giỏ khoá (423) cho tới khi chạy `finalize`. Thiếu biến này thì không chặn gì |
| `REPICK_DEADLINE` | Hạn chọn lại sau `finalize`. Phải **sau** `TOP_DEADLINE`, nếu không server không khởi động |

Người đăng ký **từ `TOP_DEADLINE` trở đi** ("đăng ký muộn") đứng ngoài cuộc đua Top: không bao giờ vào Top,
không bị khoá, `finalize` không xét họ. Họ chọn được cổ phiếu cho tới `REPICK_DEADLINE`, quyền lợi là First
(nếu còn suất) hoặc 50.000đ Standard.

## Chốt Top 1.000

Hai script chạy tay bởi người vận hành, **đúng thứ tự** dưới đây. Cả hai đều idempotent.

1. **Sau `TOP_DEADLINE`: `npm run finalize`.** Từ chối chạy nếu chưa tới deadline. Script xếp hạng người đăng ký
   trước deadline, ghi `user.final` (hạng, `inTop`, ngân sách, nhóm), và với người có giỏ không còn hợp lệ
   (mã ngoài nhóm, hoặc tổng vượt ngân sách đã chốt) thì đặt `needsRepick` và gửi email mời chọn lại. Từ lúc này
   giỏ mở lại (`repick`), người dùng chọn lại trong quyền lợi đã chốt. In bảng tổng kết: số người First, Top,
   cộng dồn, giỏ phải chọn lại.
2. **Sau `REPICK_DEADLINE`: `npm run close-repick`.** Từ chối chạy nếu chưa tới hạn. Script tự cắt giỏ của người
   `needsRepick` mà chưa chọn lại (giữ mã hợp lệ theo thứ tự đã chọn tới khi hết ngân sách), rồi giỏ khoá hẳn
   (423). Trả số giỏ đã cắt và số giỏ rỗng sau khi cắt; email của người có giỏ rỗng chỉ được **in ra log**,
   hãy lưu lại để xử lý.

**Lưu ý vận hành**

- **Email mời chọn lại hiện chỉ in ra console** (`sendRepickEmail` trong `mailer.service.js` chưa gắn nhà cung cấp).
  Trước khi chạy `finalize` thật phải gắn nhà cung cấp mail, nếu không người dùng không biết mình cần chọn lại.
- Nếu gửi mail lỗi cho ai đó, `finalize` không dừng mà in danh sách `mailFailed` và **thoát với mã 1**. Chạy lại
  sẽ **không** gửi lại cho họ (họ đã có `final`), nên phải gửi tay cho danh sách đó.
- **Hồi phục sau khi `finalize` chết giữa chừng** (đã ghi nhưng chưa gửi mail): tìm người cần báo lại bằng query
  ```js
  db.users.find({ 'final.needsRepick': true, 'final.repickedAt': { $exists: false } })
  ```
- `finalize` **idempotent**: chạy lại sẽ bỏ qua người đã có `final` và hạng của mọi người giữ nguyên. Chạy song song
  cũng an toàn: mỗi user được ghi bằng một lệnh riêng có điều kiện `final` chưa tồn tại, chỉ lần chạy ghi trúng mới
  đếm và gửi mail cho người đó, nên không ghi đè, không gửi mail trùng. Bảng tổng kết của mỗi lần chạy chỉ là phần
  lần đó ghi được; con số chuẩn để đối soát là dòng **"Tổng số người inTop trong DB"** in ngay sau bảng.
- Nếu chưa đặt `REPICK_DEADLINE` thì `close-repick` không chạy được và giỏ sau finalize mở mãi mãi.

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
  models/           schema Mongoose: user, otp, counter, price, session
  services/         nghiệp vụ: waitlist (hạng, referral), otp, reserve, entitlement, finalize, session,
                    price (snapshot giá), price-source (adapter nhà cung cấp), mailer
  controllers/      đọc req → gọi service → trả res
  routes/           khai báo đường dẫn
  middlewares/      asyncHandler, error handler
  utils/            AppError, email, sinh mã
  scripts/          migrate-json-to-mongo, backfill-referrals, update-prices, finalize-top, close-repick
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
npm run finalize     # sau TOP_DEADLINE: chốt Top 1.000 — xem mục "Chốt Top 1.000"
npm run close-repick # sau REPICK_DEADLINE: cắt giỏ người không chọn lại

# Dữ liệu demo để xem tay màn hình Reserve — chỉ chạy được trên database _test
node --env-file=.env.test server/scripts/seed-demo.js
```
