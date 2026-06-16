/**
 * 剪辑工作室 - 文件系统工具模块
 * 
 * 提供可重用的文件系统操作函数，供 main.js 和 MCP 服务器共享使用
 */

const { app } = require('electron')
const path = require('path')
const fs = require('fs').promises
const fsSync = require('fs')
const projectStructure = require('./project-structure')

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
    type: item.isFile() ? getMimeType(path.join(resolved, item.name)) : undefined,
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
  // allowedRoots[0] 已经是 剪辑工作室 目录，直接创建项目文件夹
  const projectPath = path.join(allowedRoots[0] || app.getPath('documents'), projectName)
  
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
  // allowedRoots[0] 已经是 剪辑工作室 目录，直接读取项目文件夹
  const projectsRoot = allowedRoots[0] || app.getPath('documents')
  
  try {
    const items = await fs.readdir(projectsRoot, { withFileTypes: true })
    const projects = []
    
    for (const item of items) {
      if (item.isDirectory()) {
        const projectConfigPath = path.join(projectsRoot, item.name, 'project.json')
        try {
          const configContent = await fs.readFile(projectConfigPath, 'utf-8')
          const config = JSON.parse(configContent)
          // 使用 toVirtualPath 转换项目路径为虚拟路径格式（如 /项目名）
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

// ==================== 外部文件导入 ====================

/**
 * 分析外部文件夹内容
 * @param {string} externalPath - 外部文件夹的绝对路径
 * @returns {Promise<Object>} 分析结果
 */
async function analyzeExternalFolder(externalPath) {
  const result = {
    path: externalPath,
    totalFiles: 0,
    totalSize: 0,
    folders: [],
    filesByType: {
      video: [],
      audio: [],
      image: [],
      document: [],
      script: [],
      subtitle: [],
      other: [],
    },
    structure: [],
  }
  
  const typePatterns = {
    video: /\.(mp4|mov|avi|mkv|webm|flv|wmv)$/i,
    audio: /\.(mp3|wav|m4a|aac|ogg|flac|wma)$/i,
    image: /\.(png|jpg|jpeg|gif|webp|svg|bmp|ico|heic)$/i,
    document: /\.(doc|docx|pdf|xls|xlsx|ppt|pptx|txt|md)$/i,
    script: /\.(js|ts|jsx|tsx|py|sh|bat|ps1)$/i,
    subtitle: /\.(srt|vtt|ass|ssa)$/i,
  }
  
  const scanDir = async (dir, relativePath = '') => {
    try {
      const items = await fs.readdir(dir, { withFileTypes: true })
      const folderInfo = {
        name: path.basename(dir),
        path: relativePath || dir,
        files: 0,
        subfolders: [],
      }
      
      for (const item of items) {
        const fullPath = path.join(dir, item.name)
        const itemRelative = path.join(relativePath, item.name)
        
        if (item.isDirectory()) {
          folderInfo.subfolders.push(await scanDir(fullPath, itemRelative))
        } else if (item.isFile()) {
          const stat = await fs.stat(fullPath)
          result.totalFiles++
          result.totalSize += stat.size
          folderInfo.files++
          
          const fileInfo = {
            name: item.name,
            path: fullPath,
            relativePath: itemRelative,
            size: stat.size,
            ext: path.extname(item.name).toLowerCase(),
          }
          
          // 分类文件
          let categorized = false
          for (const [type, pattern] of Object.entries(typePatterns)) {
            if (pattern.test(item.name)) {
              result.filesByType[type].push(fileInfo)
              categorized = true
              break
            }
          }
          if (!categorized) {
            result.filesByType.other.push(fileInfo)
          }
        }
      }
      
      result.structure.push(folderInfo)
      return folderInfo
    } catch (e) {
      console.error('[analyzeExternalFolder] 扫描目录失败:', e)
      return null
    }
  }
  
  await scanDir(externalPath)
  
  // 生成摘要
  result.summary = {
    videoCount: result.filesByType.video.length,
    audioCount: result.filesByType.audio.length,
    imageCount: result.filesByType.image.length,
    documentCount: result.filesByType.document.length,
    scriptCount: result.filesByType.script.length,
    subtitleCount: result.filesByType.subtitle.length,
    otherCount: result.filesByType.other.length,
    totalSizeMB: (result.totalSize / 1024 / 1024).toFixed(2),
  }
  
  return result
}

/**
 * 将外部文件夹导入到 VFS
 * @param {string} externalPath - 外部文件夹的绝对路径
 * @param {string} vfsTargetPath - VFS 中的目标路径
 * @param {Object} options - 选项
 * @returns {Promise<Object>} 导入结果
 */
async function importExternalFolder(externalPath, vfsTargetPath, options = {}) {
  const {
    includePatterns = [],     // 包含的文件模式
    excludePatterns = [],     // 排除的文件模式
    copyFiles = true,         // 是否复制文件（false=只记录）
    flatten = false,          // 是否扁平化目录结构
    maxFileSize = 500 * 1024 * 1024, // 最大文件大小（500MB）
  } = options
  
  // ========== 强制路径验证：必须指向 剪辑工作室/项目名 目录 ==========
  const documentsPath = app.getPath('documents')
  const studioRoot = path.join(documentsPath, '剪辑工作室')
  
  // 解析 vfsTargetPath（支持 VFS 路径格式 /项目名/xxx）
  let resolvedTargetPath
  if (vfsTargetPath && vfsTargetPath.startsWith('/') && !vfsTargetPath.startsWith('/projects/')) {
    // VFS 路径格式，项目直接在根目录下
    resolvedTargetPath = path.join(studioRoot, vfsTargetPath)
  } else if (vfsTargetPath && vfsTargetPath.startsWith('/projects/')) {
    // 旧的 /projects/ 格式，拒绝
    throw new Error(`❌ 无效的导入路径格式：${vfsTargetPath}。导入路径必须是 /项目名/xxx 格式，例如 /我的视频项目/原始视频（不再使用/projects/前缀）`)
  } else {
    // 绝对路径，验证是否在 剪辑工作室 目录下
    const normalizedTarget = path.normalize(vfsTargetPath)
    const normalizedRoot = path.normalize(studioRoot)
    if (!normalizedTarget.startsWith(normalizedRoot)) {
      throw new Error(`❌ 导入路径必须在 ${studioRoot} 目录下。当前路径：${normalizedTarget}`)
    }
    resolvedTargetPath = normalizedTarget
  }
  
  const result = {
    sourcePath: externalPath,
    targetPath: vfsTargetPath,
    copiedFiles: [],
    skippedFiles: [],
    errors: [],
    totalCopied: 0,
    totalSize: 0,
  }
  
  // 确保目标目录存在
  await fs.mkdir(resolvedTargetPath, { recursive: true })
  
  const copyFile = async (srcPath, destPath) => {
    try {
      const stat = await fs.stat(srcPath)
      
      // 检查文件大小
      if (stat.size > maxFileSize) {
        result.skippedFiles.push({
          path: srcPath,
          reason: `文件过大 (${(stat.size / 1024 / 1024).toFixed(2)}MB > ${(maxFileSize / 1024 / 1024)}MB)`,
        })
        return
      }
      
      // 检查包含/排除模式
      const fileName = path.basename(srcPath)
      if (includePatterns.length > 0) {
        const included = includePatterns.some(p => new RegExp(p).test(fileName))
        if (!included) {
          result.skippedFiles.push({ path: srcPath, reason: '不匹配包含模式' })
          return
        }
      }
      
      if (excludePatterns.length > 0) {
        const excluded = excludePatterns.some(p => new RegExp(p).test(fileName))
        if (excluded) {
          result.skippedFiles.push({ path: srcPath, reason: '匹配排除模式' })
          return
        }
      }
      
      // 创建目标目录
      await fs.mkdir(path.dirname(destPath), { recursive: true })
      
      // 复制文件
      if (copyFiles) {
        await fs.copyFile(srcPath, destPath)
      }
      
      result.copiedFiles.push({
        source: srcPath,
        target: destPath,
        size: stat.size,
      })
      result.totalCopied++
      result.totalSize += stat.size
    } catch (error) {
      result.errors.push({ path: srcPath, error: error.message })
    }
  }
  
  const scanAndCopy = async (dir, relativeBase = '') => {
    try {
      const items = await fs.readdir(dir, { withFileTypes: true })
      
      for (const item of items) {
        const srcPath = path.join(dir, item.name)
        
        if (item.isDirectory()) {
          if (flatten) {
            // 扁平化：直接复制文件到目标根目录
            await scanAndCopy(srcPath, relativeBase)
          } else {
            // 保持目录结构
            const destDir = path.join(resolvedTargetPath, path.relative(relativeBase, srcPath))
            await fs.mkdir(destDir, { recursive: true })
            await scanAndCopy(srcPath, relativeBase)
          }
        } else if (item.isFile()) {
          let destPath
          if (flatten) {
            destPath = path.join(resolvedTargetPath, item.name)
          } else {
            const relativePath = path.relative(externalPath, srcPath)
            destPath = path.join(resolvedTargetPath, relativePath)
          }
          await copyFile(srcPath, destPath)
        }
      }
    } catch (e) {
      result.errors.push({ path: dir, error: e.message })
    }
  }
  
  await scanAndCopy(externalPath, externalPath)
  
  result.summary = {
    totalCopied: result.totalCopied,
    totalSkipped: result.skippedFiles.length,
    totalErrors: result.errors.length,
    totalSizeMB: (result.totalSize / 1024 / 1024).toFixed(2),
  }
  
  return result
}

/**
 * 智能组织外部文件到项目结构（增强版 - 支持脚本文件分析）
 * @param {string} externalPath - 外部文件夹路径
 * @param {string} projectPath - 项目路径
 * @param {Object} options - 选项
 * @returns {Promise<Object>} 组织结果
 */
async function smartOrganizeToProject(externalPath, projectPath, options = {}) {
  const {
    autoRename = true,        // 自动重命名重复文件
    createSubfolders = true,  // 创建子文件夹分类
    useScriptAnalysis = true, // 是否使用脚本文件分析（根据 script.json 分类视频）
  } = options
  
  // ========== 强制路径验证：必须指向 剪辑工作室/项目名 目录 ==========
  const documentsPath = app.getPath('documents')
  const studioRoot = path.join(documentsPath, '剪辑工作室')
  
  // 解析 projectPath（支持 VFS 路径格式 /项目名）
  let resolvedProjectPath
  let projectName
  if (projectPath && projectPath.startsWith('/') && !projectPath.startsWith('/projects/')) {
    // VFS 路径格式，项目直接在根目录下
    projectName = projectPath.split('/')[1] // 获取 /项目名 中的项目名
    if (!projectName) {
      throw new Error(`❌ 无效的项目路径格式：${projectPath}。项目路径必须是 /项目名 格式，例如 /我的视频项目`)
    }
    resolvedProjectPath = path.join(studioRoot, projectName)
  } else if (projectPath && projectPath.startsWith('/projects/')) {
    // 旧的 /projects/ 格式，拒绝
    throw new Error(`❌ 无效的项目路径格式：${projectPath}。项目路径必须是 /项目名 格式，例如 /我的视频项目（不再使用/projects/前缀）`)
  } else {
    // 绝对路径，验证是否在 剪辑工作室 目录下
    const normalizedProject = path.normalize(projectPath)
    const normalizedRoot = path.normalize(studioRoot)
    if (!normalizedProject.startsWith(normalizedRoot)) {
      throw new Error(`❌ 项目路径必须在 ${studioRoot} 目录下。当前路径：${normalizedProject}`)
    }
    resolvedProjectPath = normalizedProject
    // 从路径提取项目名
    projectName = path.basename(normalizedProject)
  }
  
  const result = {
    sourcePath: externalPath,
    projectPath,
    projectName,
    useScriptAnalysis,
    scriptFound: false,
    organized: {
      video: [],        // 原始视频（human 类型）
      edited: [],       // 剪辑视频（scene 类型）
      audio: [],
      image: [],
      document: [],
      script: [],
      subtitle: [],
      other: [],
    },
    scriptAnalysis: {
      humanVideos: [],  // 数字人出镜视频
      sceneVideos: [],  // 场景展示视频
    },
    errors: [],
  }
  
  // 项目目录结构 - 只允许三个标准目录（原始视频、剪辑视频、输出）
// 注意：smartOrganizeToProject 只使用原始视频和剪辑视频两个目录来分类视频
// 其他文件类型（音频、图片、文档等）直接放到项目根目录，不再创建额外的子目录
const projectFolders = {
    video: projectStructure.PROJECT_FOLDERS.RAW_VIDEO,    // 原始视频（human 类型）
    edited: projectStructure.PROJECT_FOLDERS.EDITED_VIDEO, // 剪辑视频（scene 类型）
  }
  
  const typePatterns = {
    video: /\.(mp4|mov|avi|mkv|webm|flv|wmv)$/i,
    audio: /\.(mp3|wav|m4a|aac|ogg|flac|wma)$/i,
    image: /\.(png|jpg|jpeg|gif|webp|svg|bmp|ico|heic)$/i,
    document: /\.(doc|docx|pdf|xls|xlsx|ppt|pptx|txt|md)$/i,
    script: /\.(js|ts|jsx|tsx|py|sh|bat|ps1)$/i,
    subtitle: /\.(srt|vtt|ass|ssa)$/i,
    json: /\.json$/i,
  }
  
  // 确保项目目录存在，并创建三个标准子目录（原始视频、剪辑视频、输出）
  await fs.mkdir(resolvedProjectPath, { recursive: true })
  await fs.mkdir(path.join(resolvedProjectPath, projectStructure.PROJECT_FOLDERS.RAW_VIDEO), { recursive: true })
  await fs.mkdir(path.join(resolvedProjectPath, projectStructure.PROJECT_FOLDERS.EDITED_VIDEO), { recursive: true })
  await fs.mkdir(path.join(resolvedProjectPath, projectStructure.PROJECT_FOLDERS.OUTPUT), { recursive: true })
  
  // 脚本文件分析结果（如果存在）
  let scriptSegments = null
  
  // 首先查找并解析 script.json
  if (useScriptAnalysis) {
    const scriptPath = await findScriptJson(externalPath)
    if (scriptPath) {
      try {
        const scriptContent = await fs.readFile(scriptPath, 'utf-8')
        const scriptData = JSON.parse(scriptContent)
        
        if (scriptData && Array.isArray(scriptData.segments)) {
          scriptSegments = scriptData.segments
          result.scriptFound = true
          result.scriptAnalysis.scriptPath = scriptPath
          
          // 提取 human 和 scene 类型的视频文件名
          scriptSegments.forEach(seg => {
            if (seg.flag === 'human' && seg.video_file) {
              result.scriptAnalysis.humanVideos.push(seg.video_file.toLowerCase())
            } else if (seg.flag === 'scene' && seg.scene_file) {
              result.scriptAnalysis.sceneVideos.push(seg.scene_file.toLowerCase())
            }
          })
          
          console.log('[smartOrganizeToProject] 脚本文件分析完成:', {
            humanVideos: result.scriptAnalysis.humanVideos.length,
            sceneVideos: result.scriptAnalysis.sceneVideos.length,
          })
        }
      } catch (e) {
        console.error('[smartOrganizeToProject] 解析脚本文件失败:', e.message)
        result.errors.push({ path: scriptPath, error: `解析 script.json 失败：${e.message}` })
      }
    }
  }
  
  /**
   * 查找 script.json 文件
   */
  async function findScriptJson(dir) {
    try {
      const items = await fs.readdir(dir, { withFileTypes: true })
      for (const item of items) {
        const fullPath = path.join(dir, item.name)
        if (item.isFile() && item.name.toLowerCase() === 'script.json') {
          return fullPath
        }
        if (item.isDirectory()) {
          const found = await findScriptJson(fullPath)
          if (found) return found
        }
      }
    } catch (e) {
      // 忽略
    }
    return null
  }
  
  /**
   * 根据脚本分析确定视频文件的目标文件夹
   */
  function getVideoTargetFolder(fileName) {
    if (!useScriptAnalysis || !scriptSegments) {
      return projectFolders.video  // 默认放到原始视频
    }
    
    const lowerName = fileName.toLowerCase()
    
    // 检查是否是 scene 类型视频
    if (result.scriptAnalysis.sceneVideos.some(sceneFile => 
      lowerName.includes(sceneFile.toLowerCase()) || sceneFile.toLowerCase().includes(lowerName)
    )) {
      return projectFolders.edited  // 剪辑视频
    }
    
    // 检查是否是 human 类型视频
    if (result.scriptAnalysis.humanVideos.some(humanFile => 
      lowerName.includes(humanFile.toLowerCase()) || humanFile.toLowerCase().includes(lowerName)
    )) {
      return projectFolders.video  // 原始视频
    }
    
    // 无法匹配，默认放到原始视频
    return projectFolders.video
  }
  
  const organizeFile = async (filePath) => {
    try {
      const stat = await fs.stat(filePath)
      const fileName = path.basename(filePath)
      const ext = path.extname(fileName).toLowerCase()
      
      // 确定文件类型
      let fileType = 'other'
      for (const [type, pattern] of Object.entries(typePatterns)) {
        if (pattern.test(fileName)) {
          fileType = type
          break
        }
      }
      
      // 确定目标目录
      // 注意：项目目录结构只允许三个标准子目录（原始视频、剪辑视频、输出）
      // 其他文件（音频、图片、文档、字幕等）直接放到项目根目录
      let targetDir = resolvedProjectPath
      
      // 特殊处理：脚本 JSON 文件直接放到项目主目录
      if (fileName.toLowerCase() === 'script.json') {
        targetDir = resolvedProjectPath
      }
      // 特殊处理：视频文件根据脚本分析分类到原始视频或剪辑视频
      else if (fileType === 'video' && useScriptAnalysis && scriptSegments) {
        targetDir = path.join(resolvedProjectPath, getVideoTargetFolder(fileName))
      }
      // 其他文件类型（音频、图片、文档、字幕等）直接放到项目根目录
      // 不再创建额外的子目录（如音频素材、图片素材等）
      
      // 处理重名文件
      let targetPath = path.join(targetDir, fileName)
      if (autoRename && await fs.access(targetPath).then(() => true).catch(() => false)) {
        const nameWithoutExt = path.basename(fileName, ext)
        const timestamp = Date.now()
        targetPath = path.join(targetDir, `${nameWithoutExt}_${timestamp}${ext}`)
      }
      
      // 复制文件
      await fs.mkdir(path.dirname(targetPath), { recursive: true })
      await fs.copyFile(filePath, targetPath)
      
      // 记录到对应的分类
      if (fileType === 'video') {
        // 根据实际目标文件夹判断是原始视频还是剪辑视频
        if (targetDir.includes(projectStructure.PROJECT_FOLDERS.EDITED_VIDEO)) {
          result.organized.edited.push({
            source: filePath,
            target: targetPath,
            size: stat.size,
            flag: 'scene',
          })
        } else {
          result.organized.video.push({
            source: filePath,
            target: targetPath,
            size: stat.size,
            flag: 'human',
          })
        }
      } else {
        result.organized[fileType].push({
          source: filePath,
          target: targetPath,
          size: stat.size,
        })
      }
      
      return true
    } catch (error) {
      result.errors.push({ path: filePath, error: error.message })
      return false
    }
  }
  
  const scanAndOrganize = async (dir) => {
    try {
      const items = await fs.readdir(dir, { withFileTypes: true })
      for (const item of items) {
        const fullPath = path.join(dir, item.name)
        if (item.isDirectory()) {
          await scanAndOrganize(fullPath)
        } else if (item.isFile()) {
          await organizeFile(fullPath)
        }
      }
    } catch (e) {
      result.errors.push({ path: dir, error: e.message })
    }
  }
  
  await scanAndOrganize(externalPath)
  
  // 生成摘要
  result.summary = {
    humanVideoCount: result.organized.video.length,    // human 类型（原始视频）
    sceneVideoCount: result.organized.edited.length,   // scene 类型（剪辑视频）
    audioCount: result.organized.audio.length,
    imageCount: result.organized.image.length,
    documentCount: result.organized.document.length,
    scriptCount: result.organized.script.length,
    subtitleCount: result.organized.subtitle.length,
    otherCount: result.organized.other.length,
    totalFiles: Object.values(result.organized).reduce((sum, arr) => sum + arr.length, 0),
    errorCount: result.errors.length,
  }
  
  return result
}

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
  
  // 外部文件导入
  analyzeExternalFolder,
  importExternalFolder,
  smartOrganizeToProject,
  
  // 项目结构（导出供外部使用）
  projectStructure,
}