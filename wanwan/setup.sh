#!/bin/sh

# ==================================================================
# ⬇️ 远程一键安装运行命令 (请直接复制到终端运行)
# wget -qO- https://raw.githubusercontent.com/hc990275/yhjs/main/wanwan/setup.sh | sh
# ==================================================================

echo "================================================="
echo " ⬇️ 【Alpine 首次一键安装环境命令】"
echo "================================================="
apk update && apk add --no-cache nodejs npm && npm install -g pm2

echo "================================================="
echo " 正在创建目录并下载 s5fj.js 代码..."
echo "================================================="
mkdir -p /root/yhjs_app
cd /root/yhjs_app
wget -O s5fj.js https://raw.githubusercontent.com/hc990275/yhjs/main/wanwan/s5fj.js

echo "================================================="
echo " 正在使用 PM2 启动脚本并设置开机自启..."
echo "================================================="
# 清理可能残留的旧进程
pm2 delete s5fj 2>/dev/null || true

# 每次启动脚本前，必须先清理旧日志
pm2 flush s5fj 2>/dev/null || true

# 单实例启动（无哈希负载均衡）
pm2 start s5fj.js --name "s5fj"

# 保存当前 PM2 进程列表
pm2 save

# 设置 Alpine 的开机自启 (精准匹配 openrc)
pm2 startup openrc -u root --hp /root

echo ""
echo "================================================="
echo " 🎉 安装部署完成！"
echo " ⬇️ 【日常运维命令】(使用 pm2 守护进程):"
echo " 1. 启动并应用新代码:    pm2 restart all"
echo " 2. 保存并更新自启配置:  pm2 save"
echo " 3. 查看最近 500 行日志: pm2 logs s5fj --lines 500"
echo "================================================="
