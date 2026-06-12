# 外部文件导入功能 - 使用指南

## 📋 功能概述

这套 MCP 工具让 AI 能够**直接访问和分析**你 PC 上的任意文件夹，并将文件智能导入到 VFS 虚拟文件系统的项目中。

## 🎯 核心场景

**以前：**
> "C:\Users\admin\Desktop\New folder2 里面的文件请帮我分析处理一下并放到项目中或者生成项目并放到项目中自动放好"
> 
> ❌ AI 无法访问本地文件，需要你手动复制粘贴

**现在：**
> "请分析 C:\Users\admin\Desktop\New folder2 文件夹，然后智能组织到 /projects/我的新项目 中"
> 
> ✅ AI 可以直接分析、分类、导入文件！

---

## 🛠️ 三个核心工具

### 1️⃣ `vfs_analyze_external` - 分析外部文件夹

**用途：** 扫描外部文件夹，返回详细的文件分类统计

**参数：**
- `externalPath` (必需): 外部文件夹的绝对路径

**示例：**
```javascript
// 调用示例
await mcpClient.callTool('vfs_analyze_external', {
  externalPath: 'C:\\Users\\admin\\Desktop\\New folder2'
})
```

**返回报告：**
```
📂 外部文件夹分析报告
━━━━━━━━━━━━━━━━━━━━━━
📍 路径：C:\Users\admin\Desktop\New folder2
📊 文件总数：45
💾 总大小：1234.56 MB

📁 文件分类:
  🎬 视频：12 个
  🎵 音频：8 个
  🖼️  图片：15 个
  📄 文档：5 个
  💻 脚本：2 个
  📝 字幕：3 个
  📦 其他：0 个

🎬 视频文件:
  - intro.mp4 (125.3 MB)
  - scene_01.mp4 (89.2 MB)
  - scene_02.mov (156.7 MB)
  ... 还有 9 个视频文件
```

---

### 2️⃣ `vfs_import_external` - 导入外部文件夹到 VFS

**用途：** 将外部文件夹复制到 VFS 虚拟文件系统中

**参数：**
- `externalPath` (必需): 外部文件夹的绝对路径
- `vfsTargetPath` (必需): VFS 中的目标路径
- `includePatterns` (可选): 包含的文件正则模式数组，例如 `["\\.mp4$", "\\.mov$"]`
- `excludePatterns` (可选): 排除的文件正则模式数组，例如 `["\\.tmp$", "~$"]`
- `flatten` (可选): 是否扁平化目录结构，默认 `false`（保持原结构）
- `maxFileSize` (可选): 最大文件大小（字节），默认 500MB

**示例：**
```javascript
// 完整导入，保持目录结构
await mcpClient.callTool('vfs_import_external', {
  externalPath: 'C:\\Users\\admin\\Desktop\\素材包',
  vfsTargetPath: '/imports/素材包'
})

// 只导入视频文件
await mcpClient.callTool('vfs_import_external', {
  externalPath: 'C:\\Users\\admin\\Desktop\\素材包',
  vfsTargetPath: '/imports/视频素材',
  includePatterns: ['\\.mp4$', '\\.mov$', '\\.avi$']
})

// 扁平化导入（所有文件放到同一层）
await mcpClient.callTool('vfs_import_external', {
  externalPath: 'C:\\Users\\admin\\Desktop\\音乐合集',
  vfsTargetPath: '/imports/音乐',
  flatten: true
})

// 排除临时文件
await mcpClient.callTool('vfs_import_external', {
  externalPath: 'C:\\Users\\admin\\Desktop\\项目文件',
  vfsTargetPath: '/imports/项目',
  excludePatterns: ['\\.tmp$', '~$', '\\.bak$']
})
```

**返回报告：**
```
✅ 导入完成
━━━━━━━━━━━━━━━━━━━━━━
📥 源路径：C:\Users\admin\Desktop\素材包
📤 目标路径：/imports/素材包
📊 成功复制：125 个文件
💾 总大小：2345.67 MB
⚠️  跳过：3 个文件
```

---

### 3️⃣ `vfs_smart_organize` - 智能组织到项目（🌟 支持脚本文件分析）

**用途：** 自动按文件类型分类导入到项目目录结构中

**🆕 脚本文件分析功能：**
如果外部文件夹中包含 `script.json` 脚本文件，工具会自动解析并根据 `flag` 字段分类视频：

| flag 类型 | 说明 | 目标文件夹 |
|----------|------|-----------|
| `human` | 数字人出镜视频 | `原始视频/` |
| `scene` | 场景展示视频 | `剪辑视频/` |

**其他文件分类规则：**
| 文件类型 | 扩展名 | 目标文件夹 |
|---------|--------|-----------|
| 音频 | mp3, wav, m4a, aac, ogg, flac, wma | `音频素材/` |
| 图片 | png, jpg, jpeg, gif, webp, svg, bmp, ico, heic | `图片素材/` |
| 文档 | doc, docx, pdf, xls, xlsx, ppt, pptx, txt, md | `文案文档/` |
| 字幕 | srt, vtt, ass, ssa | `字幕文件/` |
| 脚本 | js, ts, jsx, tsx, py, sh, bat, ps1 | `脚本代码/` |
| JSON | json | `项目主目录`（包括 script.json） |
| 其他 | 其他所有文件 | `其他文件/` |

**参数：**
- `externalPath` (必需): 外部文件夹的绝对路径
- `projectPath` (必需): 项目路径（VFS 路径）
- `autoRename` (可选): 是否自动重命名重复文件，默认 `true`
- `createSubfolders` (可选): 是否创建分类子文件夹，默认 `true`
- `useScriptAnalysis` (可选): 是否使用脚本文件分析，默认 `true`

**示例：**
```javascript
// 智能组织到新项目（自动检测 script.json）
await mcpClient.callTool('vfs_smart_organize', {
  externalPath: 'C:\\Users\\admin\\Desktop\\New folder2',
  projectPath: '/projects/我的新项目'
})

// 导入到现有项目，不创建子文件夹
await mcpClient.callTool('vfs_smart_organize', {
  externalPath: 'C:\\Users\\admin\\Desktop\\混用素材',
  projectPath: '/projects/已有项目',
  createSubfolders: false
})

// 禁用脚本分析（所有视频都放到原始视频）
await mcpClient.callTool('vfs_smart_organize', {
  externalPath: 'C:\\Users\\admin\\Desktop\\素材包',
  projectPath: '/projects/项目',
  useScriptAnalysis: false
})
```

**返回报告（有 script.json）：**
```
🎯 智能组织完成
━━━━━━━━━━━━━━━━━━━━━━
📥 源路径：C:\Users\admin\Desktop\New folder2
📤 项目路径：/projects/我的新项目
✅ 检测到脚本文件：C:\...\script.json
   - human 视频（数字人）：2 个
   - scene 视频（场景）：7 个

📊 总文件数：45

📁 分类结果:
  🎬 原始视频 (human)：2 个
  🎬 剪辑视频 (scene)：7 个
  🎵 音频素材：8 个
  🖼️  图片素材：15 个
  📄 文案文档：5 个
  📝 字幕文件：3 个
  💻 脚本代码：2 个
  📦 其他文件：3 个
```

**返回报告（无 script.json）：**
```
🎯 智能组织完成
━━━━━━━━━━━━━━━━━━━━━━
📥 源路径：C:\Users\admin\Desktop\素材包
📤 项目路径：/projects/我的新项目
📊 总文件数：45

📁 分类结果:
  🎬 原始视频：12 个    （所有视频默认放这里）
  🎵 音频素材：8 个
  🖼️  图片素材：15 个
  📄 文案文档：5 个
  📝 字幕文件：3 个
  💻 脚本代码：2 个
  📦 其他文件：0 个
```

---

## 💡 完整工作流示例

### 场景 1：从零开始创建项目

```javascript
// 1. 先分析外部文件夹
const analysis = await mcpClient.callTool('vfs_analyze_external', {
  externalPath: 'C:\\Users\\admin\\Desktop\\新视频素材'
})
console.log(analysis)

// 2. 创建新项目
const projectPath = await mcpClient.callTool('vfs_project_create', {
  name: '我的新视频'
})

// 3. 智能组织素材到项目
const result = await mcpClient.callTool('vfs_smart_organize', {
  externalPath: 'C:\\Users\\admin\\Desktop\\新视频素材',
  projectPath: projectPath
})
console.log(result)

// 4. 查看项目结构
const structure = await mcpClient.callTool('vfs_list', {
  path: projectPath
})
console.log(structure)
```

### 场景 2：🌟 有脚本文件的数字人带货视频项目

```javascript
// 假设外部文件夹结构：
// C:\Users\admin\Desktop\鹿茸血视频\
//   ├── script.json           (带货视频脚本)
//   ├── 数字人播报.mp4        (flag: human)
//   ├── 割二杠鹿茸.mp4        (flag: scene)
//   ├── 鹿茸血.mp4            (flag: scene)
//   ├── 背景音乐.mp3
//   └── 字幕.srt

// 1. 分析文件夹
const analysis = await mcpClient.callTool('vfs_analyze_external', {
  externalPath: 'C:\\Users\\admin\\Desktop\\鹿茸血视频'
})

// 2. 创建项目
const projectPath = await mcpClient.callTool('vfs_project_create', {
  name: '鹿茸血带货视频'
})

// 3. 智能组织（自动解析 script.json，根据 flag 分类视频）
const result = await mcpClient.callTool('vfs_smart_organize', {
  externalPath: 'C:\\Users\\admin\\Desktop\\鹿茸血视频',
  projectPath: projectPath,
  useScriptAnalysis: true  // 启用脚本分析
})

// 组织后的项目结构：
// /projects/鹿茸血带货视频/
//   ├── script.json          ← 脚本文件放主目录
//   ├── 背景音乐.mp3         ← 音频放主目录
//   ├── 字幕.srt             ← 字幕放主目录
//   ├── 原始视频/
//   │   └── 数字人播报.mp4   ← human 类型
//   └── 剪辑视频/
//       ├── 割二杠鹿茸.mp4   ← scene 类型
//       └── 鹿茸血.mp4       ← scene 类型
```

### 场景 3：只导入特定类型文件

```javascript
// 只导入视频和字幕文件
await mcpClient.callTool('vfs_import_external', {
  externalPath: 'C:\\Users\\admin\\Desktop\\素材合集',
  vfsTargetPath: '/imports/视频相关',
  includePatterns: ['\\.mp4$', '\\.mov$', '\\.srt$', '\\.vtt$']
})
```

### 场景 3：批量导入多个文件夹

```javascript
const folders = [
  'C:\\Users\\admin\\Desktop\\视频',
  'C:\\Users\\admin\\Desktop\\音频',
  'C:\\Users\\admin\\Desktop\\图片'
]

for (const folder of folders) {
  await mcpClient.callTool('vfs_import_external', {
    externalPath: folder,
    vfsTargetPath: `/imports/${path.basename(folder)}`,
    flatten: false
  })
}
```

---

## 🔒 安全说明

1. **路径验证**: 所有外部路径会经过验证，确保是合法的绝对路径
2. **文件大小限制**: 默认最大 500MB，可通过 `maxFileSize` 参数调整
3. **只读分析**: `vfs_analyze_external` 只读取文件信息，不修改任何文件
4. **复制非移动**: 导入操作是**复制**文件，不会删除或移动原始文件

---

## 📝 给 AI 的提示词示例

你可以这样对 AI 说：

```
请帮我处理 C:\Users\admin\Desktop\New folder2 这个文件夹：

1. 先用 vfs_analyze_external 分析一下里面有什么文件
2. 然后用 vfs_smart_organize 把文件智能组织到 /projects/新视频项目 中
3. 最后用 vfs_list 查看一下项目结构
```

或者更简单的：

```
把 C:\Users\admin\Desktop\素材包 里的所有视频和音频文件导入到 /projects/我的项目 中
```

---

## 🐛 常见问题

**Q: 路径格式有问题怎么办？**
A: Windows 路径可以用 `\\` 或 `/` 都可以，例如：
- `C:\\Users\\admin\\Desktop\\文件夹`
- `C:/Users/admin/Desktop/文件夹`

**Q: 导入大文件很慢怎么办？**
A: 可以调整 `maxFileSize` 参数限制最大文件大小，或使用 `includePatterns` 只导入特定类型文件。

**Q: 文件重名了怎么办？**
A: `vfs_smart_organize` 默认会添加时间戳自动重命名。`vfs_import_external` 会覆盖同名文件。

**Q: 可以导入网络路径吗？**
A: 支持 UNC 路径（如 `\\server\share\folder`），但需要确保有访问权限。

---

## 📚 API 参考

### fs-utils.js 导出函数

```javascript
// 分析外部文件夹
analyzeExternalFolder(externalPath)

// 导入外部文件夹到 VFS
importExternalFolder(externalPath, vfsTargetPath, options)

// 智能组织到项目
smartOrganizeToProject(externalPath, projectPath, options)
```

### MCP 工具

```javascript
vfs_analyze_external      // 分析外部文件夹
vfs_import_external       // 导入到 VFS
vfs_smart_organize        // 智能组织到项目
```

### IPC 处理器（renderer 进程调用）

```javascript
fs:analyzeExternalFolder
fs:importExternalFolder
fs:smartOrganizeToProject
```