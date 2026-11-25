# Rule nhận cổ phiếu v2: First + Top song song, chốt Top tại deadline, token phiên

Ngày: 2026-11-26 · Nhánh: `ui_reward_program` · Thay cho luật ở commit `57bc226`.

## 1. Mục đích

Nexxa chạy **hai campaign song song và độc lập**:

- **First 1.000**: thưởng cho 1.000 người đăng ký đầu tiên.
- **Top 1.000**: thưởng cho 1.000 người mời được nhiều bạn nhất, tính tại thời điểm deadline.

Người thuộc First vẫn được đi mời và tham gia đua Top để nhận **thêm** cổ phiếu. Cơ chế này cho nhóm
đăng ký sớm lý do tiếp tục lan truyền, thay vì đứng ngoài cuộc như luật hiện tại.

Đi kèm là ba việc sửa lỗi:

- Chặn chuyện ai biết email cũng xem hoặc sửa được giỏ của người khác (thêm token phiên).
- Sửa lỗi mất giỏ chọn trước khi đăng ký.
- Làm cho việc ghi giỏ và việc cấp `joinIndex` an toàn khi có nhiều request chạy song song.

## 2. Mục tiêu, không làm, phản mục tiêu

**Mục tiêu**

- Luật quyền lợi mới như bảng ở §4, áp dụng cho cả backend lẫn frontend.
- Top 1.000 cạnh tranh thật. Chỉ người đứng hạng 1 đến 1.000 **tại deadline** mới nhận quà Top.
- Có quy trình sau deadline: chốt hạng, mở một hạn chọn lại cho người có giỏ không còn hợp lệ, rồi
  tự cắt giỏ của người không chọn lại.
- Có hai bảng: FIRST chỉ để thông tin, TOP là bảng xếp hạng thật.
- Mọi API đọc hoặc ghi dữ liệu riêng của một người đều đòi token phiên lấy được sau khi xác thực OTP.

**Không làm (lần này)**

- Không sửa dòng "Join NEXXA For 10 VIP Stocks" (mục 5 cũ).
- Không dọn các log debug trong `reserve.service.js` (mục 6 cũ).
- Không tích hợp nhà cung cấp email thật. `mailer.service.js` vẫn chỉ in ra console. Email mời chọn
  lại dùng cùng cơ chế đó, và việc gắn SMTP/Resend để làm sau.
- Không giới hạn số người đăng ký nhóm Standard.
- Không xử lý ghi giỏ song song (mục 4 cũ): hai lần "Nhận" chen nhau thì lần ghi sau thắng. Để
  làm sau.

**Phản mục tiêu (nếu xảy ra thì coi như làm hỏng)**

- Người thuộc First bị mất quyền lợi First vì tụt hạng Top.
- Số người nhận quà Top lớn hơn 1.000.
- Người dùng mất giỏ một cách âm thầm, không thấy báo lỗi gì.
- Trình duyệt dùng chung lộ email hoặc giỏ của người dùng trước.

## 3. Ràng buộc

- Mongoose đang ở chế độ `strict`, và collection `users` thật đang có dữ liệu. **Không xoá field nào
  khỏi schema.** Field cũ (`score`, `reservation.lockedRank`, …) phải được giữ lại để lần ghi sau
  không xoá mất chúng.
- Mọi API là POST, ngoại lệ duy nhất là `GET /r/:code`.
- Nguồn sự thật cho luật là `shared/catalog.js`. Frontend chỉ đọc cờ do server trả về, không tự suy
  ra luật.
- Không thêm dependency nếu tránh được: chỉ dùng `crypto` của Node và mongoose.
- Test chạy bằng `node --test` trên database tên kết thúc bằng `_test`.

## 4. Luật quyền lợi mới

| Trường hợp | Ngân sách | Nhóm được chọn |
|---|---|---|
| Chỉ thuộc First 1.000 | 100.000đ | VIP + Standard |
| Chỉ thuộc Top 1.000 | 100.000đ | VIP + Standard |
| Vừa First vừa Top | **200.000đ** (cộng dồn, chọn chung một giỏ) | VIP + Standard |
| Không thuộc nhóm nào | 50.000đ | Chỉ Standard |

- **First**: `joinIndex <= 1000`. Suất này chắc chắn, không phụ thuộc điểm hay deadline.
- **Top**: xếp **tất cả** người đăng ký, kể cả người thuộc First, theo `invites` giảm dần. Bằng điểm
  thì `joinIndex` nhỏ hơn đứng trên. Hạng 1 đến 1.000 thuộc Top. `RACE_FILTER` bị bỏ.
- Hệ quả đã được chấp nhận: lúc mới mở, nhóm First với 0 lượt mời chiếm kín Top 1.000. Người đăng ký
  từ #1.001 trở đi phải mời được ít nhất 1 người mới chen vào được.
- Công thức trong `shared/catalog.js`:
  ```js
  ENTITLEMENTS = { first: 100000, top: 100000, rest: 50000 }  // pools như bảng trên
  entitlementOf({ early, inTop }) =
    early || inTop
      ? { budget: (early ? 100000 : 0) + (inTop ? 100000 : 0), pools: ['vip', 'standard'] }
      : { budget: 50000, pools: ['standard'] }
  ```
  Profile trả về `early`, `rank` (hạng Top của **mọi** người, không còn `null`), `inTop` và `vip`
  (`early || inTop`).

### Trước và sau deadline

| Giai đoạn | `inTop` lấy từ đâu | Lượt mời | Giỏ |
|---|---|---|---|
| Trước `TOP_DEADLINE` | Hạng hiện tại (tính lại mỗi lần đọc) | Được cộng | Chọn tạm, có thể sửa. Ngân sách theo hạng hiện tại |
| Từ `TOP_DEADLINE` đến lúc chạy `finalize` | Hạng hiện tại, đã đứng yên vì không còn cộng lượt mời | **Ngừng cộng** | Chặn ghi (423) cho tới khi finalize xong |
| Sau `finalize`, trước `REPICK_DEADLINE` | `user.final` (đã chốt) | Ngừng | Người `needsRepick` được chọn lại theo quyền lợi đã chốt. Người khác vẫn sửa được trong quyền lợi đã chốt |
| Sau `REPICK_DEADLINE` (đã chạy `close-repick`) | `user.final` | Ngừng | Khoá: mọi lần ghi giỏ trả 423 |

**Bỏ cơ chế "chốt ở lần Reserve đầu tiên".** `getEntitlement` không đọc `reservation.budget`,
`allowedPools` và `lockedRank` nữa. Các field này vẫn nằm trong schema (do ràng buộc ở §3) nhưng
không còn được ghi. `lockedPrices` **vẫn giữ** đúng như cũ: mã đã chọn giữ giá lúc chọn.

## 5. Các cách đã cân nhắc

**Token phiên.** Đã chọn **A**.

- **A. Token ngẫu nhiên, lưu hash trong collection `sessions` có TTL**, giống `otps`.
  - Ưu: thu hồi được, không phải quản lý secret.
  - Nhược: mỗi request thêm một lần đọc DB, không đáng kể ở quy mô này.
- **B. Token tự ký HMAC.** Không tốn DB nhưng không thu hồi được và phải thêm `SESSION_SECRET`.

**Chốt hạng tại deadline.** Đã chọn **A**.

- **A. Script `npm run finalize` chạy một lần, ghi kết quả vào từng user, cộng chặn ở code sau
  deadline.** Có bản ghi để đối soát việc phát quà thật.
- **B. Tính lười**: sau deadline, mỗi request tự tính lại từ dữ liệu đã đứng yên. Cách này không có
  thời điểm chốt rõ ràng, và việc gửi email vẫn cần một job riêng.

**Hạn chọn lại.** Đã chọn **B**: hạn chọn lại kèm email, quá hạn thì tự cắt giỏ.

- Phương án A (cắt giỏ ngay) bị loại vì giỏ có thể khác ý người dùng.
- Phương án C (quá hạn thì mất quà) bị loại vì làm mất thiện chí.

**Thời gian sống của phiên.** Đã chọn **A**: phiên chỉ sống trong tab (`sessionStorage`), đóng tab
là phải OTP lại. Cách này khớp với chủ trương hiện có là không để lại dữ liệu người dùng trên máy
dùng chung.

## 6. Thiết kế

### 6.1 Token phiên (mục 1 cũ)

- **Model `Session`** (`server/models/session.model.js`):
  `{ hash (sha256, unique), userId, createdAt, expiresAt }`, kèm TTL index trên `expiresAt`.
  - `SESSION_TTL_MS` = 12 giờ, khai báo trong `constants.js`.
  - Phía client còn giới hạn bởi vòng đời tab.
- **Cấp token**: `/api/waitlist/verify` thành công thì trả `{ profile, token }`.
  - **Đổi hành vi**: email đã đăng ký mà xác thực OTP đúng thì trả **200** với
    `alreadyRegistered: true`, kèm profile và token. Đây chính là bước đăng nhập. Không trả 409 nữa.
- **Middleware `requireSession`** đọc `Authorization: Bearer <token>`, hash token rồi tìm `Session`.
  - Không có token hoặc token sai thì trả 401.
  - Gắn `req.user` cho các bước sau.
  - Biến thể `optionalSession` dùng cho các API cho phép xem thử.
- **Thay đổi API**

  | Endpoint | Trước | Sau |
  |---|---|---|
  | `/waitlist/check` | Trả `profile` của email bất kỳ | Chỉ trả `{ exists }`. Không lộ hạng, `refCode` hay lượt mời |
  | `/waitlist/me` (mới) | | `requireSession` → `profile` |
  | `/reserve/options` | `body.email` | `optionalSession`: có token thì dùng quyền lợi thật, không có thì xem thử |
  | `/reserve` | `body.email` | `requireSession`. Bỏ qua `body.email` |
  | `/waitlist/logout` (mới) | | Xoá session |

- **Frontend**
  - `src/lib/api.js` giữ token trong `sessionStorage` (key `nexxa_session`) và gắn header cho mọi
    request.
  - Gặp 401 thì xoá token và đưa người dùng về form email.
  - `SignupCard`: email đã tồn tại thì đi thẳng sang bước OTP, kèm câu "Email này đã đăng ký —
    nhập mã để xem kết quả". Hiện tại bước này hiện profile ngay mà không cần OTP.
  - Khi mở trang, nếu `sessionStorage` có token thì gọi `/waitlist/me` để khôi phục `me`. Việc này
    chỉ có tác dụng khi tải lại trang **trong cùng tab**, nên chủ trương "mở trang mới là về form
    đăng ký" vẫn được giữ.

### 6.2 Luật và chốt Top (mục 2 cũ + rule song song)

- **Cấu hình** trong `server/config/env.js`, đọc từ `.env` và cập nhật `.env.example`:
  - `TOP_DEADLINE` và `REPICK_DEADLINE` (ISO 8601 có múi giờ).
  - Bắt buộc `REPICK_DEADLINE > TOP_DEADLINE`.
  - Khi thiếu biến thì coi như campaign chưa có deadline: không chặn gì và ghi cảnh báo lúc khởi
    động. Có như vậy môi trường dev mới chạy được mà không cần cấu hình.
- **`waitlist.service.js`**
  - Bỏ `RACE_FILTER`. `rankOf` đếm trên toàn bộ user.
  - `getLeaderboard` xếp trên toàn bộ user, và mỗi dòng thêm cờ `first: boolean` để hiện huy hiệu
    First.
  - Sau `TOP_DEADLINE`, `join()` vẫn tạo user và lưu `referrer`, nhưng **không** `$inc invites`.
    Như vậy dữ liệu ai mời ai vẫn đủ, chỉ có điểm là ngừng tăng.
- **`entitlement.service.js`**
  - Nếu `user.final` tồn tại thì trả quyền lợi đã chốt.
  - Nếu chưa, tính theo `{ early, inTop: rank <= 1000 }` hiện tại.
  - Kết quả trả về thêm `phase: 'open' | 'frozen' | 'repick' | 'closed'`.
- **Schema `User`**: thêm field `final`:
  ```
  { early, topRank, inTop, budget, pools, finalizedAt,
    needsRepick, repickedAt, autoTrimmedAt }
  ```
- **`npm run finalize`** (`server/scripts/finalize-top.js`):
  1. Từ chối chạy nếu `now < TOP_DEADLINE`.
  2. **Idempotent**: user đã có `final` thì bỏ qua.
  3. Duyệt toàn bộ user theo `RANK_ORDER` và gán `topRank` theo vị trí. Không gọi `rankOf` riêng cho
     từng người.
  4. Tính quyền lợi chốt.
  5. Một giỏ là **không hợp lệ** nếu có mã nằm ngoài `pools`, hoặc tổng theo `lockedPrices` lớn hơn
     `budget`. Giỏ không hợp lệ thì đặt `needsRepick = true` và gọi `sendRepickEmail(email, …)`.
     Hàm mới này nằm trong `mailer.service.js` và hiện chỉ in ra console.
  6. In bảng tổng kết: số người First, số người Top, số người cộng dồn, số giỏ phải chọn lại.
  7. Đảm bảo **đúng 1.000 người** có `inTop` (hoặc ít hơn nếu tổng số user dưới 1.000).
- **`npm run close-repick`** (`server/scripts/close-repick.js`):
  1. Từ chối chạy nếu `now < REPICK_DEADLINE`.
  2. Với user có `needsRepick && !repickedAt`, cắt giỏ: giữ các mã thuộc `pools`, **theo thứ tự đã
     chọn**, cộng dồn theo `lockedPrices` cho tới khi vượt `budget`.
  3. Ghi `autoTrimmedAt`. Giỏ cắt xong có thể rỗng, và trường hợp này phải được ghi rõ trong log.
- **`/reserve`** chặn theo `phase`:
  - `frozen` và `closed` trả **423** kèm thông báo.
  - `repick` cho phép ghi theo quyền lợi đã chốt. Người `needsRepick` thì đặt thêm `repickedAt`.
- **Stats**
  - `topRemaining` không còn ý nghĩa, vì nhóm đua giờ là tất cả mọi người.
  - Thay bằng `topCutoff` (điểm của người hạng 1.000) và `topDeadline`.
  - **Vẫn trả** `topRemaining`, tính bằng `max(0, 1000 − registered)`.
- **Vòng Top ở `Scarcity`** (người dùng đã chốt):
  - **Khi `topRemaining > 0`** (Top chưa đủ 1.000 người): giữ nguyên vòng hiện tại, hiện
    "X / 1.000" suất còn lại, cung tròn theo % còn lại.
  - **Khi `topRemaining === 0`**: chuyển sang dạng kết hợp.
    - Giữa vòng hiện ngưỡng "≥ `topCutoff` đ", kèm dòng "còn N ngày" đếm tới `topDeadline`.
    - Cung tròn thể hiện thời gian còn lại, tính từ lúc mở campaign tới `topDeadline`. Ngày mở lấy
      từ `TOP_START` trong `.env`. Thiếu biến này thì vẽ đầy cung.
    - Nếu `topCutoff` bằng 0 thì thay dòng ngưỡng bằng "Mời 1 bạn để vào Top".
    - Không có deadline thì chỉ hiện ngưỡng.
    - Sau deadline thì hiện "Đã chốt".

### 6.3 Hai bảng xếp hạng

- **TOP**: `POST /api/leaderboard` như hiện tại, nhưng xếp toàn bộ user, mỗi dòng có thêm `first`.
  `cutoff` tính trên toàn bộ user.
- **FIRST**: `POST /api/leaderboard/first { page }` trả `{ rows: [{ joinIndex, masked, at }],
  page, pageSize, total, totalPages, firstRemaining }`.
  - Chỉ lấy người có `joinIndex <= 1000`, sắp `joinIndex` giảm dần (mới nhất lên đầu).
  - Không có điểm.
  - Cần thêm index `{ joinIndex: -1 }`.
- **`RewardsPage`** có hai tab: "Top 1.000 · Bảng xếp hạng" (mặc định) và "First 1.000 · Danh sách".
  - Người thuộc First giờ **có** nút "Xem hạng của tôi" và dòng hạng được ghim trong tab TOP.
  - Thanh điểm so với `cutoff` hiện cho **mọi** người.
  - Thẻ trạng thái thêm biến thể "First + Top · 200.000đ".
  - Thêm đồng hồ đếm ngược tới `TOP_DEADLINE`.
- **`SignupCard`**:
  - Pill có thêm "First + Top · VIP".
  - Người thuộc First hiện cả "#joinIndex" lẫn "Hạng Top #rank".
  - Phần mời bạn hiện cho mọi người, kèm "+10 điểm".

### 6.4 Sửa lỗi mất giỏ (mục 3 cũ)

`App.handleJoined`:

- Chỉ `setPendingBasket([])` khi `api.reserve` **thành công**.
- Nếu lỗi:
  - Giữ nguyên `pendingBasket`.
  - Mở lại `ReserveModal` (`setReserveOpen(true)`).
  - Truyền vào lỗi từ server qua prop mới `initialError`. Ví dụ "Bạn chưa được chọn VCB…", dựa vào
    `wrongPool` để đánh dấu đúng mã sai.
- `ReserveModal`: khi `initialBasket` có mã nằm ngoài `opts.pools`, hiện các mã đó ở trạng thái lỗi
  kèm nút bỏ, không âm thầm lọc đi.

### 6.5 Bộ đếm không hụt số (mục 7 cũ)

`join()`:

1. `User.create` **không có** `joinIndex`. Schema đổi `joinIndex` từ `required: true` sang không
   bắt buộc. Field vẫn còn nên dữ liệu cũ không mất.
2. Email trùng bị unique index chặn **trước khi** kịp tiêu số.
3. Tạo xong mới gọi `nextJoinIndex()` rồi `updateOne { $set: { joinIndex, score: joinIndex } }`.
4. Mọi query xếp hạng hoặc thống kê thêm `joinIndex: { $exists: true }` để loại bản ghi đang dở dang
   trong vài mili-giây đó.
5. Nếu bước 3 lỗi thì xoá user vừa tạo rồi ném lỗi, để không sót bản ghi thiếu số.

## 7. Kiểm thử

Thêm hoặc sửa test trong `server/tests/`:

- **Session**
  - `/verify` trả token.
  - Email đã đăng ký xác thực lại được 200 kèm token.
  - `/reserve` không có token trả 401.
  - Token của user A không ghi được giỏ của user B.
  - `/check` không còn trả profile.
- **Luật**: chỉ First = 100k; chỉ Top = 100k; First + Top = 200k; người ngoài = 50k Standard.
  Người First có 0 lượt mời vẫn có hạng Top.
- **Deadline**
  - Sau `TOP_DEADLINE` thì không cộng lượt mời nữa.
  - `/reserve` trả 423 khi đang `frozen` và khi `closed`.
- **finalize**
  - Đúng 1.000 người `inTop`.
  - Chạy lại lần hai không đổi gì.
  - Giỏ có mã VIP của người bị đẩy khỏi Top thì có `needsRepick`.
  - Người First bị đẩy khỏi Top giữ 100k và không bị đặt `needsRepick` nếu giỏ của họ vẫn vừa 100k.
- **close-repick**: cắt đúng thứ tự, không vượt ngân sách, bỏ qua người đã `repickedAt`.
- **Counter**: hai `join` cùng email song song chỉ tiêu một số `joinIndex`.
- **Leaderboard FIRST**: chỉ gồm `joinIndex <= 1000` và sắp giảm dần.

## 8. Phần để người làm tự quyết (đã chốt bởi Claude, có thể sửa)

- `SESSION_TTL_MS` = 12 giờ phía server.
- `TOP_START` (tuỳ chọn) là mốc bắt đầu, dùng để vẽ cung đếm ngược ở hero.
- Preview (chưa đăng nhập) vẫn áp ngân sách 100k, cả hai nhóm, như hiện tại.
- Campaign First **không** đóng theo deadline. Nó tự đóng khi đủ 1.000 người.
- Người đăng ký sau `TOP_DEADLINE` nhận 50k Standard, hoặc 100k nếu vẫn còn suất First.
- Dữ liệu cũ đã có `reservation.budget` (bản chốt kiểu cũ) **không được tôn trọng nữa** và được tính
  lại theo luật mới. Theo comment trong `user.model.js`, hiện chỉ có khoảng 7 user. Cần kiểm tra lại
  DB thật trước khi deploy.
- Cập nhật `docs/business-rules.md` và Postman collection cùng lúc với code.
