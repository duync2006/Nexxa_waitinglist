import logoLight from '../assets/nexxa-logo.png';
import logoDark from '../assets/nexxa-logo-dark.png';

// Ảnh đã cắt sát nội dung và bỏ nền trắng (nguồn: public/Nexxa-Logo.png). Khối chữ "nexxa"
// nằm sẵn trong ảnh — đừng kèm thêm chữ Nexxa bên cạnh, sẽ thành đọc hai lần.
//
// Bản dark đổi chữ "nexxa" sang màu sáng: màu gốc là navy gần đen, đặt lên nền dark mode
// (#0a0e08) thì chìm hẳn, chỉ còn trơ mỗi chữ N. Chữ N là gradient xanh/tím sáng nên giữ
// nguyên ở cả hai bản.
//
// width/height là kích thước thật của file, chỉ để trình duyệt chừa sẵn chỗ khi ảnh chưa
// tải xong; kích thước hiển thị do .brand-logo trong styles.css quyết định.
export default function Logo({ theme }) {
  return (
    <img
      className="brand-logo"
      src={theme === 'dark' ? logoDark : logoLight}
      width={370}
      height={108}
      alt="Nexxa"
    />
  );
}

