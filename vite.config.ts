import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  optimizeDeps: {
    entries: ['index.html'],
  },
  server: {
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/target/**'],
    },
  },
});
