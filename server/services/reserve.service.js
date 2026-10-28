import { MAX_RESERVE_TICKERS } from '../config/constants.js';
import { POOL_OF_TICKER, RESERVABLE, RESERVABLE_TICKERS } from '../../shared/catalog.js';
import { User } from '../models/index.js';
import { badRequest, forbidden } from '../utils/app-error.js';
import { getEntitlement, previewEntitlement } from './entitlement.service.js';
import { getPriceTable, requirePrices } from './price.service.js';
import { findByEmail } from './waitlist.service.js';

const vnd = (n) => Number(n).toLocaleString('vi-VN') + 'đ';

const normalize = (raw) =>
  Array.isArray(raw) ? [...new Set(raw.map((t) => String(t).toUpperCase()))] : [];

// Bảng giá để tính tiền: giá đã chốt thắng, phần còn lại lấy từ snapshot hiện tại.
//
// Nếu chỉ chốt ngân sách mà để giá trôi, người dùng sửa lại lựa chọn vài tuần sau có thể
// thấy giỏ cũ vượt ngân sách dù không đổi gì. Nhưng cũng KHÔNG thể chỉ dùng lockedPrices:
// lần chốt đầu chỉ đông cứng giá của những mã đã chọn, nên mã mới chọn về sau sẽ không có
// giá và bị 503 oan. Vì vậy phải hợp hai bảng.
async function priceTableFor(user) {
  const table = await getPriceTable();
  for (const r of user?.reservation?.lockedPrices ?? []) table[r.ticker] = r.price;
  return table;
}

// Dữ liệu màn hình Reserve cần TRƯỚC khi người dùng chọn: ngân sách, nhóm được phép,
// và giá từng mã. Email rỗng -> bản xem thử.
export async function getOptions(email) {
  const user = email ? await findByEmail(email) : null;
  const entitlement = user ? await getEntitlement(user) : previewEntitlement();

  const table = await priceTableFor(user);
  // Chỉ trả giá của những mã user được phép chọn — không rò danh mục ngoài quyền.
  const allowed = entitlement.pools.flatMap((key) => RESERVABLE[key] ?? []).map((s) => s.t);
  const prices = Object.fromEntries(
    allowed.filter((t) => typeof table[t] === 'number').map((t) => [t, table[t]])
  );

  return {
    rank: entitlement.rank,
    budget: entitlement.budget,
    pools: entitlement.pools,
    locked: entitlement.locked,
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

// Chỉ email đã xác thực waitlist mới được ghi nhận lựa chọn. Chọn lại thì ghi đè.
export async function saveSelection(email, rawTickers) {
  const user = await findByEmail(email);
  if (!user) {
    throw forbidden('Email này chưa tham gia waitlist. Vui lòng đăng ký trước khi nhận quà.');
  }

  const tickers = normalize(rawTickers);

  if (tickers.length === 0 || tickers.length > MAX_RESERVE_TICKERS) {
    throw badRequest('Vui lòng chọn ít nhất một mã cổ phiếu.');
  }
  if (tickers.some((t) => !RESERVABLE_TICKERS.has(t))) {
    throw badRequest('Có mã cổ phiếu không thuộc danh sách Reserve.');
  }

  const entitlement = await getEntitlement(user);

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

  const reservation = {
    tickers,
    updatedAt: new Date(),
    // Lần Reserve đầu tiên chốt luôn quyền lợi và bảng giá; lần sau giữ nguyên bản đã chốt.
    lockedRank: entitlement.locked ? user.reservation.lockedRank : entitlement.rank,
    budget: entitlement.budget,
    allowedPools: entitlement.pools,
    // Hợp giá đã chốt với giá của những mã mới chọn lần này: mã đã đông cứng thì giữ
    // nguyên, mã mới thì đông cứng từ bây giờ.
    lockedPrices: lockedPricesAfter(user, prices),
    totalValue
  };

  await User.updateOne({ email }, { $set: { reservation } });
  return { tickers, totalValue, budget: entitlement.budget };
}
