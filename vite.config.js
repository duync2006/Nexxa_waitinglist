import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Bản build production được phục vụ tại nexxa.asia/waitlist/ (xem nginx); dev vẫn chạy ở /
export default defineConfig(({ command }) => ({
  base: '/waitlist/',
  plugins: [react()],
  server: {
    // host: true => lắng nghe trên 0.0.0.0, mở cho các máy khác trong LAN truy cập
    host: true,
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
      '/r': 'http://localhost:3001',
      // base là /waitlist/ nên fetch tới /waitlist/api/..., bỏ tiền tố này trước khi gửi sang API
      '/waitlist/api': { target: 'http://localhost:3001', rewrite: (p) => p.replace(/^\/waitlist/, '') },
      '/waitlist/r': { target: 'http://localhost:3001', rewrite: (p) => p.replace(/^\/waitlist/, '') }
    }
  }
}));
