/**
 * Electron 文件系统适配器
 * 
 * 通过 Electron IPC 直接访问本地文件系统，完全脱离浏览器沙盒限制
 * 用法与 VirtualFileSystem 类完全相同，便于迁移
 */

// =====================================================
// 文件系统根目录
// =====================================================
const ROOT_PATH = '/'

// =====================================================
// Electron 文件系统类
// =====================================================
export class ElectronFileSystem {
  constructor() {
    this.currentPath = ROOT_PATH
    this.initialized = false
    this.electronAPI = null
  }

  /**
   * 初始化文件系统
   */
  async init() {
    if (this.initialized) return true
    
    // 检查是否在 Electron 环境中
    if (typeof window !== 'undefined' && window.electronAPI) {
      this.electronAPI = window.electronAPI
      this.initialized = true
      console.log('[ElectronFileSystem] 已初始化，使用 Electron IPC 模式')
      return true
    }
    
    // 降级处理：在非 Electron 环境中抛出错误或降级
    console.warn('[ElectronFileSystem] 不在 Electron 环境中，功能受限')
    this.initialized = true
    return false
  }

  /**
   * 检查是否在 Electron 环境中
   */
  isElectron() {
    return !!(typeof window !== 'undefined' && window.electronAPI)
  }

  /**
   * 规范化路径
   */
  normalizePath(path) {
    if (!path) return ROOT_PATH
    if (path === ROOT_PATH) return ROOT_PATH
    
    // 处理相对路径
    if (path.startsWith('./')) {
      path = this.currentPath + path.substring(1)
    } else if (path.startsWith('../')) {
      const parts = this.currentPath.split('/').filter(Boolean)
      const relativeParts = path.split('/')
      for (const part of relativeParts) {
        if (part === '..') {
          parts.pop()
        } else if (part !== '.') {
          parts.push(part)
        }
      }
      path = '/' + parts.join('/')
    } else if (!path.startsWith('/')) {
      path = this.currentPath + (this.currentPath.endsWith('/') ? '' : '/') + path
    }
    
    // 规范化路径（移除多余的斜杠）
    return path.replace(/\/+/g, '/').replace(/\/$/, '') || ROOT_PATH
  }

  // ==================== 目录操作 ====================

  /**
   * 列出目录内容
   */
  async listDirectory(path = this.currentPath) {
    if (!this.isElectron()) {
      throw new Error('不在 Electron 环境中')
    }
    
    const normalizedPath = this.normalizePath(path)
    // 转换为系统路径（去掉前导斜杠或作为相对路径）
    const systemPath = normalizedPath === '/' ? '/' : normalizedPath
    
    const items = await this.electronAPI.listDirectory(systemPath)
    return items
  }

  /**
   * 创建目录
   */
  async mkdir(path, recursive = false) {
    if (!this.isElectron()) {
      throw new Error('不在 Electron 环境中')
    }
    
    const normalizedPath = this.normalizePath(path)
    const systemPath = normalizedPath === '/' ? '/' : normalizedPath
    
    await this.electronAPI.mkdir(systemPath, recursive)
    return normalizedPath
  }

  /**
   * 创建目录（别名）
   */
  async createDirectory(path, recursive = false) {
    return this.mkdir(path, recursive)
  }

  /**
   * 切换当前目录
   */
  async cd(path) {
    const dir = await this.getDirectory(path)
    if (!dir) {
      throw new Error(`目录不存在：${path}`)
    }
    this.currentPath = this.normalizePath(path)
    return this.currentPath
  }

  /**
   * 获取当前目录
   */
  pwd() {
    return this.currentPath
  }

  /**
   * 获取目录信息
   */
  async getDirectory(path = this.currentPath) {
    try {
      const normalizedPath = this.normalizePath(path)
      const exists = await this.electronAPI.exists(normalizedPath)
      const isDir = await this.electronAPI.isDirectory(normalizedPath)
      
      if (exists && isDir) {
        return { path: normalizedPath, name: normalizedPath.split('/').pop() || 'root' }
      }
      return null
    } catch {
      return null
    }
  }

  // ==================== 文件读取 ====================

  /**
   * 获取文件信息
   */
  async getFile(path) {
    if (!this.isElectron()) {
      throw new Error('不在 Electron 环境中')
    }
    
    const normalizedPath = this.normalizePath(path)
    return await this.electronAPI.getFile(normalizedPath)
  }

  /**
   * 读取文件
   */
  async readFile(path, encoding = 'utf-8') {
    if (!this.isElectron()) {
      throw new Error('不在 Electron 环境中')
    }
    
    const normalizedPath = this.normalizePath(path)
    return await this.electronAPI.readFile(normalizedPath, encoding)
  }

  /**
   * 读取文件为 Blob
   */
  async readFileAsBlob(path) {
    if (!this.isElectron()) {
      throw new Error('不在 Electron 环境中')
    }
    
    const normalizedPath = this.normalizePath(path)
    const result = await this.electronAPI.readFileAsBuffer(normalizedPath)
    
    console.log('[ElectronFileSystem.readFileAsBlob] 原始结果:', {
      type: result?.type,
      constructor: result?.constructor?.name,
      byteLength: result?.byteLength,
      length: result?.length,
      isArrayBuffer: result instanceof ArrayBuffer,
      isBuffer: result?.constructor?.name === 'Buffer'
    })
    
    // 获取文件类型
    const fileInfo = await this.electronAPI.getFile(normalizedPath)
    const mimeType = fileInfo?.type || 'application/octet-stream'
    
    // 处理 ArrayBuffer
    if (result instanceof ArrayBuffer) {
      console.log('[ElectronFileSystem.readFileAsBlob] 使用 ArrayBuffer，byteLength:', result.byteLength)
      return new Blob([result], { type: mimeType })
    }
    
    // 处理 Uint8Array
    if (result instanceof Uint8Array) {
      console.log('[ElectronFileSystem.readFileAsBlob] 使用 Uint8Array，length:', result.length)
      return new Blob([result], { type: mimeType })
    }
    
    // 处理 Buffer（Node.js 类型，Electron IPC 可能序列化为对象）
    if (result && result.type === 'Buffer' && Array.isArray(result.data)) {
      console.log('[ElectronFileSystem.readFileAsBlob] 使用 Buffer 对象格式，data 长度:', result.data.length)
      const uint8Array = new Uint8Array(result.data)
      return new Blob([uint8Array], { type: mimeType })
    }
    
    // 回退处理
    console.warn('[ElectronFileSystem.readFileAsBlob] 未知格式，使用回退处理')
    return new Blob([result], { type: mimeType })
  }

  /**
   * 读取文件为 DataURL
   */
  async readFileAsDataURL(path) {
    const blob = await this.readFileAsBlob(path)
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('读取文件失败'))
      reader.readAsDataURL(blob)
    })
  }

  /**
   * 读取 JSON 文件
   */
  async readJSON(path) {
    const content = await this.readFile(path)
    return JSON.parse(content)
  }

  // ==================== 文件写入 ====================

  /**
   * 写入文件
   */
  async writeFile(path, content, options = {}) {
    if (!this.isElectron()) {
      throw new Error('不在 Electron 环境中')
    }
    
    const normalizedPath = this.normalizePath(path)
    
    // 处理 Blob/ArrayBuffer 内容
    let writeContent = content
    if (content instanceof Blob) {
      writeContent = await content.arrayBuffer()
    }
    
    const result = await this.electronAPI.writeFile(normalizedPath, writeContent, options)
    
    return {
      path: normalizedPath,
      name: normalizedPath.split('/').pop(),
      size: result.size,
      type: options.type || this.getMimeType(normalizedPath),
      createdAt: new Date().toISOString(),
      updatedAt: result.updatedAt,
      metadata: options.metadata || {},
    }
  }

  /**
   * 写入 JSON 文件
   */
  async writeJSON(path, data, options = {}) {
    return this.writeFile(path, JSON.stringify(data, null, 2), {
      ...options,
      type: 'application/json',
    })
  }

  // ==================== 文件管理 ====================

  /**
   * 删除文件或目录
   */
  async delete(path, recursive = false) {
    if (!this.isElectron()) {
      throw new Error('不在 Electron 环境中')
    }
    
    const normalizedPath = this.normalizePath(path)
    await this.electronAPI.delete(normalizedPath, recursive)
  }

  /**
   * 移动/重命名文件或目录
   */
  async move(fromPath, toPath) {
    if (!this.isElectron()) {
      throw new Error('不在 Electron 环境中')
    }
    
    const fromNormalized = this.normalizePath(fromPath)
    const toNormalized = this.normalizePath(toPath)
    
    await this.electronAPI.move(fromNormalized, toNormalized)
  }

  /**
   * 复制文件
   */
  async copy(fromPath, toPath) {
    if (!this.isElectron()) {
      throw new Error('不在 Electron 环境中')
    }
    
    const fromNormalized = this.normalizePath(fromPath)
    const toNormalized = this.normalizePath(toPath)
    
    await this.electronAPI.copy(fromNormalized, toNormalized)
  }

  /**
   * 检查路径是否存在
   */
  async exists(path) {
    if (!this.isElectron()) {
      return false
    }
    
    const normalizedPath = this.normalizePath(path)
    return await this.electronAPI.exists(normalizedPath)
  }

  /**
   * 检查是否为目录
   */
  async isDirectory(path) {
    if (!this.isElectron()) {
      return false
    }
    
    const normalizedPath = this.normalizePath(path)
    return await this.electronAPI.isDirectory(normalizedPath)
  }

  /**
   * 检查是否为文件
   */
  async isFile(path) {
    if (!this.isElectron()) {
      return false
    }
    
    const normalizedPath = this.normalizePath(path)
    return await this.electronAPI.isFile(normalizedPath)
  }

  // ==================== 搜索 ====================

  /**
   * 搜索文件
   */
  async search(pattern, options = {}) {
    if (!this.isElectron()) {
      return []
    }
    
    return await this.electronAPI.search(pattern, options)
  }

  /**
   * 按类型搜索
   */
  async searchByType(type, options = {}) {
    if (!this.isElectron()) {
      return []
    }
    
    return await this.electronAPI.searchByType(type, options)
  }

  /**
   * 搜索视频文件
   */
  async searchVideos() {
    return this.searchByType('video')
  }

  /**
   * 搜索音频文件
   */
  async searchAudio() {
    return this.searchByType('audio')
  }

  /**
   * 搜索字幕文件
   */
  async searchSubtitles() {
    return this.searchByType('subtitle')
  }

  /**
   * 搜索 JSON 文件
   */
  async searchJSON() {
    return this.searchByType('json')
  }

  // ==================== 项目操作 ====================

  /**
   * 创建视频项目
   */
  async createVideoProject(projectName, config = {}) {
    if (!this.isElectron()) {
      throw new Error('不在 Electron 环境中')
    }
    
    return await this.electronAPI.createVideoProject(projectName, config)
  }

  /**
   * 获取视频项目列表
   */
  async getVideoProjects() {
    if (!this.isElectron()) {
      return []
    }
    
    return await this.electronAPI.getVideoProjects()
  }

  // ==================== 存储 ====================

  /**
   * 获取存储信息
   */
  async getStorageInfo() {
    if (!this.isElectron()) {
      return { totalSize: 0, fileCount: 0 }
    }
    
    return await this.electronAPI.getStorageInfo()
  }

  // ==================== 工具方法 ====================

  /**
   * 获取 MIME 类型
   */
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
      ass: 'text/ass',
    }
    return mimeTypes[ext] || 'application/octet-stream'
  }

  /**
   * 创建默认目录结构
   */
  async createDefaultStructure() {
    // 项目是唯一的顶层组织单位，子目录按项目使用情况创建。
    return true
  }
}

// =====================================================
// 创建默认的文件系统实例
// =====================================================
export async function createDefaultFileSystem() {
  const fs = new ElectronFileSystem()
  await fs.init()
  await fs.createDefaultStructure()
  return fs
}

// =====================================================
// 创建共享的文件系统实例（单例）
// =====================================================
let sharedFS = null

export async function getSharedFileSystem() {
  if (!sharedFS) {
    sharedFS = new ElectronFileSystem()
    await sharedFS.init()
    await sharedFS.createDefaultStructure()
  }
  return sharedFS
}

export default ElectronFileSystem
