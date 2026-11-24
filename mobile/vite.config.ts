import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Android 客户端的网页资源：悬浮面板与设置页，输出到 APK assets，由 WebViewAssetLoader 加载。
const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: here('.'),
  base: './',
  plugins: [react()],
  build: {
    outDir: here('../android/app/src/main/assets/web'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        panel: here('panel.html'),
        settings: here('settings.html'),
      },
    },
  },
});
