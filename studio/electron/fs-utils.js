/**
 * RJCut Studio - 文件系统工具模块
 * 
 * 提供可重用的文件系统操作函数，供 main.js 和 MCP 服务器共享使用
 */

const { app } = require('electron')
const path = require('path')
const fs = require('fs').promises
const fsSync = require('fs')

// 允许的根目录（由 main.js 设置）
let allowedRoots = []

/**
 * 设置允许的根目录
 */
function setAllowedRoots(roots) {
  allowedRoots = roots.map(r => path.normalize(r))
}

/**
 * 获取允许的根目录
 */
function getAllowedRoots() {
  return allowedRoots
}

/**
 * 验证路径是否在允许的根目录内
 */
function validatePath(requestedPath) {
  const defaultRoot = allowedRoots[0] || app.getPath('documents')
  
  if (!requestedPath || requestedPath === '/') {
    return defaultRoot
  }
  
  let resolvedPath = requestedPath
  
  // 处理虚拟路径（以 / 开头的路径，视为相对于 defaultRoot 的虚拟路径）
  // 注意：在 Windows 上 path.isAbsolute('/xxx') 也返回 true，所以需要特殊处理
  if (requestedPath.startsWith('/')) {
    // 先规范化路径（处理 // 等情况），然后移除前导斜杠
    const normalizedVirtual = requestedPath.replace(/^\/+/, '').replace(/\/+/g, path.sep)
    // 使用 path.normalize 确保路径正确
    resolvedPath = path.normalize(path.join(defaultRoot, normalizedVirtual))
    console.log(`[validatePath] 虚拟路径 "${requestedPath}" -> "${resolvedPath}"`)
    // 虚拟路径直接返回，不再进行允许性检查（因为已经是相对于 defaultRoot 的）
    return resolvedPath
  } else if (path.isAbsolute(requestedPath)) {
    // 已经是绝对路径，直接规范化
    resolvedPath = path.normalize(requestedPath)
  } else {
    // 相对路径，拼接到默认根目录
    resolvedPath = path.normalize(path.join(defaultRoot, requestedPath))
  }
  
  // 验证路径是否在允许的根目录内
  // 统一使用小写和正斜杠进行比较（Windows 路径不区分大小写）
  const normalizedResolved = resolvedPath.toLowerCase().replace(/\\/g, '/')
  const isAllowed = allowedRoots.some(root => {
    const normalizedRoot = root.toLowerCase().replace(/\\/g, '/')
    return normalizedResolved === normalizedRoot || normalizedResolved.startsWith(normalizedRoot + '/')
  })
  
  if (!isAllowed && allowedRoots.length > 0) {
    // 如果不在允许的根目录内，映射到默认根目录
    const mappedPath = path.join(defaultRoot, path.basename(resolvedPath))
    console.log(`[validatePath] 路径 "${requestedPath}" 不在允许的根目录内，映射到 "${mappedPath}"`)
    return mappedPath
  }
  
  return resolvedPath
}

/**
 * 获取 MIME 类型
 */
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase().slice(1)
  const mimeTypes = {
    json: 'application/json',
    js: 'text/javascript',
    jsx: 'text/javascript',
    ts: 'application/typescript',
    tsx: 'application/typescript',
    css: 'text/css',
    html: 'text/html',
    md: 'text/markdown',
    txt: 'text/plain',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    avi: 'video/x-msvideo',
    mkv: 'video/x-matroska',
    webm: 'video/webm',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    srt: 'text/srt',
    vtt: 'text/vtt',
  }
  return mimeTypes[ext] || 'application/octet-stream'
}

// ==================== 基础文件系统操作 ====================

/**
 * 将物理路径转换为虚拟路径
 */
function toVirtualPath(physicalPath) {
  const defaultRoot = allowedRoots[0] || app.getPath('documents')
  
  // 统一使用小写和正斜杠进行比较（Windows 路径不区分大小写）
  const normalizedPhysical = physicalPath.toLowerCase().replace(/\\/g, '/')
  const normalizedRoot = defaultRoot.toLowerCase().replace(/\\/g, '/')
  
  // 如果路径在默认根目录内，转换为虚拟路径
  if (normalizedPhysical.startsWith(normalizedRoot)) {
    let relative = path.relative(defaultRoot, physicalPath)
    // 处理 Windows 路径分隔符
    relative = relative.replace(/\\/g, '/')
    // 确保不以 / 开头（因为 path.relative 可能返回空或带 \ 的路径）
    if (!relative.startsWith('/')) {
      relative = '/' + relative
    }
    // 清理重复的斜杠
    relative = relative.replace(/\/+/g, '/')
    console.log(`[toVirtualPath] "${physicalPath}" -> "${relative}"`)
    return relative
  }
  
  // 否则返回原始路径（绝对路径）
  console.log(`[toVirtualPath] "${physicalPath}" -> "${physicalPath}" (不在根目录内)`)
  return physicalPath
}

/**
 * 列出目录内容
 */
async function listDirectory(dirPath) {
  const resolved = validatePath(dirPath)
  
  console.log(`[FS Utils] listDirectory: dirPath="${dirPath}" -> resolved="${resolved}"`)
  
  try {
    await fs.access(resolved)
  } catch {
    await fs.mkdir(resolved, { recursive: true })
    console.log(`[FS Utils] 自动创建目录：${resolved}`)
  }
  
  const items = await fs.readdir(resolved, { withFileTypes: true })
  
  console.log(`[FS Utils] listDirectory: 找到 ${items.length} 个项目`)
  
  const result = items.map(item => ({
    name: item.name,
    path: toVirtualPath(path.join(resolved, item.name)),
    isDirectory: item.isDirectory(),
    isFile: item.isFile(),
    isSymlink: item.isSymbolicLink(),
    size: item.isFile() ? fsSync.statSync(path.join(resolved, item.name)).size : undefined,
    updatedAt: item.isFile() ? fsSync.statSync(path.join(resolved, item.name)).mtime.toISOString() : undefined,
  })).sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1
    if (!a.isDirectory && b.isDirectory) return 1
    return a.name.localeCompare(b.name)
  })
  
  console.log(`[FS Utils] listDirectory: 返回结果:`, result.map(i => i.path))
  
  return result
}

/**
 * 创建目录
 */
async function mkdir(dirPath, recursive = false) {
  const resolved = validatePath(dirPath)
  await fs.mkdir(resolved, { recursive })
  return resolved
}

/**
 * 读取文件
 */
async function readFile(filePath, encoding = 'utf-8') {
  const resolved = validatePath(filePath)
  const stat = await fs.stat(resolved)
  
  if (stat.size > 100 * 1024 * 1024) {
    throw new Error(`文件过大：${(stat.size / 1024 / 1024).toFixed(2)}MB > 100MB`)
  }
  
  return await fs.readFile(resolved, encoding)
}

/**
 * 读取文件为 Buffer
 */
async function readFileAsBuffer(filePath) {
  const resolved = validatePath(filePath)
  const stat = await fs.stat(resolved)
  
  if (stat.size > 500 * 1024 * 1024) {
    throw new Error(`文件过大：${(stat.size / 1024 / 1024).toFixed(2)}MB > 500MB`)
  }
  
  return await fs.readFile(resolved)
}

/**
 * 读取 JSON
 */
async function readJSON(filePath) {
  const content = await readFile(filePath, 'utf-8')
  return JSON.parse(content)
}

/**
 * 写入文件
 */
async function writeFile(filePath, content, options = {}) {
  const resolved = validatePath(filePath)
  
  if (options.createParent !== false) {
    await fs.mkdir(path.dirname(resolved), { recursive: true })
  }
  
  let data
  if (typeof content === 'string') {
    data = content
  } else if (content instanceof ArrayBuffer || ArrayBuffer.isView(content)) {
    data = Buffer.from(content)
  } else {
    data = JSON.stringify(content, null, 2)
  }
  
  await fs.writeFile(resolved, data)
  
  const stat = await fs.stat(resolved)
  return {
    path: resolved,
    size: stat.size,
    updatedAt: stat.mtime.toISOString(),
  }
}

/**
 * 写入 JSON
 */
async function writeJSON(filePath, data, options = {}) {
  const content = JSON.stringify(data, null, 2)
  return writeFile(filePath, content, options)
}

/**
 * 删除文件/目录
 */
async function deleteFile(targetPath, recursive = false) {
  const resolved = validatePath(targetPath)
  const stat = await fs.stat(resolved)
  
  if (stat.isDirectory()) {
    await fs.rm(resolved, { recursive })
  } else {
    await fs.unlink(resolved)
  }
  
  return true
}

/**
 * 移动/重命名
 */
async function moveFile(fromPath, toPath) {
  const from = validatePath(fromPath)
  const to = validatePath(toPath)
  
  await fs.mkdir(path.dirname(to), { recursive: true })
  await fs.rename(from, to)
  return true
}

/**
 * 复制文件
 */
async function copyFile(fromPath, toPath) {
  const from = validatePath(fromPath)
  const to = validatePath(toPath)
  
  await fs.mkdir(path.dirname(to), { recursive: true })
  await fs.copyFile(from, to)
  return true
}

/**
 * 获取文件信息
 */
async function getFile(filePath) {
  const resolved = validatePath(filePath)
  const stat = await fs.stat(resolved)
  
  return {
    name: path.basename(filePath),
    path: resolved,
    size: stat.size,
    isDirectory: stat.isDirectory(),
    isFile: stat.isFile(),
    createdAt: stat.birthtime.toISOString(),
    updatedAt: stat.mtime.toISOString(),
    type: getMimeType(filePath),
  }
}

/**
 * 检查路径是否存在
 */
async function exists(targetPath) {
  try {
    const resolved = validatePath(targetPath)
    await fs.access(resolved)
    return true
  } catch {
    return false
  }
}

/**
 * 检查是否为目录
 */
async function isDirectory(dirPath) {
  try {
    const resolved = validatePath(dirPath)
    const stat = await fs.stat(resolved)
    return stat.isDirectory()
  } catch {
    return false
  }
}

/**
 * 检查是否为文件
 */
async function isFile(filePath) {
  try {
    const resolved = validatePath(filePath)
    const stat = await fs.stat(resolved)
    return stat.isFile()
  } catch {
    return false
  }
}

/**
 * 搜索文件
 */
async function search(pattern, options = {}) {
  const results = []
  const regex = typeof pattern === 'string' 
    ? new RegExp(pattern, 'i')
    : pattern
  
  const searchDir = async (dir) => {
    try {
      const items = await listDirectory(dir)
      for (const item of items) {
        if (regex.test(item.name) || regex.test(item.path)) {
          results.push(item)
        }
        if (item.isDirectory && options.includeDirectories !== false) {
          await searchDir(item.path)
        }
      }
    } catch (e) {
      // 忽略访问错误的目录
    }
  }
  
  await searchDir('/')
  
  if (options.maxResults) {
    return results.slice(0, options.maxResults)
  }
  
  return results
}

/**
 * 按类型搜索
 */
async function searchByType(type, options = {}) {
  const typePatterns = {
    video: /\.(mp4|mov|avi|mkv|webm|flv)$/i,
    audio: /\.(mp3|wav|m4a|aac|ogg|flac)$/i,
    image: /\.(png|jpg|jpeg|gif|webp|svg|bmp)$/i,
    json: /\.json$/i,
    subtitle: /\.(srt|vtt|ass|ssa)$/i,
    text: /\.(txt|md|js|jsx|ts|tsx|css|html)$/i,
  }
  
  const pattern = typePatterns[type]
  if (!pattern) {
    throw new Error(`未知的文件类型：${type}`)
  }
  
  return search(pattern, options)
}

/**
 * 搜索视频
 */
async function searchVideos(options = {}) {
  return searchByType('video', options)
}

/**
 * 搜索音频
 */
async function searchAudio(options = {}) {
  return searchByType('audio', options)
}

/**
 * 搜索字幕
 */
async function searchSubtitles(options = {}) {
  return searchByType('subtitle', options)
}

/**
 * 搜索 JSON
 */
async function searchJSON(options = {}) {
  return searchByType('json', options)
}

/**
 * 获取存储信息
 */
async function getStorageInfo() {
  const root = allowedRoots[0] || app.getPath('documents')
  let totalSize = 0
  let fileCount = 0
  
  const calcSize = async (dir) => {
    try {
      const items = await fs.readdir(dir, { withFileTypes: true })
      for (const item of items) {
        const fullPath = path.join(dir, item.name)
        if (item.isDirectory()) {
          await calcSize(fullPath)
        } else {
          const stat = await fs.stat(fullPath)
          totalSize += stat.size
          fileCount++
        }
      }
    } catch (e) {
      // 忽略
    }
  }
  
  await calcSize(root)
  
  return {
    root,
    totalSize,
    fileCount,
  }
}

// ==================== 项目操作 ====================

/**
 * 创建视频项目
 */
async function createVideoProject(projectName, config = {}) {
  const projectPath = path.join(allowedRoots[0] || app.getPath('documents'), 'RJCut', 'projects', projectName)
  
  await fs.mkdir(path.join(projectPath, '原始视频'), { recursive: true })
  await fs.mkdir(path.join(projectPath, '剪辑视频'), { recursive: true })
  await fs.mkdir(path.join(projectPath, '输出'), { recursive: true })
  
  const projectConfig = {
    name: projectName,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    config: {
      pipeline: {
        remove_keyword: '转场',
        margin: 0.15,
        min_segment_duration: 0.1,
      },
      audio: {
        bgm_volume: 0.3,
        original_volume: 1.0,
      },
      ...config,
    },
    scenes: [],
  }
  
  await fs.writeFile(
    path.join(projectPath, 'project.json'),
    JSON.stringify(projectConfig, null, 2)
  )
  
  return projectPath
}

/**
 * 获取视频项目列表
 */
async function getVideoProjects() {
  // allowedRoots[0] 已经是 RJCut 目录了，直接拼接 projects 即可
  const projectsRoot = path.join(allowedRoots[0] || app.getPath('documents'), 'projects')
  
  try {
    const items = await fs.readdir(projectsRoot, { withFileTypes: true })
    const projects = []
    
    for (const item of items) {
      if (item.isDirectory()) {
        const projectConfigPath = path.join(projectsRoot, item.name, 'project.json')
        try {
          const configContent = await fs.readFile(projectConfigPath, 'utf-8')
          const config = JSON.parse(configContent)
          // 使用 toVirtualPath 转换项目路径为虚拟路径格式（如 /projects/123）
          const virtualPath = toVirtualPath(path.join(projectsRoot, item.name))
          projects.push({
            name: config.name || item.name,
            path: virtualPath,
            config,
            createdAt: config.createdAt,
            updatedAt: config.updatedAt,
          })
        } catch (e) {
          // 忽略无效的项目配置
        }
      }
    }
    
    return projects.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
  } catch (e) {
    return []
  }
}

// ==================== 导出 ====================

module.exports = {
  // 配置
  setAllowedRoots,
  getAllowedRoots,
  validatePath,
  getMimeType,
  
  // 基础操作
  listDirectory,
  mkdir,
  readFile,
  readFileAsBuffer,
  readJSON,
  writeFile,
  writeJSON,
  deleteFile,
  moveFile,
  copyFile,
  getFile,
  exists,
  isDirectory,
  isFile,
  
  // 搜索
  search,
  searchByType,
  searchVideos,
  searchAudio,
  searchSubtitles,
  searchJSON,
  getStorageInfo,
  
  // 项目
  createVideoProject,
  getVideoProjects,
}