#!/bin/bash
# FRP 服务端快速部署脚本 - 用户目录版本（无需 root 权限）

set -e

echo "========================================="
echo "  FRP 服务端快速部署脚本（用户目录版）"
echo "========================================="

# 配置变量
FRP_VERSION="0.69.0"
FRP_DIR="$HOME/rjcut-frp"
TOKEN="rjcut_secure_token_2024"
DASHBOARD_PWD="RjCut@2024Admin"

echo ""
echo "配置信息："
echo "  FRP 版本：${FRP_VERSION}"
echo "  安装目录：${FRP_DIR}"
echo "  Token: ${TOKEN}"
echo "  仪表板密码：${DASHBOARD_PWD}"
echo ""

# 创建目录
echo "创建目录..."
mkdir -p ${FRP_DIR}
mkdir -p ${FRP_DIR}/log

# 下载 FRP 服务端
echo "下载 FRP ${FRP_VERSION}..."
cd /tmp

# 尝试使用代理下载
DOWNLOAD_URL="https://ghfast.top/https://github.com/fatedier/frp/releases/download/v${FRP_VERSION}/frp_${FRP_VERSION}_linux_amd64.tar.gz"
echo "下载地址：${DOWNLOAD_URL}"

if command -v wget &> /dev/null; then
    wget -q --show-progress "${DOWNLOAD_URL}" -O frp.tar.gz || {
        echo "wget 下载失败，尝试使用 curl..."
        curl -L "${DOWNLOAD_URL}" -o frp.tar.gz
    }
elif command -v curl &> /dev/null; then
    curl -L "${DOWNLOAD_URL}" -o frp.tar.gz
else
    echo "错误：需要安装 wget 或 curl"
    exit 1
fi

# 解压
echo "解压文件..."
tar -xzf frp.tar.gz
mv frp_${FRP_VERSION}_linux_amd64/frps ${FRP_DIR}/
mv frp_${FRP_VERSION}_linux_amd64/frpc ${FRP_DIR}/ 2>/dev/null || true
chmod +x ${FRP_DIR}/frps
chmod +x ${FRP_DIR}/frpc 2>/dev/null || true

# 清理
rm -rf frp.tar.gz frp_${FRP_VERSION}_linux_amd64

# 生成配置文件
echo "生成配置文件..."
cat > ${FRP_DIR}/frps.ini << EOF
[common]
bind_port = 7000
kcp_bind_port = 7000
token = ${TOKEN}
dashboard_addr = 0.0.0.0
dashboard_port = 7500
dashboard_user = admin
dashboard_pwd = ${DASHBOARD_PWD}
log_level = info
log_file = ${FRP_DIR}/log/frps.log
log_max_days = 7
tcp_mux = true
heartbeat_timeout = 90
heartbeat_interval = 30
max_ports_per_client = 10
EOF

# 保存配置信息
cat > ${FRP_DIR}/config.info << EOF
========================================
FRP 服务端配置信息
========================================
Token: ${TOKEN}
仪表板地址：http://YOUR_SERVER_IP:7500
仪表板用户名：admin
仪表板密码：${DASHBOARD_PWD}
========================================

客户端配置示例 (frpc.ini):
[common]
server_addr = YOUR_SERVER_IP
server_port = 7000
token = ${TOKEN}

[studio-http]
type = http
local_port = 80
custom_domains = studio.yourdomain.com
========================================
EOF

echo ""
echo "保存配置信息到：${FRP_DIR}/config.info"
cat ${FRP_DIR}/config.info

# 启动服务（后台运行）
echo ""
echo "启动 FRP 服务端..."
cd ${FRP_DIR}
nohup ./frps -c ${FRP_DIR}/frps.ini > ${FRP_DIR}/log/frps.out 2>&1 &

# 等待服务启动
sleep 3

# 检查进程
echo ""
echo "检查服务状态..."
if pgrep -f "frps -c ${FRP_DIR}/frps.ini" > /dev/null; then
    echo "✓ FRP 服务端已成功启动"
    echo "  进程 ID: $(pgrep -f "frps -c ${FRP_DIR}/frps.ini")"
else
    echo "✗ FRP 服务端启动失败，请查看日志："
    echo "  ${FRP_DIR}/log/frps.log"
    echo "  ${FRP_DIR}/log/frps.out"
    exit 1
fi

echo ""
echo "========================================="
echo "  部署完成！"
echo "========================================="
echo ""
echo "重要提示："
echo "1. 请保存好 config.info 中的 Token 和密码"
echo "2. 确保服务器防火墙开放端口：7000, 7500, 80, 443"
echo "3. 访问管理仪表板：http://YOUR_SERVER_IP:7500"
echo "4. 在本地服务器配置 frpc.ini 时使用上述 Token"
echo ""
echo "常用命令："
echo "  查看状态：ps aux | grep frps"
echo "  查看日志：tail -f ${FRP_DIR}/log/frps.log"
echo "  查看输出：tail -f ${FRP_DIR}/log/frps.out"
echo "  重启服务：${FRP_DIR}/frps -c ${FRP_DIR}/frps.ini &"
echo "  停止服务：pkill -f 'frps -c ${FRP_DIR}/frps.ini'"
echo ""