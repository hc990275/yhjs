#!/bin/bash

# ==============================================================================
# 脚本名称: setup_proxy.sh
# 脚本功能: 自动化安装 Nginx 并配置 Stream 模块，同时转发 Java版(TCP) 和 基岩版(UDP)
# ==============================================================================

# 定义被墙的游戏源站真实 IP
BACKEND_IP="218.161.50.241"

# 定义对应的端口号
JAVA_PORT="25565"
BEDROCK_PORT="19132"

echo "=================================================="
echo " 正在启动 Minecraft 双版本(TCP+UDP) 端口转发脚本"
echo "=================================================="

# ------------------------------------------------------------------------------
# 步骤 1: 安装 Nginx 环境
# ------------------------------------------------------------------------------
echo "[1/4] 正在更新系统并安装 Nginx..."
sudo apt update -y
sudo apt install nginx -y

# ------------------------------------------------------------------------------
# 步骤 2: 写入双协议 Stream 转发规则
# ------------------------------------------------------------------------------
echo "[2/4] 正在配置 Nginx 混合协议转发规则..."

# 校验当前 Nginx 是否支持 stream 模块
if ! nginx -V 2>&1 | grep -q 'with-stream'; then
    echo "❌ 错误: 当前系统的 Nginx 编译版本不支持 stream 模块。"
    exit 1
fi

# 构造同时包含 TCP 和 UDP 转发的配置块
# 严格保持层级展开，拒绝压缩
STREAM_CONFIG="
stream {
    # ----------------------------------------------
    # 1. Minecraft Java 版转发 (纯 TCP 协议)
    # ----------------------------------------------
    server {
        listen ${JAVA_PORT};
        proxy_pass ${BACKEND_IP}:${JAVA_PORT};
        proxy_timeout 600s;
        proxy_connect_timeout 10s;
    }

    # ----------------------------------------------
    # 2. Minecraft 基岩版转发 (纯 UDP 协议)
    # ----------------------------------------------
    server {
        # 【关键点】此处必须显式指定 udp 关键字
        listen ${BEDROCK_PORT} udp;
        proxy_pass ${BACKEND_IP}:${BEDROCK_PORT};
        
        # UDP 是无状态协议，超时时间通常设置得比 TCP 短
        proxy_timeout 60s;
        proxy_connect_timeout 10s;
        
        # 允许接收来自源站的回应数据包
        proxy_responses 1;
    }
}
"

# 检查防止重复写入
if grep -q "stream {" /etc/nginx/nginx.conf; then
    echo "⚠️ 提示: /etc/nginx/nginx.conf 中已存在 stream 配置，跳过追加。"
else
    echo "$STREAM_CONFIG" | sudo tee -a /etc/nginx/nginx.conf > /dev/null
    echo "✅ Java版(TCP) 与 基岩版(UDP) 转发规则已成功写入配置。"
fi

# ------------------------------------------------------------------------------
# 步骤 3: 语法验证与服务重载
# ------------------------------------------------------------------------------
echo "[3/4] 正在验证 Nginx 语法并启动服务..."

if sudo nginx -t; then
    sudo systemctl restart nginx
    sudo systemctl enable nginx
    echo "✅ Nginx 转发服务已成功重启并设置开机自启。"
else
    echo "❌ 错误: Nginx 配置文件语法检查失败。"
    exit 1
fi

# ------------------------------------------------------------------------------
# 步骤 4: 防火墙放行（同时放行 TCP 和 UDP）
# ------------------------------------------------------------------------------
echo "[4/4] 正在配置系统防火墙..."

if command -v ufw > /dev/null; then
    # UFW 防火墙分别放行 TCP 和 UDP
    sudo ufw allow ${JAVA_PORT}/tcp
    sudo ufw allow ${BEDROCK_PORT}/udp
    echo "✅ UFW 防火墙已放行 ${JAVA_PORT}/tcp 和 ${BEDROCK_PORT}/udp。"
    
elif command -v iptables > /dev/null; then
    # Iptables 规则追加
    sudo iptables -A INPUT -p tcp --dport ${JAVA_PORT} -j ACCEPT
    sudo iptables -A INPUT -p udp --dport ${BEDROCK_PORT} -j ACCEPT
    echo "✅ Iptables 已成功添加 TCP 和 UDP 放行规则。"
else
    echo "⚠️ 提示: 未检测到本地防火墙工具，请确保在 VPS 服务商控制台安全组中放行以下端口："
    echo "   - TCP 端口: ${JAVA_PORT}"
    echo "   - UDP 端口: ${BEDROCK_PORT}"
fi

echo "=================================================="
echo " 🎉 恭喜！双版本中转代理服务架设成功！"
echo " 电脑端玩家连入端口: ${JAVA_PORT} (TCP)"
echo " 手机/基岩端玩家连入端口: ${BEDROCK_PORT} (UDP)"
echo "=================================================="
