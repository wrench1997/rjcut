/**
 * RJCut Studio - 前端项目结构工具模块
 * 
 * 统一项目目录结构定义，确保前端组件使用与 Electron 后端相同的路径规则
 * 
 * 项目目录结构：
 * C:\Users\admin\Documents\剪辑工作室\项目名\
 * ├── 文案/                 # 文案、数字人生成视频等输入（按需创建）
 * ├── 场景素材/             # 模板混剪使用的场景素材（按需创建）
 * └── 成片/                 # 渲染输出文件（按需创建）
 *
 * 目录本身就是项目，不再生成 project.json 项目标记文件。
 */

/**
 * 项目子目录名称常量
 */
export const PROJECT_FOLDERS = {
  RAW_VIDEO: '文案',
  EDITED_VIDEO: '场景素材',
  OUTPUT: '成片',
}

// 根目录下这些目录属于素材库或历史容器，不应被识别为视频项目。
export const PROJECT_DISCOVERY_EXCLUDED_FOLDERS = [
  '素材库', '素材', '草稿', '配置', '脚本', '模板', '输出', '音频', '字幕', '转录',
  '项目', 'projects', '回收站', '文案', '场景素材', '成片',
]

/**
 * 项目根目录路径前缀
 * 项目直接位于根目录，例如 /12344/场景素材。
 * 不再使用公共素材库或项目容器前缀。
 */
export const PROJECT_ROOT_PREFIX = ''

/**
 * 旧项目文件名，仅用于兼容和界面隐藏；不是新项目的必需文件。
 */
export const PROJECT_FILES = {
  CONFIG: 'project.json',
}

export const PROJECT_METADATA_FILES = Object.values(PROJECT_FILES)

/**
 * 获取项目文件夹名称列表
 */
export function getProjectFolderNames() {
  return Object.values(PROJECT_FOLDERS)
}

/**
 * 获取项目必需文件列表
 */
export function getProjectFileNames() {
  return []
}

/**
 * 构建 VFS 虚拟路径
 * @param {string} projectName - 项目名称
 * @param {string} subPath - 可选的子路径（例如 '文案' 或 '场景素材/xxx.mp4'）
 * @returns {string} VFS 虚拟路径（例如 /项目名/场景素材）
 */
export function buildVFSPath(projectName, subPath = '') {
  const base = PROJECT_ROOT_PREFIX ? `${PROJECT_ROOT_PREFIX}/${projectName}` : `/${projectName}`
  if (subPath) {
    // 确保子路径使用正斜杠
    const normalizedSub = subPath.replace(/\\/g, '/')
    return `${base}/${normalizedSub}`
  }
  return base
}

/**
 * 从 VFS 路径解析项目名称
 * @param {string} vfsPath - VFS 路径（例如 /项目名/xxx）
 * @returns {string|null} 项目名称，如果路径无效则返回 null
 */
export function parseProjectNameFromVFS(vfsPath) {
  if (!vfsPath) {
    return null
  }
  
  const parts = vfsPath.split('/').filter(Boolean)
  if (parts.length === 0 || ['项目', 'projects'].includes(parts[0])) {
    return null
  }
  return parts[0]
}

/**
 * 验证 VFS 路径是否是有效的项目路径
 * @param {string} vfsPath - VFS 路径
 * @returns {Object} 验证结果 { isValid, projectName, subPath, error }
 */
export function validateVFSProjectPath(vfsPath) {
  const projectName = parseProjectNameFromVFS(vfsPath)
  
  if (!projectName) {
    return {
      isValid: false,
      error: '路径必须以 /项目名 格式开头',
    }
  }
  
  // 获取子路径（如果有）
  const subPath = vfsPath.replace(`${PROJECT_ROOT_PREFIX}/${projectName}`, '')
  
  // 检查是否是项目根目录或有效的子目录
  if (!subPath || subPath === '' || subPath === '/') {
    return { isValid: true, projectName, subPath: '' }
  }
  
  // 规范化子路径
  const normalizedSub = subPath.replace(/^\//, '').replace(/\\/g, '/')
  const folderName = normalizedSub.split('/')[0]
  
  // 检查子目录是否是项目允许的子目录
  const validFolders = getProjectFolderNames()
  if (validFolders.includes(folderName)) {
    return { isValid: true, projectName, subPath: normalizedSub }
  }
  
  // 允许其他子路径（例如具体文件）
  return { isValid: true, projectName, subPath: normalizedSub }
}

/**
 * 构建项目子目录路径（VFS 格式）
 * @param {string} projectName - 项目名称
 * @param {string} folderType - 目录类型 ('raw_video' | 'edited_video' | 'output')
 * @returns {string} VFS 子目录路径
 */
export function buildProjectSubVFSPath(projectName, folderType) {
  const folderName = PROJECT_FOLDERS[folderType.toUpperCase()]
  if (!folderName) {
    throw new Error(`无效的目录类型：${folderType}。有效类型：raw_video, edited_video, output`)
  }
  return buildVFSPath(projectName, folderName)
}

/**
 * 根据数字人视频路径推导当前项目的场景素材目录。
 * 非项目路径返回 null，调用方应要求用户先选择项目。
 */
export function getSceneMaterialsPathFromVideo(videoPath) {
  const normalizedPath = String(videoPath || '').replace(/\\/g, '/').replace(/\/+/g, '/')
  const parts = normalizedPath.split('/').filter(Boolean)
  const firstPart = parts[0]
  const projectName = firstPart
  if (
    !projectName ||
    PROJECT_DISCOVERY_EXCLUDED_FOLDERS.includes(firstPart) ||
    PROJECT_DISCOVERY_EXCLUDED_FOLDERS.includes(projectName)
  ) {
    return null
  }
  return `/${projectName}/${PROJECT_FOLDERS.EDITED_VIDEO}`
}

/**
 * 获取项目标准子目录列表（VFS 路径）
 * @param {string} projectName - 项目名称
 * @returns {Array<{name: string, vfsPath: string, type: string}>} 子目录列表
 */
export function getProjectSubDirectories(projectName) {
  return [
    {
      name: PROJECT_FOLDERS.RAW_VIDEO,
      vfsPath: buildVFSPath(projectName, PROJECT_FOLDERS.RAW_VIDEO),
      type: 'raw_video',
    },
    {
      name: PROJECT_FOLDERS.EDITED_VIDEO,
      vfsPath: buildVFSPath(projectName, PROJECT_FOLDERS.EDITED_VIDEO),
      type: 'edited_video',
    },
    {
      name: PROJECT_FOLDERS.OUTPUT,
      vfsPath: buildVFSPath(projectName, PROJECT_FOLDERS.OUTPUT),
      type: 'output',
    },
  ]
}
