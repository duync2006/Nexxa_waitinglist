// Đọc và kiểm tra biến môi trường. Thiếu thì ném lỗi ngay lúc nạp module thay vì để server
// chạy tiếp với giá trị mặc định — bản cũ fallback về mongodb://localhost:27017 nên khi quên
// khai báo .env thì server im lặng nối vào một DB rỗng khác và mọi thứ "chạy được" nhưng sai.
function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Thiếu biến môi trường ${name}. Sao chép .env.example thành .env và điền giá trị trước khi chạy.`
    );
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT) || 3001,
  isProd: process.env.NODE_ENV === 'production',
  mongoUri: required('MONGODB_URI'),
  mongoDb: process.env.MONGODB_DB || 'nexxa_waitlist'
};
