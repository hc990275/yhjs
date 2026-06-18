#!/bin/bash
# Nginx Minecraft 端口转发一键部署脚本

# 检查是否为 root
if [ "$EUID" -ne 0 ]; then
  echo -e "\033[31m[错误] 请使用 root 用户或 sudo 运行此脚本\033[0m"
  exit 1
fi

# 默认目标 IP
TARGET_IP="218.161.50.241"

# 如果执行脚本时附带了 IP 参数，则使用新 IP（如 bash install.sh 1.1.1.1）
if [ -n "$1" ]; then
    TARGET_IP="$1"
fi

echo -e "\033[36m[信息] 目标源站 IP 设置为: $TARGET_IP\033[0m"

# 1. 安装 Nginx (适配 Debian/Ubuntu)
if ! command -v nginx &> /dev/null; then
    echo -e "\033[33m[进度] 正在安装 Nginx...\033[0m"
    apt-get update -y && apt-get install -y nginx
else
    echo -e "\033[32m[信息] Nginx 已安装，跳过安装步骤。\033[0m"
fi

# 2. 检查并注入 stream 模块主配置
NGINX_CONF="/etc/nginx/nginx.conf"
STREAM_DIR="/etc/nginx/stream.d"

mkdir -p "$STREAM_DIR"

# 检查 Nginx 主配置文件中是否已经包含了我们自定义的 stream 目录
if ! grep -q "include $STREAM_DIR/\*.conf;" "$NGINX_CONF"; then
    echo -e "\033[33m[进度] 正在向 $NGINX_CONF 注入 stream 配置块...\033[0m"
    # 将 stream 块追加到文件末尾
    echo -e "\n# Minecraft 代理使用的 stream 模块\nstream {\n    include $STREAM_DIR/*.conf;\n}" >> "$NGINX_CONF"
fi

# 3. 写入具体的转发规则
echo -e "\033[33m[进度] 正在生成 Minecraft 代理规则...\033[0m"
cat <<EOF > "$STREAM_DIR/minecraft.conf"
    # ----------------------------------------
    # 1. Minecraft Java 版反向代理 (纯 TCP)
    # ----------------------------------------
    server {
        listen 25565;
        proxy_pass $TARGET_IP:25565;
        proxy_timeout 600s;
        proxy_connect_timeout 10s;
    }

    # ----------------------------------------
    # 2. Minecraft 基岩版反向代理 (纯 UDP)
    # ----------------------------------------
    server {
        listen 19132 udp;
        proxy_pass $TARGET_IP:19132;
        proxy_timeout 60s;
        proxy_responses 1;
    }
EOF

# 4. 自动放行系统级防火墙
echo -e "\033[33m[进度] 正在配置系统防火墙...\033[0m"
if command -v ufw &> /dev/null; then
    echo -e " -> 检测到 UFW，正在放行 25565/tcp 和 19132/udp..."
    ufw allow 25565/tcp >/dev/null 2>&1
    ufw allow 19132/udp >/dev/null 2>&1
    ufw reload >/dev/null 2>&1
elif command -v firewall-cmd &> /dev/null; then
    echo -e " -> 检测到 firewalld，正在放行 25565/tcp 和 19132/udp..."
    firewall-cmd --permanent --add-port=25565/tcp >/dev/null 2>&1
    firewall-cmd --permanent --add-port=19132/udp >/dev/null 2>&1
    firewall-cmd --reload >/dev/null 2>&1
elif command -v iptables &> /dev/null; then
    echo -e " -> 检测到 iptables，正在写入规则..."
    iptables -I INPUT -p tcp --dport 25565 -j ACCEPT
    iptables -I INPUT -p udp --dport 19132 -j ACCEPT
    # 尝试保存规则防止重启失效
    if command -v netfilter-persistent &> /dev/null; then
        netfilter-persistent save >/dev/null 2>&1
    elif command -v service &> /dev/null; then
        service iptables save >/dev/null 2>&1
    fi
else
    echo -e "\033[33m -> 未检测到常见防火墙(ufw/firewalld/iptables)，跳过系统防火墙配置。\033[0m"
fi

# 5. 测试并重启 Nginx
echo -e "\033[33m[进度] 正在测试 Nginx 配置...\033[0m"
if nginx -t; then
    systemctl restart nginx
    
    # 获取外网 IP
    echo -e "\033[33m[进度] 正在获取服务器外网 IP...\033[0m"
    PUBLIC_IP=$(curl -s --max-time 3 ipv4.icanhazip.com || curl -s --max-time 3 ifconfig.me || echo "你的服务器公网IP")
    
    echo -e "\n\033[32m========================================================\033[0m"
    echo -e "\033[1;32m🎉 部署成功！Nginx 反向代理已生效。\033[0m"
    echo -e "\033[32m目标源站: \033[1;36m$TARGET_IP\033[0m"
    echo -e "\033[32m========================================================\033[0m"
    echo -e "\033[36m请通知玩家使用以下地址连接游戏：\033[0m"
    echo -e "\033[1;33m▶ Minecraft Java版 (TCP)  :  ${PUBLIC_IP}:25565\033[0m"
    echo -e "\033[1;33m▶ Minecraft 基岩版 (UDP)  :  ${PUBLIC_IP}:19132\033[0m"
    echo -e "\033[32m========================================================\033[0m\n"
else
    echo -e "\033[31m[错误] Nginx 配置文件语法有误，请检查错误信息！\033[0m"
    exit 1
fi
