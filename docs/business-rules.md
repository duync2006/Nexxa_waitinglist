# Nexxa Waitlist: tổng hợp luật nghiệp vụ

Tài liệu này tổng hợp mọi luật đang chạy ở cả server (BE) và giao diện (FE), để tra cứu khi
sửa tính năng. Khi luật trong code đổi, cập nhật file này cùng lúc.

Nguồn sự thật duy nhất cho luật quyền lợi là [`shared/catalog.js`](../shared/catalog.js). Cả FE
lẫn BE import từ đó. FE **không tự suy lại luật VIP** mà đọc cờ `vip` (cùng `inTop`, `budget`) do server trả về.

Ba mốc thời gian của campaign đọc từ biến môi trường, xem mục 4.4.

---

## 1. Hằng số

| Hằng số | Giá trị | Ý nghĩa | File |
|---|---|---|---|
| `FIRST_SLOTS` | 1.000 | Số suất First 1.000 (người đăng ký sớm) | `shared/catalog.js` |
| `TOTAL_SLOTS` | 1.000 | Số suất Top 1.000 (xếp trên toàn bộ người đăng ký) | `shared/catalog.js` |
| `FIRST_BUDGET` | 100.000đ | Ngân sách suất First | `shared/catalog.js` |
| `TOP_BUDGET` | 100.000đ | Ngân sách suất Top | `shared/catalog.js` |
| `REST_BUDGET` | 50.000đ | Ngân sách người không thuộc suất nào | `shared/catalog.js` |
| `STANDARD_SLOTS` | 9.000 | Chỉ để hiển thị, server **không** chặn đăng ký khi vượt | `shared/catalog.js` |
| `POINTS_PER_INVITE` | 10 | Mỗi lượt mời thành công được +10 điểm | `server/config/constants.js` |
| `BOOST` | 10 | Dùng cho field `score` cũ, **không còn dùng để xếp hạng** | `server/config/constants.js` |
| `LEADERBOARD_PAGE_SIZE` | 7 | Số dòng mỗi trang bảng xếp hạng | `server/config/constants.js` |
| `MAX_RESERVE_TICKERS` | 100 | Số mã tối đa trong một lần nhận | `server/config/constants.js` |
| `SESSION_TTL_MS` | 12 giờ | Thời gian sống của token phiên (phía client còn giới hạn bởi vòng đời tab) | `server/config/constants.js` |
| `OTP_TTL_MS` | 10 phút | Thời gian sống của mã OTP | `server/config/constants.js` |
| `RESEND_COOLDOWN_MS` | 60 giây | Thời gian chờ trước khi được gửi lại mã | `server/config/constants.js` |
| `MAX_ATTEMPTS` | 5 | Số lần nhập sai OTP tối đa | `server/config/constants.js` |
| `MAX_EMAIL_LENGTH` | 254 | Độ dài email tối đa (RFC 5321) | `server/config/constants.js` |
| `PRICE_MAX_AGE_MS` | 48 giờ | Bảng giá cũ hơn mốc này thì server ghi cảnh báo lúc khởi động | `server/config/constants.js` |

---

## 2. Đăng ký, đăng nhập và thứ tự đăng ký

- Mỗi người đăng ký nhận một `joinIndex` tăng đều 1, lấy từ bộ đếm `Counter` có `_id: 'users'`.
  `joinIndex` là **thứ tự đăng ký** và không bao giờ đổi.
- `join()` tạo user **trước**, xin `joinIndex` **sau** (rồi `$set { joinIndex, score }`). Hai request cùng
  email chạy song song thì unique index trên `email` chặn cái thứ hai ngay ở bước tạo, nên không có số nào bị
  tiêu oan. Nếu bước xin số lỗi thì user vừa tạo bị xoá. Mọi query xếp hạng và thống kê đều lọc
  `joinIndex: { $exists: true }` (`NUMBERED`) để bỏ qua bản ghi đang dở dang.
- Đăng ký và đăng nhập **cùng một đường** qua OTP gửi tới email (xem mục 7).
- Email đã đăng ký mà xác thực OTP đúng thì trả **200** kèm `alreadyRegistered: true`, profile và token mới.
  Đây chính là bước đăng nhập (không còn 409).
- `/api/waitlist/check` chỉ trả `{ exists }`, không lộ profile, hạng hay `refCode`. FE dùng nó để đổi lời
  nhắc ("Email này đã đăng ký — nhập mã để xem kết quả"), vẫn phải nhập OTP.
- `refCode` của mỗi người gồm 6 ký tự, bỏ các ký tự dễ nhầm `I`, `O`, `0`, `1`.

### Token phiên
- Verify thành công thì server tạo token ngẫu nhiên, **chỉ lưu hash SHA-256** trong collection `sessions`
  (TTL index trên `expiresAt`). Sống `SESSION_TTL_MS` = 12 giờ.
- Client gửi `Authorization: Bearer <token>` và lưu token ở `sessionStorage` (key `nexxa_session`): đóng tab là
  phải OTP lại, mở trang mới ở tab mới luôn về form đăng ký.
- `requireSession` (`/reserve`, `/waitlist/me`, `/waitlist/logout`): thiếu hoặc sai token thì **401**.
  `optionalSession` (`/reserve/options`): không token thì trả bản xem thử, không bao giờ ném lỗi.
- `/reserve` lấy danh tính từ token và **bỏ qua** `email` trong body.
- FE gặp 401 thì xoá token và đưa người dùng về form email, **không đụng tới giỏ** đang chọn.

## 3. Referral và điểm

- Link mời có dạng `/r/:code` (GET) và chuyển hướng về `/?ref=CODE`. FE đọc `?ref` rồi gửi kèm
  khi xin OTP. Server lưu `ref` (tối đa 16 ký tự) vào bản ghi OTP.
- Khi người được mời xác thực xong, người mời được cộng `invites +1` (tức +10 điểm) và ghi
  `_id` của người được mời vào `referees`. Cả hai thay đổi nằm trong **một** lệnh update.
- Tự mời chính mình (cùng email) thì không được tính.
- **Từ `TOP_DEADLINE` trở đi, lượt mời ngừng cộng điểm** (`invitesOpen()`): `join()` vẫn tạo user và ghi
  `referees`, nhưng không `$inc invites`. Dữ liệu ai mời ai vẫn đủ, chỉ có điểm đứng yên.
- **Điểm = `invites × 10`.** Điểm không được lưu riêng mà luôn suy ra từ `invites`.

## 4. Hai campaign song song: First 1.000 và Top 1.000

Hai campaign chạy **độc lập và có thể chồng nhau**. Người thuộc First vẫn đi mời và đua Top để nhận thêm.

### 4.1 First 1.000 (đăng ký sớm)
- Điều kiện: `joinIndex <= FIRST_SLOTS`, kiểm tra bằng `isEarlyJoin(joinIndex)`.
- **Chắc chắn có suất**, không phụ thuộc điểm hay deadline. Campaign First không đóng theo ngày, nó tự đóng khi đủ 1.000 người.
- First **không** loại người đó khỏi bảng Top: người First cũng có hạng Top.

### 4.2 Top 1.000 (đua theo điểm)
- Xếp **toàn bộ** người đăng ký (kể cả người First) theo `RANK_ORDER = { invites: -1, joinIndex: 1 }`:
  1. Điểm cao đứng trước.
  2. Bằng điểm thì ai đăng ký trước (`joinIndex` nhỏ hơn) đứng trước.
- `rank` = số người đứng trên + 1, **mọi người đều có hạng** (không còn `null`). Hạng 1 đến 1.000 là Top.
- Hệ quả đã chấp nhận: lúc mới mở, nhóm First với 0 lượt mời chiếm kín Top 1.000. Người đăng ký từ #1.001
  phải mời được ít nhất 1 người mới chen vào được.
- Trước `TOP_DEADLINE`, hạng **thay đổi theo thời gian**. Chỉ hạng **tại deadline** (bản chốt) mới nhận quà Top.

### 4.3 Hàm quyết định
```js
isVip({ early, inTop }) = early || inTop
entitlementOf({ early, inTop }) =
  isVip ? { budget: (early ? 100000 : 0) + (inTop ? 100000 : 0), pools: ['vip', 'standard'] }
        : { budget: 50000, pools: ['standard'] }
```

### 4.4 Đồng hồ campaign (`server/config/campaign.js`)
Ba biến môi trường, đều **tuỳ chọn**, và phải là ISO 8601 **có múi giờ** (ví dụ `2026-12-31T23:59:59+07:00`).
Thiếu múi giờ hoặc sai định dạng thì `getCampaign()` ném lỗi và **server từ chối khởi động**. Server đọc
`getCampaign()` ngay lúc khởi động để lỗi lộ ra sớm.

| Biến | Ý nghĩa |
|---|---|
| `TOP_START` | Lúc mở campaign, chỉ dùng để vẽ cung đếm ngược ở hero |
| `TOP_DEADLINE` | Hết giờ đua Top: ngừng cộng lượt mời, giỏ bị khoá cho tới khi `finalize` |
| `REPICK_DEADLINE` | Hạn chọn lại sau finalize. **Phải sau** `TOP_DEADLINE`, và không được có khi thiếu `TOP_DEADLINE` |

Thiếu `TOP_DEADLINE` thì campaign chưa có hạn: giai đoạn luôn là `open`, không chặn gì, server chỉ ghi cảnh báo
lúc khởi động. Mỗi lần gọi `getCampaign()` đọc lại `process.env` nên đổi `.env` chỉ cần khởi động lại.

### 4.5 Giai đoạn (`phase`) của một người
`phaseOf(user)` quyết định giỏ có ghi được không:

| Giai đoạn | Khi nào | `inTop` lấy từ đâu | Giỏ |
|---|---|---|---|
| `open` | Trước `TOP_DEADLINE` (hoặc chưa đặt deadline) | Hạng hiện tại, tính lại mỗi lần đọc | Chọn tạm, sửa thoải mái, ngân sách theo hạng hiện tại |
| `frozen` | Từ `TOP_DEADLINE`, user đăng ký **trước** deadline, chưa có `user.final` | Hạng hiện tại (đã đứng yên) | Chặn ghi, **423**, chờ `finalize` |
| `repick` | Đã `finalize` (có `user.final`), hoặc là người đăng ký muộn, và chưa tới `REPICK_DEADLINE` (hoặc chưa đặt hạn này) | `user.final` (đã chốt) | Sửa được trong quyền lợi đã chốt. Người `needsRepick` chọn xong thì ghi `repickedAt` |
| `closed` | Như `repick` nhưng đã qua `REPICK_DEADLINE` | `user.final` | Khoá hẳn, **423** |

**Người đăng ký muộn** (`createdAt >= TOP_DEADLINE`, `isLateRegistrant`) đứng ngoài cuộc đua Top:
- `inTop` luôn `false`, không bao giờ `frozen`, `finalize` không chốt gì cho họ (không có `user.final`).
- Trước `REPICK_DEADLINE` họ chọn được (`repick`), sau đó `closed`.
- Quyền lợi: First nếu `joinIndex` vẫn <= 1.000, còn lại 50.000đ Standard.

**Bỏ cơ chế "chốt ở lần Reserve đầu tiên".** `getEntitlement` không đọc `reservation.budget`, `allowedPools`
và `lockedRank` nữa. Các field này vẫn nằm trong schema nhưng không còn được ghi. `lockedPrices` **vẫn giữ**:
mã đã chọn giữ giá lúc chọn. Dữ liệu cũ đã có bản chốt kiểu cũ được tính lại theo luật mới.

### 4.6 Chốt Top sau deadline (script)
Thứ tự vận hành xem [README, mục "Chốt Top 1.000"](../README.md).

**`npm run finalize`** (`server/scripts/finalize-top.js`, logic ở `finalize.service.js`):
1. Từ chối chạy nếu `now < TOP_DEADLINE`.
2. Duyệt user **đăng ký trước deadline** theo `RANK_ORDER`, gán `topRank` theo vị trí (không gọi `rankOf` từng người).
   Người đăng ký muộn không được xếp hạng.
3. Ghi `user.final = { early, topRank, inTop, budget, pools, finalizedAt, needsRepick }`. Hạng 1 đến 1.000 là `inTop`.
4. Giỏ **không hợp lệ** (có mã ngoài `pools`, mã thiếu giá, hoặc tổng theo `lockedPrices` > `budget`) thì
   `needsRepick = true` và gọi `sendRepickEmail`. Hàm này hiện **chỉ in ra console** (mailer chưa gắn nhà cung cấp).
5. Idempotent: user đã có `final` bị bỏ qua nhưng vẫn chiếm một vị trí trong bảng hạng nên hạng của người khác
   không đổi giữa các lần chạy. Ghi theo điều kiện `final: { $exists: false }` nên hai lần chạy song song không ghi đè nhau.
6. Gửi mail **sau** khi đã ghi. Mail lỗi không làm dừng run mà được gom vào `mailFailed`; script in danh sách,
   **exit 1**, và operator phải gửi tay (chạy lại sẽ không gửi lại vì user đã có `final`).
7. In bảng tổng kết: người xét, First, Top, cộng dồn, giỏ phải chọn lại, đã chốt từ trước.

**`npm run close-repick`** (`close-repick.js`):
1. Từ chối chạy nếu `now < REPICK_DEADLINE`.
2. Với user `needsRepick` mà chưa `repickedAt` và chưa `autoTrimmedAt`: cắt giỏ theo thứ tự đã chọn, giữ mã
   thuộc `pools`, có giá, và còn vừa `budget`. Một mã đắt không chặn mã rẻ phía sau. Ghi `autoTrimmedAt`.
3. Trả `trimmed`, `emptied`, `emptiedEmails`. Giỏ rỗng sau khi cắt chỉ được **in cảnh báo kèm danh sách email**.

## 5. Quyền lợi (entitlement)

| Trường hợp | Ngân sách | Nhóm được chọn |
|---|---|---|
| Chỉ thuộc First 1.000 | 100.000đ | VIP + Standard |
| Chỉ thuộc Top 1.000 | 100.000đ | VIP + Standard |
| Vừa First vừa Top | **200.000đ** (cộng dồn, chọn chung một giỏ) | VIP + Standard |
| Không thuộc nhóm nào | 50.000đ | Chỉ Standard |

Profile và `/reserve/options` trả `early`, `rank`, `inTop`, `budget`, `vip` (= `early || inTop`); FE không tự cộng ngân sách.

### Nguồn quyền lợi
- Có `user.final`: trả đúng bản đã chốt (`final.budget`, `final.pools`, `final.inTop`, `final.topRank`).
- Chưa có: tính theo `{ early, inTop }` hiện tại, với `inTop = rank <= 1.000 && !người đăng ký muộn`.
- Quyền lợi đã chốt không đổi dù sau đó có người mời thêm, vì sau deadline điểm đã đứng yên.

### Bản xem thử
Không có token (hoặc token hết hạn) thì `/reserve/options` trả `preview: true`. Server áp tạm 100.000đ, cả hai
nhóm, `rank: null`. `phase` của bản xem thử là giai đoạn của một người đăng ký ngay bây giờ: `open` trước
deadline, sau đó `repick` hoặc `closed`. Lúc bấm nhận vẫn bị chặn 401 vì chưa có token.

## 6. Chọn cổ phiếu (Reserve)

### Danh mục
| Nhóm (`pool`) | Hạng trong catalog | Số mã | Ví dụ |
|---|---|---|---|
| `vip` | `gold` (VN30) | 30 | ACB, FPT, HPG, VCB, VIC, VNM… |
| `standard` | `silver` + `copper` | 10 + 10 | PLX, TPB, REE… / PNJ, KDH, KBC… |

Hai nhóm không có mã trùng nhau. Mã được phân về nhóm qua `POOL_OF_TICKER`, và nhóm được lưu
thành `groupType: 'VIP' | 'STANDARD'` trong collection `prices`.

### Điều kiện khi nhận (server kiểm tra theo thứ tự)
1. Phải có token phiên hợp lệ, nếu không trả **401**.
2. Giỏ không bị khoá: `phase` là `frozen` hoặc `closed` thì trả **423** (kèm `phase`), chặn **trước** mọi kiểm tra khác.
3. Chọn từ 1 đến 100 mã. Mã trùng tự được gộp, mã viết thường tự chuyển thành chữ hoa.
4. Mọi mã phải nằm trong `RESERVABLE_TICKERS`. Nếu không, trả **400**.
5. Mọi mã phải thuộc nhóm người dùng được phép chọn. Nếu không, trả **400** kèm `wrongPool` nêu đích danh mã sai.
6. Mọi mã phải có giá. Thiếu giá thì trả **503** kèm `missing`, không âm thầm tính sai tổng.
7. **Tổng giá ≤ ngân sách.** Mỗi mã tính **1 cổ phiếu** theo giá của nó. Vượt thì trả **400** kèm `totalValue` và `budget`.
8. Nhận lại thì **ghi đè** lựa chọn cũ. Giỏ được ghi bằng đường dẫn chấm (`reservation.tickers`…), nên field cũ trong document không bị xoá.
9. Ở `phase = repick`, người `needsRepick` chưa `repickedAt` thì cùng lần ghi đó đặt `final.repickedAt`, để `close-repick` không cắt giỏ vừa chọn.

### Giá
- Reserve **chỉ đọc snapshot** trong collection `prices` và không bao giờ gọi trực tiếp nhà cung cấp giá.
- Giá dùng để tính = giá đã chốt (`lockedPrices`) **hợp với** snapshot hiện tại. Mã đã chọn giữ
  giá cũ, mã mới chọn thì chốt theo giá tại thời điểm chọn.
- `npm run prices` cập nhật snapshot. Nếu nguồn giá lỗi, snapshot cũ được **giữ nguyên**. Mã nào
  nguồn không trả giá thì giữ giá cũ của mã đó.
- `/api/reserve/options` chỉ trả giá của những mã người dùng **được phép chọn**, để không lộ giá ngoài quyền.
- Cảnh báo lúc khởi động: server cảnh báo khi chưa có bảng giá, khi bảng giá cũ hơn 48 giờ, và
  khi một bậc không mua nổi mã rẻ nhất trong nhóm của nó (`checkBudgetFeasibility`).

### Phía FE (ReserveModal, App)
- Chỉ hiển thị những nhóm có trong `opts.pools`. Người bậc Tiêu chuẩn **không thấy** nhóm VIP.
- Mã chưa chọn bị làm mờ nếu chưa có giá hoặc giá lớn hơn phần ngân sách còn lại. Mã đã chọn thì luôn bấm được để bỏ ra.
- Nút "Nhận" chỉ bật khi người dùng đã đăng nhập, giỏ có ít nhất 1 mã, quyền chọn đã tải xong và không có request nào đang chạy.
- Người chưa đăng nhập vẫn chọn được giỏ. Giỏ được giữ ở `App` (`pendingBasket`) và tự gửi đi sau khi đăng nhập xong.
- **Người dùng cũ đăng nhập bằng OTP cũng được áp giỏ đã chọn lúc chưa đăng nhập**: giỏ đó **ghi đè** giỏ đã lưu trước đó
  (`handleJoined` chạy cho cả đăng ký mới lẫn `alreadyRegistered`).
- **Không mất giỏ âm thầm.** `pendingBasket` chỉ được xoá khi `api.reserve` thành công. Lỗi thì giữ giỏ, mở lại
  `ReserveModal` kèm lỗi của server (`initialError`). Mã server báo `wrongPool` được **giữ nguyên trong giỏ
  ở trạng thái lỗi** để người dùng bỏ ra, không bị lọc đi.
- Nhãn ngân sách:
  - Bản xem thử: "Ngân sách dự kiến".
  - Người thuộc First (kể cả First + Top): "Ngân sách First 1.000". Con số bên cạnh vẫn là `budget` server trả, đã cộng dồn nên là 200.000đ nếu có cả Top.
  - Người còn lại: "Ngân sách hạng #N" (N là hạng Top hiện tại).

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

| Endpoint | Token | Trả về |
|---|---|---|
| `/api/stats` | không | `{ registered, firstSlots, firstRemaining, totalSlots, topRemaining, remaining, topCutoff, topStart, topDeadline, last24h, recent }` |
| `/api/leaderboard` | không | `{ top: [{ rank, masked, points, first }], page, pageSize, total, totalPages, cutoff }` |
| `/api/leaderboard/first` | không | `{ rows: [{ joinIndex, masked, at }], page, pageSize, total, totalPages, firstRemaining }` |
| `/api/waitlist/check` | không | `{ exists }` |
| `/api/waitlist/request-otp` | không | gửi OTP |
| `/api/waitlist/verify` | không | `{ profile, token }`, thêm `alreadyRegistered: true` nếu email đã đăng ký (200, không còn 409) |
| `/api/waitlist/me` | bắt buộc | `profile` |
| `/api/waitlist/logout` | bắt buộc | `{ ok: true }`, xoá phiên |
| `/api/reserve/options` | tuỳ chọn | `{ rank, early, inTop, budget, pools, phase, preview, selected, prices }` |
| `/api/reserve` | bắt buộc | `{ ok, tickers, totalValue, budget }` |
| `/api/catalog` | không | `{ totalSlots, entitlements, pools, stocks }` |

Mã lỗi riêng của đợt này: **401** thiếu hoặc sai token, **423** giỏ đang khoá (`frozen` hoặc `closed`).

### Cách tính các con số trong stats
- `firstRemaining = max(0, FIRST_SLOTS − số người có joinIndex ≤ 1.000)`
- `topRemaining = max(0, TOTAL_SLOTS − registered)`. Top xếp trên toàn bộ người đăng ký nên chừng nào chưa đủ
  1.000 người thì ai cũng đang trong Top. Đủ rồi thì về 0, chỉ còn cách mời bạn để vượt `topCutoff`.
- `remaining = firstRemaining + topRemaining`. Giữ để không vỡ client cũ; hai campaign chồng nhau nên đây
  không phải số người còn vào được VIP.
- `topCutoff` là điểm của người hạng 1.000 trên toàn bộ user, `null` khi chưa đủ 1.000 người.
- `topStart`, `topDeadline` là chuỗi ISO hoặc `null` khi chưa đặt biến môi trường.
- `last24h` là số người đăng ký trong 24 giờ gần nhất.
- `recent` là 12 người đăng ký gần nhất, email đã được che.

### Bảng xếp hạng Top
- Xếp **toàn bộ** user (kể cả First). `total` là số người đã có `joinIndex`. Mỗi dòng có `first: true` nếu thuộc First, để FE gắn huy hiệu.
- `cutoff` là điểm của người đứng hạng 1.000, tức ngưỡng vào Top. Giá trị là `null` khi chưa đủ 1.000 người.
- `page` không hợp lệ thì quay về trang 1. `page` vượt quá số trang thì trả `top: []`.

### Danh sách First
- Chỉ người có `joinIndex <= 1.000`, sắp `joinIndex` giảm dần (mới nhất lên đầu). Không có điểm, chỉ để thông tin.
- `page` vượt quá số trang thì trả `rows: []`.

### Profile
```js
{ email, early, joinIndex, rank, inTop, budget, vip, registered, refCode, invites }
```

| Trường | Ý nghĩa |
|---|---|
| `early` | Người dùng thuộc First 1.000 |
| `joinIndex` | Thứ tự đăng ký |
| `rank` | Hạng Top trên toàn bộ user, **mọi người đều có** |
| `inTop` | Đang trong Top 1.000. Có `user.final` thì lấy theo bản chốt. Người đăng ký muộn luôn `false` |
| `budget` | First + Top cộng dồn |
| `vip` | `early \|\| inTop`. Server tự quyết định, FE chỉ đọc cờ này |

### Che email
Email được che **ở server** trước khi trả ra API công khai, theo dạng
`nguyenvana@gmail.com` → `ng•••••a@gmail.com`. Số dấu chấm luôn cố định là 5, để không lộ độ dài
email. Phần domain được giữ nguyên.

## 9. Hiển thị phía FE

### Hero / Scarcity ([`src/components/Scarcity.jsx`](../src/components/Scarcity.jsx))
- Có hai vòng tròn: **First 1.000** (màu vàng `#D69A00`, ghi chú "Đăng ký sớm") và **Top 1.000** (màu `--accent`, ghi chú "Theo điểm mời").
- Vòng First, và vòng Top khi `topRemaining > 0`: giữa vòng hiển thị số suất **còn lại** dạng `X / 1.000`. Độ dài cung
  ngoài bằng % suất còn lại, bắt đầu ở 12 giờ và chạy theo chiều kim đồng hồ. Khi còn suất, cung luôn giữ tối thiểu 1,5% để không trông như đã hết.
- **Vòng Top khi `topRemaining === 0`** chuyển sang dạng kết hợp:
  - Giữa vòng hiện ngưỡng "≥ `topCutoff` đ", kèm dòng đếm ngược tới `topDeadline` (hook `useCountdown`).
  - Cung thể hiện thời gian còn lại, tính từ `topStart` tới `topDeadline`. Thiếu `topStart` thì vẽ đầy cung. Sau deadline cung về rỗng.
  - `topCutoff = 0` thì thay dòng ngưỡng bằng "Mời 1 bạn để vào Top". Không có deadline thì chỉ hiện ngưỡng.
- Số liệu lấy từ `/api/stats`, App gọi lại mỗi 30 giây và tạm ngừng khi tab bị ẩn. Ở khung hình
  đầu tiên, trước khi có stats, cả hai vòng được coi là còn nguyên suất.

### Thẻ kết quả sau đăng nhập ([`SignupCard.jsx`](../src/components/SignupCard.jsx))
| Người xem | Số hiển thị | Pill |
|---|---|---|
| Chỉ First | "Bạn là người đăng ký thứ #`joinIndex`" và "Hạng Top 1.000 #`rank`" | `First 1.000 · VIP` |
| Chỉ Top | "Hạng của bạn trong cuộc đua Top 1.000 #`rank`" | `Top 1.000 · VIP` |
| First + Top | như dòng First | `First + Top · VIP` |
| Tiêu chuẩn | như dòng Top | `Tiêu chuẩn` |

- Phần mời bạn hiện cho **mọi người**: "Mời bạn bè, leo hạng nhanh hơn" kèm "+10 điểm".
- Ô quà hiển thị "Cổ phiếu trị giá" theo `me.budget`.
- Email đã đăng ký thì đi thẳng sang bước OTP, kèm câu "Email này đã đăng ký — nhập mã để xem kết quả".
- Khi mở trang, nếu `sessionStorage` có token thì gọi `/waitlist/me` để khôi phục kết quả (tải lại trong cùng tab).

Bậc quà (màu sắc) lấy từ `tierOf(me)` trong [`src/lib/catalog.jsx`](../src/lib/catalog.jsx). Hàm này chỉ đọc `me.vip`.

### Trang Phần thưởng ([`RewardsPage.jsx`](../src/components/RewardsPage.jsx), `#/rewards`)
- Thẻ trạng thái có 5 biến thể:
  - Chưa đăng nhập:
    - Còn suất First: "Còn X suất First 1.000".
    - Hết suất First: "Đã hết suất First — vào Top 1.000".
  - First + Top: "Bạn có cả First và Top · 200.000đ".
  - Chỉ First: "Bạn đã chắc suất VIP".
  - Chỉ Top: "Bạn đang trong Top 1.000".
  - Tiêu chuẩn: "Bạn đang ở hạng Tiêu chuẩn".
- Thanh điểm so với `cutoff` hiện cho **mọi** người đã đăng nhập (ai cũng có hạng), khi `cutoff` không phải `null`.
- Thẻ VIP hiển thị số suất còn lại của **cả hai** đường vào và dòng "Có cả First và Top: cộng dồn 200.000đ".
- Có hai tab:
  - **"Top 1.000 · Bảng xếp hạng"** (mặc định): gắn huy hiệu "First" cho người thuộc First, có nút "Xem hạng của tôi" và
    dòng hạng được ghim ở cuối bảng cho **mọi** người đã đăng nhập (kể cả First). Có dòng đếm ngược "Chốt bảng Top: …"
    tới `topDeadline`, hoặc "Bảng Top đã chốt" sau deadline.
  - **"First 1.000 · Danh sách"**: chỉ tải khi mở tab lần đầu, hiện "Còn X / 1.000 suất".

---

## 10. Điểm chưa khớp và rủi ro đã biết

- Hero ghi "Nhận cổ phiếu VIP — lên tới 10 mã" (và dòng "Join NEXXA For 10 VIP Stocks") vẫn **chưa khớp**: code
  **không giới hạn 10 mã**. Số mã chọn được thực tế do ngân sách quyết định, giới hạn kỹ thuật là 100 mã.
- **Ghi giỏ song song chưa xử lý**: hai lần "Nhận" chen nhau thì lần ghi sau thắng.
- **Email mời chọn lại chưa gửi thật**: `sendRepickEmail` chỉ in ra console vì `mailer.service.js` chưa gắn nhà
  cung cấp. Người cần chọn lại sẽ không nhận được mail cho tới khi gắn SMTP/Resend, nên lúc đó phải gửi tay
  (xem README, mục "Chốt Top 1.000").
- **Người bị cắt giỏ rỗng chỉ được ghi log**: `close-repick` in danh sách email có giỏ rỗng, không có thông báo nào gửi cho họ.
- `server/db/connect.js` **in cả `MONGODB_URI`** (có mật khẩu) ra log lúc kết nối. Cần bỏ hoặc che trước khi lên thật.
- `STANDARD_SLOTS = 9.000` chỉ dùng để hiển thị. Server **không** chặn đăng ký khi vượt quá.
- Ngân sách 50.000đ có thể không mua nổi mã Standard nào nếu giá tăng. Server có cảnh báo lúc
  khởi động, nhưng cách xử lý là quyết định kinh doanh.
- "First 1.000" dựa vào `joinIndex`. Nếu xoá user trong DB, bộ đếm **không** lùi lại, nên suất sớm
  thực tế sẽ ít hơn 1.000.
- `TierList.jsx` đang bị tắt và vẫn dùng `tierOfRank` theo luật cũ (không biết cộng dồn First + Top). Cần sửa nếu bật lại.
- Chưa đặt `REPICK_DEADLINE` thì người đã finalize (và người đăng ký muộn) chọn lại được **mãi mãi**, và `close-repick` không chạy được.
- Dữ liệu `reservation.budget` kiểu cũ trong DB thật không còn được tôn trọng. Cần kiểm tra lại DB trước khi deploy.

## 11. Bản đồ file

| Luật | File |
|---|---|
| Hằng số suất, ngân sách, danh mục, quyền lợi, `isVip` | `shared/catalog.js` |
| Hằng số OTP, điểm, phân trang, `SESSION_TTL_MS` | `server/config/constants.js` |
| Đồng hồ campaign, `phaseOf`, người đăng ký muộn | `server/config/campaign.js` |
| Đăng ký, xếp hạng, stats, profile, bảng First | `server/services/waitlist.service.js` |
| Quyền lợi (bản chốt hoặc hạng hiện tại) | `server/services/entitlement.service.js` |
| Chốt Top, cắt giỏ sau hạn chọn lại | `server/services/finalize.service.js`, `server/scripts/finalize-top.js`, `server/scripts/close-repick.js` |
| Token phiên | `server/services/session.service.js`, `server/middlewares/session.middleware.js`, `server/models/session.model.js` |
| Reserve (kiểm tra và lưu) | `server/services/reserve.service.js` |
| Giá và cảnh báo | `server/services/price.service.js` |
| OTP | `server/services/otp.service.js` |
| Gửi mail (hiện chỉ console) | `server/services/mailer.service.js` |
| Che email / mã | `server/utils/mask.js`, `server/utils/codes.js` |
| Token phía client | `src/lib/api.js` |
| Context catalog FE (`tierOf`) | `src/lib/catalog.jsx` |
| Màu từng bậc, mã phổ biến, dữ liệu dự phòng | `src/lib/data.js` |
| Test luật | `server/tests/entitlement.test.js`, `waitlist.test.js`, `referral.test.js`, `session.test.js`, `campaign.test.js`, `finalize.test.js`, `reserve.test.js` |
