import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1000,
    // Two pages: the game, and the project report that links to it
    rollupOptions: { input: { main: 'index.html', about: 'about.html' } },
  },
});
