import { useMemo, useState } from 'react';
import { axisMoney, fmt, money, vnd } from '../lib/format.js';

const W = 1000;
const H = 280;

function niceMax(x) {
  if (x <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const k = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((m) => m * p >= x);
  return k * p;
}

function Slider({ id, label, valueText, min, max, step, value, onChange, minText, maxText }) {
  return (
    <div className="slider">
      <div className="slider-head">
        <label htmlFor={id}>{label}</label>
        <span className="slider-val">{valueText}</span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseInt(e.target.value, 10))} />
      <div className="slider-scale"><span>{minText}</span><span>{maxText}</span></div>
    </div>
  );
}

export default function DcaCalculator() {
  const [C, setC] = useState(50000);
  const [R, setR] = useState(10);
  const [N, setN] = useState(30);

  const calc = useMemo(() => {
    const mr = R / 100 / 12;
    const fv = (m) => (mr === 0 ? C * m : (C * (Math.pow(1 + mr, m) - 1)) / mr);
    const pts = [];
    for (let y = 0; y <= N; y++) pts.push({ v: fv(y * 12), c: C * y * 12 });
    const finalV = pts[N].v;
    const paid = C * N * 12;
    const maxV = niceMax(finalV);
    const X = (i) => ((i / N) * W).toFixed(1);
    const Y = (v) => (H - (v / maxV) * H).toFixed(1);
    const line = pts.map((p, i) => (i ? 'L' : 'M') + X(i) + ',' + Y(p.v)).join(' ');
    const cash = pts.map((p, i) => (i ? 'L' : 'M') + X(i) + ',' + Y(p.c)).join(' ');
    return {
      finalV,
      paid,
      line,
      cash,
      area: `${line} L${W},${H} L0,${H} Z`,
      yLabels: [1, 0.75, 0.5, 0.25, 0].map((k) => axisMoney(maxV * k)),
      xTicks: [...new Set([0, 1, 2, 3, 4, 5].map((k) => Math.round((N * k) / 5)))],
      multiple: (finalV / paid).toLocaleString('vi-VN', { maximumFractionDigits: 1 })
    };
  }, [C, R, N]);

  const aria = `Biểu đồ: đầu tư ${vnd(C)} mỗi tháng trong ${N} năm, lợi nhuận ${R}%/năm, đạt khoảng ${money(calc.finalV)} so với ${money(calc.paid)} tiền gốc.`;

  return (
    <section id="tinh-toan" className="container section">
      <div className="stack-4">
        <span className="eyebrow">Đầu tư định kỳ (DCA) trên Nexxa</span>
        <h2 className="h2">Mỗi tháng một ít, sở hữu những gì bạn biết</h2>
        <p className="muted section-lead wide">
          {/* Trên Nexxa, bạn mua cổ phiếu blue-chip đều đặn mỗi tháng, từ 50.000đ. Kéo các thanh trượt để xem danh mục lãi kép có thể tăng trưởng thế nào so với chỉ để tiền mặt, giả định lợi nhuận bình quân {R}%/năm. */}
        </p>
      </div>

      <div className="calc-card">
        <div className="kpis">
          <div className="kpi">
            <span className="kpi-label">Mỗi tháng</span>
            <span className="kpi-value">{vnd(C)}</span>
          </div>
          <div className="kpi">
            <span className="kpi-label">Tổng tiền gốc bỏ ra</span>
            <span className="kpi-value">{money(calc.paid)}</span>
          </div>
          <div className="kpi kpi-good">
            <span className="kpi-label">Giá trị dự kiến sau {N} năm</span>
            <span className="kpi-value">{money(calc.finalV)}</span>
            <span className="kpi-label">Gấp {calc.multiple} lần tiền gốc</span>
          </div>
        </div>

        <div className="stack-8">
          <span className="muted-13">Giá trị danh mục (VNĐ)</span>
          <div className="chart">
            <div className="y-axis">
              {calc.yLabels.map((t, i) => <span key={i}>{t}</span>)}
            </div>
            <div className="chart-plot">
              <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={aria}>
                {[0, 70, 140, 210].map((y) => (
                  <line key={y} x1="0" y1={y} x2={W} y2={y} style={{ stroke: 'var(--grid)' }} strokeWidth="1" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
                ))}
                <line x1="0" y1={H} x2={W} y2={H} style={{ stroke: 'var(--axis)' }} strokeWidth="1" vectorEffect="non-scaling-stroke" />
                <path d={calc.area} fill="var(--accent)" fillOpacity="0.12" stroke="none" />
                <path d={calc.line} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                <path d={calc.cash} fill="none" stroke="#E07B2E" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              </svg>
              <div className="x-axis">
                {calc.xTicks.map((t) => <span key={t}>{t}</span>)}
              </div>
              <span className="x-title">Số năm đầu tư</span>
            </div>
          </div>
          <div className="legend">
            <span><i style={{ background: 'var(--accent)' }} />Danh mục cổ phiếu trên Nexxa (lãi kép)</span>
            <span><i style={{ background: '#E07B2E' }} />Tổng tiền gốc (không sinh lời)</span>
          </div>
        </div>

        <div className="sliders">
          <Slider id="calc-c" label="Số tiền mỗi tháng" valueText={vnd(C)} min={50000} max={5000000} step={50000} value={C} onChange={(v) => setC(v || 50000)} minText="50.000đ" maxText="5 triệu" />
          <Slider id="calc-r" label="Lợi nhuận kỳ vọng / năm" valueText={`${R}%`} min={0} max={20} step={1} value={R} onChange={(v) => setR(v || 0)} minText="0%" maxText="20%" />
          <Slider id="calc-n" label="Thời gian đầu tư" valueText={`${fmt(N)} năm`} min={1} max={40} step={1} value={N} onChange={(v) => setN(v || 1)} minText="1 năm" maxText="40 năm" />
        </div>

        {/* <p className="disclaimer">
          Minh hoạ với lãi kép hằng tháng, chưa trừ phí và thuế. Lợi nhuận không được đảm bảo; giá cổ phiếu có thể giảm và kết quả quá khứ không phản ánh tương lai. Đây không phải lời khuyên đầu tư.
        </p> */}
      </div>
    </section>
  );
}
