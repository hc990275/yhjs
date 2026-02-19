# 功能清单与实施计划 (Implementation Plan)

## 目标说明
用户已要求移除 `worker.js` 中的备份功能（已完成），并列出 `worker.js` 和 `wg.js` (油猴脚本) 的所有现有功能以供查阅。

## 功能清单

### 1. Cloudflare Worker (`worker.js`)
**后端服务与管理后台**

**核心服务:**
- **GitHub 文件存储**: 使用 GitHub 仓库 (`hc990275/CloudFlare-worker`) 中的文件作为数据存储，替代 Cloudflare KV。
- **身份验证**:
    - **管理员访问**: 通过 URL 路径中的 `ADMIN_UUID` 进行验证。
    - **API/访客访问**: 通过 `GUEST_TOKEN` 进行鉴权 (Token 也存储在 GitHub 文件中或环境变量)。

**API 接口:**
- `POST /api/add`: **数据追加** - 向 GitHub 文件追加新数据。
- `POST /api/sync`: **全量同步** - 接收客户端上传的完整数据并更新 GitHub 文件。
- `GET /txt`: **纯文本导出** - 获取 GitHub 文件的原始内容。
- `GET /raw`, `/md`: **其他导出** - 提供下载或 Markdown 预览格式。
- `GET /<ADMIN_UUID>`: Renders the Admin Dashboard.

**[已移除功能]**:
- KV 存储支持。
- AI 智能清洗 (`/api/ai_clean` 及相关 UI)。
- 订阅接口 (`/sub`)。
- TVBox 接口 (`/tvbox`)。
- Clash 配置接口 (`/clash`)。
- 备份功能 (`/api/backup/*`)。

**环境变量 (新增):**
- `GITHUB_TOKEN`: GitHub Personal Access Token。
- `GITHUB_USER`: `hc990275`。
- `GITHUB_REPO`: `CloudFlare-worker`。
- **GITHUB_PATH**: 数据文件在仓库中的路径 (默认为 `txt/content.txt`)。
- `GUEST_TOKEN`: 访客 Token (可选，或存储在文件中)。

**管理后台 (Web UI):**
- **数据管理**: 可视化查看、添加、删除黑名单、地址和电话数据。
- **源码编辑**: 提供原始文本编辑器，支持手动修改所有数据。
- **Markdown 预览**: 实时预览数据的 Markdown 渲染效果。
- **AI 工具箱**: 集成 AI 清洗功能的触发界面，展示清洗日志（*备份功能已移除*）。
- **分享管理**: 生成并复制用于油猴脚本或订阅的访问 Token 和链接。

### 2. 油猴脚本 (`wg.js`)
**前端自动化辅助 (v15.6.9)**

**核心功能:**
- **自动抓取 (Scraping)**:
    - 实时监听订单页 (`/substituteDrivingOrder`) 和司机页 (`/driverAll`) 的 DOM 变化。
    - 自动提取表格中的**电话**和**地址**信息。
- **智能过滤 & 去重**:
    - **排除关键词/列**: 根据配置排除特定列（如第6列）包含特定关键词（如"腾讯出行"）的行。
    - **本地去重**: 抓取的数据与本地存储比对，重复数据不录入。
    - **黑名单过滤**: 自动拦截包含黑名单关键词（如"位置", "司机"等）的地址。
    - **格式校验**: 自动校验手机号格式 (`1\d{10}`) 和地址长度。
- **本地数据库**:
    - 使用 `GM_setValue` / `GM_getValue` 在浏览器本地存储数据 (上限 80000 条)。
    - 支持手动导入/导出数据文件。
- **云端同步**:
    - **拉取 (Pull)**: 从 Worker 获取最新数据，合并或覆盖本地库。
    - **推送 (Push)**: 将本地清洗后的数据全量上传至 Worker。
    - **自动清洗**: 推送前自动执行本地黑名单清洗。

**UI 界面:**
- **悬浮窗**: 可拖拽、缩放的控制面板。
- **数据列表**: 分页展示本地地址库、电话库和黑名单。
- **一键操作**: 支持一键复制、删除单条数据。
- **主题切换**: 支持“暗黑模式”与“明亮模式”切换。

**自动化流程:**
- **自动刷新**:
    - 订单页/司机页支持倒计时自动点击刷新按钮。
    - 派单页 (`/substituteDrivingDispatch`) 支持极速刷新 (500ms)。
- **一键填充**:
    - 自动识别页面输入框，一键填充地址或电话。
    - 智能匹配 Placeholder 关键词（如"起点", "电话"）。
- **智能滑块**: 根据当前时间自动调整派单页面的距离滑块值 (2km/3km)。

## 已完成变更
### `worker.js` 重构计划
#### [NEW] GitHub 存储集成
1.  **新增环境变量**: `GITHUB_TOKEN`, `GITHUB_USER`, `GITHUB_REPO`, `GITHUB_PATH`。
2.  **实现 GitHub API 交互**:
    - `fetchGithubFile()`: 获取文件内容 (GET /repos/:owner/:repo/contents/:path)。
    - `updateGithubFile()`: 更新文件内容 (PUT /repos/:owner/:repo/contents/:path)，需要处理 `sha`。

#### [DELETE] 移除功能
1.  **移除 KV 绑定**: 删除 `env.KV` 相关代码。
2.  **移除 AI 功能**: 删除 `/api/ai_clean` 接口及前端“AI 智能工具”按钮和弹窗。
3.  **移除导出接口**: 删除 `/sub`, `/tvbox`, `/clash` 接口。
4.  **移除备份功能**: 确认已彻底清理。

#### [MODIFY] 更新逻辑
1.  **数据读写**: 将所有 KV 读写操作替换为 GitHub API 调用。
2.  **前端适配**: 更新管理后台 HTML，移除被删除功能的入口。

## 验证计划
### 手动验证
1.  **检查管理后台**:
    - 确认“AI 智能工具”弹窗中不再显示备份相关按钮和列表。
    - 确认其他功能（AI 清洗、日志查看、数据管理）正常运行。
2.  **代码检查**:
    - 确认所有备份相关的死代码已清理干净。
