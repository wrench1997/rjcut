# FRP 内网穿透部署指南

本文档说明如何使用 FRP 将本地 Docker 部署的 Studio 服务暴露到公网。

## 目录结构

```
frp/
├── Dockerfile              # FRP 客户端镜像（本地服务器）
├── Dockerfile.server       # FRP 服务端镜像（公网服务器）
├── frpc.ini                # FRP 客户端配置
├── frps.ini                # FRP 服务端配置
└── docker-compose.server.yml  # 服务端 Docker Compose 配置
```

## 部署步骤

### 一、公网服务器部署（VPS）

#### 1. 准备公网服务器
- 需要一台具有公网 IP 的 Linux 服务器（推荐 Ubuntu 20.04+）
- 确保服务器防火墙开放以下端口：
  - 7000 (TCP/UDP) - FRP 客户端连接
  - 7500 (TCP) - 管理仪表板
  - 80 (TCP) - HTTP 服务（可选，用于域名访问）
  - 443 (TCP) - HTTPS 服务（可选）

#### 2. 上传服务端文件
将以下文件上传到公网服务器：
```bash
scp -r frp/ root@YOUR_SERVER_IP:/opt/rjcut-frp/
```

#### 3. 配置服务端
编辑 `frps.ini`，修改以下配置：
```ini
[common]
token = YOUR_SECURE_TOKEN  # 设置一个安全的令牌
dashboard_pwd = YOUR_ADMIN_PASSWORD  # 设置仪表板密码
# subdomain_host = yourdomain.com  # 如果使用子域名，填写你的域名
```

#### 4. 启动 FRP 服务端
```bash
cd /opt/rjcut-frp/
docker-compose -f docker-compose.server.yml up -d
```

#### 5. 验证服务端
访问 `http://YOUR_SERVER_IP:7500` 查看 FRP 管理仪表板。

---

### 二、本地服务器部署

#### 1. 配置 FRP 客户端
编辑 `frpc.ini`，修改以下配置：
```ini
[common]
server_addr = YOUR_PUBLIC_SERVER_IP  # 公网服务器 IP
server_port = 7000
token = YOUR_SECURE_TOKEN  # 必须与服务端一致

[studio-http]
type = http
local_port = 80
custom_domains = studio.yourdomain.com  # 或使用公网 IP 访问
```

#### 2. 配置 Studio 生产环境
编辑 `studio/docker-compose.yml`，确保 `studio-prod` 服务的 API 地址正确：
```yaml
environment:
  - VITE_API_BASE_URL=http://YOUR_API_SERVER:8000
```

#### 3. 启动所有服务
在本地服务器执行：
```bash
cd studio/
docker-compose up -d
```

#### 4. 验证部署
- 本地访问：`http://localhost`
- FRP 管理界面：`http://localhost:7400`
- 公网访问：`http://studio.yourdomain.com` 或 `http://YOUR_PUBLIC_SERVER_IP:80`

---

## 配置说明

### FRP 客户端配置 (frpc.ini)

| 配置项 | 说明 | 示例 |
|--------|------|------|
| server_addr | 公网服务器 IP | 123.45.67.89 |
| server_port | FRP 服务端端口 | 7000 |
| token | 认证令牌 | your_secret_token |
| custom_domains | 自定义域名 | studio.example.com |

### FRP 服务端配置 (frps.ini)

| 配置项 | 说明 | 示例 |
|--------|------|------|
| bind_port | 客户端连接端口 | 7000 |
| token | 认证令牌 | your_secret_token |
| dashboard_port | 管理界面端口 | 7500 |
| dashboard_pwd | 管理界面密码 | admin123 |
| subdomain_host | 子域名配置 | example.com |

---

## 访问模式

### 模式 1：使用 IP 直接访问
```ini
[studio-http]
type = tcp
local_port = 80
remote_port = 8080
```
访问：`http://YOUR_PUBLIC_SERVER_IP:8080`

### 模式 2：使用域名访问（推荐）
```ini
[studio-http]
type = http
local_port = 80
custom_domains = studio.yourdomain.com
```
访问：`http://studio.yourdomain.com`

### 模式 3：使用子域名
服务端配置：
```ini
subdomain_host = yourdomain.com
```

客户端配置：
```ini
[studio-http]
type = http
local_port = 80
subdomain = studio
```
访问：`http://studio.yourdomain.com`

---

## 安全建议

1. **使用强令牌**：`token` 应使用复杂的随机字符串
2. **启用 HTTPS**：生产环境建议配置 SSL 证书
3. **限制访问 IP**：可在防火墙中限制 FRP 端口的访问来源
4. **定期更新**：保持 FRP 版本更新以修复安全漏洞
5. **监控日志**：定期检查 FRP 日志发现异常连接

---

## 故障排查

### 客户端连接失败
1. 检查公网服务器防火墙是否开放 7000 端口
2. 确认 `token` 配置一致
3. 查看客户端日志：`docker logs rjcut-frp-client`

### 无法访问服务
1. 检查 `studio-prod` 容器是否正常运行
2. 确认 FRP 配置中的 `local_port` 正确
3. 查看服务端日志：`docker logs rjcut-frp-server`

### 域名无法解析
1. 确保域名 DNS 解析到公网服务器 IP
2. 检查 `custom_domains` 或 `subdomain` 配置
3. 确认服务端 `subdomain_host` 配置正确

---

## 常用命令

### 本地服务器
```bash
# 查看所有服务状态
docker-compose ps

# 查看 FRP 客户端日志
docker logs rjcut-frp-client -f

# 重启 FRP 客户端
docker-compose restart frp-client

# 停止所有服务
docker-compose down
```

### 公网服务器
```bash
# 查看 FRP 服务端日志
docker logs rjcut-frp-server -f

# 重启 FRP 服务端
docker-compose -f docker-compose.server.yml restart frp-server

# 查看连接状态
curl http://localhost:7500/api/proxy/tcp
```

---

## 性能优化

### 启用 KCP 加速（高延迟网络）
服务端 `frps.ini`：
```ini
kcp_bind_port = 7000
```

客户端 `frpc.ini`：
```ini
[common]
protocol = kcp
```

### 连接池优化
```ini
[common]
tcp_mux = true
heartbeat_interval = 30
heartbeat_timeout = 90

[studio-http]
pool_count = 5
```