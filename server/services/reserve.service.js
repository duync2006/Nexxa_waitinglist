import { MAX_RESERVE_TICKERS } from '../config/constants.js';
import { POOL_OF_TICKER, RESERVABLE, RESERVABLE_TICKERS } from '../../shared/catalog.js';
import { User } from '../models/index.js';
import { badRequest, locked } from '../utils/app-error.js';
import { getEntitlement, previewEntitlement } from './entitlement.service.js';
import { getPriceTable, requirePrices } from './price.service.js';

const vnd = (n) => Number(n).toLocaleString('vi-VN') + 'đ';

const normalize = (raw) =>
  Array.isArray(raw) ? [...new Set(raw.map((t) => String(t).toUpperCase()))] : [];

// Bảng giá để tính tiền: giá đã chốt thắng, phần còn lại lấy từ snapshot hiện tại.
//
// Nếu để giá trôi, người dùng sửa lại lựa chọn vài tuần sau có thể thấy giỏ cũ vượt ngân
// sách dù không đổi gì. Nhưng cũng KHÔNG thể chỉ dùng lockedPrices: chỉ những mã đã từng
// chọn mới có giá đông cứng, nên mã mới chọn về sau sẽ không có giá và bị 503 oan. Vì vậy
// phải hợp hai bảng.
async function priceTableFor(user) {
  const table = await getPriceTable();
  console.log('[reserve] bảng giá snapshot', Object.keys(table).length, 'mã');
  console.log('table: ', table);
  for (const r of user?.reservation?.lockedPrices ?? []) table[r.ticker] = r.price;
  console.log("user.reservation: ", user?.reservation);
  console.log('[reserve] bảng giá hợp với lockedPrices', Object.keys(table).length, 'mã');
  return table;
}

// Dữ liệu màn hình Reserve cần TRƯỚC khi người dùng chọn: ngân sách, nhóm được phép,
// và giá từng mã. User null -> bản xem thử.
export async function getOptions(user) {
  const entitlement = user ? await getEntitlement(user) : previewEntitlement();

  const table = await priceTableFor(user);
  // Chỉ trả giá của những mã user được phép chọn — không rò danh mục ngoài quyền.
  const allowed = entitlement.pools.flatMap((key) => RESERVABLE[key] ?? []).map((s) => s.t);
  const prices = Object.fromEntries(
    allowed.filter((t) => typeof table[t] === 'number').map((t) => [t, table[t]])
  );

  return {
    rank: entitlement.rank,
    early: entitlement.early,
    inTop: entitlement.inTop,
    budget: entitlement.budget,
    pools: entitlement.pools,
    phase: entitlement.phase,
    preview: !user,
    selected: user?.reservation?.tickers ?? [],
    prices
  };
}

function lockedPricesAfter(user, prices) {
  const out = [...(user?.reservation?.lockedPrices ?? [])].map((r) => ({ ticker: r.ticker, price: r.price }));
  const seen = new Set(out.map((r) => r.ticker));
  for (const [ticker, price] of Object.entries(prices)) {
    if (!seen.has(ticker)) out.push({ ticker, price });
  }
  return out;
}

// Giai đoạn nào thì giỏ bị khoá, kèm câu báo cho người dùng (423).
const LOCKED_MESSAGES = {
  frozen: 'Đang chốt kết quả Top 1.000. Vui lòng quay lại sau.',
  closed: 'Đã hết hạn chọn cổ phiếu.'
};

// User đã được xác thực bằng token phiên. Chọn lại thì ghi đè.
export async function saveSelection(user, rawTickers) {
  const now = new Date();
  const entitlement = await getEntitlement(user, now);
  // Chặn trước mọi kiểm tra khác: giỏ đang khoá thì nói đúng lý do, không bắt người dùng
  // sửa lỗi chọn mã rồi mới biết là đằng nào cũng không ghi được.
  if (LOCKED_MESSAGES[entitlement.phase]) {
    throw locked(LOCKED_MESSAGES[entitlement.phase], { phase: entitlement.phase });
  }

  const tickers = normalize(rawTickers);

  if (tickers.length === 0 || tickers.length > MAX_RESERVE_TICKERS) {
    throw badRequest('Vui lòng chọn ít nhất một mã cổ phiếu.');
  }
  if (tickers.some((t) => !RESERVABLE_TICKERS.has(t))) {
    throw badRequest('Có mã cổ phiếu không thuộc danh sách Reserve.');
  }

  // Mã phải thuộc nhóm user được phép — nêu đích danh mã sai để frontend chỉ được chỗ.
  const wrongPool = tickers.filter((t) => !entitlement.pools.includes(POOL_OF_TICKER[t]));
  if (wrongPool.length) {
    throw badRequest(
      `Bạn chưa được chọn ${wrongPool.join(', ')}. Hạng của bạn chỉ chọn được nhóm ${entitlement.pools
        .map((p) => p.toUpperCase())
        .join(', ')}.`,
      { wrongPool }
    );
  }

  // Thiếu giá thì 503 (ném từ requirePrices) chứ không âm thầm tính tổng sai.
  const table = await priceTableFor(user);
  const prices = requirePrices(tickers, table);

  const totalValue = tickers.reduce((sum, t) => sum + prices[t], 0);
  if (totalValue > entitlement.budget) {
    throw badRequest(
      `Tổng ${vnd(totalValue)} vượt ngân sách ${vnd(entitlement.budget)}. Vui lòng bỏ bớt một mã.`,
      { totalValue, budget: entitlement.budget }
    );
  }

  const fields = {
    tickers,
    updatedAt: now,
    // Hợp giá đã chốt với giá của những mã mới chọn lần này: mã đã đông cứng thì giữ
    // nguyên, mã mới thì đông cứng từ bây giờ.
    lockedPrices: lockedPricesAfter(user, prices),
    totalValue
  };
  // Đã có reservation thì ghi từng field bằng đường dẫn chấm thay vì thay cả object:
  // lockedRank, budget, allowedPools của bản chốt kiểu cũ không còn được ghi, nhưng cũng
  // không bị xoá khỏi document cũ — còn đó để đối soát. Chưa có (hoặc null) thì ghi cả
  // object, vì Mongo không tạo được field con bên trong một giá trị null.
  const update = user.reservation
    ? Object.fromEntries(Object.entries(fields).map(([k, v]) => [`reservation.${k}`, v]))
    : { reservation: fields };
  // Người bị yêu cầu chọn lại sau finalize: ghi mốc chọn lại CÙNG lần ghi giỏ, để
  // close-repick biết mà bỏ qua, không tự cắt giỏ họ vừa chọn.
  if (entitlement.phase === 'repick' && user.final?.needsRepick && !user.final.repickedAt) {
    update['final.repickedAt'] = now;
  }

  await User.updateOne({ _id: user._id }, { $set: update });
  return { tickers, totalValue, budget: entitlement.budget };
}
