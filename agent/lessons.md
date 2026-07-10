# 项目教训与回归规则

本文档记录本项目已踩过的坑、已修复的错误和不可复发的规则。

**规则优先级高于临时推测**。当遇到类似问题时，先查阅本文档。

---

## 已记录规则




### Docker 容器访问宿主机应使用实际 IP 而非 host.docker.internal

- **出现日期**: 2026-07-10
- **问题描述**: Docker 容器内访问宿主机服务时，不能使用 host.docker.internal（这是 Docker Desktop 的专有特性），在 Linux/Windows Docker 环境中需要使用宿主机实际 IP 地址
- **根因**: 1. api_digital_human.py 中配置 base_url 为 "http://host.docker.internal:8080"
2. host.docker.internal 仅在 Docker Desktop (Mac/Windows) 上有效
3. 在 Linux 或某些 Docker 环境中，此域名无法解析，导致容器无法访问宿主机的 API 服务
- **正确规则**: 1. Docker 容器访问宿主机服务时，使用实际宿主机 IP 地址（如 192.168.166.151）
2. 不要依赖 host.docker.internal，除非明确只在 Docker Desktop 环境运行
3. 统一使用项目既定的宿主机 IP 配置（192.168.166.151）
- **回归检查**:
  ```bash
  grep -n "host.docker.internal" api_digital_human.py chanjing_api_v2.py
  ```
### 蝉镜 API code=None 兼容性处理

- **出现日期**: 2026-07-10
- **问题描述**: 蝉镜 API 某些接口返回的响应中 code 字段可能为 None（旧版 API 或特殊场景），导致状态码检查逻辑错误判断为失败
- **根因**: 1. ChanjingStatusCode.is_success() 方法只检查 code == 0，当 code 为 None 时返回 False
2. api_digital_human.py 中的状态码检查使用 `res.get('code') != 0`，当 code 为 None 时条件为 True，误判为错误
3. 这导致前端收到"蝉镜 API 错误"的报错，但实际 API 调用是成功的
- **正确规则**: 1. ChanjingStatusCode.is_success() 必须兼容 code=None 的情况，返回 True（假设没有错误码表示成功）
2. api_digital_human.py 中的状态码检查应使用 `api_code is not None and api_code != 0`
3. 所有使用 ChanjingStatusCode.is_success() 的地方都会自动获得兼容性
- **回归检查**:
  ```bash
  grep -n "res.get('code') != 0" api_digital_human.py 或 grep -n "code == 0" chanjing_api.py
  ```
