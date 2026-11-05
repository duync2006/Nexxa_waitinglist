import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { fmt } from '../lib/format.js';
import NexxaBot from './NexxaBot.jsx';

// Mỗi lượt mời = 10 điểm. Hạng xếp theo điểm ở server (bằng điểm thì ai vào trước đứng trên).
const POINTS_PER_INVITE = 10;

// Số liệu và chữ bám theo bản thiết kế Claude Design (Rewards.dc.html). Màu lấy từ token của
// site (--accent, --tag-*, --line...) chứ không chép bảng màu riêng của mockup, để trang này
// đổi sáng/tối cùng phần còn lại.

const TILES = [
  { t: 'FPT', x: 22, y: 26 },
  { t: 'VCB', x: 262, y: 18 },
  { t: 'HPG', x: 34, y: 140 },
  { t: 'VNM', x: 250, y: 132 }
];

const WAYS = [
  { title: 'Mời bạn bè', body: 'Mỗi người hoàn tất đăng ký và eKYC', value: '+10 điểm',
    icon: <><circle cx="9" cy="8" r="4" /><path d="M2 21c0-4 3-6 7-6s7 2 7 6" /><path d="M19 8v6M16 11h6" /></> },
  { title: 'Mua 1, tặng 1 mỗi tháng', body: 'Mua 1 cổ phiếu bất kỳ trong tháng, nhận thêm 1 cổ phiếu', value: '+1 CP',
    icon: <><path d="M17 2l4 4-4 4" /><path d="M3 11V9a3 3 0 0 1 3-3h15" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a3 3 0 0 1-3 3H3" /></> },
  { title: 'Đăng ký sớm', body: '1.000 người đăng ký đầu tiên nhận cổ phiếu VIP', value: 'VIP',
    icon: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2" /><path d="M9 2h6" /></> }
];

const TERMS = [
  'Nắm giữ cổ phiếu thưởng tối thiểu 1 năm.',
  'Hoàn tất đăng ký và xác thực eKYC.',
  'Thưởng bắt đầu sau khi Nexxa chính thức ra mắt.',
  'Áp dụng điều khoản chương trình. [LINK ĐIỀU KHOẢN]'
];

function Tile({ t, style }) {
  return (
    <div className="rw-tile" style={style}>
      <svg width="80" height="56" viewBox="0 0 80 56" aria-hidden="true">
        <polygon points="2,21 40,40 40,54 2,35" className="rw-tile-l" />
        <polygon points="78,21 40,40 40,54 78,35" className="rw-tile-r" />
        <polygon points="40,2 78,21 40,40 2,21" className="rw-tile-top" />
      </svg>
      <span>{t}</span>
    </div>
  );
}

export default function RewardsPage({ me, registered, totalSlots, onBack }) {
  const [termsOpen, setTermsOpen] = useState(false);
  // Bảng xếp hạng phân trang, mỗi trang 7 người (server quyết định pageSize). Giữ trang cũ
  // trên màn hình trong lúc tải trang mới để bảng không nháy trắng.
  const [page, setPage] = useState(1);
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.leaderboard(page)
      .then((b) => { if (alive) setBoard(b); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [page]);
  const pageSize = board?.pageSize ?? 7;
  const myPage = me ? Math.ceil(me.rank / pageSize) : null;
  const meOffPage = !!me && !!board && myPage !== board.page;
  const points = me ? (me.invites || 0) * POINTS_PER_INVITE : 0;
  const cutoff = board?.cutoff ?? null;
  const left = Math.max(0, totalSlots - registered);
  const pct = totalSlots ? Math.min(100, (registered / totalSlots) * 100) : 0;
  const isVip = !!me && me.rank <= totalSlots;
  const isStd = !!me && !isVip;

  // Thẻ trạng thái: ba biến thể theo người xem (chưa đăng ký / VIP / tiêu chuẩn).
  const status = isVip
    ? { eyebrow: `Hạng #${fmt(me.rank)} · ${fmt(points)} điểm`, title: 'Bạn nằm trong nhóm VIP — cổ phiếu 100.000đ',
        body: 'Mời thêm bạn bè để giữ vững vị trí.', cta: 'Mời thêm bạn bè' }
    : isStd
      ? { eyebrow: `Hạng #${fmt(me.rank)} · ${fmt(points)} điểm`, title: 'Bạn đang ở hạng Tiêu chuẩn — cổ phiếu 50.000đ',
          body: 'Mời bạn bè để leo lên Top 1.000 và nhận cổ phiếu VIP.', cta: 'Mời bạn bè' }
      : { eyebrow: 'Suất VIP đang mở', title: `Còn ${fmt(left)} suất VIP — đăng ký để giữ chỗ`,
          body: 'Hoàn tất đăng ký và eKYC để nhận cổ phiếu trị giá đến 100.000đ.', cta: 'Đăng ký ngay' };

  return (
    <div className="rw">
      <nav className="rw-nav">
        <button type="button" className="rw-nav-btn" aria-label="Quay lại" onClick={onBack}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <span className="rw-nav-title">Phần thưởng</span>
        <span className="rw-nav-btn" aria-hidden="true" />
      </nav>

      <div className="rw-body">
        <section className="rw-intro">
          <div className="rw-hero" aria-hidden="true">
            {TILES.map((t) => <Tile key={t.t} t={t.t} style={{ left: t.x, top: t.y }} />)}
            <NexxaBot className="rw-bot" />
            <div className="rw-bot-shadow" />
          </div>
          <h1 className="rw-title">Nhận cổ phiếu trị giá đến 100.000đ</h1>
          <p className="rw-sub">Lọt Top 1.000 để nhận cổ phiếu VIP. Mỗi người bạn mời = 10 điểm.</p>
          <a className="rw-terms-link" href="#rw-terms" onClick={() => setTermsOpen(true)}>Áp dụng điều khoản</a>
        </section>

        <section className="rw-status" aria-label="Trạng thái của bạn">
          <div className="rw-status-eyebrow">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.8-6.2 3.8 1.6-7L2 9.2l7.1-.6z" /></svg>
            <span>{status.eyebrow}</span>
          </div>
          <p className="rw-status-title">{status.title}</p>
          {me && cutoff !== null && (
            <div className="rw-bar-wrap">
              <div className="rw-bar"><div style={{ width: `${cutoff ? Math.min(100, (points / cutoff) * 100) : 100}%` }} /></div>
              <div className="rw-bar-meta">
                <span>{fmt(points)} / {fmt(cutoff)} điểm</span>
                <span>{points >= cutoff ? `Hơn ngưỡng ${fmt(points - cutoff)} điểm` : `Thiếu ${fmt(cutoff - points)} điểm`}</span>
              </div>
            </div>
          )}
          {!me && (
            <div className="rw-bar-wrap">
              <div className="rw-bar"><div style={{ width: `${pct}%` }} /></div>
              <div className="rw-bar-meta">
                <span>{fmt(registered)} / {fmt(totalSlots)} đã nhận</span>
                <span>Còn {fmt(left)}</span>
              </div>
            </div>
          )}
          <p className="rw-status-body">{status.body}</p>
          <button type="button" className="rw-link-btn" onClick={onBack}>{status.cta}</button>
        </section>

        <section className="rw-sec">
          <h2 className="rw-h2">Hai hạng thưởng</h2>
          <div className="rw-tiers">
            <div className={`rw-tier${isVip ? ' is-me-vip' : ''}`}>
              <span className="rw-badge rw-badge-vip">VIP</span>
              <span className="rw-tier-amt">100.000đ</span>
              <span className="rw-tier-note">Top {fmt(totalSlots)} · cổ phiếu VN30</span>
              <span className="rw-tier-left">Còn {fmt(left)} / {fmt(totalSlots)}</span>
            </div>
            <div className={`rw-tier${isStd ? ' is-me-std' : ''}`}>
              <span className="rw-badge rw-badge-std">TIÊU CHUẨN</span>
              <span className="rw-tier-amt">50.000đ</span>
              <span className="rw-tier-note">Từ hạng #{fmt(totalSlots + 1)} · cổ phiếu tiêu chuẩn</span>
            </div>
          </div>
        </section>

        <section className="rw-sec">
          <h2 className="rw-h2">Cách nhận thêm</h2>
          <ul className="rw-ways">
            {WAYS.map((w) => (
              <li key={w.title} className="rw-way">
                <span className="rw-way-ico">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{w.icon}</svg>
                </span>
                <div className="rw-way-text">
                  <span className="rw-way-t">{w.title}</span>
                  <span className="rw-way-b">{w.body}</span>
                </div>
                <span className="rw-way-v">{w.value}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rw-sec">
          <h2 className="rw-h2">Bảng xếp hạng</h2>
          {board && board.top.length > 0 ? (
            <ul className={`rw-board${loading ? ' is-loading' : ''}`} aria-busy={loading}>
              {board.top.map((r) => {
                const mine = me && r.rank === me.rank;
                return (
                  <li key={r.rank} className={`rw-board-row${mine ? ' is-me' : ''}`}>
                    <span className="rw-board-rank">#{fmt(r.rank)}</span>
                    <span className="rw-board-name">{mine ? 'Bạn' : r.masked}</span>
                    <span className="rw-board-pts">{fmt(r.points)}</span>
                  </li>
                );
              })}
              {/* Hạng của mình không nằm trong trang đang xem thì ghim ở cuối. */}
              {meOffPage && (
                <li className="rw-board-row is-me">
                  <span className="rw-board-rank">#{fmt(me.rank)}</span>
                  <span className="rw-board-name">Bạn</span>
                  <span className="rw-board-pts">{fmt(points)}</span>
                </li>
              )}
            </ul>
          ) : (
            <p className="rw-way-b">{board ? 'Chưa có ai trên bảng xếp hạng.' : 'Đang tải…'}</p>
          )}
          {board && board.totalPages > 1 && (
            <div className="rw-pager">
              <button type="button" className="rw-pager-btn" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)} aria-label="Trang trước">‹</button>
              <span className="rw-pager-info">Trang {fmt(board.page)} / {fmt(board.totalPages)}</span>
              <button type="button" className="rw-pager-btn" disabled={page >= board.totalPages || loading} onClick={() => setPage((p) => p + 1)} aria-label="Trang sau">›</button>
              {me && myPage !== page && (
                <button type="button" className="rw-pager-me" onClick={() => setPage(myPage)}>Xem hạng của tôi</button>
              )}
            </div>
          )}
          {cutoff !== null && <span className="rw-board-note">Ngưỡng vào Top {fmt(totalSlots)} hiện tại: {fmt(cutoff)} điểm</span>}
        </section>

        <section id="rw-terms" className="rw-acc">
          <button type="button" className="rw-acc-btn" aria-expanded={termsOpen} onClick={() => setTermsOpen((o) => !o)}>
            <span>Điều kiện &amp; điều khoản</span>
            <span aria-hidden="true">{termsOpen ? '−' : '+'}</span>
          </button>
          {termsOpen && <ul className="rw-acc-list">{TERMS.map((t) => <li key={t}>{t}</li>)}</ul>}
        </section>
      </div>

      <div className="rw-cta">
        <button type="button" className="rw-cta-btn" onClick={onBack}>{me ? 'Mời bạn bè' : 'Đăng ký ngay'}</button>
      </div>
    </div>
  );
}
