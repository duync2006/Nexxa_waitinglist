import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { POOLS, POOL_STOCKS, RESERVABLE } from '../lib/data.js';

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

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const stockByTicker = Object.fromEntries(Object.values(RESERVABLE).flat().map((s) => [s.t, s]));
  // Để gắn tag phân loại lên chip trong ô đã chọn; hai pool không có mã nào trùng nhau.
  const poolByTicker = Object.fromEntries(POOLS.flatMap((p) => RESERVABLE[p.key].map((s) => [s.t, p.key])));
  const add = (t) => { setDone(false); setBasket((b) => (b.includes(t) ? b : [...b, t])); };
  const remove = (t) => { setDone(false); setBasket((b) => b.filter((x) => x !== t)); };
  const toggle = (t) => (basket.includes(t) ? remove(t) : add(t));

  const signedUp = Boolean(me);
  const canReceive = signedUp && basket.length > 0 && !busy;

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

        <section
          className={`dropzone${over ? ' over' : ''}`}
          aria-label="Ô nhận cổ phiếu"
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const t = e.dataTransfer.getData('text/plain');
            if (stockByTicker[t]) add(t);
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
          {POOLS.map((pool) => {
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
                    return (
                      <button
                        key={s.t}
                        type="button"
                        className="chip"
                        draggable
                        aria-pressed={picked}
                        title={s.n}
                        onClick={() => toggle(s.t)}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', s.t);
                          e.dataTransfer.effectAllowed = 'copy';
                        }}
                      >
                        <span className="chip-t">{s.t}</span>
                        <span className="chip-n">{s.n}</span>
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
            <span className="muted-14">Đã chọn {basket.length} mã</span>
            <button type="button" className="btn btn-primary" onClick={receive} disabled={!canReceive}>
              {busy ? 'Đang ghi nhận…' : 'Nhận'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
