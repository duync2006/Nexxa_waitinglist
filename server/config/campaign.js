// Đồng hồ của campaign Top 1.000. Ba mốc, đều tuỳ chọn, đều là ISO 8601 CÓ múi giờ:
//   TOP_START       — lúc mở campaign, chỉ dùng để vẽ cung đếm ngược ở frontend.
//   TOP_DEADLINE    — hết giờ đua Top: ngừng cộng lượt mời, giỏ bị khoá tới khi finalize.
//   REPICK_DEADLINE — hạn chọn lại cho người phải sửa giỏ sau finalize; phải sau TOP_DEADLINE.
// Thiếu TOP_DEADLINE thì campaign chưa có hạn: giai đoạn luôn là 'open', không chặn gì.
//
// Đọc process.env ở MỖI lần gọi chứ không chụp lúc nạp module: test đổi biến rồi trả lại
// trong afterEach, và đổi .env chỉ cần khởi động lại là đủ, không có bản sao nào bị cũ.

// Bắt buộc có múi giờ (Z hoặc ±hh:mm): "2027-01-01T00:00" sẽ bị hiểu theo giờ máy chủ, chạy
// trên container UTC là lệch 7 tiếng so với giờ Việt Nam mà không ai để ý.
const HAS_ZONE = /(Z|[+-]\d{2}:?\d{2})$/i;

function readDate(name) {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (!HAS_ZONE.test(raw) || Number.isNaN(date.getTime())) {
    throw new Error(
      `${name} không phải ngày hợp lệ: ${raw}. Dùng ISO 8601 có múi giờ, ví dụ 2027-01-01T00:00:00+07:00.`
    );
  }
  return date;
}

export function getCampaign() {
  const topStart = readDate('TOP_START');
  const topDeadline = readDate('TOP_DEADLINE');
  const repickDeadline = readDate('REPICK_DEADLINE');
  if (repickDeadline && !topDeadline) {
    throw new Error('Có REPICK_DEADLINE nhưng thiếu TOP_DEADLINE: hạn chọn lại phải đi sau TOP_DEADLINE');
  }
  if (repickDeadline && repickDeadline <= topDeadline) {
    throw new Error('REPICK_DEADLINE phải sau TOP_DEADLINE');
  }
  return { topStart, topDeadline, repickDeadline };
}

// Còn cộng lượt mời không: chưa có deadline, hoặc chưa tới deadline.
export function invitesOpen(now = new Date()) {
  const { topDeadline } = getCampaign();
  return !topDeadline || now < topDeadline;
}

// Người đăng ký muộn: tạo tài khoản từ TOP_DEADLINE trở đi, tức là sau khi cuộc đua Top đã
// khép. Họ đứng ngoài Top (inTop luôn false), finalize không cần chốt gì cho họ, và quyền
// lợi chỉ còn First (nếu còn suất) hoặc 50.000đ Standard.
export function isLateRegistrant(user, topDeadline = getCampaign().topDeadline) {
  if (!topDeadline || !user?.createdAt) return false;
  return new Date(user.createdAt) >= topDeadline;
}

// Giai đoạn của MỘT user, quyết định giỏ của họ có được ghi không:
//   open   — trước TOP_DEADLINE (hoặc chưa có deadline): chọn tạm, sửa thoải mái.
//   frozen — đã qua deadline, user đăng ký TRƯỚC deadline nhưng chưa finalize (chưa có
//            user.final): khoá, chờ chốt.
//   repick — đã finalize (hoặc là người đăng ký muộn), trước REPICK_DEADLINE (hoặc không có
//            hạn này): sửa trong quyền lợi của mình.
//   closed — như repick nhưng đã qua REPICK_DEADLINE: khoá hẳn.
// user null (không có createdAt) sau deadline là 'frozen'.
export function phaseOf(user, now = new Date()) {
  const { topDeadline, repickDeadline } = getCampaign();
  if (!topDeadline || now < topDeadline) return 'open';
  if (!user?.final && !isLateRegistrant(user, topDeadline)) return 'frozen';
  if (repickDeadline && now >= repickDeadline) return 'closed';
  return 'repick';
}
