import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Относительный base, чтобы сборка работала и в корне домена, и на GitHub Pages (/<repo>/).
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: true },
});
