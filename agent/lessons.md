# 项目教训与回归规则

本文档记录本项目已踩过的坑、已修复的错误和不可复发的规则。

**规则优先级高于临时推测**。当遇到类似问题时，先查阅本文档。

---

## 已记录规则


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
