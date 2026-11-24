import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../entrypoints/options/App';
import { installNative } from './native';
import '../components/styles.css';

// 设置页：在 Android 主界面的 WebView 中复用扩展的设置页（模型、档案、规则、样例），并提供“权限与运行”分区。
installNative({ host: 'activity' });
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
