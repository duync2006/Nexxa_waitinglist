import { useState } from 'react';
import { useCatalog } from '../lib/catalog.jsx';
import { fmt, vnd } from '../lib/format.js';

// Component này đang bị tắt ở App.jsx. Giữ lại và cập nhật theo hai bậc quyền lợi mới
// để lần bật lại không vỡ build — bảng TIERS cũ (GOLD/SILVER/COPPER) đã bị bỏ.

function TierCard({ t, registered, isMine }) {
  // Danh mục từ server, không còn gom từ RESERVABLE trong bundle.
  const { totalSlots: TOTAL_SLOTS, pools, stocksOfPools } = useCatalog();
  const [open, setOpen] = useState(false);
  const panelId = `tier-panel-${t.key}`;
  const stocks = stocksOfPools(t.pools);
  const poolLabels = t.pools
    .map((key) => pools.find((p) => p.key === key)?.label)
    .filter(Boolean)
    .join(' + ');

  // Bậc 'top' có đúng 1.000 suất và đếm được bao nhiêu đã lấp đầy.
  // Bậc 'rest' không giới hạn số lượng nên không có thanh tiến độ.
  const limited = t.key === 'top';
  const taken = Math.min(TOTAL_SLOTS, registered);
  const remain = TOTAL_SLOTS - taken;

  return (
    <div className="tier-card" style={{ borderColor: isMine ? t.bar : undefined }}>
      <div className="tier-head">
        <span className="tier-badge" style={{ background: t.bg, color: t.fg }}>{t.label}</span>
        <span className="tier-range">
          {limited ? `Hạng #1–${fmt(TOTAL_SLOTS)}` : `Từ hạng #${fmt(TOTAL_SLOTS + 1)}`}
        </span>
      </div>
      <div className="stack-2">
        <span className="tier-value">{vnd(t.budget)}</span>
        <span className="tier-group">{t.group}</span>
      </div>

      {limited && (
        <div className="stack-6">
          <div
            className="bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={TOTAL_SLOTS}
            aria-valuenow={taken}
            aria-label={`${t.label}: ${taken}/${TOTAL_SLOTS} suất đã nhận`}
          >
            <div className="bar-fill" style={{ width: `${Math.round((taken / TOTAL_SLOTS) * 100)}%`, background: t.bar }} />
          </div>
          <div className="tier-foot">
            <span>{fmt(taken)} / {fmt(TOTAL_SLOTS)} đã nhận</span>
            <span className="ink strong">{remain > 0 ? `Còn ${fmt(remain)} suất` : 'Đã kín'}</span>
          </div>
        </div>
      )}

      <button
        type="button"
        className="tier-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{open ? 'Ẩn' : 'Xem'} {stocks.length} mã {poolLabels}</span>
        <span className="chevron" aria-hidden="true" />
      </button>

      {open && (
        <div id={panelId} className="tier-panel">
          <div className="stock-grid">
            {stocks.map((s) => (
              <div key={s.t} className="stock">
                <span className="stock-t">{s.t}</span>
                <span className="stock-n" title={s.n}>{s.n}</span>
              </div>
            ))}
          </div>
          <span className="source">Danh mục dự kiến · Nexxa công bố bản chính thức trước khi phân bổ</span>
        </div>
      )}
    </div>
  );
}

export default function TierList({ registered, myRank }) {
  const { totalSlots: TOTAL_SLOTS, tierViews, tierOfRank } = useCatalog();
  const mine = myRank ? tierOfRank(myRank) : null;

  return (
    <section id="danh-sach-hang" className="container section tiers">
      <div className="stack-4">
        <span className="eyebrow">Phần quà waitlist</span>
        <h2 className="h2">2 bậc quà · {fmt(TOTAL_SLOTS)} suất VIP</h2>
        <p className="muted section-lead wide">
          Xếp theo thứ hạng trong waitlist. Top {fmt(TOTAL_SLOTS)} được chọn cổ phiếu từ cả nhóm VIP
          lẫn Standard với ngân sách cao hơn; từ hạng {fmt(TOTAL_SLOTS + 1)} trở đi vẫn nhận cổ phiếu,
          chọn trong nhóm Standard.
        </p>
      </div>

      <div className="tiers-grid">
        {tierViews.map((t) => (
          <TierCard key={t.key} t={t} registered={registered} isMine={mine?.key === t.key} />
        ))}
      </div>
    </section>
  );
}
