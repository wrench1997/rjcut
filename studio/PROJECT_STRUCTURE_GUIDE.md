# RJCut Studio - 项目结构规范

## 核心规则

项目由目录本身表示，不需要 `project.json`。创建项目时只创建项目根目录，子目录在第一次实际使用时再创建。

```text
剪辑工作室/
└── 我的项目/
    ├── 文案/               # 文案、数字人输入（按需创建）
    ├── 场景素材/           # 模板混剪素材（按需创建）
    └── 成片/               # 最终输出（按需创建）
```

目录约定：

- 根目录下的普通文件夹就是项目。
- 不再使用公共素材库或项目容器前缀；项目直接位于根目录。
- `/项目名/文案`、`/项目名/场景素材`、`/项目名/成片` 是唯一的运行路径。
- 历史目录名不再作为运行目录，新项目统一使用 `文案`、`场景素材`、`成片`。
- 已存在的 `project.json` 只读兼容并在文件浏览器中隐藏；新代码不会创建、更新或复制它。

## 统一路径模块

前端使用 `src/utils/project-structure.js`，Electron 使用 `electron/project-structure.js`。两者必须保持相同的 `PROJECT_FOLDERS` 定义：

```javascript
PROJECT_FOLDERS.RAW_VIDEO    // 文案
PROJECT_FOLDERS.EDITED_VIDEO // 场景素材
PROJECT_FOLDERS.OUTPUT       // 成片
```

构建项目路径：

```javascript
buildVFSPath('我的项目', PROJECT_FOLDERS.EDITED_VIDEO)
// /我的项目/场景素材
```

## 创建项目

项目创建接口只负责创建根目录：

```javascript
await vfs.createVideoProject('我的项目')
// /我的项目
```

需要写入素材时再创建目标目录：

```javascript
await vfs.mkdir('/我的项目/场景素材', true)
await vfs.writeFile('/我的项目/场景素材/scene.mp4', content)
```

## 兼容与迁移

项目列表扫描目录而不是扫描 `project.json`。因此旧项目即使没有配置文件也不会消失。旧 `project.json` 中的名称和时间只用于兼容显示，不再作为业务数据源。

数字人生成视频的业务信息应与视频同目录保存为同名 `.rjdh.json` sidecar；它和项目识别是两件事，不能再用 `project.json` 代替。

## 相关文件

- `src/utils/project-structure.js` - 前端路径和目录规则
- `src/utils/virtualFileSystem.js` - IndexedDB / Electron 混合 VFS
- `electron/project-structure.js` - Electron 目录规则
- `electron/fs-utils.js` - 实体文件系统和项目扫描
- `electron/virtual-file-server.js` - Electron 虚拟文件服务器
