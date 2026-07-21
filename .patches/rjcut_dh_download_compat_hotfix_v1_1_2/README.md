# RJCut digital-human download hotfix v1.1.2

This release replaces v1.1.1.

The previous PowerShell file contained Chinese curly quotation marks and was saved as UTF-8 without BOM. Windows PowerShell 5.1 could decode it with the local ANSI code page and fail before executing the script.

v1.1.2 uses:

- ASCII-only PowerShell source
- UTF-8 with BOM
- idempotent semicolon detection
- automatic backup
- `node --check`

## Install

```powershell
cd D:\workspace\rjcut

Expand-Archive `
  -Path "$env:USERPROFILE\Downloads\rjcut_dh_download_compat_hotfix_v1_1_2.zip" `
  -DestinationPath ".\.patches\rjcut_dh_download_compat_hotfix_v1_1_2" `
  -Force

powershell -ExecutionPolicy Bypass `
  -File ".\.patches\rjcut_dh_download_compat_hotfix_v1_1_2\apply_rjcut_dh_download_compat_hotfix_v1_1_2.ps1" `
  -StudioRoot "D:\workspace\rjcut\studio"
```

## Verify

```powershell
cd D:\workspace\rjcut\studio
npm run build
```
