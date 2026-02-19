# ☁️ Cloudflare Worker Text Database (GitHub Storage)

## 📌 项目简介
本项目是一个基于 Cloudflare Worker 的轻量级文本/数据库管理系统，利用 GitHub API 直接读写仓库文件 (`txt/content.txt`) 作为后端存储，替代传统的 KV 存储。

## ⚙️ 环境变量配置 (Environment Variables)

部署 Worker 后，请在 Cloudflare 后台 -> Settings -> Variables 中添加以下环境变量：

### 必填项 (Required)

| 变量名 | 示例值 | 说明 |
| :--- | :--- | :--- |
| **`ADMIN_UUID`** | `550e8400-e29b-41d4-a716-446655440000` | **管理员访问密钥**。<br>用于访问管理后台：`https://你的域名/<ADMIN_UUID>` |
| **`GITHUB_TOKEN`** | `ghp_xxxxxxxxxxxx` | **GitHub 访问令牌** (Classic Token)。<br>需要勾选 `repo` 权限以读写私有仓库。 |

### 选填项 (Optional)

| 变量名 | 默认值 | 说明 |
| :--- | :--- | :--- |
| **`GUEST_TOKEN`** | *(空)* | **访客访问令牌**。<br>用于 API 接口调用或只读访问 (如 `/txt?token=xxx`)。 |
| `GITHUB_USER` | `hc990275` | GitHub 用户名。 |
| `GITHUB_REPO` | `CloudFlare-worker` | GitHub 仓库名称。 |
| `GITHUB_PATH` | `txt/content.txt` | 数据文件在仓库中的路径。<br>例如 `data/config.txt`。 |

## 🚀 快速开始

1.  创建一个 GitHub 仓库（或使用现有仓库）。
2.  在仓库中创建目标文件（例如 `txt/content.txt`）。
3.  部署此 Worker 代码。
4.  在 Worker 设置中配置上述环境变量。
5.  访问 `https://你的域名/<ADMIN_UUID>` 进入管理后台。

## 🔗 API 接口说明

- **管理后台**: `GET /<ADMIN_UUID>`
- **纯文本导出**: `GET /txt?token=<GUEST_TOKEN>`
- **数据追加**: `POST /api/add?token=<GUEST_TOKEN>` (JSON body: `{ "type": "addr", "data": "..." }`)
- **全量同步**: `POST /api/sync?token=<GUEST_TOKEN>` (Body: 完整文本内容)
