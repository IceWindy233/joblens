import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  imports: false,
  // 输出到可见目录（.output 在 macOS 访达中默认隐藏）
  outDir: 'dist',
  manifest: {
    name: 'JobLens · 职镜',
    description: '基于当前招聘职位与所选简历的 AI 求职分析助手',
    minimum_chrome_version: '116',
    permissions: ['sidePanel', 'storage', 'tabs'],
    host_permissions: ['https://www.zhipin.com/*'],
    optional_host_permissions: ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*'],
    action: { default_title: '打开 JobLens' },
  },
});
