# 项目教训与回归规则

本文档记录本项目已踩过的坑、已修复的错误和不可复发的规则。

**规则优先级高于临时推测**。当遇到类似问题时，先查阅本文档。

---

## 已记录规则







### Docker 容器访问宿主机应使用 host.docker.internal 而非硬编码 IP

- **出现日期**: 2026-07-10
- **问题描述**: Docker 容器内访问宿主机服务时，硬编码宿主机 IP（如 192.168.166.151）会导致网络环境变化时（如 IP 变更、迁移到其他机器）需要修改代码，不够灵活。
- **根因**: 1. chanjing_api_v2.py 和 api_digital_human.py 中硬编码 base_url 为 "http://127.0.0.1:8080"
2. 没有使用环境变量或配置化方式管理宿主机地址
3. 没有利用 Docker 内置的 host.docker.internal DNS 解析机制
- **正确规则**: 1. Docker 容器访问宿主机服务时，优先使用 host.docker.internal（Docker 内置 DNS，支持 Windows/Mac/Linux）
2. 通过环境变量 CHANJING_BASE_URL 配置宿主机 API 地址，支持灵活切换
3. 代码中设置合理的默认值：os.getenv("CHANJING_BASE_URL", "http://host.docker.internal:8080")
4. docker-compose.yml 中统一配置环境变量，便于集中管理
- **回归检查**:
  ```bash
  grep -n "192.168.166.151:8080" chanjing_api_v2.py api_digital_human.py docker-compose.yml
  ```
