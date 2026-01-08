这是一个基于你提供的资料以及参考视频内容整理的 `README.md` 文档，旨在帮助用户快速了解并部署 MTProxy。

---

# MTProxy 一键安装脚本 (MTP 协议)

本项目提供一个简单易用的 Telegram 专用 MTProxy 一键安装脚本。MTProxy（MTP 协议）由 Telegram 官方设计，专门用于优化 Telegram 的网络连接，具有安全、高速、可靠等特点。

## 🚀 协议优势

* **专用性**：专门针对 Telegram 流量进行优化 [[00:38](http://www.youtube.com/watch?v=ovn_paWMqHw&t=38)]。
* **安全兼容**：作为加密软件的专属协议，安全性与兼容性优于通用代理工具 [[00:48](http://www.youtube.com/watch?v=ovn_paWMqHw&t=48)]。
* **高速传递**：相比传统 VPN，信息传递更直接、延迟更低 [[01:11](http://www.youtube.com/watch?v=ovn_paWMqHw&t=71)]。
* **弱连接可靠性**：在网络环境不稳定或频繁切换时，能保持 Telegram 持续在线不掉线 [[00:13](http://www.youtube.com/watch?v=ovn_paWMqHw&t=13)]。

## 🛠️ 安装步骤

### 1. 准备工作

确保你拥有一台 VPS（推荐使用 Ubuntu/CentOS/Debian 系统）。

### 2. 执行安装命令

在终端中依次输入以下两条命令：

**第一步：创建工作目录**

```bash
mkdir /home/mtproxy && cd /home/mtproxy

```

**第二步：下载并运行脚本**

```bash
curl -s -o mtproxy.sh https://raw.githubusercontent.com/ellermister/mtproxy/master/mtproxy.sh && chmod +x mtproxy.sh && bash mtproxy.sh

```

> **提示**：安装过程中可根据提示选择版本（默认推荐版本 1）、设置连接端口（默认 443）以及伪装域名。如果不确定，可直接按**回车键**使用默认配置 [[06:09](http://www.youtube.com/watch?v=ovn_paWMqHw&t=369)]。

## 📖 使用方式

### 服务管理

* **启动服务**：`bash mtproxy.sh start`
* **停止服务**：`bash mtproxy.sh stop`
* **重启服务**：`bash mtproxy.sh restart`
* **调试运行**：`bash mtproxy.sh debug`

### 卸载脚本

```bash
rm -rf /home/mtproxy

```

## 📱 Telegram 设置方法

安装完成后，脚本会输出 IP、端口和密匙 (Secret)。

1. 打开 Telegram，进入 **设置 (Settings)** -> **高级 (Advanced)** [[06:54](http://www.youtube.com/watch?v=ovn_paWMqHw&t=414)]。
2. 选择 **连接类型 (Connection Type)** -> **使用自定义代理 (Use custom proxy)** [[07:12](http://www.youtube.com/watch?v=ovn_paWMqHw&t=432)]。
3. 选择 **MTPROTO** 协议。
4. 填写服务器 IP、端口和密匙，保存即可。

## 🔗 参考资料

* **详细博客教程**: [https://blog.ugoearn.com/telegram_proxy/](https://blog.ugoearn.com/telegram_proxy/)
* **YouTube 视频演示**: [优哥跨境 - Telegram直连教程](https://www.youtube.com/watch?v=ovn_paWMqHw)

---

**注意**：请在符合当地法律法规的前提下使用本脚本。
