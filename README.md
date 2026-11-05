<p align="center"><img src="docs/icon.png" width="96" alt="JobLens"></p>

<h1 align="center">JobLens · 职镜</h1>

<p align="center">在 BOSS 直聘浏览职位时，用你自己的简历档案和你自己配置的大模型，<br>一键得到岗位匹配分析与可直接使用的打招呼语。</p>

---

JobLens 是一个 Chrome 侧边栏扩展（Manifest V3）。打开 BOSS 直聘职位页后，它会读取当前职位的 JD，结合你选择的简历档案调用 OpenAI 兼容的模型接口，给出：

- **辅助评分与结论**：0–100 分，以及“推荐投递 / 可以考虑 / 不太匹配”
- **主要优势**：JD 要求 ↔ 你档案中的对应证据
- **主要差距**：JD 要求而档案中未体现的能力（如实列出，不回避）
- **打招呼语**：按你的写作规则生成，可编辑后一键复制

> [!NOTE]
> 插件**不会**自动发送消息、自动投递或批量操作；所有模型调用都只在你点击按钮时发生。

## 功能特点

- **多简历档案**：不同求职方向各建一份档案（如“前端开发方向”“数据分析方向”），每份有独立的摘要、能力边界说明和打招呼规则，分析时互不串用。
- **本地解析简历**：PDF（pdf.js）/ DOCX（mammoth）在浏览器本地提取文字，支持一键遮蔽手机号、邮箱、身份证号；可用模型把简历整理成档案摘要，也可手写。
- **自动跟随职位**：在列表页点选职位或进入职位详情页，侧边栏自动识别当前职位；切换标签页也会跟随。
- **结果按“职位 × 档案 × 档案版本”缓存**：来回切换职位或档案时，已分析的结果直接恢复，修改档案后自动视为过期。
- **自带模型**：任何 OpenAI 兼容接口（OpenAI、DeepSeek、通义、Moonshot、本地 Ollama 等），需要支持 `/chat/completions`。
- **抗干扰抽取**：自动剔除 BOSS 页面在 JD 中插入的隐藏干扰字，还原形近替换字；薪资如使用字体反爬则留空，不做破解。

## 安装

### 方式一：下载发布包（推荐）

1. 在本仓库的 **Releases** 页面下载最新的 `joblens-x.y.z-chrome.zip` 并解压。
2. Chrome 打开 `chrome://extensions`，打开右上角 **开发者模式**。
3. 点击 **加载已解压的扩展程序**，选择解压后的文件夹（里面直接能看到 `manifest.json`）。
4. 安装后会自动打开设置页。

### 方式二：从源码构建

需要 Node.js ≥ 22.12 和 pnpm 11（可用 `corepack enable` 自动启用）。

```bash
pnpm install
pnpm build          # 产物在 dist/chrome-mv3
```

然后按上面的步骤 2–3 加载 `dist/chrome-mv3` 目录。

> [!TIP]
> 更新代码后重新 `pnpm build`，在 `chrome://extensions` 点 JobLens 卡片上的刷新按钮，再**刷新已打开的 BOSS 页面**。

要求 Chrome 116 及以上（侧边栏 API）；建议使用最新版 Chrome。

## 使用

1. **配置模型**（设置页 → 模型设置）
   - API Base URL：例如 `https://api.openai.com/v1`、`https://api.deepseek.com/v1`；本地服务可用 `http://localhost:11434/v1`。
   - 模型名称、API Key。
   - 点击 **保存**，在弹窗中授予该 API 域名的访问权限；可点 **测试连接** 验证。
   - 如需浏览器重启后免输入，勾选 **在本机记住 API Key**（见下文隐私说明）。
2. **新建简历档案**（设置页 → 简历档案）
   - 上传文字版 PDF / DOCX，检查提取的文字，可一键遮蔽联系方式。
   - 点 **整理档案** 让模型生成摘要，或直接手写；核对“补充事实与能力边界”“目标岗位”等字段。
   - **打招呼语规则**已预填一套通用规则，可在末尾追加你的个人约定（例如某段经历的统一称呼、某个项目在哪类岗位上提及）。规则只影响打招呼语，不影响评分和差距分析。
3. **分析职位**
   - 打开 BOSS 直聘职位列表页或职位详情页，点击工具栏的 JobLens 图标打开侧边栏。
   - 选择档案，点击 **分析当前职位**，查看结果；编辑打招呼语后点 **复制打招呼语**，自行粘贴到聊天框。

## 隐私与安全

| 数据 | 存放位置 | 何时离开浏览器 |
|---|---|---|
| 简历档案、设置 | `chrome.storage.local`（仅本机） | 点击“整理档案”时，简历文字发送给**你配置的**模型服务商 |
| 职位 JD | 不持久保存 | 点击“分析”时，与档案摘要/规则一起发送给你配置的模型服务商（**不含**简历原文） |
| API Key（默认） | `chrome.storage.session`，浏览器重启后清空 | 仅作为请求头发给你配置的 API 地址 |
| API Key（勾选“记住”） | `chrome.storage.local`，**明文** | 同上 |

- 没有任何开发者服务器、统计或遥测；除了你配置的模型接口，扩展不访问其他网络地址。
- 网页和注入页面的内容脚本都读不到 API Key 和档案；内容脚本只读取当前职位文本，不修改页面。
- “记住 API Key”是明文保存：能访问你电脑上浏览器数据的人或恶意软件可以读取。建议为 JobLens 单独创建一个设置了额度上限的 Key。
- 模型服务商如何处理你发送的数据，取决于该服务商的政策。

## 已知限制

- 目前只支持 **BOSS 直聘**（列表页右侧详情面板与 `/job_detail/` 职位详情页）。页面结构改版可能导致读取失败，侧边栏会提示“职位读取失败”。
- 列表页的薪资通常使用字体反爬，读取为空；详情页一般可读。
- 不支持扫描版 PDF / 图片简历（无 OCR），也不支持 `.doc`。
- 扩展安装或更新后，已打开的 BOSS 页面需要刷新。
- 评分由模型主观给出，仅供参考，不代表录用概率；不同模型结果差异可能较大。

## 页面改版了怎么办

侧边栏底部的 **开发诊断 → 下载页面结构** 会导出当前页面的结构骨架（标签、class、可见文字片段、被判定为不可见的元素），以及 JobLens 实际读取到的字段，不需要打开开发者工具。据此更新 [`adapters/boss/selectors.ts`](adapters/boss/selectors.ts) 并补充测试样本即可。快照含页面上的真实文字，分享前请自行检查。

欢迎附上快照提交 Issue。

## 开发

```bash
pnpm dev        # 开发模式（自动打开带扩展的 Chrome，热更新）
pnpm compile    # 类型检查
pnpm test       # 单元测试（Vitest + jsdom）
pnpm check      # 类型检查 + 单元测试
pnpm build      # 生产构建 → dist/chrome-mv3
pnpm zip        # 构建并打包 → dist/joblens-<version>-chrome.zip
```

技术栈：[WXT](https://wxt.dev) · React 19 · TypeScript · pdf.js · mammoth · Vitest。

```
entrypoints/
  background.ts         # 点击图标打开侧边栏；首次安装打开设置页
  content.ts            # 注入 BOSS 页面，只读当前职位（JobState）
  sidepanel/            # 侧边栏：职位、档案选择、分析结果、打招呼语
  options/              # 设置页：模型设置、简历档案管理
adapters/boss/          # BOSS 页面适配：选择器、抽取、变化监听、诊断快照
analysis/               # 分析 Prompt、结果校验、分析流程
llm/                    # OpenAI 兼容客户端（超时、取消、错误映射）
profile/                # 简历解析、遮蔽、档案整理与管理
storage/                # chrome.storage 封装
shared/                 # 类型、消息契约、错误码、文本工具
tests/                  # 单元测试与 DOM 样本
```

### 发布新版本

1. 修改 `package.json` 的 `version`（扩展 manifest 版本取自这里），提交。
2. 打同名标签并推送：

   ```bash
   git tag v0.1.0
   git push origin main --tags
   ```

3. GitHub Actions 的 **Release** 工作流会校验版本号、运行类型检查和测试、打包，并创建附带 `joblens-<version>-chrome.zip` 的 Release（`v0.x` 标记为预发布）。

每次推送到 `main` 或提交 PR，**CI** 工作流都会运行类型检查、测试和打包，构建产物可在该次运行的 Artifacts 中下载。

## 免责声明

本项目为个人学习与求职辅助工具，与 BOSS 直聘（看准科技）无任何关联。BOSS 直聘用户协议对第三方工具有相关条款，请自行评估使用风险；请勿用于批量采集、自动沟通等违反平台规则的用途。

## 许可证

[MIT](LICENSE)
