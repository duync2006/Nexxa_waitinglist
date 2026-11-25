// Giai đoạn campaign do server tính (profile và /reserve/options đều trả `phase`,
// `needsRepick`, `repickDeadline`). Frontend chỉ đọc, không tự suy luật từ đồng hồ máy.
//   open   — đang đua Top, giỏ sửa thoải mái
//   frozen — đã qua deadline, đang chốt: giỏ khoá
//   repick — đã chốt: sửa trong quyền lợi đã chốt; needsRepick = phải chọn lại trước hạn
//   closed — hết hạn chọn: giỏ khoá hẳn

// Câu chữ trùng với lỗi 423 của server (reserve.service.js), để banner và lỗi nói cùng một ý.
export const FROZEN_NOTICE = 'Đang chốt kết quả Top 1.000. Vui lòng quay lại sau.';
export const CLOSED_NOTICE = 'Đã hết hạn chọn cổ phiếu.';

// Giỏ đang khoá: nút Nhận phải tắt, bấm cũng chỉ nhận về 423.
export const isLocked = (phase) => phase === 'frozen' || phase === 'closed';

// Cuộc đua Top đã khép: lượt mời không còn cộng điểm. Thiếu phase (server cũ) coi như còn mở.
export const raceOver = (phase) => Boolean(phase) && phase !== 'open';

// Ngày giờ theo giờ Việt Nam, cố định múi giờ để người ở nước ngoài thấy đúng mốc của chương trình.
function deadlineText(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

// Nhắc người phải chọn lại. Chưa đặt REPICK_DEADLINE thì không có mốc để nêu.
export function repickNotice(repickDeadline) {
  const when = deadlineText(repickDeadline);
  return when
    ? `Kết quả Top đã chốt. Vui lòng chọn lại cổ phiếu trước ${when}.`
    : 'Kết quả Top đã chốt. Vui lòng chọn lại cổ phiếu.';
}

// Banner cho màn chọn cổ phiếu, null khi không có gì cần báo.
export function phaseNotice({ phase, needsRepick, repickDeadline } = {}) {
  if (phase === 'frozen') return FROZEN_NOTICE;
  if (phase === 'closed') return CLOSED_NOTICE;
  if (phase === 'repick' && needsRepick) return repickNotice(repickDeadline);
  return null;
}
