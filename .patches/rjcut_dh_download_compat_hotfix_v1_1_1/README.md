# RJCut 数字人下载兼容热修复 v1.1.1

修复 `digitalHumanDownload.js` 的 Webpack 构建错误：

```text
Expression expected
].forEach(...)
```

原因是：

```js
const id = encodeURIComponent(String(taskId))
[
  ...
].forEach(...)
```

下一行以 `[` 开头时，会被解析成上一行表达式的一部分。

热修复会自动改成：

```js
const id = encodeURIComponent(String(taskId));
[
  ...
].forEach(...)
```

安装：

```powershell
cd D:\workspace\rjcut

Expand-Archive `
  -Path "$env:USERPROFILE\Downloads\rjcut_dh_download_compat_hotfix_v1_1_1.zip" `
  -DestinationPath ".\.patches\rjcut_dh_download_compat_hotfix_v1_1_1" `
  -Force

powershell -ExecutionPolicy Bypass `
  -File ".\.patches\rjcut_dh_download_compat_hotfix_v1_1_1\apply_rjcut_dh_download_compat_hotfix_v1_1_1.ps1" `
  -StudioRoot "D:\workspace\rjcut\studio"
```

验证：

```powershell
cd D:\workspace\rjcut\studio
npm run build
```
