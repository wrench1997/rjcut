# GenVideos 账号与 API Key 管控操作手册

## 1. 当前入口

| 用途 | 地址 |
| --- | --- |
| 管理员管控台 | `http://112.111.7.91:7980/admin` |
| 用户自助注册 | `http://112.111.7.91:7980/admin/register` |
| 用户登录与账号中心 | `http://112.111.7.91:7980/admin/login` |
| 网关健康检查 | `http://112.111.7.91:7980/healthz` |
| H3 API 根地址 | `http://112.111.7.91:7980/h3` |
| DeepSeek OpenAI 兼容根地址 | `http://112.111.7.91:7980/v1` |

公网 7980 由外层端口映射到服务器 Nginx 8000。访问网关和前端分别只监听服务器本机 7990、7991，H3 与 DeepSeek 上游分别只监听本机 30010、8001，不直接暴露模型服务。

## 2. 管控模型

系统将网页登录凭据和模型调用凭据严格分开：

- 管理员使用管理员账号和密码登录 `/admin`，不再把管理员 API Key 粘贴到浏览器。
- 普通用户自行验证邮箱并设置密码，之后使用邮箱和密码登录 `/admin/login`。
- SMTP Gmail 账号只是平台统一发件人，只负责发送验证码，不代表或限制注册用户的邮箱域名。
- 每名普通用户始终只有一条账号记录和一把有效 API Key。API Key 只用于 H3、DeepSeek 的程序调用。
- 注册完成时完整 API Key 只显示一次；服务端只保存 SHA-256 哈希和短提示。
- 用户丢失或怀疑泄露 Key 时，可在用户中心输入登录密码后重新生成。新 Key 只显示一次，旧 Key 立即失效，数据库中仍只有一条用户记录。
- 管理员可以查看用户、权限、额度、最近来源 IP、调用量、视频归属和审计记录，并可立即停用账号。

网页密码使用随机盐 scrypt 哈希保存，数据库、日志和 Git 都不保存明文密码。管理员会话与用户会话使用不同的 HttpOnly、SameSite=Strict Cookie，写操作还要求 CSRF Token。

## 3. 管理员登录

初始管理员用户名为 `admin`，随机密码只保存在服务器：

```bash
ssh -p 60228 jirongtech@112.111.7.91 \
  "cat /mnt/nvme/genvideos-gateway/state/INITIAL_ADMIN_LOGIN.txt"
```

该文件权限为 0600。安全保存密码后，应删除服务器上的初始明文文件；不要把内容粘贴到聊天、代码、Shell 脚本或 Git。

在服务器交互式修改管理员密码：

```bash
read -rsp "New admin password: " NEW_ADMIN_PASSWORD && echo
printf '%s\n' "$NEW_ADMIN_PASSWORD" | \
  /mnt/nvme/genvideos-gateway/venv/bin/python \
  /mnt/nvme/genvideos-gateway/gateway_admin.py \
  set-password admin --password-stdin
unset NEW_ADMIN_PASSWORD
```

密码最少 8 个字符、最多 128 个字符，建议使用密码管理器生成至少 16 个随机字符。

## 4. 用户自助注册和登录

用户注册不需要管理员提前录入邮箱：

1. 打开 `/admin/register`。
2. 输入用户自己的邮箱，点击“发送验证码”。
3. 平台统一 Gmail SMTP 向该邮箱发送 6 位验证码。
4. 用户输入验证码并设置网页登录密码。
5. 注册成功后页面一次性显示该用户唯一 API Key。
6. 用户保存 Key，以后用邮箱和密码登录 `/admin/login` 查看账号、额度、来源 IP 和自己的视频任务。

验证码 10 分钟过期、最多尝试 5 次；同一邮箱 60 秒内不能重复发送。Nginx 还按来源 IP 对注册申请、验证码验证、管理员登录和用户登录分别限速。重复邮箱不能创建第二个账号或第二把 Key。

自助注册默认策略为：

- 权限：H3 + DeepSeek
- 每日 H3 视频：5 个
- 每日 DeepSeek：200 次
- H3 视频并发：1 个
- 有效期：永久，除非管理员停用

默认值由 `genvideos-gateway.service` 的 `GATEWAY_SELF_REGISTRATION_*` 环境项控制。管理员仍可在管控台使用“特殊配额邀请”为特定邮箱预分配不同权限和额度，但这不是普通用户注册的前置条件。

## 5. 用户 API Key 的使用

建议把 Key 放入当前 Shell 的临时环境变量，不要直接写进代码仓库：

```bash
read -rsp "GenVideos API Key: " GENVIDEOS_API_KEY && echo
export GENVIDEOS_API_KEY
```

### DeepSeek

查询模型：

```bash
curl -sS http://112.111.7.91:7980/v1/models \
  -H "Authorization: Bearer $GENVIDEOS_API_KEY"
```

聊天调用：

```bash
curl -sS http://112.111.7.91:7980/v1/chat/completions \
  -H "Authorization: Bearer $GENVIDEOS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "DeepSeek-V4-Flash-0731",
    "messages": [{"role": "user", "content": "你好"}]
  }'
```

### MiniMax H3 文生视频

查询模型：

```bash
curl -sS http://112.111.7.91:7980/h3/v1/models \
  -H "Authorization: Bearer $GENVIDEOS_API_KEY"
```

提交文生视频：

```bash
curl -sS http://112.111.7.91:7980/h3/v1/videos \
  -H "Authorization: Bearer $GENVIDEOS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "MiniMax/MiniMax-H3",
    "prompt": "夜晚城市雨中行驶的蓝色跑车，电影级灯光",
    "size": "1344x768",
    "seconds": 4,
    "num_inference_steps": 50,
    "seed": 42,
    "task": "t2va",
    "conditions": [],
    "target": {
      "short_edge": 768,
      "aspect_ratio": "16:9",
      "duration_seconds": 4.0
    },
    "flow_shift": 12.0,
    "audio_flow_shift": 3.0
  }'
```

任务查询、成片下载和 Python 客户端用法见 `H3_使用说明.md`。外部 Authorization 不会转发给 SGLang 或 vLLM；网关会用服务端内部连接访问模型。

## 6. 权限、配额和停用

Key 鉴权后按账号执行以下检查：

- `h3`、`deepseek` 服务作用域。
- DeepSeek 每日调用额度。
- H3 每日视频额度。
- H3 同时处于提交、排队或生成状态的视频数量。
- 账号是否启用、是否过期。

管理员停用用户后，用户网页登录和 API Key 调用都会立即失败。恢复启用不会改变其 Key。用户主动轮换 Key 后，旧 Key 的 SHA-256 哈希被新哈希覆盖，因此旧 Key 立即返回 401。

## 7. IP、审计、视频与数据集

- Nginx 写入真实来源地址，网关只接受来自本机代理的转发头。
- 用户注册完成、网页登录和每次 API Key 调用都会更新账号的最近来源 IP 和时间。
- 审计日志记录请求 ID、账号、服务、方法、路径、状态码、耗时、来源 IP 和时间，不记录密码、Key、Cookie 或任意请求正文。
- H3 视频 ID 与创建者账号绑定。普通用户只能列表、查询、下载或删除自己的视频；跨用户查询统一返回 404。
- 历史未归属视频仅管理员可见，可在仪表盘分配给指定邮箱用户。
- 当前数据集只采集文生视频：邮箱用户、来源 IP、提示词、选定生成参数、视频 ID、状态和时间。媒体二进制、参考图片和参考视频不写入 SQLite。
- DeepSeek vLLM 的前缀缓存查询、命中率和 KV Cache 占用只从内网 metrics 读取，并展示在管理员仪表盘；metrics 不对公网开放。

## 8. 初始测试账号文件

为迁移前已经创建的首个 Gmail 用户补充了随机网页登录密码。先列出对应的 0600 文件，再读取与该用户邮箱匹配的文件：

```bash
ssh -p 60228 jirongtech@112.111.7.91 \
  "ls -l /mnt/nvme/genvideos-gateway/state/INITIAL_USER_LOGIN_*.txt"

ssh -p 60228 jirongtech@112.111.7.91 \
  "cat /mnt/nvme/genvideos-gateway/state/INITIAL_USER_LOGIN_SANITIZED_EMAIL.txt"
```

第二条命令中的 `SANITIZED_EMAIL` 应替换为上一条命令列出的实际文件名部分。

该用户原有唯一 API Key 仍有效，保存在原 0600 初始 Key 文件。安全保存后也应删除这些初始明文文件。新用户不会在服务器生成此类登录文件，他们在网页注册时自行设置密码并自行保存一次性显示的 Key。

## 9. 当前 HTTPS 边界

当前公网 7980 仍是 HTTP。管理员密码、用户密码、验证码和 Bearer API Key 在不可信网络中可能被窃听，正式对外开放前必须配置域名和 HTTPS，并把 `GATEWAY_COOKIE_SECURE` 改为 `1`。

在 TLS 完成前，可以使用 SSH 隧道保护浏览器流量：

```bash
ssh -p 60228 -L 17980:127.0.0.1:8000 jirongtech@112.111.7.91
```

保持该 SSH 会话打开，然后访问：

```text
http://127.0.0.1:17980/admin
http://127.0.0.1:17980/admin/register
http://127.0.0.1:17980/admin/login
```

虽然浏览器地址仍显示 HTTP，但本机到服务器之间的链路封装在 SSH 内。正式多用户使用仍应部署 HTTPS。

## 10. 运维检查

服务状态：

```bash
systemctl is-active \
  genvideos-gateway.service \
  genvideos-dashboard.service \
  minimax-h3-sglang.service \
  deepseek-v4-flash-0731.service
```

网关日志：

```bash
sudo journalctl -u genvideos-gateway.service -n 100 --no-pager
```

非敏感账号清单：

```bash
/mnt/nvme/genvideos-gateway/venv/bin/python \
  /mnt/nvme/genvideos-gateway/gateway_admin.py list-users
```

当前已验证结果：管理员账号密码登录 200、管理员仪表盘 200、用户邮箱密码登录 200、用户中心 200、重复邮箱注册 409、无 Key 的模型接口 401、有效用户 Key 的 H3/DeepSeek 模型查询均为 200、危险 H3 管理接口 404；管理员和现有用户密码字段均为 scrypt 哈希。另用普通邮箱用户的唯一 Key 完成了一次真实 4 秒、16:9、20 步 H3 生成，任务状态为 completed、生成 1 个输出、推理约 68.84 秒，带该 Key 下载成片返回 200 和 467617 字节、不带 Key 返回 401，数据库确认提示词、来源 IP、非管理员邮箱用户归属及 completed 状态均已落库。部署仅重启网关和前端，H3 与 DeepSeek 模型进程 PID 未变化。
