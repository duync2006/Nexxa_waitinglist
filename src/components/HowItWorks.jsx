import NexxaBot from './NexxaBot.jsx';
import { vnd } from '../lib/format.js';
import { FIRST_BUDGET, TOP_BUDGET, REST_BUDGET } from '../../shared/catalog.js';

// Thẻ giới thiệu Chương trình thưởng trên trang chính. Chi tiết (hạng thưởng, cách nhận
// thêm, bảng xếp hạng, điều khoản) đã nằm ở trang Phần thưởng (#/rewards), nên ở đây chỉ
// giữ đúng một lời hứa + hai mức thưởng để người đọc có lý do bấm sang. Cả thẻ là một
// liên kết: vùng bấm lớn trên điện thoại, không bắt người ta nhắm vào một dòng chữ nhỏ.
export default function HowItWorks() {
  return (
    <section className="container section section-last">
      <a className="promo" href="#/rewards">
        <div className="promo-text">
          <span className="promo-eyebrow">Chương trình thưởng</span>
          <h2 className="promo-title">Nhận cổ phiếu trị giá đến {vnd(FIRST_BUDGET + TOP_BUDGET)}</h2>
          <div className="promo-tiers">
            <span className="promo-tier promo-tier-vip"><b>VIP</b> {vnd(FIRST_BUDGET)}/suất</span>
            <span className="promo-tier promo-tier-std"><b>Tiêu chuẩn</b> {vnd(REST_BUDGET)}</span>
          </div>
          <span className="promo-cta">
            Xem chi tiết
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </span>
        </div>
        <div className="promo-art" aria-hidden="true">
          <NexxaBot width={64} className="promo-bot" />
          <span className="promo-shadow" />
        </div>
      </a>
    </section>
  );
}
