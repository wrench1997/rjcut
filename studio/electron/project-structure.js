/**
 * 剪辑工作室 - 项目结构定义模块
 * 
 * 统一项目目录结构定义，确保前端组件和 Electron 后端使用相同的路径规则
 * 
 * 项目目录结构：
 * C:\Users\admin\Documents\剪辑工作室\项目名\
 * ├── 文案/                 # 文案、数字人生成视频等输入（按需创建）
 * ├── 场景素材/             # 模板混剪使用的场景素材（按需创建）
 * └── 成片/                 # 渲染输出文件（按需创建）
 *
 * 目录本身就是项目，不再生成 project.json 项目标记文件。
 */

const path = require('path')

/**
 * 项目子目录名称常量
 */
const PROJECT_FOLDERS = {
  RAW_VIDEO: '文案',        // 文案、数字人生成视频等输入
  EDITED_VIDEO: '场景素材', // 模板混剪使用的场景素材
  OUTPUT: '成片',           // 渲染输出文件
}

// 根目录下这些目录属于素材库或历史容器，不应被识别为视频项目。
const PROJECT_DISCOVERY_EXCLUDED_FOLDERS = [
  '素材库', '素材', '草稿', '配置', '脚本', '模板', '输出', '音频', '字幕', '转录',
  '项目', 'projects', '回收站', '文案', '场景素材', '成片',
]

/**
 * 旧项目文件名，仅用于兼容和界面隐藏；不是新项目的必需文件。
 */
const PROJECT_FILES = {
  CONFIG: 'project.json',
}

const PROJECT_METADATA_FILES = Object.values(PROJECT_FILES)

/**
 * 获取项目文件夹名称列表
 */
function getProjectFolderNames() {
  return Object.values(PROJECT_FOLDERS)
}

/**
 * 获取项目必需文件列表
 */
function getProjectFileNames() {
  return []
}

/**
 * 构建项目根路径
 * @param {string} baseRoot - 基础根目录（例如：C:\Users\admin\Documents\剪辑工作室）
 * @param {string} projectName - 项目名称
 * @returns {string} 项目根路径
 */
function buildProjectPath(baseRoot, projectName) {
  return path.join(baseRoot, projectName)
}

/**
 * 构建项目子目录路径
 * @param {string} baseRoot - 基础根目录
 * @param {string} projectName - 项目名称
 * @param {string} folderType - 目录类型 ('raw_video' | 'edited_video' | 'output')
 * @returns {string} 子目录路径
 */
function buildProjectSubPath(baseRoot, projectName, folderType) {
  const folderName = PROJECT_FOLDERS[folderType.toUpperCase()]
  if (!folderName) {
    throw new Error(`无效的目录类型：${folderType}。有效类型：raw_video, edited_video, output`)
  }
  return path.join(buildProjectPath(baseRoot, projectName), folderName)
}

/**
 * 构建 VFS 虚拟路径
 * @param {string} projectName - 项目名称
 * @param {string} subPath - 可选的子路径（例如 '文案' 或 '场景素材/xxx.mp4'）
 * @returns {string} VFS 虚拟路径（例如 /项目名/场景素材）
 */
function buildVFSPath(projectName, subPath = '') {
  // 项目直接在根目录下，不需要 /projects 前缀
  const base = `/${projectName}`
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
function parseProjectNameFromVFS(vfsPath) {
  if (!vfsPath || vfsPath === '/') {
    return null
  }
  // 移除前导斜杠，获取剩余部分
  const remaining = vfsPath.replace(/^\//, '')
  // 获取第一个路径段作为项目名
  const projectName = remaining.split('/')[0]
  if (['项目', 'projects'].includes(projectName)) {
    return null
  }
  return projectName || null
}

/**
 * 验证 VFS 路径是否是有效的项目路径
 * @param {string} vfsPath - VFS 路径
 * @returns {Object} 验证结果 { isValid, projectName, subPath }
 */
function validateVFSProjectPath(vfsPath) {
  const projectName = parseProjectNameFromVFS(vfsPath)
  
  if (!projectName) {
    return {
      isValid: false,
      error: '路径必须以 /项目名 格式开头',
    }
  }
  
  // 获取子路径（如果有）
  const subPath = vfsPath.replace(`/${projectName}`, '')
  
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
 * 将 VFS 项目路径转换为物理路径
 * @param {string} vfsPath - VFS 路径（例如 /项目名/场景素材）
 * @param {string} baseRoot - 基础根目录（例如 C:\Users\admin\Documents\剪辑工作室）
 * @returns {string} 物理路径
 */
function vfsToPhysicalPath(vfsPath, baseRoot) {
  const validation = validateVFSProjectPath(vfsPath)
  if (!validation.isValid) {
    throw new Error(`无效的 VFS 项目路径：${vfsPath}。${validation.error}`)
  }
  
  const projectPath = buildProjectPath(baseRoot, validation.projectName)
  if (validation.subPath) {
    return path.join(projectPath, validation.subPath.replace(/\//g, path.sep))
  }
  return projectPath
}

module.exports = {
  // 常量
  PROJECT_FOLDERS,
  PROJECT_DISCOVERY_EXCLUDED_FOLDERS,
  PROJECT_FILES,
  PROJECT_METADATA_FILES,
  
  // 工具函数
  getProjectFolderNames,
  getProjectFileNames,
  buildProjectPath,
  buildProjectSubPath,
  buildVFSPath,
  parseProjectNameFromVFS,
  validateVFSProjectPath,
  vfsToPhysicalPath,
}
