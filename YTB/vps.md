这是为您整合了 **视频教程** 和 **博客文章** 详细内容的 **2026 WebHostMost 永久免费服务器部署最终版教程**。

我已将视频中提到的关键操作（如 Cloudflare 解析、代码修改行数、订阅地址格式）补充到了步骤中，确保您“看文即懂”。

---

# 2026 WebHostMost 永久免费服务器部署教程 (终极版)

本教程基于 [YouTube 视频教程](https://www.youtube.com/watch?v=mSeqp-iYZBs) 和 [博客文章](https://kjgx668.blogspot.com/2025/12/6ipyoutube4kchatgpttioktok.html) 整理。无需实名、无需信用卡，轻松搭建支持 4K 秒开、解锁 ChatGPT 的高速节点。

## 📺 教程来源

* **视频教程**：[点击观看 YouTube 视频](https://www.youtube.com/watch?v=mSeqp-iYZBs)
* **图文博客**：[点击查看 Blogspot 文章](https://kjgx668.blogspot.com/2025/12/6ipyoutube4kchatgpttioktok.html)

---

## 🛠️ 第一步：必备工具与资源 (请先打开)

请在操作前准备好以下所有页面：

1. **主机注册**
* **WebHostMost 官网**：[https://webhostmost.com](https://webhostmost.com)


2. **身份信息生成** (注册时使用)
* **真实地址生成器**：[http://ip-geoaddress-generator-1ip.pages.dev/](http://ip-geoaddress-generator-1ip.pages.dev/)
* **美国地址生成器**：[https://www.meiguodizhi.com/](https://www.meiguodizhi.com/)


3. **部署必备**
* **项目代码 (GitHub)**：[https://github.com/eishare/DirectAdmin-Vless-ws-tls](https://github.com/eishare/DirectAdmin-Vless-ws-tls)
* **UUID 生成器**：[https://1024tools.com/uuid](https://1024tools.com/uuid)
* **Cloudflare (域名解析)**：[https://www.cloudflare.com/zh-cn/](https://www.cloudflare.com/zh-cn/)
* **优选域名/IP**：[https://mrxn.net/BESTCFDOMAIN](https://mrxn.net/BESTCFDOMAIN)



---

## ⚙️ 第二步：详细部署流程

### 1. 注册与创建主机

1. 进入 WebHostMost 官网，点击 **"Free Trial"** (免费试用) 或 **"Order Now"**。
2. **域名选择**：选择 "I will use my existing domain and update my nameservers"，随便输入一个域名（例如 `test.com`，后续会改）。
3. **配置选择**：Location (地区) 建议选 **India (印度)** 或其他可用地区。
4. **填写信息**：使用上方的“地址生成器”填入虚假信息。**注意：邮箱必须真实**，需要接收验证码。
5. 完成订单，去邮箱点击验证链接，激活服务。

### 2. Cloudflare 域名解析 (关键)

1. 登录 Cloudflare，添加一个你拥有的域名（如果没有，可去申请免费域名）。
2. 在 WebHostMost 后台找到你的 **服务器 IP 地址**。
3. 在 Cloudflare 中添加 **A 记录**：
* **类型**：A
* **名称**：任意前缀 (如 `v1`)
* **内容**：WebHostMost 的服务器 IP
* **代理状态**：**开启 (小黄云)**


4. 保存，稍后会用到这个完整域名 (如 `v1.yourdomain.com`)。

### 3. 服务器端配置

1. 回到 WebHostMost 面板 (DirectAdmin)。
2. **绑定域名**：进入 "Domain Setup"，删除注册时填的乱填域名，添加你在 Cloudflare 解析好的域名 (如 `v1.yourdomain.com`)。
3. **上传代码**：
* 进入 "File Manager" -> `public_html` 目录。
* 删除目录下原有文件。
* 创建新文件 `index.js`，将 GitHub 项目中的 `index.js` 代码全部复制进去。
* 创建新文件 `package.json` (或根据项目说明上传对应文件)。


4. **修改代码 (非常重要)**：
* 打开 `index.js` 编辑。
* **第 5 行**：填入你生成的 **UUID**。
* **第 6 行**：填入你的 **域名**。
* 保存文件。



### 4. 启动 Node.js 应用

1. 在面板中找到 **"Setup Node.js App"**。
2. 点击 **"Create Application"**。
3. 填写配置参数（**必须完全一致**）：
* **Node.js Version**: 推荐选择 `20` 或最新版。
* **Application Mode**: `Production`
* **Application Root**: `public_html`
* **Application URL**: 选择你的域名。
* **Application Startup File**:
```text
index.js

```




4. 点击右上角 **"Create"**。
5. 点击 **"Run NPM Install"** 安装依赖。
6. 点击 **"Start App"** 启动服务器。

---

## 🚀 第三步：获取节点与连接

1. **验证启动**：在浏览器访问你的域名。如果显示正常页面（或特定的伪装页面），说明部署成功。
2. **获取订阅/节点**：
* 在浏览器地址栏输入：
```text
http://你的域名/你的UUID

```


* 例如：`http://v1.test.com/550e8400-e29b...`


3. **导入软件**：页面会显示 VLESS 节点信息，直接复制导入到 v2rayN、Clash 或 Shadowrocket 中即可使用。

---

## ⚠️ 核心注意事项 (防封号必读)

* **禁止测速**：免费容器严禁使用测速软件（Speedtest等），瞬间大流量会导致封号。
* **流量使用**：虽然标称无限流量，但建议仅用于观看视频（YouTube 4K 无压力）和网页浏览，避免长时间下载大文件。
* **服务恢复**：如果节点突然失效（被删除），通常是配置丢失。只需回到 WebHostMost 后台的 Node.js 界面，**重新 Create Application** (无需重新上传文件)，即可瞬间复活。
