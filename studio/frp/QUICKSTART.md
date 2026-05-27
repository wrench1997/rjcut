# 快速部署指南 - 使用 IP 112.111.7.91

## 一、公网服务器部署（112.111.7.91）

### 🚀 快速开始（一行命令）

在服务器 `112.111.7.91` 上直接执行：

```bash
curl -L https://ghfast.top/https://github.com/fatedier/frp/releases/download/v0.69.0/frp_0.69.0_linux_amd64.tar.gz -o /tmp/frp.tar.gz && tar -xzf /tmp/frp.tar.gz -C /tmp && mkdir -p $HOME/rjcut-frp && mv /tmp/frp_0.69.0_linux_amd64/frps $HOME/rjcut-frp/ && chmod +x $HOME/rjcut-frp/frps && echo -e "[common]\nbind_port = 7000\ntoken = rjcut_secure_token_2024\ndashboard_port = 7500\ndashboard_user = admin\ndashboard_pwd = RjCut@2024Admin\nlog_file = $HOME/rjcut-frp/log/frps.log" > $HOME/rjcut-frp/frps.ini && mkdir -p $HOME/rjcut-frp/log && nohup $HOME/rjcut-frp/frps -c $HOME/rjcut-frp/frps.ini > $HOME/rjcut-frp/log/frps.out 2>&1 & && echo "FRP 已启动！管理面板：http://112.111.7.91:7500"
```

### 方案 A：用户目录部署（无需 root 权限，推荐）

#### 1. 上传脚本到服务器
```bash
# 在本地执行
scp studio/frp/deploy_server_user.sh jirongtech@112.111.7.91:/tmp/
```

#### 2. 登录服务器并执行
```bash
# SSH 登录
ssh jirongtech@112.111.7.91

# 赋予执行权限
chmod +x /tmp/deploy_server_user.sh

# 运行部署脚本（自动下载、配置、启动）
/tmp/deploy_server_user.sh
```

#### 3. 或者手动一键部署
```bash
# 在服务器上直接执行
bash <(curl -sL https://ghfast.top/https://raw.githubusercontent.com/your-repo/main/studio/frp/deploy_server_user.sh)
```

#### 3. 配置防火墙（重要！）
联系管理员开放以下端口，或自行配置：
```bash
# Ubuntu/Debian
ufw allow 7000/tcp
ufw allow 7000/udp
ufw allow 7500/tcp
ufw allow 80/tcp
ufw allow 443/tcp

# CentOS/RHEL
firewall-cmd --permanent --add-port=7000/tcp
firewall-cmd --permanent --add-port=7000/udp
firewall-cmd --permanent --add-port=7500/tcp
firewall-cmd --permanent --add-port=80/tcp
firewall-cmd --permanent --add-port=443/tcp
firewall-cmd --reload
```

### 方案 B：纯二进制部署（需要 root 权限）

#### 1. 上传脚本到服务器
```bash
scp studio/frp/deploy_server_native.sh root@112.111.7.91:/tmp/
```

#### 2. 登录服务器并执行
```bash
ssh root@112.111.7.91
chmod +x /tmp/deploy_server_native.sh
/tmp/deploy_server_native.sh
```

### 方案 C：Docker 部署（如果服务器已安装 Docker）

#### 1. 上传文件到服务器
```bash
scp -r studio/frp/ root@112.111.7.91:/opt/rjcut-frp/
```

#### 2. 登录服务器并部署
```bash
ssh root@112.111.7.91
cd /opt/rjcut-frp/
chmod +x deploy_server.sh
./deploy_server.sh
```

### 4. 验证服务（方案 A - 用户目录）
```bash
# 查看进程
ps aux | grep frps

# 查看日志
tail -f $HOME/rjcut-frp/log/frps.log

# 访问管理面板
# http://112.111.7.91:7500
# 用户名：admin
# 密码：RjCut@2024Admin
```

### 4. 验证服务（方案 B - root 二进制）
```bash
# 查看服务状态
systemctl status frps

# 查看日志
journalctl -u frps -f
```

---

## 二、本地服务器部署

### 1. 确认配置已更新
`studio/frp/frpc.ini` 已配置：
- server_addr = 112.111.7.91
- token = rjcut_secure_token_2024

### 2. 启动所有服务
```bash
cd studio/
docker-compose up -d
```

### 3. 验证部署
```bash
# 查看所有容器状态
docker-compose ps

# 查看 FRP 客户端日志
docker logs rjcut-frp-client -f

# 查看 Studio 生产环境日志
docker logs rjcut-studio-prod -f
```

### 4. 访问服务
- **本地访问**: http://localhost
- **公网访问**: http://112.111.7.91
- **FRP 管理界面**: http://localhost:7400

---

## 三、配置凭证

### FRP 服务端（112.111.7.91）
| 项目 | 值 |
|------|-----|
| IP 地址 | 112.111.7.91 |
| Token | rjcut_secure_token_2024 |
| 管理面板 | http://112.111.7.91:7500 |
| 用户名 | admin |
| 密码 | RjCut@2024Admin |

### 需要开放的端口
| 端口 | 协议 | 用途 |
|------|------|------|
| 7000 | TCP/UDP | FRP 客户端连接 |
| 7500 | TCP | 管理仪表板 |
| 80 | TCP | HTTP 服务 |
| 443 | TCP | HTTPS 服务（可选） |

---

## 四、常见问题

### 1. FRP 客户端连接失败
```bash
# 检查网络连通性
ping 112.111.7.91

# 检查端口是否可达
telnet 112.111.7.91 7000

# 查看客户端日志
docker logs rjcut-frp-client
```

### 2. 无法访问公网服务
- 检查服务器防火墙是否开放 80 端口
- 确认 FRP 服务端日志中客户端已连接
- 检查 studio-prod 容器是否正常运行

### 3. 重启服务
```bash
# 本地服务器
docker-compose restart

# 公网服务器
cd /opt/rjcut-frp/
docker-compose restart
```

---

## 五、安全建议

1. **修改默认密码**：生产环境请修改 frps.ini 中的 dashboard_pwd
2. **使用 HTTPS**：建议配置 SSL 证书
3. **定期备份**：备份配置文件和重要数据
4. **监控日志**：定期检查 FRP 和 Docker 日志

---

## 六、完整命令参考

### 本地服务器
```bash
# 启动所有服务
cd studio/
docker-compose up -d

# 停止所有服务
docker-compose down

# 查看日志
docker-compose logs -f

# 重启 FRP 客户端
docker-compose restart frp-client

# 重新构建
docker-compose build --no-cache
```

### 公网服务器（方案 A - 用户目录）
```bash
# 查看状态
ps aux | grep frps

# 查看日志
tail -f $HOME/rjcut-frp/log/frps.log

# 查看输出
tail -f $HOME/rjcut-frp/log/frps.out

# 重启服务
pkill -f 'frps -c' && $HOME/rjcut-frp/frps -c $HOME/rjcut-frp/frps.ini &

# 停止服务
pkill -f 'frps -c'

# 启动服务
$HOME/rjcut-frp/frps -c $HOME/rjcut-frp/frps.ini &

# 查看连接状态
curl http://localhost:7500/api/proxy
```

### 公网服务器（方案 B - root 二进制）
```bash
# 查看状态
systemctl status frps

# 查看日志
journalctl -u frps -f

# 重启服务
systemctl restart frps

# 停止服务
systemctl stop frps

# 启动服务
systemctl start frps
```

### 公网服务器（方案 C - Docker）
```bash
# 启动服务
cd /opt/rjcut-frp/
docker-compose -f docker-compose.server.yml up -d

# 停止服务
docker-compose -f docker-compose.server.yml down

# 查看日志
docker logs rjcut-frp-server -f
```