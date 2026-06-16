/**
 * RJCut Studio - 前端项目结构工具模块
 * 
 * 统一项目目录结构定义，确保前端组件使用与 Electron 后端相同的路径规则
 * 
 * 项目目录结构：
 * C:\Users\admin\Documents\RJCut\projects\项目名\
 * ├── project.json          # 项目配置文件
 * ├── 原始视频/             # human 类型视频（数字人出镜）
 * ├── 剪辑视频/             # scene 类型视频（场景展示）
 * └── 输出/                 # 渲染输出文件
 */

/**
 * 项目子目录名称常量
 */
export const PROJECT_FOLDERS = {
  RAW_VIDEO: '原始视频',    // human 类型视频（数字人出镜）
  EDITED_VIDEO: '剪辑视频', // scene 类型视频（场景展示）
  OUTPUT: '输出',           // 渲染输出文件
}

/**
 * 项目根目录路径前缀
 * 设置为空字符串表示项目直接在根目录下，例如 /项目名/剪辑视频
 * 设置为 '/projects' 表示项目在 projects 子目录下，例如 /projects/项目名/剪辑视频
 */
export const PROJECT_ROOT_PREFIX = '' // 修改为空字符串，项目直接在根目录

/**
 * 项目必需文件
 */
export const PROJECT_FILES = {
  CONFIG: 'project.json',   // 项目配置文件
}

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
  return Object.values(PROJECT_FILES)
}

/**
 * 构建 VFS 虚拟路径
 * @param {string} projectName - 项目名称
 * @param {string} subPath - 可选的子路径（例如 '原始视频' 或 '剪辑视频/xxx.mp4'）
 * @returns {string} VFS 虚拟路径（例如 /项目名/原始视频）
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
  
  // 根据 PROJECT_ROOT_PREFIX 解析路径
  if (PROJECT_ROOT_PREFIX) {
    // 有前缀的情况：/projects/项目名/xxx
    if (!vfsPath.startsWith(`${PROJECT_ROOT_PREFIX}/`)) {
      return null
    }
    const remaining = vfsPath.replace(`${PROJECT_ROOT_PREFIX}/`, '')
    const projectName = remaining.split('/')[0]
    return projectName || null
  } else {
    // 无前缀的情况：/项目名/xxx
    const parts = vfsPath.split('/').filter(p => p) // 移除空字符串
    if (parts.length === 0) {
      return null
    }
    return parts[0]
  }
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
      error: '路径必须以 /projects/项目名 格式开头',
    }
  }
  
  // 获取子路径（如果有）
  const subPath = vfsPath.replace(`/projects/${projectName}`, '')
  
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