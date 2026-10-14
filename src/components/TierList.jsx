import { TIERS, tierOfRank } from '../lib/data.js';
import { fmt, vnd } from '../lib/format.js';

export default function TierList({ registered, myRank }) {
  const mine = myRank ? tierOfRank(myRank) : null;

  return (
    <aside className="tiers">
      <div className="stack-2">
        <h2 className="h2-sm">3 hạng quà · 1.000 suất</h2>
        <span className="muted-14">Xếp theo thứ hạng trong waitlist</span>
      </div>

      {TIERS.map((t) => {
        const size = t.to - t.from + 1;
        const taken = Math.min(size, Math.max(0, registered - t.from + 1));
        const remain = size - taken;
        const isMine = mine?.key === t.key;
        return (
          <div key={t.key} className="tier-card" style={{ borderColor: isMine ? t.bar : undefined }}>
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
          </div>
        );
      })}

      <a href="#danh-muc" className="link-accent anchor">Xem danh sách cổ phiếu từng hạng ↓</a>
    </aside>
  );
}
