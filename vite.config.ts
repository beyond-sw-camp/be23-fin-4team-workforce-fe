import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: {
          antd: ['antd', '@ant-design/icons'],
          tanstack: ['@tanstack/react-query', '@tanstack/react-router'],
          charts: ['chart.js', 'react-chartjs-2', 'echarts'],
          markdown: ['react-markdown', 'remark-gfm'],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'lottie-web': 'lottie-web/build/player/lottie_light',
    },
  },
  server: {
    // 자기 자신(localhost)을 iframe 으로 띄우는 결재 작성 모달용 - SAMEORIGIN 명시 허용
    headers: {
      'X-Frame-Options': 'SAMEORIGIN',
      'Content-Security-Policy': "frame-ancestors 'self';",
    },
  },
});
