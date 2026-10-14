import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { STOCKS, tierOfRank } from '../lib/data.js';
import { fmt, vnd } from '../lib/format.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readRef() {
  try { return new URLSearchParams(window.location.search).get('ref') || null; } catch { return null; }
}

export default function SignupCard({ me, onJoined, onReset }) {
  const [step, setStep] = useState(me ? 'result' : 'email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [devOtp, setDevOtp] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [ref] = useState(readRef);

  useEffect(() => { if (me) setStep('result'); }, [me]);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function sendCode() {
    const res = await api.requestOtp(email.trim(), ref);
    setDevOtp(res.devOtp || '');
    setCooldown(60);
  }

  async function submitEmail(e) {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) {
      setError('Email chưa đúng định dạng. Vui lòng kiểm tra lại.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await sendCode();
      setOtp('');
      setStep('otp');
    } catch (err) {
      // Đang trong thời gian chờ gửi lại → vẫn cho nhập mã đã gửi trước đó
      if (/đợi/.test(err.message)) setStep('otp');
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitOtp(e) {
    e.preventDefault();
    if (otp.length !== 6) {
      setError('Vui lòng nhập đủ 6 số.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const profile = await api.verify(email.trim(), otp);
      onJoined(profile);
      setStep('result');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (cooldown > 0 || busy) return;
    setBusy(true);
    setError('');
    try { await sendCode(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <div className="card signup">
      {step === 'email' && (
        <form className="stack-12" onSubmit={submitEmail} noValidate>
          <label htmlFor="wl-email" className="label-lg">Email của bạn</label>
          <div className="row-wrap">
            <input
              id="wl-email"
              className="input"
              type="email"
              placeholder="ban@email.com"
              autoComplete="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(''); }}
            />
            <button type="submit" className="btn btn-primary btn-grow" disabled={busy}>
              {busy ? 'Đang gửi…' : 'Tham gia waitlist'}
            </button>
          </div>
          {error && <p role="alert" className="error">{error}</p>}
          <p className="muted-sm">
            Chúng tôi sẽ gửi mã xác thực 6 số tới email này. Không spam.
            {ref && <> Bạn được mời bởi mã <strong>{ref.toUpperCase()}</strong>.</>}
          </p>
        </form>
      )}

      {step === 'otp' && (
        <form className="stack-14" onSubmit={submitOtp} noValidate>
          <div className="stack-4">
            <h2 className="h2-card">Nhập mã xác thực</h2>
            <p className="muted">Mã 6 số đã được gửi tới <strong className="ink">{email.trim()}</strong></p>
          </div>
          <label htmlFor="wl-otp" className="label">Mã OTP</label>
          <input
            id="wl-otp"
            className="input input-otp"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            value={otp}
            autoFocus
            onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
          />
          {devOtp && <p className="dev-hint">Chế độ dev — mã OTP: <strong>{devOtp}</strong></p>}
          {error && <p role="alert" className="error">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Đang xác thực…' : 'Xác nhận'}</button>
          <div className="otp-actions">
            <button type="button" className="link-btn" onClick={() => { setStep('email'); setError(''); setOtp(''); }}>Đổi email</button>
            <button type="button" className="link-btn link-accent" onClick={resend} disabled={cooldown > 0 || busy}>
              {cooldown > 0 ? `Gửi lại mã (${cooldown}s)` : 'Gửi lại mã'}
            </button>
          </div>
        </form>
      )}

      {step === 'result' && me && <Result me={me} onReset={onReset} />}
    </div>
  );
}

function Result({ me, onReset }) {
  const [copied, setCopied] = useState(false);
  const myTier = tierOfRank(me.rank);
  const invitesTo = (target) => Math.max(1, Math.ceil((me.rank - target) / 10));

  const refUrl = `${window.location.origin}${import.meta.env.BASE_URL}r/${me.refCode}`;
  const refShown = refUrl.replace(/^https?:\/\//, '');
  const shareText = 'Đăng ký waitlist Nexxa để nhận cổ phiếu Việt Nam miễn phí!';

  let nextTitle, nextBody;
  if (myTier?.key === 'gold') {
    nextTitle = 'Bạn đang ở hạng cao nhất.';
    nextBody = 'Người khác cũng có thể leo hạng — mời bạn bè để giữ vững vị trí trong top 200.';
  } else if (myTier?.key === 'silver') {
    nextTitle = `Mời ${invitesTo(200)} bạn để lên GOLD`;
    nextBody = '(cổ phiếu VN30 trị giá 100.000đ).';
  } else if (myTier) {
    nextTitle = `Mời ${invitesTo(400)} bạn để lên SILVER`;
    nextBody = `(cổ phiếu trị giá 60.000đ), hoặc ${invitesTo(200)} bạn để lên GOLD.`;
  } else {
    nextTitle = `Mời ${invitesTo(1000)} bạn để vào top 1.000`;
    nextBody = 'và nhận cổ phiếu COPPER trị giá 40.000đ.';
  }

  const tier = myTier
    ? { label: myTier.label, fg: myTier.fg, bg: myTier.bg }
    : { label: 'NGOÀI TOP 1.000', fg: '#374151', bg: '#ECEFF3' };

  async function copy() {
    try { await navigator.clipboard.writeText(refUrl); } catch { /* bỏ qua */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function nativeShare() {
    if (navigator.share) {
      try { await navigator.share({ title: 'Nexxa Waitlist', text: shareText, url: refUrl }); return; } catch { return; }
    }
    copy();
  }

  const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(refUrl)}`;
  const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);

  return (
    <div className="stack-20">
      <div className="success-line">
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="9" fill="#DCFCE7" />
          <path d="M6 10.2l2.7 2.6L14 7.5" stroke="#15803D" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>Đăng ký thành công · {me.email}</span>
      </div>

      <div className="rank-row">
        <div className="stack-2">
          <span className="muted-14">Vị trí của bạn trong waitlist</span>
          <span className="rank-big">#{fmt(me.rank)}</span>
        </div>
        <span className="tier-pill" style={{ background: tier.bg, color: tier.fg }}>{tier.label}</span>
      </div>

      {myTier ? (
        <div className="gift-box" style={{ background: myTier.bg }}>
          <span className="gift-kicker" style={{ color: myTier.fg }}>Phần quà dự kiến</span>
          <span className="gift-value">Cổ phiếu trị giá {vnd(myTier.value)}</span>
          <span className="gift-group">
            {myTier.group} · VD: {STOCKS[myTier.key].slice(0, 5).map((x) => x.t).join(', ')}…
          </span>
        </div>
      ) : (
        <div className="gift-box" style={{ background: '#F1F3F6' }}>
          <span className="gift-full">1.000 suất quà đã có chủ</span>
          <span className="gift-group">Bạn vẫn giữ chỗ trong waitlist và được dùng Nexxa sớm. Leo vào top 1.000 để nhận cổ phiếu.</span>
        </div>
      )}

      <p className="next-step"><strong>{nextTitle}</strong> {nextBody}</p>

      <div className="invite">
        <div className="stack-2">
          <span className="invite-title">Mời bạn bè, leo hạng nhanh hơn</span>
          <span className="muted-14">Mỗi người đăng ký qua link của bạn = <strong className="ink">+10 bậc</strong>.</span>
        </div>
        <div className="row-wrap-8">
          <div className="ref-box" title={refUrl}>{refShown}</div>
          <button type="button" className="btn btn-dark" onClick={copy}>{copied ? 'Đã chép' : 'Sao chép'}</button>
        </div>
        <div className="row-wrap-8">
          <button type="button" className="btn-share" onClick={nativeShare}>Chia sẻ qua Zalo</button>
          <a className="btn-share" href={fbUrl} target="_blank" rel="noopener noreferrer">Facebook</a>
          {isMobile ? (
            <a className="btn-share" href={`fb-messenger://share?link=${encodeURIComponent(refUrl)}`}>Messenger</a>
          ) : (
            <button type="button" className="btn-share" onClick={nativeShare}>Messenger</button>
          )}
        </div>
        <div className="invite-foot">
          <span>Đã mời {fmt(me.invites)} bạn · +{fmt(me.invites * 10)} bậc</span>
          <button type="button" className="link-btn small" onClick={onReset}>Dùng email khác</button>
        </div>
      </div>
    </div>
  );
}
