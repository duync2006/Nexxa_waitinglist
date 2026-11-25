# Rule nhận cổ phiếu v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chạy hai campaign First 1.000 và Top 1.000 song song, có cộng dồn quà. Top được chốt tại
deadline, sau đó có hạn chọn lại. Mọi API dữ liệu riêng được bảo vệ bằng token phiên cấp sau khi
xác thực OTP. Kèm theo là sửa lỗi mất giỏ và lỗi bộ đếm `joinIndex` bị hụt số.

**Architecture:**

- Luật quyền lợi vẫn nằm ở `shared/catalog.js`.
- Thời điểm campaign và giai đoạn (`phase`) nằm trong một module mới `server/config/campaign.js`.
  Module này đọc `process.env` **mỗi lần gọi** để test đổi deadline được.
- Việc chốt hạng và cắt giỏ nằm trong `server/services/finalize.service.js`. Hai script npm chỉ là
  lớp vỏ gọi vào đó.
- Token phiên là chuỗi ngẫu nhiên, server lưu hash trong collection `sessions` có TTL.

**Tech Stack:** Node (ESM) + Express 4, Mongoose 9, `node:test` + supertest, React 18 + Vite.
Không thêm dependency.

**Spec:** `docs/superpowers/specs/2026-11-26-reward-rules-v2-design.md`

## Global Constraints

- Không xoá field nào khỏi `userSchema`. Field cũ (`score`, `reservation.lockedRank`, `budget`,
  `allowedPools`) giữ trong schema nhưng không còn được ghi, riêng `score` vẫn ghi như cũ.
- Mọi API là POST, trừ `GET /r/:code`.
- Ngân sách: First 100.000đ, Top 100.000đ, cộng dồn được 200.000đ, người ngoài 50.000đ và chỉ chọn
  nhóm Standard. Ai có ít nhất một suất thì được chọn cả `['vip', 'standard']`.
- Hạng Top xếp trên **toàn bộ** user theo `{ invites: -1, joinIndex: 1 }`. Hạng 1 đến 1.000 là Top.
- `SESSION_TTL_MS = 12 * 60 * 60 * 1000`. Token gửi qua header `Authorization: Bearer <token>`. Phía
  client lưu ở `sessionStorage`, key `nexxa_session`.
- Biến môi trường mới: `TOP_START`, `TOP_DEADLINE`, `REPICK_DEADLINE`, đều là ISO 8601 có múi giờ
  và đều tuỳ chọn. Thiếu `TOP_DEADLINE` thì giai đoạn luôn là `open`.
- Mã lỗi mới: **401** khi thiếu hoặc sai token, **423** khi giỏ đang khoá (`frozen`/`closed`).
- Không thêm dependency.
- Test chạy bằng `npm test`, trên database có tên kết thúc bằng `_test`.
- Thông báo cho người dùng viết bằng tiếng Việt, đúng câu chữ ghi trong từng task.

## Review Focus

1. Token hết hạn ở server trong lúc người dùng đang chọn giỏ. Kỳ vọng: frontend nhận 401, xoá token,
   đưa về bước nhập email, và **giữ** giỏ trong `pendingBasket`. Thuộc Task 8.
2. Chạy `finalizeTop` khi tổng số user dưới 1.000. Kỳ vọng: mọi user có `inTop = true` và không ai
   bị đặt `needsRepick` chỉ vì lý do này. Thuộc Task 5.
3. User chưa từng chọn giỏ, hoặc giỏ rỗng, lúc finalize. Kỳ vọng: không bị đặt `needsRepick` và
   không nhận email. Thuộc Task 5.
4. Mã trong giỏ không có trong `lockedPrices` và cũng không có trong snapshot giá lúc cắt giỏ. Kỳ
   vọng: mã đó bị loại khỏi giỏ, script không crash. Thuộc Task 6.
5. `REPICK_DEADLINE <= TOP_DEADLINE`, hoặc ngày viết sai định dạng. Kỳ vọng: `getCampaign()` ném lỗi
   ghi rõ tên biến, thay vì âm thầm coi như không có deadline. Thuộc Task 4.

---

### Task 1: Bộ đếm `joinIndex` không hụt số

**Files:**
- Modify: `server/models/user.model.js`: đổi `joinIndex` thành `{ type: Number }`, bỏ
  `required`. Thêm comment giải thích lý do.
- Modify: `server/services/waitlist.service.js`: `join()`, cùng `RACE_FILTER`/`EARLY_FILTER` và mọi
  query đếm.
- Test: `server/tests/waitlist.test.js`

**Interfaces:**
- Produces: `NUMBERED = { joinIndex: { $exists: true } }`, export từ `waitlist.service.js`. Mọi
  query xếp hạng hoặc thống kê đều phải gộp điều kiện này vào. `join(email, refCode)` giữ nguyên
  chữ ký và kết quả trả về `{ user, created }`, trong đó `user.joinIndex` luôn đã có giá trị.

- [ ] **Step 1: Viết test thất bại**

```js
it('hai lần join cùng email chạy song song chỉ tiêu một số joinIndex', async () => {
  await Promise.all([join('dup@test.local'), join('dup@test.local')]);
  const { user } = await join('next@test.local');
  assert.equal(user.joinIndex, 2);
  assert.equal(await User.countDocuments({}), 2);
});
```

- [ ] **Step 2: Chạy `npm test`.** Kỳ vọng: test FAIL với `user.joinIndex` bằng 3, hoặc gặp lỗi
  `ValidationError` của schema.

- [ ] **Step 3: Cài đặt `join()` theo thứ tự trong spec §6.5**
  1. `User.create` không có `joinIndex` và `score`. Gặp lỗi 11000 thì trả user đã có, như cũ.
  2. Gọi `nextJoinIndex()`.
  3. Chạy `updateOne { $set: { joinIndex, score: joinIndex } }`.
  4. Bước 2 hoặc 3 lỗi thì `deleteOne({ _id })` rồi ném lỗi lại.
  5. Chỉ cộng lượt mời cho người mời **sau** khi đã có số.
  6. Trả về user đã gán `joinIndex`.

  Gộp `NUMBERED` vào mọi `countDocuments`/`find` trong `getStats`, `getLeaderboard`, `rankOf` và
  `listRecentJoins`.

- [ ] **Step 4: Chạy `npm test`.** Kỳ vọng: toàn bộ PASS.

- [ ] **Step 5: Commit** với message `fix: cấp joinIndex sau khi tạo user để email trùng không tiêu số`

---

### Task 2: Token phiên cùng các endpoint đăng nhập, `/me`, `/logout`

**Files:**
- Create: `server/models/session.model.js`, export thêm từ `server/models/index.js`
- Create: `server/services/session.service.js`
- Create: `server/middlewares/session.middleware.js`
- Modify: `server/utils/app-error.js`: thêm `unauthorized` (401) và `locked` (423)
- Modify: `server/config/constants.js`: thêm `SESSION_TTL_MS`
- Modify: `server/controllers/waitlist.controller.js`, `server/routes/waitlist.routes.js`
- Modify: `server/tests/helpers/db.js`: `resetDb` xoá thêm `Session`; viết lại `joinViaApi`; thêm
  `authed`
- Create: `server/tests/session.test.js`
- Modify: các test đang đọc `verifyRes.body.<field>` thì đổi thành `verifyRes.body.profile.<field>`

**Interfaces:**
- Produces:
  - `Session`, schema `{ hash: String unique, userId: ObjectId, createdAt: Date, expiresAt: Date }`,
    có TTL index trên `expiresAt`, collection `sessions`.
  - `createSession(userId) -> Promise<string>`. Token là `randomBytes(32).toString('base64url')`.
    Lưu `sha256` của token.
  - `userFromToken(token) -> Promise<UserDoc|null>`. Session hết hạn thì trả null, kể cả khi TTL
    chưa kịp xoá.
  - `destroySession(token) -> Promise<void>`.
  - Middleware `requireSession(req, res, next)` gắn `req.user`, ném 401 với thông báo
    `'Phiên đăng nhập đã hết hạn. Vui lòng xác thực lại email.'`.
    `optionalSession` gắn `req.user` (có thể là `null`), không bao giờ ném lỗi.
  - Helper test:
    - `joinViaApi(request, app, email, ref) -> Promise<Response>`, body `{ profile, token, alreadyRegistered? }`.
    - `authed(req, token)` trả `req.set('Authorization', 'Bearer ' + token)`.
- Hình dạng API:
  - `/waitlist/verify` trả 200 `{ profile, token }`. Email đã đăng ký thì trả 200
    `{ profile, token, alreadyRegistered: true }`, không còn 409.
  - `/waitlist/check` trả `{ exists }`.
  - `/waitlist/me` (có `requireSession`) trả `profile`.
  - `/waitlist/logout` (có `requireSession`) trả `{ ok: true }`.

- [ ] **Step 1: Viết test thất bại** trong `session.test.js`:
  - `'verify trả token và profile'`: `res.body.token` là chuỗi dài hơn hoặc bằng 40 ký tự, và
    `res.body.profile.email === 'a@test.local'`.
  - `'email đã đăng ký xác thực lại thì 200 kèm token mới'`: `status === 200`,
    `alreadyRegistered === true`, và token khác token lần đầu.
  - `'check không trả profile'`: `deepEqual(res.body, { exists: true })`.
  - `'/me không token thì 401'` và `'/me có token thì trả profile đúng email'`.
  - `'logout xong token cũ thì 401'`.
  - `'session hết hạn thì 401'`: dùng `Session.updateOne` đặt `expiresAt` về quá khứ.

- [ ] **Step 2: Chạy `npm test`.** Kỳ vọng: các test mới FAIL.

- [ ] **Step 3: Cài model, service, middleware và controller** theo Interfaces ở trên. Token gốc
  không bao giờ được lưu vào DB.

- [ ] **Step 4: Cập nhật helper và các test cũ** để đọc theo hình dạng `{ profile, token }`. Ca test
  cũ nào kỳ vọng 409 cho email trùng thì đổi thành 200 kèm `alreadyRegistered`.

- [ ] **Step 5: Chạy `npm test`.** Kỳ vọng: toàn bộ PASS.

- [ ] **Step 6: Commit** với message `feat: token phiên sau OTP, /me, /logout; check không lộ profile`

---

### Task 3: Bảo vệ `/reserve` và `/reserve/options` bằng token

**Files:**
- Modify: `server/controllers/reserve.controller.js`, `server/routes/reserve.routes.js`
- Modify: `server/services/reserve.service.js`: `getOptions` và `saveSelection` nhận user thay
  vì email
- Modify: `server/tests/reserve.test.js`, `server/tests/entitlement.test.js`: gửi token thay
  vì `email`

**Interfaces:**
- Consumes: `requireSession`, `optionalSession`, `authed`, `joinViaApi` (Task 2).
- Produces:
  - `getOptions(user: UserDoc|null)`. Hình dạng kết quả như cũ, cộng thêm `inTop` và `phase` (Task 4
    sẽ điền `phase`; trong task này để `'open'`).
  - `saveSelection(user: UserDoc, rawTickers)`.

- [ ] **Step 1: Viết test thất bại** trong `reserve.test.js`:
  - `'không token thì 401'`.
  - `'token của A không ghi được giỏ của B dù body gửi email B'`: sau khi A gọi, giỏ của B trong DB
    vẫn là `undefined`.
  - `'options không token trả preview: true'`.

- [ ] **Step 2: Chạy `npm test`.** Kỳ vọng: FAIL.

- [ ] **Step 3: Cài đặt.**
  - `/reserve` dùng `requireSession`, `/reserve/options` dùng `optionalSession`.
  - Bỏ hẳn `requireEmail` và `findByEmail` ở hai luồng này.
  - Nhánh 403 "chưa tham gia waitlist" không còn cần, vì có token tức là đã có user.

- [ ] **Step 4: Sửa các test cũ của reserve/entitlement** để dùng token. Muốn lấy token cho user tạo
  thẳng trong DB, gọi `createSession(user._id)` trực tiếp.

- [ ] **Step 5: Chạy `npm test`.** Kỳ vọng: toàn bộ PASS.

- [ ] **Step 6: Commit** với message `feat: reserve dùng token phiên thay cho email trong body`

---

### Task 4: Luật song song, cộng dồn, đồng hồ campaign và các giai đoạn

**Files:**
- Modify: `shared/catalog.js`
- Create: `server/config/campaign.js`
- Modify: `server/services/waitlist.service.js`: `rankOf`, `toProfile`, `getLeaderboard`,
  `getStats`, và chặn cộng lượt mời trong `join()`
- Modify: `server/services/entitlement.service.js`
- Modify: `server/services/reserve.service.js`: kiểm tra `phase`
- Modify: `server/models/user.model.js`: thêm field `final` (không có default)
- Modify: `server/index.js`: gọi `getCampaign()` lúc khởi động để lỗi cấu hình hiện ngay
- Modify: `.env.example`: ba biến mới, kèm comment
- Modify: `server/tests/entitlement.test.js`, `server/tests/waitlist.test.js`
- Create: `server/tests/campaign.test.js`

**Interfaces:**
- Produces, trong `shared/catalog.js`:
  - `FIRST_BUDGET = 100000`, `TOP_BUDGET = 100000`, `REST_BUDGET = 50000`.
  - `entitlementOf({ early, inTop }) -> { key: 'top'|'rest', label, budget, pools }`. Trả `'top'`
    khi `early || inTop`, với budget = `(early ? FIRST_BUDGET : 0) + (inTop ? TOP_BUDGET : 0)` và
    pools `['vip','standard']`. Ngược lại trả `rest`.
  - `isVip({ early, inTop })`.
  - `ENTITLEMENTS` giữ nguyên hai phần tử `top` và `rest` để `/api/catalog` và các style ở frontend
    không vỡ. Label của `top` vẫn là `'VIP'`.
- Produces, trong `server/config/campaign.js`:
  - `getCampaign() -> { topStart: Date|null, topDeadline: Date|null, repickDeadline: Date|null }`.
    - Ngày sai định dạng thì ném `Error('TOP_DEADLINE không phải ngày hợp lệ: …')`.
    - `repickDeadline <= topDeadline` thì ném `Error('REPICK_DEADLINE phải sau TOP_DEADLINE')`.
    - Có `REPICK_DEADLINE` mà thiếu `TOP_DEADLINE` cũng ném lỗi.
  - `invitesOpen(now = new Date()) -> boolean`: đúng khi không có deadline hoặc `now < topDeadline`.
  - `phaseOf(user, now = new Date()) -> 'open'|'frozen'|'repick'|'closed'`:
    1. Không có `topDeadline`, hoặc `now < topDeadline`: `'open'`.
    2. Không phải bước 1 và `!user?.final`: `'frozen'`.
    3. Không phải hai bước trên, có `repickDeadline` và `now >= repickDeadline`: `'closed'`.
    4. Còn lại: `'repick'`.
- Produces, trong `entitlement.service.js`:
  `getEntitlement(user, now) -> { rank, early, inTop, budget, pools, phase }`. Có `user.final` thì
  dùng `final`, nếu không thì tính từ hạng hiện tại. Không còn đọc `reservation.budget`.
- Produces, trong `waitlist.service.js`:
  - `RANK_ORDER` giữ nguyên.
  - `rankOf(user) -> number`, đếm trên toàn bộ user và không bao giờ trả null.
  - `toProfile` thêm `inTop` và `budget`. `vip = early || inTop`.
  - Mỗi dòng của `getLeaderboard` thêm `first: boolean`. `cutoff` tính trên toàn bộ user.
  - `getStats` thêm `topCutoff: number|null`, `topStart: string|null`, `topDeadline: string|null`.
    `topRemaining = max(0, TOTAL_SLOTS − registered)`.
- Schema `final`:
  `{ early, topRank, inTop, budget, pools: [String], finalizedAt, needsRepick, repickedAt, autoTrimmedAt }`.
  Khai báo bằng sub-schema có `_id: false`.

- [ ] **Step 1: Viết test thất bại**
  - `entitlement.test.js`:
    - `'chỉ First (hạng > 1000) được 100.000đ'`. Tạo user `joinIndex = 1` có `invites = 0`, rồi tạo
      1.000 user khác có `invites = 1`.
    - `'chỉ Top được 100.000đ'`.
    - `'First và Top được 200.000đ'`.
    - `'không thuộc nhóm nào được 50.000đ, chỉ standard'`.
    - `'First có hạng Top là số, không còn null'`.
  - `campaign.test.js`: dùng `process.env` và khôi phục trong `afterEach`.
    - `'thiếu TOP_DEADLINE thì phase open'`.
    - `'sau deadline chưa finalize thì frozen'`.
    - `'có final và trước REPICK_DEADLINE thì repick'`.
    - `'sau REPICK_DEADLINE thì closed'`.
    - `'REPICK_DEADLINE trước TOP_DEADLINE thì getCampaign ném lỗi'`.
    - `'ngày sai định dạng thì ném lỗi nêu tên biến'`.
    - `'sau deadline join qua ref không cộng invites nhưng vẫn lưu referrer'`.
    - `'reserve khi frozen thì 423'`, với thông báo
      `'Đang chốt kết quả Top 1.000. Vui lòng quay lại sau.'`.
    - `'reserve khi closed thì 423'`, với thông báo `'Đã hết hạn chọn cổ phiếu.'`.
  - `waitlist.test.js`:
    - `'leaderboard gồm cả người First và gắn first: true'`.
    - `'stats trả topCutoff và topDeadline'`.

- [ ] **Step 2: Chạy `npm test`.** Kỳ vọng: các test mới FAIL.

- [ ] **Step 3: Cài đặt** theo Interfaces ở trên.
  - Bỏ hẳn `RACE_FILTER`.
  - Trong `join()`, `$inc invites` và `score` chỉ chạy khi `invitesOpen()`. `$push referees` thì
    luôn chạy.
  - Trong `saveSelection`:
    - Gặp `frozen` hoặc `closed` thì ném `locked(...)`.
    - Gặp `repick` mà `user.final.needsRepick` thì ghi thêm `final.repickedAt` cùng lần ghi giỏ.
    - Bỏ việc ghi `lockedRank`, `budget`, `allowedPools`.
    - **Vẫn** ghi `lockedPrices` và `totalValue`.

- [ ] **Step 4: Sửa các test cũ** đang khẳng định luật nhóm đua tách riêng (`rank === null` với
  người First, leaderboard bỏ qua người First, chốt quyền lợi ở lần nhận đầu). Viết lại theo luật mới
  hoặc xoá. Xoá ca nào thì ghi lý do trong commit.

- [ ] **Step 5: Chạy `npm test`.** Kỳ vọng: toàn bộ PASS.

- [ ] **Step 6: Commit** với message `feat!: First và Top song song, cộng dồn 200k, các giai đoạn theo deadline`

---

### Task 5: `finalizeTop` và `npm run finalize`

**Files:**
- Create: `server/services/finalize.service.js`
- Create: `server/scripts/finalize-top.js`
- Modify: `server/services/mailer.service.js`: thêm `sendRepickEmail`
- Modify: `package.json`: script
  `"finalize": "node --env-file-if-exists=.env server/scripts/finalize-top.js"`
- Create: `server/tests/finalize.test.js`

**Interfaces:**
- Consumes: `getCampaign`, `entitlementOf`, `RANK_ORDER`, `NUMBERED`, `isEarlyJoin`,
  `getPriceTable`.
- Produces:
  - `basketFits(tickers, priceOf: (t)=>number|undefined, { budget, pools }) -> boolean`. Trả false
    khi có mã ngoài `pools`, có mã không có giá, hoặc tổng vượt `budget`. Giỏ rỗng trả true.
  - `finalizeTop(now = new Date()) -> Promise<{ total, first, top, both, needsRepick, skipped }>`.
    - Ném `Error('Chưa tới TOP_DEADLINE')` khi `phaseOf` vẫn là open, hoặc khi không có deadline.
    - Duyệt user theo `RANK_ORDER` bằng cursor, gán `topRank = vị trí + 1`, và
      `inTop = topRank <= TOTAL_SLOTS`.
    - Bỏ qua user đã có `final`; đếm họ vào `skipped`.
    - `priceOf` dùng `lockedPrices` của user trước, thiếu thì lấy từ snapshot.
    - Giỏ không vừa thì đặt `needsRepick = true` và gọi
      `sendRepickEmail(email, { budget, pools, repickDeadline })`.
  - `sendRepickEmail(email, { budget, pools, repickDeadline }) -> Promise<void>`: chỉ in ra console.

- [ ] **Step 1: Viết test thất bại**
  - `'chốt đúng 1.000 người inTop khi có 1.005 user'`.
  - `'dưới 1.000 user thì tất cả inTop'`.
  - `'chạy lại lần hai không đổi gì, skipped = total'`.
  - `'người Top bị đẩy ra có giỏ chứa VCB thì needsRepick và có email'`. Spy `sendRepickEmail` bằng
    `mock.method`.
  - `'người First bị đẩy khỏi Top có giỏ 100k thì không needsRepick'`.
  - `'người chưa chọn giỏ thì không needsRepick, không email'`.
  - `'trước deadline thì ném lỗi'`.

- [ ] **Step 2: Chạy `npm test`.** Kỳ vọng: FAIL.

- [ ] **Step 3: Cài `basketFits`, `finalizeTop`, `sendRepickEmail`.** Script
  `finalize-top.js` làm bốn việc: kết nối DB, gọi `finalizeTop()`, in bảng tổng kết bằng
  `console.table`, đóng kết nối. Có lỗi thì `process.exitCode = 1`.

- [ ] **Step 4: Chạy `npm test`.** Kỳ vọng: PASS.

- [ ] **Step 5: Commit** với message `feat: npm run finalize chốt Top 1.000 và đánh dấu giỏ cần chọn lại`

---

### Task 6: `closeRepick` và `npm run close-repick`

**Files:**
- Modify: `server/services/finalize.service.js`
- Create: `server/scripts/close-repick.js`
- Modify: `package.json`: script `"close-repick"`
- Modify: `server/tests/finalize.test.js`

**Interfaces:**
- Consumes: `basketFits` và hàm `priceOf` từ Task 5.
- Produces:
  - `trimBasket(tickers, priceOf, { budget, pools }) -> string[]`. Duyệt theo đúng thứ tự trong
    `tickers`. Giữ mã khi mã đó thuộc `pools`, có giá, và cộng thêm vẫn ≤ `budget`. Nếu không thì
    bỏ mã đó và **đi tiếp** xét mã sau.
  - `closeRepick(now = new Date()) -> Promise<{ trimmed, emptied }>`.
    - Ném lỗi khi `now < repickDeadline` hoặc không có `repickDeadline`.
    - Chỉ xử lý user `final.needsRepick && !final.repickedAt && !final.autoTrimmedAt`.
    - Ghi lại `reservation.tickers`, `reservation.totalValue` và `final.autoTrimmedAt`.

- [ ] **Step 1: Viết test thất bại**
  - `'cắt giữ đúng thứ tự, không vượt 50.000đ, bỏ mã VIP'`, với giỏ `['VCB','PLX','TPB','REE']`,
    mỗi mã 20.000đ, kết quả là `['PLX','TPB']`.
  - `'mã không có giá ở cả lockedPrices lẫn snapshot thì bị loại'`.
  - `'người đã repickedAt thì không bị cắt'`.
  - `'chạy lại lần hai không cắt lần nữa'`.
  - `'trước REPICK_DEADLINE thì ném lỗi'`.

- [ ] **Step 2: Chạy `npm test`.** Kỳ vọng: FAIL.

- [ ] **Step 3: Cài `trimBasket`, `closeRepick` và script.**

- [ ] **Step 4: Chạy `npm test`.** Kỳ vọng: PASS.

- [ ] **Step 5: Commit** với message `feat: npm run close-repick tự cắt giỏ người không chọn lại`

---

### Task 7: Danh sách FIRST 1.000

**Files:**
- Modify: `server/services/waitlist.service.js`, `server/controllers/stats.controller.js`,
  `server/routes/waitlist.routes.js`
- Modify: `server/models/user.model.js`: thêm index `{ joinIndex: -1 }`
- Modify: `src/lib/api.js`: thêm `firstList(page)`
- Test: `server/tests/waitlist.test.js`

**Interfaces:**
- Produces:
  - `getFirstList(page = 1, pageSize = LEADERBOARD_PAGE_SIZE) -> { rows: [{ joinIndex, masked, at }], page, pageSize, total, totalPages, firstRemaining }`.
  - Route `POST /api/leaderboard/first { page }`.

- [ ] **Step 1: Viết test thất bại**
  - `'chỉ gồm joinIndex <= 1000, sắp giảm dần'`. Tạo user có `joinIndex` 999, 1000 và 1001; kết quả
    `rows` có `joinIndex` là `[1000, 999]`.
  - `'email được che'`.
  - `'page vượt quá thì rows rỗng'`.

- [ ] **Step 2: Chạy `npm test`.** Kỳ vọng: FAIL.
- [ ] **Step 3: Cài đặt.**
- [ ] **Step 4: Chạy `npm test`.** Kỳ vọng: PASS.
- [ ] **Step 5: Commit** với message `feat: API danh sách First 1.000`

---

### Task 8: Frontend phần phiên đăng nhập và sửa lỗi mất giỏ

**Files:**
- Modify: `src/lib/api.js`
- Modify: `src/App.jsx`
- Modify: `src/components/SignupCard.jsx`
- Modify: `src/components/ReserveModal.jsx`

**Interfaces:**
- Consumes: các API ở Task 2 và Task 3.
- Produces, trong `api.js`:
  - `session.get()`, `session.set(token)`, `session.clear()`, làm việc với `sessionStorage` key
    `nexxa_session`, có bọc `try/catch`.
  - Hàm `call` tự gắn header `Authorization` khi có token. Gặp 401 thì `session.clear()` và phát
    sự kiện `window.dispatchEvent(new Event('nexxa:logout'))` trước khi ném lỗi.
  - `api.verify` trả `{ profile, token }` và tự gọi `session.set`.
  - `api.me()`, `api.logout()`.
  - `api.reserve(tickers)` và `api.reserveOptions()` không còn nhận email.
- Produces, trong `App`:
  - Lúc mở trang, nếu `session.get()` có token thì gọi `api.me()` và `setMe`.
  - Nghe sự kiện `nexxa:logout` để `setMe(null)`, **không** xoá `pendingBasket`.
  - `handleReset` gọi `api.logout()` (bỏ qua lỗi) rồi `setMe(null)`.
- Produces, trong `ReserveModal`: prop mới `initialError: { message, wrongPool?: string[] } | null`.
  Mã nằm trong `wrongPool`, hoặc nằm ngoài `opts.pools`, hiện ở ô đã chọn với class `chip-err` và
  nút bỏ. Không tự lọc đi.

- [ ] **Step 1: `api.js`** theo Interfaces ở trên.

- [ ] **Step 2: `SignupCard`.**
  - `check` trả `exists: true` thì gửi OTP luôn và hiện câu
    `'Email này đã đăng ký — nhập mã để xem kết quả.'` ở bước OTP.
  - Bỏ nhánh 409.
  - Sau `verify` thì gọi `onJoined(profile)`.

- [ ] **Step 3: `App.handleJoined`.**
  - `api.reserve(pendingBasket)` thành công thì `setPendingBasket([])`.
  - Thất bại thì giữ giỏ, gọi `setReserveError({ message: err.message, wrongPool: err.data?.wrongPool })`
    và `setReserveOpen(true)`.
  - Truyền `initialError={reserveError}` cho modal. Xoá `reserveError` khi modal đóng.

- [ ] **Step 4: `ReserveModal`.**
  - Hiện `initialError` thay cho `error` lúc mới mở.
  - Thêm class `chip-err` vào `src/styles.css` (viền đỏ, dùng biến màu lỗi đang có).

- [ ] **Step 5: Kiểm tra.**
  - Chạy `npm run build`. Kỳ vọng: build không lỗi.
  - Chạy `npm run dev` rồi thử tay bằng `devOtp` lấy từ console server:
    1. Chọn giỏ có VCB khi chưa đăng ký, rồi đăng ký bằng email có `joinIndex > 1000` và 0 lượt mời
       khi đã đủ 1.000 user. Seed DB dev bằng
       `node --env-file=.env server/scripts/seed-demo.js`. Kỳ vọng: modal mở lại, VCB có viền đỏ,
       giỏ còn nguyên.
    2. Tải lại trang trong cùng tab. Kỳ vọng: vẫn thấy kết quả.
    3. Mở tab mới. Kỳ vọng: về form đăng ký.
    4. Xoá document trong `sessions` rồi bấm "Nhận". Kỳ vọng: về form email, giỏ còn nguyên.

- [ ] **Step 6: Commit** với message `feat(fe): đăng nhập bằng OTP, token theo tab, không mất giỏ khi reserve lỗi`

---

### Task 9: Frontend phần thẻ kết quả, trang Phần thưởng và vòng Top

**Files:**
- Modify: `src/components/SignupCard.jsx`, `src/components/RewardsPage.jsx`,
  `src/components/Scarcity.jsx`, `src/App.jsx` (truyền thêm `topCutoff`, `topStart`,
  `topDeadline` vào `slots`), `src/lib/catalog.jsx`, `src/styles.css`

**Interfaces:**
- Consumes: `profile.inTop`, `profile.budget`, `profile.early`, `profile.joinIndex`,
  `profile.rank`; `stats.topCutoff`, `stats.topStart`, `stats.topDeadline`; `api.firstList`.
- `tierOf(me)` giữ chức năng chọn màu, nhưng **ngân sách hiển thị lấy từ `me.budget`**.

- [ ] **Step 1: `SignupCard`.**
  - Pill:
    - `early && inTop`: `'First + Top · VIP'`
    - `early`: `'First 1.000 · VIP'`
    - `inTop`: `'Top 1.000 · VIP'`
    - còn lại: `'Tiêu chuẩn'`
  - Người First hiện hai dòng: `'Bạn là người đăng ký thứ #{joinIndex}'` và
    `'Hạng Top 1.000 #{rank}'`.
  - Phần mời bạn kèm "+10 điểm" hiện cho **mọi** người.
  - `gift-value` dùng `me.budget`.

- [ ] **Step 2: `RewardsPage`.**
  - Hai tab: `'Top 1.000 · Bảng xếp hạng'` (mặc định) và `'First 1.000 · Danh sách'`.
  - Tab Top: dòng có `first: true` gắn huy hiệu "First". Nút "Xem hạng của tôi" và dòng ghim hiện
    cho mọi người đã đăng nhập. Bỏ ghi chú "Chỉ xếp người đăng ký từ #1.001".
  - Tab First: phân trang qua `api.firstList`, đầu bảng ghi `'Còn {firstRemaining} / 1.000 suất'`.
  - Thẻ trạng thái thêm biến thể `'Bạn có cả First và Top · 200.000đ'`.
  - Thanh điểm so với `cutoff` hiện cho mọi người.
  - Đếm ngược tới `topDeadline` nếu có.

- [ ] **Step 3: `Scarcity`, vòng Top.**
  - `topRemaining > 0`: giữ nguyên như hiện tại.
  - `topRemaining === 0`:
    - Giữa vòng hiện `'≥ {topCutoff} đ'`. Nếu `topCutoff === 0` thì thay bằng
      `'Mời 1 bạn để vào Top'`.
    - Dòng dưới hiện `'còn {N} ngày'`. Khi còn dưới 1 ngày thì hiện `HH:MM:SS`.
    - Cung tròn bằng `(deadline − now) / (deadline − start)`, trong đó `start` là `topStart`. Thiếu
      `topStart` thì vẽ đầy cung.
    - Không có `topDeadline`: chỉ hiện ngưỡng, cung đầy.
    - Sau deadline: hiện `'Đã chốt'`, cung rỗng.

- [ ] **Step 4: Kiểm tra.**
  - Chạy `npm run build`. Kỳ vọng: không lỗi.
  - Chạy `npm run dev` với DB dev có từ 1.000 user trở lên và
    `TOP_DEADLINE` bằng hiện tại cộng 3 ngày. Chụp màn hero, trang `#/rewards` ở cả hai tab, và thẻ
    kết quả của ba loại người: First + Top, chỉ Top, Tiêu chuẩn.

- [ ] **Step 5: Commit** với message `feat(fe): hai bảng First/Top, pill cộng dồn, vòng Top theo ngưỡng và deadline`

---

### Task 10: Tài liệu

**Files:**
- Modify: `docs/business-rules.md`: viết lại §2, §4, §5, §6 (phía frontend), §8, §9, §10 theo spec
  v2. Xoá dòng về `TierList`/`tierOfRank` nếu Task 4 đã gỡ chúng.
- Modify: `docs/nexxa-waitlist.postman_collection.json`: thêm biến `token`; request `verify`
  tự lưu token bằng test script; `/reserve*` và `/me` gắn header; thêm `/logout` và
  `/leaderboard/first`.
- Modify: `README.md`: thêm mục "Chốt Top 1.000", gồm thứ tự chạy `finalize` sau `TOP_DEADLINE` và
  `close-repick` sau `REPICK_DEADLINE`.

- [ ] **Step 1: Sửa ba file.**
- [ ] **Step 2: Chạy `npm test` lần cuối.** Kỳ vọng: toàn bộ PASS.
- [ ] **Step 3: Commit** với message `docs: luật nhận cổ phiếu v2, Postman có token, hướng dẫn chốt Top`
