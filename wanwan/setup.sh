#!/bin/sh

# ==================================================================
# ⬇️ 远程一键安装运行命令 (请直接复制到终端运行，无需取消注释)
# 
# 如果你的 setup.sh 放在仓库根目录，请使用：
# wget -qO- https://raw.githubusercontent.com/hc990275/yhjs/main/setup.sh | sh
#
# 如果你的 setup.sh 放在 wanwan 文件夹内，请使用：
# wget -qO- https://raw.githubusercontent.com/hc990275/yhjs/main/wanwan/setup.sh | sh
# ==================================================================

echo "================================================="
echo " ⬇️ 【Alpine 首次一键安装环境命令】(没装过环境才需要跑)"
echo "================================================="
# 更新源并安装 nodejs, npm 和 pm2
apk update && apk add --no-cache nodejs npm && npm install -g pm2

echo "================================================="
echo " 正在创建目录并下载 s5fj.js 代码..."
echo "================================================="
# 创建工作目录并进入
mkdir -p /root/yhjs_app
cd /root/yhjs_app

# 从你的同一仓库中下载 JS 文件
wget -O s5fj.js https://raw.githubusercontent.com/hc990275/yhjs/main/wanwan/s5fj.js

echo "================================================="
echo " 正在使用 PM2 启动脚本并设置开机自启..."
echo "================================================="
# 清理之前可能跑着的旧进程
pm2 delete s5fj 2>/dev/null || true

# 每次启动脚本前先清理旧日志
pm2 flush s5fj 2>/dev/null || true

# 启动脚本
pm2 start s5fj.js --name "s5fj"

# 保存当前 PM2 进程列表
pm2 save

# 设置 Alpine 的开机自启 (自动识别环境)
pm2 startup alpine -u root --hp /root || pm2 startup

echo ""
echo "================================================="
echo " 🎉 安装部署完成！"
echo " ⬇️ 【日常运维命令】(使用 pm2 守护进程):"
echo " 1. 启动并应用新代码:    pm2 restart all"
echo " 2. 设置开机自启(两步):  pm2 startup (如上方自动自启失败，请手动执行这行)"
echo "                        pm2 save"
echo " 3. 查看实时日志:        pm2 logs s5fj"
echo "================================================="
