import { STOCKS, STOCK_SOURCE, TIERS } from '../lib/data.js';
import { vnd } from '../lib/format.js';

export default function StockLists() {
  return (
    <section id="danh-muc" className="container section">
      <div className="stack-4">
        <h2 className="h2">Bạn sẽ nhận cổ phiếu của doanh nghiệp nào?</h2>
        <p className="muted section-lead">
          Mỗi hạng quà gắn với một nhóm cổ phiếu niêm yết trên HOSE. Cổ phiếu cụ thể được phân bổ từ danh mục của hạng bạn đạt được.
        </p>
      </div>
      <div className="lists">
        {TIERS.map((t) => (
          <div key={t.key} className={`list-card ${t.key === 'gold' ? 'list-wide' : ''}`}>
            <div className="list-head">
              <div className="list-title">
                <span className="tier-badge" style={{ background: t.bg, color: t.fg }}>{t.label}</span>
                <span className="list-group">{t.group}</span>
              </div>
              <span className="muted-14">{STOCKS[t.key].length} mã · {vnd(t.value)}/người</span>
            </div>
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
        ))}
      </div>
    </section>
  );
}
