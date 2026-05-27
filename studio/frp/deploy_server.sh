#!/bin/bash
# FRP 服务端快速部署脚本 - 在公网服务器上运行

set -e

echo "========================================="
echo "  FRP 服务端快速部署脚本"
echo "========================================="

# 配置变量（请根据实际情况修改）
FRP_VERSION="0.52.3"
FRP_DIR="/opt/rjcut-frp"
TOKEN="YOUR_SECURE_TOKEN_$(date +%s | sha256sum | head -c 32)"
DASHBOARD_PWD="Admin@$(date +%s | sha256sum | head -c 8)"

echo ""
echo "配置信息："
echo "  FRP 版本：${FRP_VERSION}"
echo "  安装目录：${FRP_DIR}"
echo "  Token: ${TOKEN}"
echo "  仪表板密码：${DASHBOARD_PWD}"
echo ""

# 检查 Docker 是否安装
if ! command -v docker &> /dev/null; then
    echo "错误：Docker 未安装，请先安装 Docker"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "错误：Docker Compose 未安装，请先安装 Docker Compose"
    exit 1
fi

# 创建目录
echo "创建目录..."
mkdir -p ${FRP_DIR}/frp

# 下载 FRP 服务端
echo "下载 FRP ${FRP_VERSION}..."
cd /tmp
wget -q https://github.com/fatedier/frp/releases/download/v${FRP_VERSION}/frp_${FRP_VERSION}_linux_amd64.tar.gz
tar -xzf frp_${FRP_VERSION}_linux_amd64.tar.gz
mv frp_${FRP_VERSION}_linux_amd64/frps ${FRP_DIR}/frp/
chmod +x ${FRP_DIR}/frp/frps

# 生成配置文件
echo "生成配置文件..."
cat > ${FRP_DIR}/frp/frps.ini << EOF
[common]
bind_port = 7000
kcp_bind_port = 7000
token = ${TOKEN}
dashboard_addr = 0.0.0.0
dashboard_port = 7500
dashboard_user = admin
dashboard_pwd = ${DASHBOARD_PWD}
log_level = info
log_file = /frp/log/frps.log
log_max_days = 7
tcp_mux = true
heartbeat_timeout = 90
heartbeat_interval = 30
max_ports_per_client = 10
EOF

# 创建 Docker Compose 文件
cat > ${FRP_DIR}/docker-compose.yml << EOF
version: '3.8'

services:
  frp-server:
    image: alpine:latest
    container_name: rjcut-frp-server
    volumes:
      - ./frp:/frp
      - frp-logs:/frp/log
    ports:
      - "7000:7000"
      - "7000:7000/udp"
      - "7500:7500"
      - "80:80"
      - "443:443"
    command: /frp/frps -c /frp/frps.ini
    restart: unless-stopped

volumes:
  frp-logs:
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
EOF

echo ""
echo "保存配置信息到：${FRP_DIR}/config.info"
cat ${FRP_DIR}/config.info

# 启动服务
echo ""
echo "启动 FRP 服务端..."
cd ${FRP_DIR}
docker-compose up -d

# 等待服务启动
sleep 3

# 检查服务状态
echo ""
echo "检查服务状态..."
docker-compose ps

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
echo "查看日志：docker logs rjcut-frp-server -f"
echo ""