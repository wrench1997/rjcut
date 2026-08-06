/**
 * Electron MCP 本地虚拟文件服务器
 * 
 * 参考 virtualFileSystem.js 的逻辑，使用内存 + 文件持久化的虚拟文件系统
 * 避免直接操作真实路径导致的失败，同时提供清晰的目录结构
 * 
 * 特点：
 * 1. 虚拟路径系统 - 所有操作在虚拟路径上进行
 * 2. 持久化存储 - 数据保存在本地 JSON 文件
 * 3. 清晰的目录结构 - 预定义项目目录模板
 * 4. MCP 协议支持 - 兼容外部 MCP 客户端
 */

const { app } = require('electron')
const http = require('http')
const WebSocket = require('ws')
const path = require('path')
const fs = require('fs').promises
const fsSync = require('fs')
const fsUtils = require('./fs-utils')
const projectStructure = require('./project-structure')

// =====================================================
// 配置
// =====================================================
const CONFIG = {
  PORT: process.env.VFS_PORT ? parseInt(process.env.VFS_PORT) : 8766,
  STORAGE_FILE: process.env.VFS_STORAGE || path.join(app?.getPath('userData') || __dirname, 'vfs-storage.json'),
  MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
}

// =====================================================
// 虚拟文件系统类
// =====================================================
class VirtualFileSystem {
  constructor() {
    this.files = new Map()      // path -> { name, content, size, type, createdAt, updatedAt, metadata }
    this.directories = new Map() // path -> { name, parent, children: Set, createdAt }
    this.currentPath = '/'
    this.rootPath = '/'
    
    // 初始化根目录
    this.directories.set('/', {
      name: 'root',
      parent: null,
      children: new Set(),
      createdAt: new Date().toISOString(),
    })
  }

  // =====================================================
  // 路径处理
  // =====================================================
  
  normalizePath(userPath) {
    if (!userPath || userPath === '/') return '/'
    
    // 处理相对路径
    let absolutePath
    if (userPath.startsWith('./')) {
      absolutePath = this.currentPath + userPath.substring(1)
    } else if (userPath.startsWith('../')) {
      const parts = this.currentPath.split('/').filter(Boolean)
      const relativeParts = userPath.split('/')
      for (const part of relativeParts) {
        if (part === '..') {
          parts.pop()
        } else if (part !== '.') {
          parts.push(part)
        }
      }
      absolutePath = '/' + parts.join('/')
    } else if (userPath.startsWith('/')) {
      absolutePath = userPath
    } else {
      absolutePath = this.currentPath + (this.currentPath.endsWith('/') ? '' : '/') + userPath
    }
    
    // 规范化：移除多余斜杠，保留根斜杠
    return absolutePath.replace(/\/+/g, '/').replace(/\/$/, '') || '/'
  }

  // =====================================================
  // 目录操作
  // =====================================================
  
  getDirectory(path = this.currentPath) {
    const normalized = this.normalizePath(path)
    return this.directories.get(normalized)
  }

  getFile(path) {
    const normalized = this.normalizePath(path)
    return this.files.get(normalized)
  }

  listDirectory(path = this.currentPath) {
    const dir = this.getDirectory(path)
    if (!dir) {
      throw new Error(`目录不存在：${path}`)
    }
    
    const items = []
    
    for (const childPath of dir.children) {
      const isDir = this.directories.has(childPath)
      const name = childPath.split('/').pop()
      const item = {
        name,
        path: childPath,
        isDirectory: isDir,
        isFile: !isDir,
      }
      
      if (!isDir) {
        const file = this.files.get(childPath)
        if (file) {
          item.size = file.size
          item.type = file.type
          item.updatedAt = file.updatedAt
          item.metadata = file.metadata
        }
      }
      
      items.push(item)
    }
    
    return items.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1
      if (!a.isDirectory && b.isDirectory) return 1
      return a.name.localeCompare(b.name)
    })
  }

  async mkdir(path, recursive = false) {
    const normalized = this.normalizePath(path)
    
    // 已存在目录，直接返回
    if (this.directories.has(normalized)) {
      return normalized
    }
    
    // 路径被文件占用
    if (this.files.has(normalized)) {
      throw new Error(`路径已存在（文件）：${path}`)
    }
    
    const parts = normalized.split('/').filter(Boolean)
    let current = ''
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const parentPath = current
      current = current + '/' + part
      
      if (!this.directories.has(current)) {
        if (i < parts.length - 1 && !recursive) {
          throw new Error(`父目录不存在：${parentPath}`)
        }
        
        const dirData = {
          path: current,
          name: part,
          parent: parentPath || null,
          children: new Set(),
          createdAt: new Date().toISOString(),
        }
        
        this.directories.set(current, dirData)
        
        // 添加到父目录的 children
        const actualParent = parentPath || '/'
        const parent = this.directories.get(actualParent)
        if (parent) {
          parent.children.add(current)
        }
      }
    }
    
    return normalized
  }

  // =====================================================
  // 文件操作
  // =====================================================
  
  async writeFile(path, content, options = {}) {
    const normalized = this.normalizePath(path)
    const dirPath = normalized.substring(0, normalized.lastIndexOf('/')) || '/'
    
    // 确保父目录存在
    if (!this.directories.has(dirPath)) {
      if (options.createParent !== false) {
        await this.mkdir(dirPath, true)
      } else {
        throw new Error(`父目录不存在：${dirPath}`)
      }
    }
    
    // 计算大小
    let size
    if (typeof content === 'string') {
      size = Buffer.byteLength(content, 'utf-8')
    } else if (Buffer.isBuffer(content)) {
      size = content.length
    } else if (content instanceof ArrayBuffer) {
      size = content.byteLength
    } else {
      content = JSON.stringify(content, null, 2)
      size = Buffer.byteLength(content, 'utf-8')
    }
    
    const fileInfo = {
      path: normalized,
      name: normalized.split('/').pop(),
      content,
      size,
      type: options.type || this.getMimeType(normalized),
      createdAt: options.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: options.metadata || {},
    }
    
    this.files.set(normalized, fileInfo)
    
    // 添加到目录
    const dir = this.directories.get(dirPath)
    if (dir && !dir.children.has(normalized)) {
      dir.children.add(normalized)
    }
    
    return fileInfo
  }

  async readFile(path, encoding = 'utf-8') {
    const file = this.getFile(path)
    if (!file) {
      throw new Error(`文件不存在：${path}`)
    }
    return file.content
  }

  async readJSON(path) {
    const content = await this.readFile(path)
    return JSON.parse(content)
  }

  async writeJSON(path, data, options = {}) {
    return this.writeFile(path, JSON.stringify(data, null, 2), {
      ...options,
      type: 'application/json',
    })
  }

  async delete(path, recursive = false) {
    const normalized = this.normalizePath(path)
    
    if (normalized === '/') {
      throw new Error('不能删除根目录')
    }
    
    const isDir = this.directories.has(normalized)
    const isFile = this.files.has(normalized)
    
    if (!isDir && !isFile) {
      throw new Error(`路径不存在：${path}`)
    }
    
    if (isDir) {
      const dir = this.directories.get(normalized)
      if (dir.children.size > 0 && !recursive) {
        throw new Error(`目录非空，请使用递归删除`)
      }
      
      // 递归删除子项
      for (const childPath of [...dir.children]) {
        await this.delete(childPath, true)
      }
      
      // 从父目录移除
      const parentPath = dir.parent || '/'
      const parent = this.directories.get(parentPath)
      if (parent) {
        parent.children.delete(normalized)
      }
      
      this.directories.delete(normalized)
    }
    
    if (isFile) {
      const file = this.files.get(normalized)
      if (file) {
        const dirPath = normalized.substring(0, normalized.lastIndexOf('/')) || '/'
        const dir = this.directories.get(dirPath)
        if (dir) {
          dir.children.delete(normalized)
        }
      }
      this.files.delete(normalized)
    }
  }

  async move(fromPath, toPath) {
    const from = this.normalizePath(fromPath)
    const to = this.normalizePath(toPath)
    
    if (from === '/') {
      throw new Error('不能移动根目录')
    }
    
    if (!this.files.has(from) && !this.directories.has(from)) {
      throw new Error(`路径不存在：${fromPath}`)
    }
    
    if (this.files.has(to) || this.directories.has(to)) {
      throw new Error(`目标路径已存在：${toPath}`)
    }
    
    const isFile = this.files.has(from)
    
    if (isFile) {
      const file = this.files.get(from)
      const newFile = {
        ...file,
        name: to.split('/').pop(),
        path: to,
        updatedAt: new Date().toISOString(),
      }
      this.files.delete(from)
      this.files.set(to, newFile)
      
      // 更新父目录
      const oldDirPath = from.substring(0, from.lastIndexOf('/')) || '/'
      const newDirPath = to.substring(0, to.lastIndexOf('/')) || '/'
      
      if (oldDirPath !== newDirPath) {
        const oldDir = this.directories.get(oldDirPath)
        const newDir = this.directories.get(newDirPath)
        if (oldDir) oldDir.children.delete(from)
        if (newDir) newDir.children.add(to)
      }
    } else {
      // 移动目录（递归更新所有子路径）
      const oldDir = this.directories.get(from)
      const itemsToUpdate = []
      
      const collectItems = (p, isDir) => {
        if (isDir) {
          const d = this.directories.get(p)
          if (d) {
            for (const child of d.children) {
              const childIsDir = this.directories.has(child)
              itemsToUpdate.push({ path: child, isDir: childIsDir })
              if (childIsDir) collectItems(child, true)
            }
          }
        }
      }
      
      itemsToUpdate.push({ path: from, isDir: true })
      collectItems(from, true)
      
      for (const { path: oldP, isDir: itemIsDir } of itemsToUpdate.reverse()) {
        const newP = to + oldP.substring(from.length)
        if (itemIsDir) {
          const d = this.directories.get(oldP)
          const newDirData = {
            ...d,
            name: newP.split('/').pop(),
            parent: newP.substring(0, newP.lastIndexOf('/')) || null,
            path: newP,
          }
          this.directories.delete(oldP)
          this.directories.set(newP, { ...newDirData, children: new Set(d.children) })
        } else {
          const f = this.files.get(oldP)
          const newFileData = { ...f, path: newP, updatedAt: new Date().toISOString() }
          this.files.delete(oldP)
          this.files.set(newP, newFileData)
        }
      }
      
      // 更新父目录
      if (oldDir.parent) {
        const parent = this.directories.get(oldDir.parent)
        if (parent) {
          parent.children.delete(from)
          parent.children.add(to)
        }
      }
    }
  }

  async copy(fromPath, toPath) {
    const from = this.normalizePath(fromPath)
    const to = this.normalizePath(toPath)
    
    if (!this.files.has(from) && !this.directories.has(from)) {
      throw new Error(`路径不存在：${fromPath}`)
    }
    
    const isFile = this.files.has(from)
    
    if (isFile) {
      const file = this.files.get(from)
      await this.writeFile(to, file.content, {
        type: file.type,
        metadata: { ...file.metadata },
      })
    } else {
      await this.mkdir(to, true)
      const dir = this.directories.get(from)
      for (const child of dir.children) {
        const childName = child.split('/').pop()
        await this.copy(child, to + '/' + childName)
      }
    }
  }

  // =====================================================
  // 工具方法
  // =====================================================
  
  getMimeType(filePath) {
    const ext = filePath.split('.').pop().toLowerCase()
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

  exists(path) {
    const normalized = this.normalizePath(path)
    return this.files.has(normalized) || this.directories.has(normalized)
  }

  isDirectory(path) {
    return this.directories.has(this.normalizePath(path))
  }

  isFile(path) {
    return this.files.has(this.normalizePath(path))
  }

  cd(path) {
    const dir = this.getDirectory(path)
    if (!dir) {
      throw new Error(`目录不存在：${path}`)
    }
    this.currentPath = this.normalizePath(path)
    return this.currentPath
  }

  pwd() {
    return this.currentPath
  }

  search(pattern, options = {}) {
    const results = []
    const regex = typeof pattern === 'string'
      ? new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      : pattern
    
    for (const [p, file] of this.files) {
      if (regex.test(file.name) || regex.test(p)) {
        results.push({
          name: file.name,
          path: p,
          isDirectory: false,
          isFile: true,
          size: file.size,
          type: file.type,
          updatedAt: file.updatedAt,
        })
      }
    }
    
    if (options.includeDirectories) {
      for (const [p, dir] of this.directories) {
        if (p !== '/' && regex.test(dir.name)) {
          results.push({
            name: dir.name,
            path: p,
            isDirectory: true,
            isFile: false,
          })
        }
      }
    }
    
    return results
  }

  searchByType(type, options = {}) {
    const patterns = {
      video: /\.(mp4|mov|avi|mkv|webm|flv)$/i,
      audio: /\.(mp3|wav|m4a|aac|ogg|flac)$/i,
      image: /\.(png|jpg|jpeg|gif|webp|svg|bmp)$/i,
      json: /\.json$/i,
      subtitle: /\.(srt|vtt|ass|ssa)$/i,
      text: /\.(txt|md|js|jsx|ts|tsx|css|html)$/i,
    }
    
    const pattern = patterns[type]
    if (!pattern) {
      throw new Error(`未知的文件类型：${type}`)
    }
    
    return this.search(pattern, options)
  }

  searchVideos(options = {}) { return this.searchByType('video', options) }
  searchAudio(options = {}) { return this.searchByType('audio', options) }
  searchSubtitles(options = {}) { return this.searchByType('subtitle', options) }
  searchJSON(options = {}) { return this.searchByType('json', options) }

  async getStorageInfo() {
    let totalSize = 0
    let fileCount = 0
    
    for (const file of this.files.values()) {
      totalSize += file.size
      fileCount++
    }
    
    return {
      totalSize,
      fileCount,
      directoryCount: this.directories.size,
    }
  }

  // =====================================================
  // 序列化/反序列化
  // =====================================================
  
  toJSON() {
    return {
      files: Array.from(this.files.entries()).map(([p, f]) => ({
        ...f,
        content: typeof f.content === 'string' ? f.content : '[Buffer]',
      })),
      directories: Array.from(this.directories.entries()).map(([p, d]) => ({
        path: p,
        name: d.name,
        parent: d.parent,
        children: Array.from(d.children),
        createdAt: d.createdAt,
      })),
      currentPath: this.currentPath,
    }
  }

  fromJSON(data) {
    this.files.clear()
    this.directories.clear()
    
    // 恢复根目录
    this.directories.set('/', {
      name: 'root',
      parent: null,
      children: new Set(),
      createdAt: new Date().toISOString(),
    })
    
    // 恢复目录
    for (const dir of (data.directories || [])) {
      if (dir.path !== '/') {
        this.directories.set(dir.path, {
          ...dir,
          children: new Set(dir.children || []),
        })
      }
    }
    
    // 恢复文件
    for (const file of (data.files || [])) {
      this.files.set(file.path, file)
    }
    
    this.currentPath = data.currentPath || '/'
  }

  // =====================================================
  // 持久化
  // =====================================================
  
  async saveToFile(filePath) {
    const data = this.toJSON()
    // 注意：content 可能很大，这里只保存元数据
    const metadataOnly = {
      ...data,
      files: data.files.map(f => ({
        ...f,
        content: f.type.startsWith('video/') || f.type.startsWith('audio/') || f.size > 1024 * 1024
          ? '[Binary Data - Not Saved]'
          : f.content,
      })),
    }
    await fs.writeFile(filePath, JSON.stringify(metadataOnly, null, 2), 'utf-8')
  }

  async loadFromFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      const data = JSON.parse(content)
      this.fromJSON(data)
      return true
    } catch (e) {
      console.log('[VFS] 加载存储文件失败，使用默认结构:', e.message)
      return false
    }
  }

  // =====================================================
  // 项目模板
  // =====================================================
  
  async createDefaultStructure() {
    // 项目是唯一的顶层组织单位，子目录按项目使用情况创建。
    return true
  }

  async createVideoProject(projectName, config = {}) {
    // 项目直接创建在根目录下，不需要 /projects 前缀
    const projectPath = `/${projectName}`
    
    // 目录本身就是项目；文案、场景素材和成片目录在首次使用时按需生成。
    await this.mkdir(projectPath, true)
    
    return projectPath
  }

  async getVideoProjects() {
    const projects = []
    const seenPaths = new Set()
    const now = new Date().toISOString()
    const excludedFolders = new Set(projectStructure.PROJECT_DISCOVERY_EXCLUDED_FOLDERS || [])

    const latestTimestamp = (values, fallback) => {
      const valid = values
        .filter(Boolean)
        .map(value => ({ value, time: new Date(value).getTime() }))
        .filter(item => Number.isFinite(item.time))
        .sort((a, b) => a.time - b.time)
      return valid.length > 0 ? valid[valid.length - 1].value : fallback
    }

    const readLegacyConfig = (projectPath) => {
      const projectConfig = this.getFile(`${projectPath}/project.json`)
      if (!projectConfig || typeof projectConfig.content !== 'string') return null
      try {
        return JSON.parse(projectConfig.content)
      } catch (e) {
        return null
      }
    }

    const collectProject = (childPath, isWorkspaceRoot) => {
      if (seenPaths.has(childPath) || !this.directories.has(childPath)) return
      const name = childPath.split('/').pop()
      if (isWorkspaceRoot && excludedFolders.has(name)) return

      const directory = this.getDirectory(childPath)
      const legacyConfig = readLegacyConfig(childPath)
      const fileTimestamps = [...this.files.values()]
        .filter(file => file.path.startsWith(`${childPath}/`))
        .flatMap(file => [file.updatedAt, file.createdAt])
      const createdAt = legacyConfig?.createdAt || directory?.createdAt || now
      const updatedAt = latestTimestamp(
        [legacyConfig?.updatedAt, directory?.updatedAt, ...fileTimestamps],
        createdAt,
      )

      seenPaths.add(childPath)
      projects.push({
        name: legacyConfig?.name || name,
        path: childPath,
        // 旧项目配置只读不写；新项目不再依赖或生成它。
        config: legacyConfig || {},
        createdAt,
        updatedAt,
      })
    }

    const rootDir = this.getDirectory('/')
    if (rootDir) {
      for (const childPath of rootDir.children) {
        collectProject(childPath, true)
      }
    }

    return projects.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
  }

  // =====================================================
  // 物理文件系统同步
  // =====================================================

  /**
   * 同步物理文件系统到 VFS
   * 扫描物理目录并更新 VFS 中的对应项目
   */
  async syncFromPhysical(vfsPath, physicalPath) {
    const normalized = this.normalizePath(vfsPath)
    
    // 确保 VFS 目录存在
    await this.mkdir(normalized, true)
    
    // 使用 fs-utils 扫描物理目录
    const items = await fsUtils.listDirectory(physicalPath)
    
    for (const item of items) {
      const vfsItemPath = normalized + '/' + item.name
      if (item.isDirectory) {
        // 递归同步子目录
        await this.syncFromPhysical(vfsItemPath, item.path)
      } else if (item.isFile) {
        // 只记录文件元数据，不复制大文件内容
        const fileInfo = {
          path: vfsItemPath,
          name: item.name,
          content: '[Physical File - Not Loaded]',
          size: item.size,
          type: item.type,
          createdAt: new Date().toISOString(),
          updatedAt: item.updatedAt,
          metadata: {
            isPhysical: true,
            physicalPath: item.path,
          },
        }
        this.files.set(vfsItemPath, fileInfo)
        
        // 添加到目录
        const dir = this.getDirectory(normalized)
        if (dir && !dir.children.has(vfsItemPath)) {
          dir.children.add(vfsItemPath)
        }
      }
    }
    
    return normalized
  }

  /**
   * 从外部文件夹导入到项目（调用 fs-utils 的智能组织功能）
   */
  async importExternalProject(externalPath, projectPath, options = {}) {
    // 调用 fs-utils 的智能组织功能
    const result = await fsUtils.smartOrganizeToProject(externalPath, projectPath, options)
    
    // 同步到 VFS
    await this.syncFromPhysical(projectPath, projectPath)
    
    return result
  }

  /**
   * 分析外部文件夹
   */
  async analyzeExternal(externalPath) {
    return await fsUtils.analyzeExternalFolder(externalPath)
  }
}

// =====================================================
// MCP 服务器
// =====================================================
class VirtualFileMCP {
  constructor(vfs) {
    this.vfs = vfs
    this.clients = new Map()
  }

  async handleRequest(message) {
    const { method, params, id } = message
    
    try {
      let result
      
      switch (method) {
        case 'tools/call':
          result = await this.handleToolCall(params)
          break
        case 'tools/list':
          result = { tools: this.getTools() }
          break
        case 'resources/list':
          result = { resources: this.getResources() }
          break
        case 'resources/read':
          result = await this.handleResourceRead(params)
          break
        case 'initialize':
          result = {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {}, resources: {} },
            serverInfo: { name: 'electron-mcp-vfs', version: '1.0.0' },
          }
          break
        default:
          throw new Error(`未知方法：${method}`)
      }
      
      return { jsonrpc: '2.0', id, result }
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32000, message: error.message },
      }
    }
  }

  async handleToolCall(params) {
    const { name, arguments: args } = params
    
    const tools = {
      vfs_list_directory: async () => {
        const items = await this.vfs.listDirectory(args?.path || '/')
        return { content: [{ type: 'text', text: JSON.stringify(items, null, 2) }] }
      },
      vfs_read_file: async () => {
        const content = await this.vfs.readFile(args?.filePath, args?.encoding || 'utf-8')
        return { content: [{ type: 'text', text: content }] }
      },
      vfs_write_file: async () => {
        await this.vfs.writeFile(args?.filePath, args?.content, { type: args?.contentType })
        return { content: [{ type: 'text', text: `✅ 文件已写入：${args?.filePath}` }] }
      },
      vfs_read_json: async () => {
        const data = await this.vfs.readJSON(args?.filePath)
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
      },
      vfs_write_json: async () => {
        await this.vfs.writeJSON(args?.filePath, args?.data)
        return { content: [{ type: 'text', text: `✅ JSON 已写入：${args?.filePath}` }] }
      },
      vfs_delete: async () => {
        await this.vfs.delete(args?.path, args?.recursive || false)
        return { content: [{ type: 'text', text: `✅ 已删除：${args?.path}` }] }
      },
      vfs_move: async () => {
        await this.vfs.move(args?.from, args?.to)
        return { content: [{ type: 'text', text: `✅ 已移动：${args?.from} -> ${args?.to}` }] }
      },
      vfs_copy: async () => {
        await this.vfs.copy(args?.from, args?.to)
        return { content: [{ type: 'text', text: `✅ 已复制：${args?.from} -> ${args?.to}` }] }
      },
      vfs_mkdir: async () => {
        await this.vfs.mkdir(args?.path, args?.recursive || false)
        return { content: [{ type: 'text', text: `✅ 目录已创建：${args?.path}` }] }
      },
      vfs_get_file_info: async () => {
        const file = this.vfs.getFile(args?.filePath)
        if (!file) throw new Error('文件不存在')
        return { content: [{ type: 'text', text: JSON.stringify(file, null, 2) }] }
      },
      vfs_search: async () => {
        const results = await this.vfs.search(args?.pattern, {
          includeDirectories: args?.includeDirectories,
          maxResults: args?.maxResults || 50,
        })
        return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] }
      },
      vfs_search_by_type: async () => {
        const results = await this.vfs.searchByType(args?.type, { maxResults: args?.maxResults || 50 })
        return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] }
      },
      vfs_get_storage_info: async () => {
        const info = await this.vfs.getStorageInfo()
        return { content: [{ type: 'text', text: JSON.stringify(info, null, 2) }] }
      },
      vfs_cd: async () => {
        this.vfs.cd(args?.path || '/')
        return { content: [{ type: 'text', text: `✅ 当前目录：${this.vfs.pwd()}` }] }
      },
      vfs_pwd: async () => {
        return { content: [{ type: 'text', text: this.vfs.pwd() }] }
      },
      vfs_exists: async () => {
        const exists = this.vfs.exists(args?.path)
        return { content: [{ type: 'text', text: exists ? `✅ 路径存在` : `❌ 路径不存在` }] }
      },
      vfs_create_project: async () => {
        const path = await this.vfs.createVideoProject(args?.name, args?.config)
        return { content: [{ type: 'text', text: `✅ 项目已创建：${path}` }] }
      },
      vfs_list_projects: async () => {
        const projects = await this.vfs.getVideoProjects()
        if (projects.length === 0) return { content: [{ type: 'text', text: '📂 没有项目' }] }
        return { content: [{ type: 'text', text: projects.map(p => `📁 ${p.name} - ${p.path}`).join('\n') }] }
      },
    }
    
    const tool = tools[name]
    if (!tool) {
      throw new Error(`未知工具：${name}`)
    }
    
    return await tool()
  }

  getTools() {
    return [
      { name: 'vfs_list_directory', description: '列出目录内容' },
      { name: 'vfs_read_file', description: '读取文件' },
      { name: 'vfs_write_file', description: '写入文件' },
      { name: 'vfs_read_json', description: '读取 JSON' },
      { name: 'vfs_write_json', description: '写入 JSON' },
      { name: 'vfs_delete', description: '删除文件/目录' },
      { name: 'vfs_move', description: '移动/重命名' },
      { name: 'vfs_copy', description: '复制文件' },
      { name: 'vfs_mkdir', description: '创建目录' },
      { name: 'vfs_get_file_info', description: '获取文件信息' },
      { name: 'vfs_search', description: '搜索文件' },
      { name: 'vfs_search_by_type', description: '按类型搜索' },
      { name: 'vfs_get_storage_info', description: '获取存储信息' },
      { name: 'vfs_cd', description: '切换目录' },
      { name: 'vfs_pwd', description: '获取当前目录' },
      { name: 'vfs_exists', description: '检查路径是否存在' },
      { name: 'vfs_create_project', description: '创建视频项目' },
      { name: 'vfs_list_projects', description: '列出所有项目' },
    ]
  }

  getResources() {
    return [
      { uri: 'vfs://current', name: '当前目录' },
      { uri: 'vfs://storage', name: '存储状态' },
      { uri: 'vfs://projects', name: '项目列表' },
    ]
  }

  async handleResourceRead(params) {
    const { uri } = params
    
    switch (uri) {
      case 'vfs://current':
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({ path: this.vfs.pwd(), root: '/' }, null, 2),
          }],
        }
      case 'vfs://storage':
        const info = await this.vfs.getStorageInfo()
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(info, null, 2),
          }],
        }
      case 'vfs://projects':
        const projects = await this.vfs.getVideoProjects()
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(projects, null, 2),
          }],
        }
      default:
        throw new Error(`未知资源：${uri}`)
    }
  }
}

// =====================================================
// HTTP/WS 服务器
// =====================================================
class VirtualFileServer {
  constructor() {
    this.vfs = new VirtualFileSystem()
    this.mcp = new VirtualFileMCP(this.vfs)
    this.server = null
    this.wss = null
  }

  async init() {
    // 尝试加载存储
    await this.vfs.loadFromFile(CONFIG.STORAGE_FILE)
    
    // 如果没有任何数据，创建默认结构
    if (this.vfs.files.size === 0 && this.vfs.directories.size <= 1) {
      await this.vfs.createDefaultStructure()
      console.log('[VFS Server] 已创建默认目录结构')
    }
    
    // 自动扫描物理项目目录，同步到 VFS（解决 VFS 同步问题）
    await this.syncPhysicalProjects()
  }

  /**
   * 自动扫描物理项目目录并同步到 VFS
   */
  async syncPhysicalProjects() {
    try {
      const allowedRoots = fsUtils.getAllowedRoots()
      if (!allowedRoots || allowedRoots.length === 0) {
        console.log('[VFS Server] 跳过物理项目同步：未设置允许的根目录')
        return
      }
      
      const root = allowedRoots[0]
      const projectsPath = path.join(root, 'projects')
      
      // 检查物理项目目录是否存在
      try {
        await fs.access(projectsPath)
      } catch {
        console.log('[VFS Server] 物理项目目录不存在，跳过同步:', projectsPath)
        return
      }
      
      // 扫描项目目录
      const items = await fs.readdir(projectsPath, { withFileTypes: true })
      let syncedCount = 0
      
      for (const item of items) {
        if (item.isDirectory()) {
          const projectPath = path.join(projectsPath, item.name)
          const vfsProjectPath = `/${item.name}`
          
          // 检查 VFS 中是否已存在该项目
          if (!this.vfs.exists(vfsProjectPath)) {
            // 同步到 VFS
            await this.vfs.syncFromPhysical(vfsProjectPath, projectPath)
            syncedCount++
            console.log(`[VFS Server] 同步物理项目到 VFS: ${item.name}`)
          } else {
            // 如果项目已存在，检查是否需要更新子目录结构（确保三个标准目录存在）
            const standardFolders = projectStructure.getProjectFolderNames()
            for (const folder of standardFolders) {
              const subDirPath = `${vfsProjectPath}/${folder}`
              if (!this.vfs.exists(subDirPath)) {
                await this.vfs.mkdir(subDirPath)
                console.log(`[VFS Server] 补充项目标准目录：${subDirPath}`)
              }
            }
          }
        }
      }
      
      if (syncedCount > 0) {
        console.log(`[VFS Server] 完成物理项目同步：${syncedCount} 个项目`)
        // 保存同步后的状态
        await this.vfs.saveToFile(CONFIG.STORAGE_FILE)
      }
    } catch (error) {
      console.error('[VFS Server] 同步物理项目失败:', error.message)
    }
  }

  start() {
    this.server = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
      
      if (req.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
      }
      
      // 健康检查
      if (req.url === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          status: 'ok',
          storage: CONFIG.STORAGE_FILE,
          timestamp: new Date().toISOString(),
        }))
        return
      }
      
      // VFS API
      if (req.url === '/api/vfs' && req.method === 'POST') {
        this.handleHTTPVFS(req, res)
        return
      }
      
      // MCP API
      if (req.url === '/api/mcp' && req.method === 'POST') {
        this.handleHTTPMCP(req, res)
        return
      }
      
      // 物理文件系统同步 API（前端直接调用）
      if (req.url === '/api/sync-physical' && req.method === 'POST') {
        this.handleHTTPSyncPhysical(req, res)
        return
      }
      
      // 外部项目导入 API
      if (req.url === '/api/import-external' && req.method === 'POST') {
        this.handleHTTPImportExternal(req, res)
        return
      }
      
      // 外部文件夹分析 API
      if (req.url === '/api/analyze-external' && req.method === 'POST') {
        this.handleHTTPAnalyzeExternal(req, res)
        return
      }
      
      res.writeHead(404)
      res.end('Not Found')
    })
    
    this.wss = new WebSocket.Server({
      server: this.server,
      path: '/ws',
    })
    
    this.wss.on('connection', (ws) => {
      console.log('[VFS Server] MCP 客户端已连接')
      
      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data)
          const response = await this.mcp.handleRequest(message)
          ws.send(JSON.stringify(response))
        } catch (error) {
          ws.send(JSON.stringify({
            jsonrpc: '2.0',
            id: -1,
            error: { code: -32700, message: error.message },
          }))
        }
      })
      
      ws.on('close', () => {
        console.log('[VFS Server] MCP 客户端断开')
      })
    })
    
    this.server.listen(CONFIG.PORT, () => {
      console.log('=============================================')
      console.log('📁 Electron MCP 虚拟文件服务器已启动')
      console.log('=============================================')
      console.log(`端口：${CONFIG.PORT}`)
      console.log(`存储文件：${CONFIG.STORAGE_FILE}`)
      console.log('')
      console.log('连接方式:')
      console.log(`  WebSocket (MCP): ws://localhost:${CONFIG.PORT}/ws`)
      console.log(`  HTTP (REST):     http://localhost:${CONFIG.PORT}/api/vfs`)
      console.log(`  健康检查：       http://localhost:${CONFIG.PORT}/health`)
      console.log('')
      console.log('虚拟目录结构:')
      console.log('  /<项目名>          - 项目根目录')
      console.log('  /<项目名>/文案     - 文案和数字人视频')
      console.log('  /<项目名>/场景素材 - 模板混剪素材')
      console.log('  /<项目名>/成片     - 输出视频')
      console.log('=============================================')
    })
    
    // 定期保存
    setInterval(() => {
      this.vfs.saveToFile(CONFIG.STORAGE_FILE).catch(console.error)
    }, 30000)
  }

  async handleHTTPVFS(req, res) {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', async () => {
      try {
        const { operation, args } = JSON.parse(body)
        const result = await this.vfs[operation](...(args || []))
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true, data: result }))
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, error: error.message }))
      }
    })
  }

  async handleHTTPMCP(req, res) {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', async () => {
      try {
        const message = JSON.parse(body)
        const response = await this.mcp.handleRequest(message)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(response))
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          id: -1,
          error: { code: -32000, message: error.message },
        }))
      }
    })
  }

  /**
   * HTTP API: 同步物理文件系统到 VFS
   */
  async handleHTTPSyncPhysical(req, res) {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', async () => {
      try {
        const { vfsPath, physicalPath } = JSON.parse(body)
        
        if (!physicalPath) {
          throw new Error('缺少参数：physicalPath')
        }
        
        const result = await this.vfs.syncFromPhysical(vfsPath || '/imported', physicalPath)
        
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          success: true,
          data: { vfsPath: result, physicalPath },
        }))
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, error: error.message }))
      }
    })
  }

  /**
   * HTTP API: 导入外部项目
   */
  async handleHTTPImportExternal(req, res) {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', async () => {
      try {
        const { externalPath, projectPath, options = {} } = JSON.parse(body)
        
        if (!externalPath || !projectPath) {
          throw new Error('缺少参数：externalPath 和 projectPath')
        }
        
        const result = await this.vfs.importExternalProject(externalPath, projectPath, options)
        
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          success: true,
          data: result,
        }))
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, error: error.message }))
      }
    })
  }

  /**
   * HTTP API: 分析外部文件夹
   */
  async handleHTTPAnalyzeExternal(req, res) {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', async () => {
      try {
        const { externalPath } = JSON.parse(body)
        
        if (!externalPath) {
          throw new Error('缺少参数：externalPath')
        }
        
        const analysis = await this.vfs.analyzeExternal(externalPath)
        
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          success: true,
          data: analysis,
        }))
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, error: error.message }))
      }
    })
  }
}

// =====================================================
// 启动
// =====================================================
async function main() {
  const server = new VirtualFileServer()
  await server.init()
  server.start()
}

main().catch(console.error)

// 导出
module.exports = { VirtualFileSystem, VirtualFileMCP, VirtualFileServer }
