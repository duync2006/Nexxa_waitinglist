import { useEffect, useState } from 'react';
import { api } from './lib/api.js';
import { TOTAL_SLOTS } from './lib/data.js';
import { fmt } from './lib/format.js';
import Logo from './components/Logo.jsx';
import SignupCard from './components/SignupCard.jsx';
import TierList from './components/TierList.jsx';
import StockLists from './components/StockLists.jsx';
import DcaCalculator from './components/DcaCalculator.jsx';
import HowItWorks from './components/HowItWorks.jsx';

const SAVED_KEY = 'nexxa_waitlist_me';

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY)) || null; } catch { return null; }
}

export default function App() {
  const [registered, setRegistered] = useState(0);
  const [me, setMe] = useState(loadSaved);

  useEffect(() => {
    api.stats().then((s) => setRegistered(s.registered)).catch(() => {});
  }, []);

  const handleJoined = (profile) => {
    setMe(profile);
    setRegistered(profile.registered);
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(profile)); } catch { /* bỏ qua */ }
  };

  const handleReset = () => {
    setMe(null);
    try { localStorage.removeItem(SAVED_KEY); } catch { /* bỏ qua */ }
  };

  const remaining = Math.max(0, TOTAL_SLOTS - Math.min(TOTAL_SLOTS, registered));

  return (
    <div className="page">
      <header className="container header">
        <div className="brand">
          <Logo />
          <span className="brand-name">Nexxa</span>
        </div>
        <div className="pill-status">
          <span className="dot" />
          <span>Còn {fmt(remaining)} / {fmt(TOTAL_SLOTS)} suất quà</span>
        </div>
      </header>

      <main className="container hero">
        <section className="hero-main">
          <div className="hero-copy">
            <span className="eyebrow">Nexxa Waitlist · 1.000 suất đầu tiên</span>
            <h1>Đăng ký sớm,<br />nhận cổ phiếu miễn phí.</h1>
            <p className="lead">
              1.000 người đầu tiên trong waitlist nhận cổ phiếu Việt Nam miễn phí, trị giá đến 100.000đ. Hạng càng cao, quà càng lớn.
            </p>
          </div>
          <SignupCard me={me} onJoined={handleJoined} onReset={handleReset} />
        </section>

        <TierList registered={registered} myRank={me?.rank} />
      </main>

      <StockLists />
      <DcaCalculator />
      <HowItWorks />

      <footer className="footer">
        <div className="container footer-inner">
          <span className="footer-terms">
            Áp dụng cho 1.000 email đầu tiên đã xác thực. Giá trị cổ phiếu quy đổi theo giá thị trường tại thời điểm phân bổ. [ĐIỀU KHOẢN CHI TIẾT]
          </span>
          <span>© 2026 Nexxa · <a href="#terms">Điều khoản chương trình</a></span>
        </div>
      </footer>
    </div>
  );
}
