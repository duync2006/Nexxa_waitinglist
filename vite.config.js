import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Bản build production được phục vụ tại nexxa.asia/waitlist/ (xem nginx); dev vẫn chạy ở /
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/waitlist/' : '/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
      '/r': 'http://localhost:3001'
    }
  }
}));
