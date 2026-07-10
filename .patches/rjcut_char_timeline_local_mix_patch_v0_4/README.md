# RJCut 字级时间轴 + 本地模板混剪补丁 v0.4

适用目录：

```text
后端：D:\workspace\rjcut
前端：D:\workspace\rjcut\studio
数字人 API：http://192.168.166.151:8080
```

## 新主线

```text
AI 结构化文案
  -> spoken_text + semantic segments
  -> 8080 数字人 API
  -> MP4 + char_timings
  -> 同名 .rjdh.json
  -> 模板混剪自动加载 JSON
  -> 根据字级时间轴生成 timeline.json
  -> 前端/Electron 本地裁切、素材替换、BGM、合成
```

模板混剪任务不再：

- 把“转场”写进口播；
- 上传数字人视频到 RJCut 后端；
- 请求 `/v1/tasks/agent-draft`；
- 请求 `/v1/tasks/agent-compose`；
- 使用 Whisper 搜索口播关键字来决定切点。

普通批量处理流程仍保留原后端逻辑，不受影响。

## AI 文案变化

后端 `/v1/ai/generate-script` 现在返回：

```json
{
  "script": {
    "schema": "rjcut.copywriting-plan/v1",
    "spoken_text": "数字人实际朗读的纯文案",
    "segments": [
      {
        "id": "s1",
        "text": "spoken_text 中连续存在的原文片段",
        "purpose": "hook",
        "visual_mode": "human",
        "visual_tags": [],
        "slot_id": null
      }
    ]
  }
}
```

自定义提示词和 AI 输出都经过后端正则过滤：

- 阻止提示词注入或绕过规则；
- 阻止重新要求写入“转场”等导演口令；
- 阻止强制虚构资质、销量、案例；
- 阻止医疗功效和绝对化广告承诺；
- 最终口播进入数字人接口前再次验收。

## 数字人项目文件

数字人视频生成后自动保存：

```text
xxx.mp4
xxx.rjdh.json
```

`.rjdh.json` 包含：

```text
schema
copywriting.spoken_text
copywriting.segments
char_timings
digital_human.duration_ms
timeline.segments
timeline.clips
```

模板混剪选择 MP4 时，会自动读取同目录、同名 `.rjdh.json`。

## 安装后验证

后端语法：

```powershell
cd D:\workspace\rjcut
python -m py_compile .\draft_utils.py .\api_service.py
python .\scripts\test_ai_copywriting_contract.py
```

前端时间线合同测试：

```powershell
cd D:\workspace\rjcut\studio
node .\scripts\test_digital_human_project.mjs
```

前端构建：

```powershell
npm run build
```

## 8080 地址设置

默认值已经是：

```text
http://192.168.166.151:8080
```

需要临时更换时，可以在浏览器开发者控制台执行：

```javascript
localStorage.setItem('rjcut_digital_human_api_base_url', 'http://新的地址:8080')
```
