import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { POOLS, POOL_STOCKS, RESERVABLE } from '../lib/data.js';
import { vnd } from '../lib/format.js';

// Thanh cuộn do mình tự vẽ. Thanh native trên mobile luôn là overlay và tự mờ đi khi ngừng cuộn —
// đó là hành vi ở tầng hệ điều hành, ::-webkit-scrollbar không can thiệp được. Nên ẩn hẳn thanh
// native rồi vẽ lại một thanh luôn hiển thị, vẫn kéo được bằng chuột lẫn ngón tay.
function ScrollBox({ label, children }) {
  const boxRef = useRef(null);
  const [bar, setBar] = useState(null);

  const sync = useCallback(() => {
    const el = boxRef.current;
    if (!el) return;
    const { clientHeight: view, scrollHeight: full, scrollTop } = el;
    if (full <= view + 1) {
      setBar(null);
      return;
    }
    const height = Math.max(28, Math.round((view / full) * view));
    const top = Math.round((scrollTop / (full - view)) * (view - height));
    setBar({ height, top });
  }, []);

  useEffect(() => {
    sync();
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    // Danh sách đổi chiều cao (xoay máy, đổi cỡ chữ) thì tính lại thanh cuộn
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [sync]);

  function startDrag(e) {
    const el = boxRef.current;
    const thumb = e.currentTarget;
    if (!el) return;
    const startY = e.clientY;
    const startScroll = el.scrollTop;
    const range = el.clientHeight - thumb.offsetHeight;
    const scrollable = el.scrollHeight - el.clientHeight;
    if (range <= 0) return;

    const onMove = (ev) => { el.scrollTop = startScroll + ((ev.clientY - startY) / range) * scrollable; };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    e.preventDefault();
  }

  return (
    <div className="pool-scroll">
      <div className="pool-chips" ref={boxRef} onScroll={sync} role="group" aria-label={label}>
        {children}
      </div>
      {bar && (
        <div className="pool-bar" aria-hidden="true">
          <div
            className="pool-bar-thumb"
            style={{ height: bar.height, transform: `translateY(${bar.top}px)` }}
            onPointerDown={startDrag}
          />
        </div>
      )}
    </div>
  );
}

export default function ReserveModal({ open, onClose, me, onGoSignup }) {
  const [basket, setBasket] = useState([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  // Quyền chọn + bảng giá do server quyết định: ngân sách, nhóm được phép, giá từng mã.
  const [opts, setOpts] = useState(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setOpts(null);
    setError('');
    api
      .reserveOptions(me?.email)
      .then((o) => {
        if (!alive) return;
        setOpts(o);
        // Lựa chọn đã ghi nhận trước đó hiện lại trong ô nhận, để sửa chứ không chọn lại từ đầu.
        setBasket(o.selected ?? []);
      })
      .catch((err) => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, [open, me?.email]);

  if (!open) return null;

  const stockByTicker = Object.fromEntries(Object.values(RESERVABLE).flat().map((s) => [s.t, s]));
  // Để gắn tag phân loại lên chip trong ô đã chọn; hai pool không có mã nào trùng nhau.
  const poolByTicker = Object.fromEntries(POOLS.flatMap((p) => RESERVABLE[p.key].map((s) => [s.t, p.key])));

  const prices = opts?.prices ?? {};
  const budget = opts?.budget ?? 0;
  const total = basket.reduce((sum, t) => sum + (prices[t] ?? 0), 0);
  const left = budget - total;

  const priceOf = (t) => prices[t];
  // Mã đã chọn luôn bấm được (để bỏ ra). Mã chưa chọn phải có giá và còn vừa ngân sách.
  const canPick = (t) => basket.includes(t) || (typeof priceOf(t) === 'number' && priceOf(t) <= left);
  const whyBlocked = (t) =>
    typeof priceOf(t) !== 'number'
      ? 'Chưa có giá cho mã này'
      : `Giá ${vnd(priceOf(t))} vượt phần ngân sách còn lại (${vnd(Math.max(0, left))})`;

  // Hạng ngoài top 1.000 chỉ được nhóm Standard: ẩn hẳn nhóm VIP thay vì cho chọn rồi báo lỗi.
  const visiblePools = opts ? POOLS.filter((p) => opts.pools.includes(p.key)) : POOLS;

  const add = (t) => { setDone(false); setBasket((b) => (b.includes(t) ? b : [...b, t])); };
  const remove = (t) => { setDone(false); setBasket((b) => b.filter((x) => x !== t)); };
  const toggle = (t) => (basket.includes(t) ? remove(t) : add(t));

  const signedUp = Boolean(me);
  // Chưa tải xong quyền chọn thì chưa cho gửi — thà đợi còn hơn để server từ chối cả giỏ.
  const canReceive = signedUp && basket.length > 0 && !busy && Boolean(opts);

  async function receive() {
    setBusy(true);
    setError('');
    try {
      await api.reserve(me.email, basket);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reserve-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div className="stack-4">
            <h2 id="reserve-title" className="h2-card">Reserve cổ phiếu</h2>
            {/* <p className="muted-14">Kéo thả hoặc bấm vào mã để chọn vào ô nhận.</p> */}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Đóng">×</button>
        </div>

        {opts && (
          <div className="reserve-budget">
            <div className="reserve-budget-head">
              <span className="muted-13">
                {/* Không liệt kê tên nhóm ở đây: chuỗi dài bị cắt trên mobile, mà các
                    nhóm được phép đã hiện thành từng mục ngay bên dưới. */}
                {opts.preview ? 'Bản xem thử' : `Ngân sách hạng #${opts.rank ?? '—'}`}
              </span>
              <span className="reserve-budget-num">{vnd(total)} / {vnd(budget)}</span>
            </div>
            <div
              className="bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={budget}
              aria-valuenow={total}
              aria-label={`Đã chọn ${vnd(total)} trong ngân sách ${vnd(budget)}`}
            >
              <div
                className="bar-fill"
                style={{ width: `${budget ? Math.min(100, Math.round((total / budget) * 100)) : 0}%` }}
              />
            </div>
          </div>
        )}

        <section
          className={`dropzone${over ? ' over' : ''}`}
          aria-label="Ô nhận cổ phiếu"
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const t = e.dataTransfer.getData('text/plain');
            if (stockByTicker[t] && canPick(t)) add(t);
          }}
        >
          {basket.length === 0 ? (
            <span className="dropzone-empty">Thả cổ phiếu vào đây</span>
          ) : (
            basket.map((t) => (
              <span key={t} className="chip picked">
                {poolByTicker[t] === 'vip' && <span className="chip-tag">VIP</span>}
                <span className="chip-t">{t}</span>
                <button type="button" className="chip-x" onClick={() => remove(t)} aria-label={`Bỏ ${t}`}>×</button>
              </span>
            ))
          )}
        </section>

        <div className="reserve-pools">
          {visiblePools.map((pool) => {
            // Mã phổ biến xếp trước, phần còn lại nối sau; cả danh sách nằm trong một vùng cuộn.
            const { popular, rest } = POOL_STOCKS[pool.key];
            const stocks = [...popular, ...rest];
            return (
              <section key={pool.key} className="pool" aria-labelledby={`pool-${pool.key}`}>
                <div className="pool-head">
                  <span id={`pool-${pool.key}`} className="pool-title">{pool.label}</span>
                  <span className="muted-13">{pool.desc}</span>
                </div>
                <ScrollBox label={`${stocks.length} mã ${pool.label}`}>
                  {stocks.map((s) => {
                    const picked = basket.includes(s.t);
                    const price = priceOf(s.t);
                    const blocked = Boolean(opts) && !canPick(s.t);
                    return (
                      <button
                        key={s.t}
                        type="button"
                        className={`chip${blocked ? ' chip-off' : ''}`}
                        draggable={!blocked}
                        aria-pressed={picked}
                        aria-disabled={blocked}
                        title={blocked ? `${s.n} — ${whyBlocked(s.t)}` : s.n}
                        onClick={() => { if (!blocked) toggle(s.t); }}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', s.t);
                          e.dataTransfer.effectAllowed = 'copy';
                        }}
                      >
                        <span className="chip-t">{s.t}</span>
                        <span className="chip-n">{s.n}</span>
                        <span className="chip-p">{typeof price === 'number' ? vnd(price) : '—'}</span>
                      </button>
                    );
                  })}
                </ScrollBox>
              </section>
            );
          })}
        </div>


        <div className="reserve-foot">
          {!signedUp && (
            <div className="reserve-hint">
              <span className="muted-14">Đăng ký waitlist bằng email để nhận quà.</span>
              <button type="button" className="link-btn link-accent" onClick={() => { onClose(); onGoSignup(); }}>
                Đăng ký ngay
              </button>
            </div>
          )}
          {error && <p role="alert" className="error">{error}</p>}
          {done && <p className="success-line" role="status">Đã ghi nhận {basket.length} mã cho {me.email}</p>}
          <div className="reserve-actions">
            <span className="muted-14">Đã chọn {basket.length} mã · còn {vnd(Math.max(0, left))}</span>
            <button type="button" className="btn btn-primary" onClick={receive} disabled={!canReceive}>
              {busy ? 'Đang ghi nhận…' : 'Nhận'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
