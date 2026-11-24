# Nexxa Waitlist: tổng hợp luật nghiệp vụ

Tài liệu này tổng hợp mọi luật đang chạy ở cả server (BE) và giao diện (FE), để tra cứu khi
sửa tính năng. Khi luật trong code đổi, cập nhật file này cùng lúc.

Nguồn sự thật duy nhất cho luật quyền lợi là [`shared/catalog.js`](../shared/catalog.js). Cả FE
lẫn BE import từ đó. FE **không tự suy lại luật VIP** mà đọc cờ `vip` do server trả về.

---

## 1. Hằng số

| Hằng số | Giá trị | Ý nghĩa | File |
|---|---|---|---|
| `FIRST_SLOTS` | 1.000 | Số suất First 1.000 (người đăng ký sớm) | `shared/catalog.js` |
| `TOTAL_SLOTS` | 1.000 | Số suất Top 1.000 trong nhóm đua | `shared/catalog.js` |
| `STANDARD_SLOTS` | 9.000 | Chỉ để hiển thị, server **không** chặn đăng ký khi vượt | `shared/catalog.js` |
| `POINTS_PER_INVITE` | 10 | Mỗi lượt mời thành công được +10 điểm | `server/config/constants.js` |
| `BOOST` | 10 | Dùng cho field `score` cũ, **không còn dùng để xếp hạng** | `server/config/constants.js` |
| `LEADERBOARD_PAGE_SIZE` | 7 | Số dòng mỗi trang bảng xếp hạng | `server/config/constants.js` |
| `MAX_RESERVE_TICKERS` | 100 | Số mã tối đa trong một lần nhận | `server/config/constants.js` |
| `OTP_TTL_MS` | 10 phút | Thời gian sống của mã OTP | `server/config/constants.js` |
| `RESEND_COOLDOWN_MS` | 60 giây | Thời gian chờ trước khi được gửi lại mã | `server/config/constants.js` |
| `MAX_ATTEMPTS` | 5 | Số lần nhập sai OTP tối đa | `server/config/constants.js` |
| `MAX_EMAIL_LENGTH` | 254 | Độ dài email tối đa (RFC 5321) | `server/config/constants.js` |
| `PRICE_MAX_AGE_MS` | 48 giờ | Bảng giá cũ hơn mốc này thì server ghi cảnh báo lúc khởi động | `server/config/constants.js` |

---

## 2. Đăng ký và thứ tự đăng ký

- Mỗi người đăng ký nhận một `joinIndex` tăng đều 1, lấy từ bộ đếm `Counter` có `_id: 'users'`.
  `joinIndex` là **thứ tự đăng ký** và không bao giờ đổi.
- Đăng ký phải qua OTP gửi tới email (xem mục 7).
- Email đã đăng ký mà xác thực lại thì trả **409** kèm `alreadyRegistered: true` và profile hiện tại.
- Nếu hai request cùng email chạy song song, unique index trên `email` đảm bảo chỉ tạo đúng một user.
- `refCode` của mỗi người gồm 6 ký tự, bỏ các ký tự dễ nhầm `I`, `O`, `0`, `1`.

## 3. Referral và điểm

- Link mời có dạng `/r/:code` (GET) và chuyển hướng về `/?ref=CODE`. FE đọc `?ref` rồi gửi kèm
  khi xin OTP. Server lưu `ref` (tối đa 16 ký tự) vào bản ghi OTP.
- Khi người được mời xác thực xong, người mời được cộng `invites +1` (tức +10 điểm) và ghi
  `_id` của người được mời vào `referees`. Cả hai thay đổi nằm trong **một** lệnh update.
- Tự mời chính mình (cùng email) thì không được tính.
- **Điểm = `invites × 10`.** Điểm không được lưu riêng mà luôn suy ra từ `invites`.

## 4. Hai đường vào VIP

Có hai nhóm VIP. Hai nhóm **không chồng nhau**, nên tổng cộng tối đa **2.000 suất VIP**.

### 4.1 First 1.000 (đăng ký sớm)
- Điều kiện: `joinIndex <= FIRST_SLOTS`, kiểm tra bằng `isEarlyJoin(joinIndex)`.
- **Chắc chắn VIP**, không phụ thuộc điểm.
- **Không có hạng đua** (`rank = null`), không xuất hiện trên bảng xếp hạng và không ảnh hưởng ngưỡng điểm.

### 4.2 Top 1.000 (nhóm đua)
- Nhóm đua gồm những người có `joinIndex > FIRST_SLOTS` (`RACE_FILTER`).
- Thứ tự xếp hạng (`RANK_ORDER = { invites: -1, joinIndex: 1 }`):
  1. Điểm cao đứng trước.
  2. Bằng điểm thì ai đăng ký trước (`joinIndex` nhỏ hơn) đứng trước.
- `rank` = số người trong nhóm đua đứng trên + 1. Hạng 1 đến 1.000 thì được VIP.
- Hạng **thay đổi theo thời gian**: người khác mời được nhiều người hơn có thể đẩy bạn ra khỏi Top.

### 4.3 Hàm quyết định
```js
isVip({ early, rank }) = early || (rank != null && rank <= TOTAL_SLOTS)
entitlementOf(standing) = isVip(standing) ? ENTITLEMENTS[0] /* top */ : ENTITLEMENTS[1] /* rest */
```

## 5. Quyền lợi (entitlement)

| Bậc (`key`) | Ai được | Ngân sách | Nhóm cổ phiếu được chọn |
|---|---|---|---|
| `top` (VIP) | First 1.000 **hoặc** Top 1.000 nhóm đua | 100.000đ | VIP + Standard |
| `rest` (Tiêu chuẩn) | Những người còn lại | 50.000đ | Chỉ Standard |

First 1.000 và Top 1.000 hưởng **cùng** quyền lợi, chỉ khác đường vào.

### Chốt quyền lợi ở lần nhận đầu tiên
- Lần `POST /api/reserve` thành công đầu tiên lưu lại `lockedRank`, `budget`, `allowedPools` và `lockedPrices`.
- Từ đó trở đi quyền lợi **không đổi**, kể cả khi hạng tụt khỏi Top 1.000.
- Người thuộc First 1.000 được lưu `lockedRank = null`.
- Chưa có `reservation.budget` nghĩa là chưa chốt. Khi đó quyền lợi được tính theo hạng hiện tại.

### Bản xem thử
Người chưa đăng ký (email rỗng hoặc lạ) vẫn xem được danh mục. Server áp tạm bậc `top`
(100.000đ, cả hai nhóm) và trả `preview: true`. Lúc bấm nhận vẫn bị chặn vì email chưa đăng ký.

## 6. Chọn cổ phiếu (Reserve)

### Danh mục
| Nhóm (`pool`) | Hạng trong catalog | Số mã | Ví dụ |
|---|---|---|---|
| `vip` | `gold` (VN30) | 30 | ACB, FPT, HPG, VCB, VIC, VNM… |
| `standard` | `silver` + `copper` | 10 + 10 | PLX, TPB, REE… / PNJ, KDH, KBC… |

Hai nhóm không có mã trùng nhau. Mã được phân về nhóm qua `POOL_OF_TICKER`, và nhóm được lưu
thành `groupType: 'VIP' | 'STANDARD'` trong collection `prices`.

### Điều kiện khi nhận (server kiểm tra theo thứ tự)
1. Email phải đã đăng ký waitlist. Nếu chưa, trả **403**.
2. Chọn từ 1 đến 100 mã. Mã trùng tự được gộp, mã viết thường tự chuyển thành chữ hoa.
3. Mọi mã phải nằm trong `RESERVABLE_TICKERS`. Nếu không, trả **400**.
4. Mọi mã phải thuộc nhóm mà người dùng được phép chọn. Nếu không, trả **400** kèm `wrongPool` nêu đích danh mã sai.
5. Mọi mã phải có giá. Thiếu giá thì trả **503** kèm `missing`, không âm thầm tính sai tổng.
6. **Tổng giá ≤ ngân sách.** Mỗi mã tính **1 cổ phiếu** theo giá của nó. Vượt thì trả **400** kèm `totalValue` và `budget`.
7. Nhận lại thì **ghi đè** lựa chọn cũ.

### Giá
- Reserve **chỉ đọc snapshot** trong collection `prices` và không bao giờ gọi trực tiếp nhà cung cấp giá.
- Giá dùng để tính = giá đã chốt (`lockedPrices`) **hợp với** snapshot hiện tại. Mã đã chốt giữ
  giá cũ, mã mới chọn thì chốt theo giá tại thời điểm chọn.
- `npm run prices` cập nhật snapshot. Nếu nguồn giá lỗi, snapshot cũ được **giữ nguyên**. Mã nào
  nguồn không trả giá thì giữ giá cũ của mã đó.
- `/api/reserve/options` chỉ trả giá của những mã người dùng **được phép chọn**, để không lộ giá ngoài quyền.
- Cảnh báo lúc khởi động: server cảnh báo khi chưa có bảng giá, khi bảng giá cũ hơn 48 giờ, và
  khi một bậc không mua nổi mã rẻ nhất trong nhóm của nó (`checkBudgetFeasibility`).

### Phía FE (ReserveModal)
- Chỉ hiển thị những nhóm có trong `opts.pools`. Người bậc Tiêu chuẩn **không thấy** nhóm VIP.
- Mã chưa chọn bị làm mờ nếu chưa có giá hoặc giá lớn hơn phần ngân sách còn lại. Mã đã chọn thì luôn bấm được để bỏ ra.
- Nút "Nhận" chỉ bật khi người dùng đã đăng ký, giỏ có ít nhất 1 mã, quyền chọn đã tải xong và không có request nào đang chạy.
- Người chưa đăng ký vẫn chọn được giỏ. Giỏ được giữ ở `App` và tự gửi đi sau khi đăng ký xong.
- Nhãn ngân sách:
  - Bản xem thử: "Ngân sách dự kiến".
  - Người thuộc First 1.000: "Ngân sách First 1.000".
  - Người trong nhóm đua: "Ngân sách hạng #N".

## 7. OTP

- Mã gồm 6 chữ số và sống 10 phút. Server chỉ lưu **hash SHA-256**, không lưu mã gốc.
- Phải chờ 60 giây mới được gửi lại. Gửi sớm hơn thì trả **429** kèm `retryAfter` (tính bằng giây).
- Gửi lại sau 60 giây thì nhận mã mới và số lần sai được reset về 0.
- Nhập sai thì trả **400** và tăng số lần sai. Đã sai 5 lần thì trả **429** và phải xin mã mới.
- Mã hết hạn, hoặc chưa từng xin mã, thì trả **400** với thông báo "Mã đã hết hạn".
- Server chuẩn hoá email trước khi kiểm tra: cắt khoảng trắng và chuyển thành chữ thường.
- Xác thực đúng thì bản ghi OTP bị xoá.
- `devOtp` chỉ được trả về ở môi trường không phải production.

## 8. API và hình dạng dữ liệu

Mọi API đều dùng **POST**. Ngoại lệ duy nhất là `GET /r/:code`, vì đó là link người dùng bấm trực tiếp trong trình duyệt.

| Endpoint | Trả về |
|---|---|
| `/api/stats` | `{ registered, firstSlots, firstRemaining, totalSlots, topRemaining, remaining, last24h, recent }` |
| `/api/leaderboard` | `{ top: [{ rank, masked, points }], page, pageSize, total, totalPages, cutoff }` |
| `/api/waitlist/check` | `{ exists: false }` hoặc `{ exists: true, profile }` |
| `/api/waitlist/request-otp` | gửi OTP |
| `/api/waitlist/verify` | `profile` |
| `/api/reserve/options` | `{ rank, early, budget, pools, locked, preview, selected, prices }` |
| `/api/reserve` | `{ ok, tickers, totalValue, budget }` |
| `/api/catalog` | `{ totalSlots, entitlements, pools, stocks }` |

### Cách tính các con số trong stats
- `firstRemaining = max(0, FIRST_SLOTS − số người có joinIndex ≤ 1.000)`
- `topRemaining = max(0, TOTAL_SLOTS − số người trong nhóm đua)`. Khi nhóm đua đủ 1.000 người thì
  giá trị này về 0, dù thứ hạng bên trong vẫn còn thay đổi theo điểm.
- `remaining = firstRemaining + topRemaining`, tức tổng suất VIP còn mở ở cả hai đường.
- `last24h` là số người đăng ký trong 24 giờ gần nhất.
- `recent` là 12 người đăng ký gần nhất, email đã được che.

### Bảng xếp hạng
- Chỉ gồm **nhóm đua**. `total` là số người trong nhóm đua.
- `cutoff` là điểm của người đứng hạng 1.000 trong nhóm đua, tức ngưỡng vào Top. Giá trị là `null` khi nhóm đua chưa đủ 1.000 người.
- `page` không hợp lệ thì quay về trang 1. `page` vượt quá số trang thì trả `top: []`.

### Profile
```js
{ email, early, joinIndex, rank, vip, registered, refCode, invites }
```

| Trường | Ý nghĩa |
|---|---|
| `early` | Người dùng thuộc First 1.000 |
| `joinIndex` | Thứ tự đăng ký |
| `rank` | Hạng trong nhóm đua, là `null` nếu `early` |
| `vip` | Server tự quyết định. FE chỉ đọc cờ này |

### Che email
Email được che **ở server** trước khi trả ra API công khai, theo dạng
`nguyenvana@gmail.com` → `ng•••••a@gmail.com`. Số dấu chấm luôn cố định là 5, để không lộ độ dài
email. Phần domain được giữ nguyên.

## 9. Hiển thị phía FE

### Hero / Scarcity ([`src/components/Scarcity.jsx`](../src/components/Scarcity.jsx))
- Có hai vòng tròn: **First 1.000** (màu vàng `#D69A00`, ghi chú "Đăng ký sớm") và **Top 1.000** (màu `--accent`, ghi chú "Theo điểm mời").
- Giữa mỗi vòng hiển thị số suất **còn lại** dạng `X / 1.000`. Độ dài cung ngoài bằng % suất còn
  lại, bắt đầu ở 12 giờ và chạy theo chiều kim đồng hồ. Khi còn suất, cung luôn giữ tối thiểu 1,5% để không trông như đã hết.
- Số liệu lấy từ `/api/stats`, App gọi lại mỗi 30 giây và tạm ngừng khi tab bị ẩn. Ở khung hình
  đầu tiên, trước khi có stats, cả hai vòng được coi là còn nguyên suất.

### Thẻ kết quả sau đăng ký ([`SignupCard.jsx`](../src/components/SignupCard.jsx))
| Người xem | Số hiển thị | Pill | Phần mời bạn |
|---|---|---|---|
| First 1.000 | "Bạn là người đăng ký thứ #`joinIndex`" | `First 1.000 · VIP` | "Mời bạn bè cùng nhận cổ phiếu" (không có phần leo hạng) |
| Top 1.000 | "Hạng của bạn trong cuộc đua Top 1.000 #`rank`" | `Top 1.000 · VIP` | "Mời bạn bè, leo hạng nhanh hơn" + "+10 điểm" |
| Tiêu chuẩn | như dòng trên | `Tiêu chuẩn` | như dòng trên |

Bậc quà (ngân sách, màu sắc) lấy từ `tierOf(me)` trong [`src/lib/catalog.jsx`](../src/lib/catalog.jsx). Hàm này chỉ đọc `me.vip`.

### Trang Phần thưởng ([`RewardsPage.jsx`](../src/components/RewardsPage.jsx), `#/rewards`)
- Thẻ trạng thái có 4 biến thể:
  - Chưa đăng ký:
    - Còn suất First: "Còn X suất First 1.000".
    - Hết suất First: "Đã hết suất First — vào Top 1.000".
  - First 1.000: "Bạn đã chắc suất VIP".
  - Top 1.000: "Bạn đang trong Top 1.000".
  - Tiêu chuẩn: "Bạn đang ở hạng Tiêu chuẩn".
- Thanh điểm so với `cutoff` **chỉ** hiện với người trong nhóm đua.
- Thẻ VIP hiển thị số suất còn lại của **cả hai** đường vào.
- Bảng xếp hạng có tiêu đề "Bảng xếp hạng Top 1.000" và ghi chú "Chỉ xếp người đăng ký từ #1.001". Người
  thuộc First 1.000 không có nút "Xem hạng của tôi" và không có dòng hạng được ghim ở cuối bảng.

---

## 10. Điểm chưa khớp và rủi ro đã biết

- Hero ghi "Nhận cổ phiếu VIP — lên tới 10 mã", nhưng code **không giới hạn 10 mã**. Số mã chọn
  được thực tế do ngân sách quyết định, giới hạn kỹ thuật là 100 mã.
- `STANDARD_SLOTS = 9.000` chỉ dùng để hiển thị. Server **không** chặn đăng ký khi vượt quá.
- Ngân sách 50.000đ có thể không mua nổi mã Standard nào nếu giá tăng. Server có cảnh báo lúc
  khởi động, nhưng cách xử lý là quyết định kinh doanh.
- "First 1.000" dựa vào `joinIndex`. Nếu xoá user trong DB, bộ đếm **không** lùi lại, nên suất sớm
  thực tế sẽ ít hơn 1.000.
- `TierList.jsx` đang bị tắt và vẫn dùng `tierOfRank` theo luật cũ. Cần sửa nếu bật lại.

## 11. Bản đồ file

| Luật | File |
|---|---|
| Hằng số suất, danh mục, quyền lợi, `isVip` | `shared/catalog.js` |
| Hằng số OTP, điểm, phân trang | `server/config/constants.js` |
| Đăng ký, xếp hạng, stats, profile | `server/services/waitlist.service.js` |
| Quyền lợi và chốt quyền lợi | `server/services/entitlement.service.js` |
| Reserve (kiểm tra và lưu) | `server/services/reserve.service.js` |
| Giá và cảnh báo | `server/services/price.service.js` |
| OTP | `server/services/otp.service.js` |
| Che email / mã | `server/utils/mask.js`, `server/utils/codes.js` |
| Context catalog FE (`tierOf`) | `src/lib/catalog.jsx` |
| Màu từng bậc, mã phổ biến, dữ liệu dự phòng | `src/lib/data.js` |
| Test luật | `server/tests/entitlement.test.js`, `waitlist.test.js`, `referral.test.js` |
