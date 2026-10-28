import { useMemo, useState } from 'react';
import { axisMoney, fmt, money, vnd } from '../lib/format.js';

const W = 1000;
const H = 280;
const CASH = '#E07B2E';

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
      // Vị trí điểm cuối tính theo % chiều cao khung, để vẽ chấm và nhãn bằng HTML chồng lên
      // SVG: SVG đang preserveAspectRatio="none" nên chữ đặt bên trong sẽ bị kéo méo.
      endValue: (finalV / maxV) * 100,
      endCash: (paid / maxV) * 100,
      // Hai nhãn cuối đường đều nằm PHÍA TRÊN đường của mình. Khi lợi nhuận thấp, hai
      // đường sát nhau (bằng 0% thì trùng hẳn) nên nhãn danh mục phải leo cao thêm một
      // nấc, nếu không hai con số đè lên nhau. 20% chiều cao khung ≈ 18px ở bản mobile,
      // vừa đủ cho một dòng chữ 16px.
      stackEnds: (finalV - paid) / maxV < 0.2,
      multiple: (finalV / paid).toLocaleString('vi-VN', { maximumFractionDigits: 1 })
    };
  }, [C, R, N]);

  const aria = `Biểu đồ: đầu tư ${vnd(C)} mỗi tháng trong ${N} năm, lợi nhuận ${R}%/năm, đạt khoảng ${money(calc.finalV)} VNĐ so với ${money(calc.paid)} VNĐ tiền gốc.`;

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
            <span className="kpi-label">Monthly</span>
            <span className="kpi-value">{vnd(C)}</span>
          </div>
          <div className="kpi">
            <span className="kpi-label">Investment</span>
            <span className="kpi-value">{money(calc.paid)}</span>
          </div>
          <div className="kpi kpi-good">
            <span className="kpi-label">ROI</span>
            <span className="kpi-value">{money(calc.finalV)}</span>
            {/* <span className="kpi-label">Gấp {calc.multiple} lần tiền gốc</span> */}
          </div>
        </div>

        <div className="stack-8">
          {/* Đơn vị nằm cùng cụm chú thích bên trái, chừa góc phải trên cho nhãn giá trị cuối đường. */}
          <div className="legend">
            <span><i style={{ background: 'var(--accent)' }} />ROI</span>
            <span><i style={{ background: CASH }} />Investment</span>
            {/* <span className="legend-unit">VNĐ</span> */}
          </div>
          <div className="chart">
            <div className="y-axis">
              {calc.yLabels.map((t, i) => <span key={i}>{t}</span>)}
            </div>
            <div className="chart-plot">
              <div className="chart-area">
                <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={aria}>
                  {[0, 70, 140, 210].map((y) => (
                    <line key={y} x1="0" y1={y} x2={W} y2={y} style={{ stroke: 'var(--grid)' }} strokeWidth="1" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
                  ))}
                  {calc.xTicks.slice(1).map((t) => (
                    <line key={t} x1={(t / N) * W} y1="0" x2={(t / N) * W} y2={H} style={{ stroke: 'var(--grid)' }} strokeWidth="1" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
                  ))}
                  <line x1="0" y1={H} x2={W} y2={H} style={{ stroke: 'var(--axis)' }} strokeWidth="1" vectorEffect="non-scaling-stroke" />
                  <path d={calc.area} fill="var(--accent)" fillOpacity="0.12" stroke="none" />
                  <path d={calc.line} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                  <path d={calc.cash} fill="none" stroke={CASH} strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                </svg>
                {/* Nhãn giá trị ngay ở cuối mỗi đường, khỏi phải dóng mắt sang trục bên trái.
                    Cả hai đặt PHÍA TRÊN đường của mình: đặt nhãn tiền gốc xuống dưới sẽ đè
                    lên đáy biểu đồ và hàng trục năm ở bản mobile (khung chỉ cao 92px). */}
                <span className="chart-dot" style={{ bottom: `${calc.endValue}%`, background: 'var(--accent)' }} />
                <span className="chart-dot" style={{ bottom: `${calc.endCash}%`, background: CASH }} />
                <span
                  className={`chart-end chart-end-up${calc.stackEnds ? ' chart-end-stacked' : ''}`}
                  style={{ bottom: `${calc.endValue}%`, color: 'var(--accent)' }}
                >
                  {money(calc.finalV)}
                </span>
                <span className="chart-end chart-end-up" style={{ bottom: `${calc.endCash}%`, color: CASH }}>{money(calc.paid)}</span>
              </div>
              <div className="x-axis">
                {calc.xTicks.map((t, i) => <span key={t}>{t}{i === calc.xTicks.length - 1 ? ' năm' : ''}</span>)}
              </div>
            </div>
          </div>
        </div>

        <div className="sliders">
          {/* onChange nhận thẳng v, KHÔNG dùng `v || 50000`: min đã là 0 nên phép `||` sẽ
              biến 0 thành 50.000 và thanh trượt không bao giờ kéo về đầu được. */}
          <Slider id="calc-c" label="Monthly Investment" valueText={vnd(C)} min={0} max={2000000} step={10000} value={C} onChange={setC} minText="0đ" maxText="2M VNĐ" />
          <Slider id="calc-r" label="Growth Rate" valueText={`${R}%`} min={0} max={20} step={1} value={R} onChange={(v) => setR(v || 0)} minText="0%" maxText="20%" />
          <Slider id="calc-n" label="Investment Period" valueText={`${fmt(N)} years`} min={1} max={40} step={1} value={N} onChange={(v) => setN(v || 1)} minText="1 year" maxText="40 years" />
        </div>

        {/* <p className="disclaimer">
          Minh hoạ với lãi kép hằng tháng, chưa trừ phí và thuế. Lợi nhuận không được đảm bảo; giá cổ phiếu có thể giảm và kết quả quá khứ không phản ánh tương lai. Đây không phải lời khuyên đầu tư.
        </p> */}
      </div>
    </section>
  );
}
