# RJCut Studio - 项目结构规范

## 📁 标准项目目录结构

```
C:\Users\admin\Documents\RJCut\projects\项目名\
├── project.json          # 项目配置文件（必需）
├── 原始视频/             # human 类型视频（数字人出镜）
├── 剪辑视频/             # scene 类型视频（场景展示）
└── 输出/                 # 渲染输出文件
```

## ⚠️ 重要规则

1. **项目位置固定**：所有项目必须位于 `C:\Users\admin\Documents\RJCut\projects\` 目录下
2. **三个标准子目录**：每个项目必须包含且仅包含以下三个子目录：
   - `原始视频` - 存放 human 类型视频（数字人出镜）
   - `剪辑视频` - 存放 scene 类型视频（场景展示）
   - `输出` - 存放渲染输出文件
3. **项目配置文件**：每个项目必须有 `project.json` 配置文件
4. **其他文件**：音频、图片、文档、字幕等文件直接放在项目根目录，**不创建额外的子目录**

## 🔧 统一路径模块

### Electron 后端 (electron/project-structure.js)

```javascript
const projectStructure = require('./project-structure')

// 获取项目文件夹名称列表
const folders = projectStructure.getProjectFolderNames()
// 返回：['原始视频', '剪辑视频', '输出']

// 构建 VFS 虚拟路径
const vfsPath = projectStructure.buildVFSPath('我的项目', '原始视频')
// 返回：/projects/我的项目/原始视频

// 从 VFS 路径解析项目名称
const projectName = projectStructure.parseProjectNameFromVFS('/projects/我的项目/原始视频')
// 返回：我的项目

// 验证 VFS 路径
const validation = projectStructure.validateVFSProjectPath('/projects/我的项目/原始视频')
// 返回：{ isValid: true, projectName: '我的项目', subPath: '原始视频' }

// VFS 路径转物理路径
const physicalPath = projectStructure.vfsToPhysicalPath(
  '/projects/我的项目/原始视频',
  'C:\\Users\\admin\\Documents\\RJCut'
)
// 返回：C:\Users\admin\Documents\RJCut\projects\我的项目\原始视频
```

### 前端 (src/utils/project-structure.js)

```javascript
import { 
  PROJECT_FOLDERS,
  buildVFSPath,
  parseProjectNameFromVFS,
  validateVFSProjectPath,
  getProjectSubDirectories
} from '@/utils/project-structure'

// 获取标准文件夹常量
console.log(PROJECT_FOLDERS.RAW_VIDEO)    // '原始视频'
console.log(PROJECT_FOLDERS.EDITED_VIDEO) // '剪辑视频'
console.log(PROJECT_FOLDERS.OUTPUT)       // '输出'

// 构建 VFS 路径
const vfsPath = buildVFSPath('我的项目', '原始视频')
// 返回：/projects/我的项目/原始视频

// 获取项目的所有子目录（VFS 路径）
const subDirs = getProjectSubDirectories('我的项目')
// 返回：
// [
//   { name: '原始视频', vfsPath: '/projects/我的项目/原始视频', type: 'raw_video' },
//   { name: '剪辑视频', vfsPath: '/projects/我的项目/剪辑视频', type: 'edited_video' },
//   { name: '输出', vfsPath: '/projects/我的项目/输出', type: 'output' }
// ]
```

## 🎯 MCP 工具使用规范

### vfs_smart_organize - 智能组织文件到项目

```javascript
// ✅ 正确用法
await mcpClient.callTool('vfs_smart_organize', {
  externalPath: 'C:\\Users\\admin\\Desktop\\素材',
  projectPath: '/projects/我的视频项目',  // 必须是 /projects/项目名 格式
  useScriptAnalysis: true,
  autoRename: true,
})

// ❌ 错误用法 - 路径格式不对
await mcpClient.callTool('vfs_smart_organize', {
  externalPath: 'C:\\Users\\admin\\Desktop\\素材',
  projectPath: '/imports/我的视频项目',  // 错误！必须是 /projects/ 开头
})

// ❌ 错误用法 - 绝对路径不在正确位置
await mcpClient.callTool('vfs_smart_organize', {
  externalPath: 'C:\\Users\\admin\\Desktop\\素材',
  projectPath: 'C:\\Users\\admin\\Documents\\Other\\项目',  // 错误！必须在 RJCut/projects 下
})
```

### vfs_import_external - 导入外部文件

```javascript
// ✅ 正确用法
await mcpClient.callTool('vfs_import_external', {
  externalPath: 'C:\\Users\\admin\\Desktop\\素材',
  vfsTargetPath: '/projects/我的视频项目/原始视频',  // 必须是 /projects/项目名/xxx 格式
  includePatterns: ['\\.mp4$', '\\.mov$'],
})

// ❌ 错误用法
await mcpClient.callTool('vfs_import_external', {
  externalPath: 'C:\\Users\\admin\\Desktop\\素材',
  vfsTargetPath: '/imports/素材',  // 错误！必须是 /projects/ 开头
})
```

## 📝 文件组织规则

### smartOrganizeToProject 函数行为

1. **检测到 script.json 时**：
   - `flag: 'human'` 的视频 → `原始视频/` 目录
   - `flag: 'scene'` 的视频 → `剪辑视频/` 目录
   - `script.json` 文件 → 项目根目录

2. **未检测到 script.json 时**：
   - 所有视频文件 → `原始视频/` 目录
   - 其他文件（音频、图片、文档等）→ 项目根目录（不再创建额外子目录）

### 项目目录创建

创建新项目时，会自动创建以下结构：

```javascript
// fs-utils.js createVideoProject 函数
await fs.mkdir(projectPath, { recursive: true })
await fs.mkdir(path.join(projectPath, '原始视频'), { recursive: true })
await fs.mkdir(path.join(projectPath, '剪辑视频'), { recursive: true })
await fs.mkdir(path.join(projectPath, '输出'), { recursive: true })
await fs.writeFile(path.join(projectPath, 'project.json'), config)
```

## 🔄 VFS 同步机制

虚拟文件系统 (VFS) 会自动同步物理项目目录：

1. **启动时**：扫描 `C:\Users\admin\Documents\RJCut\projects` 目录
2. **新项目**：自动同步到 VFS 的 `/projects/项目名` 路径
3. **现有项目**：检查并补充缺失的标准子目录（原始视频、剪辑视频、输出）

## 🚫 禁止行为

1. ❌ 不允许在项目中创建除 `原始视频`、`剪辑视频`、`输出` 之外的子目录
2. ❌ 不允许将文件保存到 `C:\Users\admin\Documents\RJCut\projects` 之外的位置
3. ❌ 不允许使用 `/imports/`、`/temp/` 等非项目路径
4. ❌ 不允许修改 `project.json` 的位置和名称

## ✅ 推荐实践

1. **使用统一路径模块**：始终使用 `projectStructure` 模块构建和验证路径
2. **VFS 路径优先**：在代码中使用 VFS 路径（如 `/projects/项目名/原始视频`）而非物理路径
3. **路径验证**：在保存文件前使用 `validateVFSProjectPath()` 验证路径
4. **遵循标准结构**：不要创建额外的子目录，保持项目结构简洁统一

## 📚 相关文件

- `electron/project-structure.js` - Electron 后端项目结构模块
- `src/utils/project-structure.js` - 前端项目结构模块
- `electron/fs-utils.js` - 文件系统工具（包含路径验证逻辑）
- `electron/virtual-file-server.js` - 虚拟文件服务器（包含自动同步逻辑）