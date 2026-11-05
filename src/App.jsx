import { useEffect, useState } from 'react';
import { api } from './lib/api.js';
import { useCatalog } from './lib/catalog.jsx';
import { fmt } from './lib/format.js';
import Logo from './components/Logo.jsx';
import msbMark from './assets/msb-mark.png';
import SignupCard from './components/SignupCard.jsx';
import FeaturedStocks from './components/FeaturedStocks.jsx';
import TierList from './components/TierList.jsx';
import DcaCalculator from './components/DcaCalculator.jsx';
import HowItWorks from './components/HowItWorks.jsx';
import RewardsPage from './components/RewardsPage.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';
import ReserveModal from './components/ReserveModal.jsx';
import Scarcity from './components/Scarcity.jsx';
import JoinTicker from './components/JoinTicker.jsx';

const SAVED_KEY = 'nexxa_waitlist_me';
const THEME_KEY = 'nexxa_waitlist_theme';

// Dọn profile mà các bản trước đã ghi vào máy người dùng. Không còn khôi phục nó nữa, nên
// để lại chỉ là email và thứ hạng của ai đó nằm trong trình duyệt mà chẳng phục vụ gì.
function dropSavedProfile() {
  try { localStorage.removeItem(SAVED_KEY); } catch { /* bỏ qua */ }
}

function loadTheme() {
  try { return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
}

export default function App() {
  const { totalSlots } = useCatalog();
  const [registered, setRegistered] = useState(0);
  const [last24h, setLast24h] = useState(0);
  // Người đăng ký gần nhất, email đã che sẵn ở server. Đi ké /api/stats nên tự làm mới
  // theo cùng nhịp 30 giây, không thêm request nào.
  const [recent, setRecent] = useState([]);
  // Không khôi phục từ localStorage: tải lại trang là về form đăng ký, không phải màn kết
  // quả của lượt trước. Trang này là trang mời đăng ký — mở lên mà thấy kết quả cũ thì nó
  // hết làm được việc của mình, và trên máy dùng chung người sau nhìn thấy email người trước.
  // Muốn xem lại kết quả chỉ cần nhập lại email: api.check trả về ngay, không phải nhập OTP.
  const [me, setMe] = useState(null);
  const [theme, setTheme] = useState(loadTheme);
  const [reserveOpen, setReserveOpen] = useState(false);
  // Giỏ cổ phiếu người chưa đăng ký đã chọn trong modal Reserve. Giữ ở App chứ không ở trong
  // modal: modal đóng lại khi về form đăng ký, mà lựa chọn thì phải sống qua bước đó — chọn
  // xong rồi mất giỏ là mất luôn lý do người ta điền email.
  const [pendingBasket, setPendingBasket] = useState([]);

  // Gọi lại mỗi 30 giây: con số nhúc nhích ngay trước mắt người đang đọc trang có sức ép
  // khác hẳn một con số tĩnh nạp một lần lúc mở. Tab bị ẩn thì ngừng gọi — không ai nhìn.
  useEffect(() => {
    let alive = true;
    const pull = () => {
      if (document.hidden) return;
      api.stats()
        .then((s) => {
          if (!alive) return;
          setRegistered(s.registered);
          setLast24h(s.last24h ?? 0);
          setRecent(s.recent ?? []);
        })
        .catch(() => {});
    };
    pull();
    const timer = setInterval(pull, 30000);
    document.addEventListener('visibilitychange', pull);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', pull);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* bỏ qua */ }
  }, [theme]);

  // Xoá profile còn sót từ bản cũ. Chạy một lần lúc mở trang.
  useEffect(dropSavedProfile, []);

  const handleJoined = async (profile) => {
    setMe(profile);
    setRegistered(profile.registered);

    // Đã chọn cổ phiếu trước khi đăng ký thì ghi nhận luôn, không bắt mở lại modal chọn lần
    // hai. Lỗi ở đây nuốt im: đăng ký đã thành công rồi, giỏ vẫn còn trong modal để thử lại.
    if (pendingBasket.length) {
      try { await api.reserve(profile.email, pendingBasket); } catch { /* bỏ qua */ }
      setPendingBasket([]);
    }
  };

  const handleReset = () => setMe(null);

  // Định tuyến bằng hash: site build dưới /waitlist/ nên không đụng tới đường dẫn, và không
  // cần thêm thư viện router cho đúng một trang phụ.
  const [route, setRoute] = useState(() => window.location.hash);
  useEffect(() => {
    const onHash = () => { setRoute(window.location.hash); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (route === '#/rewards') {
    return (
      <RewardsPage
        me={me}
        registered={registered}
        totalSlots={totalSlots}
        onBack={() => { window.location.hash = ''; }}
      />
    );
  }

  return (
    <div className="page">
      <header className="container header">
        <div className="brand">
          <Logo theme={theme} />
        </div>
        <div className="header-actions">
          <ThemeToggle theme={theme} onToggle={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))} />
        </div>
      </header>

      {/* Ngay dưới header, trước cả headline: bằng chứng người thật đang đăng ký phải đập
          vào mắt trước khi người đọc kịp nghi ngờ lời mời phía dưới có thật hay không. */}
      <JoinTicker recent={recent} />

      <ReserveModal
        open={reserveOpen}
        onClose={() => setReserveOpen(false)}
        me={me}
        initialBasket={pendingBasket}
        onGoSignup={(basket) => {
          setPendingBasket(basket);
          setReserveOpen(false);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

      <main className="container hero">
        <section className="hero-main">
          <div className="hero-copy">
            {/* <span className="hero-brand">NEXXA</span> */}
            <span className="eyebrow eyebrow-partner">
              Đối tác Ngân hàng MSB
              <img className="partner-mark" src={msbMark} width={90} height={54} alt="" />
            </span>
            <h1>
              {/* Xây Dựng Tài Sản Cùng NEXXA */}
              <span className="h1-accent">Tặng Cổ Phiếu</span>
            </h1>
            {/* Hai dòng là MỘT ý: ai được (điều kiện) rồi được gì (phần thưởng). Bọc chung
                để khoảng cách giữa chúng hẹp hơn khoảng cách với h1 và khối khan hiếm —
                để rời nhau cùng cỡ chữ thì đọc thành hai câu không liên quan. */}
            <div className="lead-group">
              <p className="lead-cond">{fmt(totalSlots)} người đăng ký NEXXA đầu tiên</p>
              <p className="lead">Nhận cổ phiếu VIP — lên tới 10 mã</p>
            </div>
            <FeaturedStocks />
          </div>
          <SignupCard
            me={me}
            onJoined={handleJoined}
            onReset={handleReset}
            onOpenReserve={() => setReserveOpen(true)}
            pendingBasket={pendingBasket}
          />
        <Scarcity registered={registered} total={totalSlots} last24h={last24h} />
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
