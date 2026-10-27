import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { tierOfRank } from '../lib/data.js';
import { fmt, vnd } from '../lib/format.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readRef() {
  try { return new URLSearchParams(window.location.search).get('ref') || null; } catch { return null; }
}

export default function SignupCard({ me, onJoined, onReset, onOpenReserve }) {
  const [ref] = useState(readRef);
  // Vào bằng link mời thì luôn mở form đăng ký, kể cả khi trình duyệt còn profile cũ —
  // link mời là để người mới đăng ký, không phải để xem lại kết quả của người đang ngồi máy.
  const [step, setStep] = useState(me && !ref ? 'result' : 'email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [devOtp, setDevOtp] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [returning, setReturning] = useState(false);

  // Mất me (bấm "Dùng email khác") thì quay lại form nhập email. Thiếu nhánh này sẽ kẹt ở
  // step 'result' và render ra card rỗng. Chiều ngược lại do submitEmail/submitOtp tự gọi.
  useEffect(() => {
    if (me) return;
    setStep('email');
    setEmail('');
    setOtp('');
    setError('');
    setReturning(false);
  }, [me]);

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
      // Email đã tham gia waitlist thì hiện luôn kết quả hiện tại, không bắt xác thực lại
      const found = await api.check(email.trim());
      if (found.exists) {
        setReturning(true);
        onJoined(found.profile);
        setStep('result');
        return;
      }
      setReturning(false);
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
      setReturning(false);
      onJoined(profile);
      setStep('result');
    } catch (err) {
      // Email vừa được đăng ký ở nơi khác giữa lúc nhập OTP: server trả 409 kèm kết quả hiện tại
      if (err.data?.alreadyRegistered && err.data.profile) {
        setReturning(true);
        onJoined(err.data.profile);
        setStep('result');
        return;
      }
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
              placeholder="nexxa@email.com"
              autoComplete="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(''); }}
            />
            <button type="submit" className="btn btn-primary btn-grow" disabled={busy}>
              {busy ? 'Đang gửi…' : 'Tham gia waitlist'}
            </button>
          </div>
          <button type="button" className="btn btn-outline" onClick={onOpenReserve}>Reserve</button>
          {error && <p role="alert" className="error">{error}</p>}
          <p className="muted-sm">
            Chúng tôi sẽ gửi mã xác thực 6 số tới email này.
            {ref && <> Bạn được mời bởi mã <strong>{ref.toUpperCase()}</strong>.</>}
          </p>
          {me && (
            <button type="button" className="link-btn link-accent" onClick={() => setStep('result')}>
              Xem kết quả của tôi →
            </button>
          )}
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

      {step === 'result' && me && <Result me={me} returning={returning} onReset={onReset} onOpenReserve={onOpenReserve} />}
    </div>
  );
}

function Result({ me, returning, onReset, onOpenReserve }) {
  const [copied, setCopied] = useState(false);
  const myTier = tierOfRank(me.rank);
  const invitesTo = (target) => Math.max(1, Math.ceil((me.rank - target) / 10));

  const refUrl = `${window.location.origin}${import.meta.env.BASE_URL}r/${me.refCode}`;
  const refShown = refUrl.replace(/^https?:\/\//, '');
  const shareText = 'Đăng ký waitlist Nexxa để nhận cổ phiếu Việt Nam miễn phí!';

  let nextTitle, nextBody;
  // if (myTier?.key === 'gold') {
  //   nextTitle = 'Bạn đang ở hạng cao nhất.';
  //   nextBody = 'Người khác cũng có thể leo hạng — mời bạn bè để giữ vững vị trí trong top 200.';
  // } else if (myTier?.key === 'silver') {
  //   nextTitle = `Mời ${invitesTo(200)} bạn để lên GOLD`;
  //   nextBody = '(cổ phiếu VN30 trị giá 100.000đ).';
  // } else if (myTier) {
  //   nextTitle = `Mời ${invitesTo(400)} bạn để lên SILVER`;
  //   nextBody = `(cổ phiếu trị giá 60.000đ), hoặc ${invitesTo(200)} bạn để lên GOLD.`;
  // } else {
  //   nextTitle = `Mời ${invitesTo(1000)} bạn để vào top 1.000`;
  //   nextBody = 'và nhận cổ phiếu COPPER trị giá 40.000đ.';
  // }

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
        <span>{returning ? 'Email này đã tham gia waitlist' : 'Đăng ký thành công'} · {me.email}</span>
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
          <span className="gift-group">{myTier.group}</span>
        </div>
      ) : (
        <div className="gift-box neutral">
          <span className="gift-full">1.000 suất quà đã có chủ</span>
          <span className="gift-group">Bạn vẫn giữ chỗ trong waitlist và được dùng Nexxa sớm. Leo vào top 1.000 để nhận cổ phiếu.</span>
        </div>
      )}


      <div className="invite">
        <div className="stack-2">
          <span className="invite-title">Mời bạn bè, leo hạng nhanh hơn</span>
          <span className="muted-14">Mỗi lượt đăng ký qua link = <strong className="ink">+10 bậc</strong></span>
        </div>
        <div className="row-wrap-8">
          <div className="ref-box" title={refUrl}>{refShown}</div>
          <button
            type="button"
            className="btn-copy"
            onClick={copy}
            aria-label={copied ? 'Đã sao chép link mời' : 'Sao chép link mời'}
            title={copied ? 'Đã chép' : 'Sao chép'}
          >
            {copied ? (
              <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
                <path d="M4.5 10.5l3.6 3.6L15.5 6.7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
                <rect x="7.25" y="7.25" width="8.5" height="8.5" rx="2" stroke="currentColor" strokeWidth="1.7" fill="none" />
                <path d="M12.75 4.25H6A1.75 1.75 0 0 0 4.25 6v6.75" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>
        {/* <div className="row-wrap-8">
          <button type="button" className="btn-share" onClick={nativeShare}>Chia sẻ qua Zalo</button>
          <a className="btn-share" href={fbUrl} target="_blank" rel="noopener noreferrer">Facebook</a>
          {isMobile ? (
            <a className="btn-share" href={`fb-messenger://share?link=${encodeURIComponent(refUrl)}`}>Messenger</a>
          ) : (
            <button type="button" className="btn-share" onClick={nativeShare}>Messenger</button>
          )}
        </div> */}
        <div className="invite-foot">
          <span>Đã mời {fmt(me.invites)} bạn · +{fmt(me.invites * 10)} bậc</span>
          <button type="button" className="link-btn small" onClick={onReset}>Dùng email khác</button>
        </div>
      </div>

      <button type="button" className="btn btn-outline" onClick={onOpenReserve}>Reserve</button>
    </div>
  );
}
