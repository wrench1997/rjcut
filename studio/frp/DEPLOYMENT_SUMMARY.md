# FRP 部署总结

## 📦 已创建的文件

```
studio/frp/
├── Dockerfile                    # FRP 客户端 Docker 镜像（本地服务器）
├── Dockerfile.server             # FRP 服务端 Docker 镜像（公网服务器）
├── frpc.ini                      # FRP 客户端配置（已配置服务器 IP: 112.111.7.91）
├── frps.ini                      # FRP 服务端配置
├── docker-compose.server.yml     # 服务端 Docker Compose 配置
├── deploy_server.sh              # 服务端部署脚本（Docker 版，需要 root）
├── deploy_server_native.sh       # 服务端部署脚本（二进制版，需要 root）
├── deploy_server_user.sh         # 服务端部署脚本（用户目录版，无需 root）⭐
├── README.md                     # 完整部署文档
└── QUICKSTART.md                 # 快速部署指南
```

---

## 🚀 公网服务器部署（112.111.7.91）

### 方式一：用户目录部署（无需 root，推荐）

**在服务器 112.111.7.91 上执行：**

```bash
# 一行命令快速部署
curl -L https://ghfast.top/https://github.com/fatedier/frp/releases/download/v0.69.0/frp_0.69.0_linux_amd64.tar.gz -o /tmp/frp.tar.gz && \
tar -xzf /tmp/frp.tar.gz -C /tmp && \
mkdir -p $HOME/rjcut-frp && \
mv /tmp/frp_0.69.0_linux_amd64/frps $HOME/rjcut-frp/ && \
chmod +x $HOME/rjcut-frp/frps && \
cat > $HOME/rjcut-frp/frps.ini << 'EOF'
[common]
bind_port = 7000
token = rjcut_secure_token_2024
dashboard_port = 7500
dashboard_user = admin
dashboard_pwd = RjCut@2024Admin
log_file = /home/jirongtech/rjcut-frp/log/frps.log
log_max_days = 7
tcp_mux = true
EOF
mkdir -p $HOME/rjcut-frp/log && \
nohup $HOME/rjcut-frp/frps -c $HOME/rjcut-frp/frps.ini > $HOME/rjcut-frp/log/frps.out 2>&1 & && \
echo "✅ FRP 服务端已启动！" && \
echo "📊 管理面板：http://112.111.7.91:7500" && \
echo "🔑 用户名：admin / 密码：RjCut@2024Admin"
```

**验证：**
```bash
# 查看进程
ps aux | grep frps

# 查看日志
tail -f $HOME/rjcut-frp/log/frps.out

# 测试端口
curl http://112.111.7.91:7500
```

### 方式二：使用部署脚本

```bash
# 从本地上传脚本
scp studio/frp/deploy_server_user.sh jirongtech@112.111.7.91:/tmp/

# SSH 登录服务器
ssh jirongtech@112.111.7.91

# 执行脚本
chmod +x /tmp/deploy_server_user.sh
/tmp/deploy_server_user.sh
```

---

## 🔧 本地服务器部署

### 1. 配置已就绪

`studio/frp/frpc.ini` 已配置：
- 服务器地址：`112.111.7.91`
- Token: `rjcut_secure_token_2024`

### 2. 启动所有服务

```bash
cd studio/
docker-compose up -d
```

### 3. 验证部署

```bash
# 查看所有容器
docker-compose ps

# 查看 FRP 客户端日志
docker logs rjcut-frp-client -f

# 查看 Studio 日志
docker logs rjcut-studio-prod -f
```

---

## 🔐 配置凭证

| 项目 | 值 |
|------|-----|
| **公网服务器 IP** | 112.111.7.91 |
| **Token** | rjcut_secure_token_2024 |
| **管理面板** | http://112.111.7.91:7500 |
| **用户名** | admin |
| **密码** | RjCut@2024Admin |

### 需要开放的端口

| 端口 | 协议 | 用途 |
|------|------|------|
| 7000 | TCP/UDP | FRP 客户端连接 |
| 7500 | TCP | 管理仪表板 |
| 80 | TCP | HTTP 服务（公网访问） |
| 443 | TCP | HTTPS 服务（可选） |

---

## 🌐 访问方式

| 访问方式 | 地址 |
|----------|------|
| 本地访问 | http://localhost |
| 公网访问 | http://112.111.7.91 |
| 管理面板 | http://112.111.7.91:7500 |
| FRP 客户端管理 | http://localhost:7400 |

---

## ⚠️ 注意事项

### 1. 防火墙配置
确保服务器 112.111.7.91 开放以下端口：
```bash
# 联系管理员或自行配置
ufw allow 7000/tcp
ufw allow 7000/udp
ufw allow 7500/tcp
ufw allow 80/tcp
```

### 2. 域名配置（可选）
如果有域名，可以配置域名访问：

**修改 `studio/frp/frpc.ini`：**
```ini
[studio-http]
type = http
local_port = 80
custom_domains = studio.yourdomain.com
```

### 3. 安全建议
- 生产环境请修改默认密码
- 建议配置 HTTPS
- 定期查看日志监控异常连接

---

## 🛠️ 故障排查

### FRP 客户端连接失败
```bash
# 检查网络连通性
ping 112.111.7.91

# 检查端口
telnet 112.111.7.91 7000

# 查看客户端日志
docker logs rjcut-frp-client
```

### 无法访问公网服务
1. 检查服务器防火墙是否开放 80 端口
2. 确认 FRP 服务端已启动：`ps aux | grep frps`
3. 查看服务端日志：`tail -f $HOME/rjcut-frp/log/frps.out`

### 重启服务
```bash
# 本地服务器
cd studio/
docker-compose restart

# 公网服务器
pkill -f 'frps -c'
$HOME/rjcut-frp/frps -c $HOME/rjcut-frp/frps.ini &
```

---

## 📋 常用命令

### 本地服务器
```bash
# 启动
cd studio/
docker-compose up -d

# 停止
docker-compose down

# 查看日志
docker-compose logs -f

# 重启 FRP
docker-compose restart frp-client
```

### 公网服务器（用户目录版）
```bash
# 查看状态
ps aux | grep frps

# 查看日志
tail -f $HOME/rjcut-frp/log/frps.out

# 停止
pkill -f 'frps -c'

# 启动
$HOME/rjcut-frp/frps -c $HOME/rjcut-frp/frps.ini &
```

---

## ✅ 部署检查清单

- [ ] 公网服务器 FRP 服务端已启动
- [ ] 防火墙已开放必要端口（7000, 7500, 80）
- [ ] 本地服务器 FRP 客户端配置正确
- [ ] Studio Docker 容器正常运行
- [ ] 可以通过公网 IP 访问服务
- [ ] 管理面板可以正常登录

---

**部署完成后，访问 http://112.111.7.91 即可使用 Studio 服务！**