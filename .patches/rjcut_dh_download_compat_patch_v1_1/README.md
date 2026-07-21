# RJCut 数字人下载兼容补丁 v1.1

修复两类问题：

1. 公共数字人、自定义数字人、声音列表中的一个接口失败时，不再让整个数字人控制平台初始化失败。
2. 兼容数字人服务修改后的 `video_url` 和文件路由。

视频下载由浏览器直接访问：

```text
http://192.168.166.151:8080
```

不会经过 `rjcut_api`，所以应查看数字人服务的 8080 日志，而不是 RJCut Python API 日志。

补丁支持这些返回位置：

```text
result.video_url
result.videoUrl
result.media.video_url
result.files.final_video.download_url
result.files.video.download_url
```

并自动尝试：

```text
/files/api_tasks/{task_id}/digital_human.mp4
/files/tasks/{task_id}/digital_human.mp4
/files/{task_id}/digital_human.mp4
```

## 安装

```powershell
cd D:\workspace\rjcut

Expand-Archive `
  -Path "$env:USERPROFILE\Downloads\rjcut_dh_download_compat_patch_v1_1.zip" `
  -DestinationPath ".\.patches\rjcut_dh_download_compat_patch_v1_1" `
  -Force

powershell -ExecutionPolicy Bypass `
  -File ".\.patches\rjcut_dh_download_compat_patch_v1_1\apply_rjcut_dh_download_compat_v1_1.ps1" `
  -StudioRoot "D:\workspace\rjcut\studio"
```

## 验证

```powershell
cd D:\workspace\rjcut\studio

node .\scripts\test_digital_human_download_compat_v1_1.mjs
npm run build
```

正确结果：

```text
DIGITAL_HUMAN_DOWNLOAD_COMPAT_V1_1=PASS
```
