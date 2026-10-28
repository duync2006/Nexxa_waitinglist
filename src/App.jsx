import { useEffect, useState } from 'react';
import { api } from './lib/api.js';
import { TOTAL_SLOTS } from './lib/data.js';
import { fmt } from './lib/format.js';
import Logo from './components/Logo.jsx';
import SignupCard from './components/SignupCard.jsx';
import FeaturedStocks from './components/FeaturedStocks.jsx';
import TierList from './components/TierList.jsx';
import DcaCalculator from './components/DcaCalculator.jsx';
import HowItWorks from './components/HowItWorks.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';
import ReserveModal from './components/ReserveModal.jsx';

const SAVED_KEY = 'nexxa_waitlist_me';
const THEME_KEY = 'nexxa_waitlist_theme';

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY)) || null; } catch { return null; }
}

function loadTheme() {
  try { return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
}

export default function App() {
  const [registered, setRegistered] = useState(0);
  const [me, setMe] = useState(loadSaved);
  const [theme, setTheme] = useState(loadTheme);
  const [reserveOpen, setReserveOpen] = useState(false);

  useEffect(() => {
    api.stats().then((s) => setRegistered(s.registered)).catch(() => {});
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* bỏ qua */ }
  }, [theme]);

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
          <Logo theme={theme} />
        </div>
        <div className="header-actions">
          <div className="pill-status">
            <span className="dot" />
            <span>Còn {fmt(remaining)} / {fmt(TOTAL_SLOTS)} suất quà</span>
          </div>
          <ThemeToggle theme={theme} onToggle={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))} />
        </div>
      </header>

      <ReserveModal
        open={reserveOpen}
        onClose={() => setReserveOpen(false)}
        me={me}
        onGoSignup={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      />

      <main className="container hero">
        <section className="hero-main">
          <div className="hero-copy">
            {/* <span className="hero-brand">NEXXA</span> */}
            <span className="eyebrow">Đối tác Ngân hàng MSB & Chứng khoán MSB</span>
            <h1>
              {/* Xây Dựng Tài Sản Cùng NEXXA */}
              <span className="h1-accent">Cổ Phiếu Miễn Phí</span>
            </h1>
            <p className="lead">
              <strong className="lead-kicker">1.000 NGƯỜI ĐẦU TIÊN + TOP 1.000</strong>
              Nhận Cổ Phiếu VIP
            </p>
          </div>
          <SignupCard me={me} onJoined={handleJoined} onReset={handleReset} onOpenReserve={() => setReserveOpen(true)} />
          <FeaturedStocks />
        </section>
      </main>

      {/* <TierList registered={registered} myRank={me?.rank} /> */}

      <HowItWorks />
      <DcaCalculator />

      <footer className="footer">
        <div className="container footer-inner">
          <span className="footer-terms">
            Giá trị cổ phiếu quy đổi theo giá thị trường tại thời điểm phân bổ. [ĐIỀU KHOẢN CHI TIẾT]
          </span>
          <span>© 2026 Nexxa · <a href="#terms">Điều khoản chương trình</a></span>
        </div>
      </footer>
    </div>
  );
}
