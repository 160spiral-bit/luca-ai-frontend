import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: 'index.html',
        chat: 'chat.html',
        about: 'about.html',
      },
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          motion: ['gsap', '@barba/core'],
        },
      },
    },
  },
});
