import { useState } from 'react';
import { STOCKS, STOCK_SOURCE, TIERS, tierOfRank } from '../lib/data.js';
import { fmt, vnd } from '../lib/format.js';

function TierCard({ t, taken, size, remain, isMine }) {
  const [open, setOpen] = useState(false);
  const panelId = `tier-panel-${t.key}`;

  return (
    <div className="tier-card" style={{ borderColor: isMine ? t.bar : undefined }}>
      <div className="tier-head">
        <span className="tier-badge" style={{ background: t.bg, color: t.fg }}>{t.label}</span>
        <span className="tier-range">Hạng #{fmt(t.from)}–{fmt(t.to)}</span>
      </div>
      <div className="stack-2">
        <span className="tier-value">{vnd(t.value)}</span>
        <span className="tier-group">{t.group}</span>
      </div>
      <div className="stack-6">
        <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={size} aria-valuenow={taken} aria-label={`${t.label}: ${taken}/${size} suất đã nhận`}>
          <div className="bar-fill" style={{ width: `${Math.round((taken / size) * 100)}%`, background: t.bar }} />
        </div>
        <div className="tier-foot">
          <span>{fmt(taken)} / {fmt(size)} đã nhận</span>
          <span className="ink strong">{remain > 0 ? `Còn ${fmt(remain)} suất` : 'Đã kín'}</span>
        </div>
      </div>

      <button
        type="button"
        className="tier-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{open ? 'Ẩn' : 'Xem'} {STOCKS[t.key].length} mã cổ phiếu</span>
        <span className="chevron" aria-hidden="true" />
      </button>

      {open && (
        <div id={panelId} className="tier-panel">
          <div className="stock-grid">
            {STOCKS[t.key].map((s) => (
              <div key={s.t} className="stock">
                <span className="stock-t">{s.t}</span>
                <span className="stock-n" title={s.n}>{s.n}</span>
              </div>
            ))}
          </div>
          <span className="source">{STOCK_SOURCE[t.key]}</span>
        </div>
      )}
    </div>
  );
}

export default function TierList({ registered, myRank }) {
  const mine = myRank ? tierOfRank(myRank) : null;

  return (
    <section id="danh-sach-hang" className="container section tiers">
      <div className="stack-4">
        <span className="eyebrow">Phần quà waitlist</span>
        <h2 className="h2">3 hạng quà · 1.000 suất</h2>
        <p className="muted section-lead wide">
          Xếp theo thứ hạng trong waitlist. Bạn sẽ nhận cổ phiếu của doanh nghiệp nào? Mỗi hạng quà gắn với một nhóm cổ phiếu niêm yết trên HOSE. Cổ phiếu cụ thể được phân bổ từ danh mục của hạng bạn đạt được.
        </p>
      </div>

      <div className="tiers-grid">
        {TIERS.map((t) => {
          const size = t.to - t.from + 1;
          const taken = Math.min(size, Math.max(0, registered - t.from + 1));
          const remain = size - taken;
          return (
            <TierCard
              key={t.key}
              t={t}
              taken={taken}
              size={size}
              remain={remain}
              isMine={mine?.key === t.key}
            />
          );
        })}
      </div>
    </section>
  );
}
