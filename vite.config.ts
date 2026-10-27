import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1000,
    // Two pages: the write-up at / and the game at /play/
    rollupOptions: { input: { main: 'index.html', play: 'play/index.html' } },
  },
});
