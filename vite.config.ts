import { defineConfig } from 'vite';

// Tauri ждёт dev-сервер на фиксированном порту.
export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ['**/src-tauri/**'] } },
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true },
});
