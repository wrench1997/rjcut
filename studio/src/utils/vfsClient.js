/**
 * VFS 客户端代理 - 支持多种模式
 * 
 * 模式：
 * 1. LOCAL_SERVER - 连接本地 VFS 服务器（推荐，脱离浏览器限制）
 * 2. EXTENSION - 通过 Chrome 扩展访问 IndexedDB VFS
 * 3. LOCAL_VFS - 直接使用浏览器内 IndexedDB VFS
 * 
 * 用法:
 * ```javascript
 * import { getVFS } from './utils/vfsClient.js'
 * const vfs = getVFS()
 * await vfs.init()
 * 
 * // 使用 VFS
 * const files = await vfs.listDirectory('/')
 * await vfs.writeFile('/test.txt', 'Hello World')
 * ```
 */

// =====================================================
// 配置
// =====================================================

// VFS 模式：'ELECTRON' | 'LOCAL_SERVER' | 'EXTENSION' | 'LOCAL_VFS'
const VFS_MODE = process.env.NEXT_PUBLIC_VFS_MODE || 'ELECTRON'

// 本地 VFS 服务器地址
const LOCAL_VFS_URL = process.env.NEXT_PUBLIC_LOCAL_VFS_URL || 'ws://localhost:8765/mcp'

// 扩展 ID
const EXTENSION_ID = process.env.NEXT_PUBLIC_EXTENSION_ID || 'YOUR_EXTENSION_ID'

/**
 * 调用 Electron API
 * @param {string} operation - 操作名
 * @param  {...any} args - 参数
 * @returns {Promise<any>} 操作结果
 */
async function callElectronVFS(operation, ...args) {
  if (typeof window === 'undefined' || !window.electronAPI) {
    throw new Error('Electron API 不可用，请确保在 Electron 环境中运行')
  }
  
  const api = window.electronAPI[operation]
  if (!api) {
    throw new Error(`Electron API 未找到：${operation}`)
  }
  
  return await api(...args)
}

/**
 * 调用本地 VFS 服务器（WebSocket MCP）
 * @param {string} operation - 操作名
 * @param  {...any} args - 参数
 * @returns {Promise<any>} 操作结果
 */
async function callLocalVFS(operation, ...args) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(LOCAL_VFS_URL)
    
    const timeout = setTimeout(() => {
      ws.close()
      reject(new Error('连接超时'))
    }, 10000)
    
    ws.onopen = () => {
      // 发送 MCP 工具调用请求
      const message = {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: `vfs_${operation}`,
          arguments: args.length === 1 && typeof args[0] === 'object' ? args[0] : { args },
        },
        id: Date.now(),
      }
      ws.send(JSON.stringify(message))
    }
    
    ws.onmessage = (event) => {
      clearTimeout(timeout)
      try {
        const response = JSON.parse(event.data)
        if (response.error) {
          reject(new Error(response.error.message))
        } else if (response.result?.content?.[0]?.text) {
          // 尝试解析返回的文本
          try {
            resolve(JSON.parse(response.result.content[0].text))
          } catch {
            resolve(response.result.content[0].text)
          }
        } else {
          resolve(response.result)
        }
      } catch (error) {
        reject(error)
      } finally {
        ws.close()
      }
    }
    
    ws.onerror = () => {
      clearTimeout(timeout)
      reject(new Error('WebSocket 错误'))
    }
    
    ws.onclose = () => {
      clearTimeout(timeout)
    }
  })
}

/**
 * 调用扩展 VFS
 * @param {string} operation - 操作名
 * @param  {...any} args - 参数
 * @returns {Promise<any>} 操作结果
 */
export async function callVFS(operation, ...args) {
  // 根据模式选择调用方式
  if (VFS_MODE === 'ELECTRON') {
    return callElectronVFS(operation, ...args)
  }
  
  if (VFS_MODE === 'LOCAL_SERVER') {
    return callLocalVFS(operation, ...args)
  }
  
  // 扩展模式
  return new Promise((resolve, reject) => {
    // 检查 Chrome Runtime 是否可用
    if (!chrome?.runtime) {
      if (VFS_MODE === 'EXTENSION') {
        reject(new Error('Chrome Runtime 不可用，请确保在扩展环境中运行'))
      }
      // 降级到本地 VFS
      return callLocalVFS(operation, ...args).then(resolve).catch(reject)
    }
    
    // 检查扩展 ID 是否配置
    if (!EXTENSION_ID || EXTENSION_ID === 'YOUR_EXTENSION_ID') {
      console.warn('[VFS] 扩展 ID 未配置，尝试使用本地 VFS 服务器')
      return callLocalVFS(operation, ...args).then(resolve).catch(reject)
    }
    
    const message = { type: 'VFS_OPERATION', payload: { operation, args } }
    
    try {
      chrome.runtime.sendMessage(EXTENSION_ID, message, (response) => {
        // 检查 Chrome Runtime 错误
        if (chrome.runtime.lastError) {
          const errorMsg = chrome.runtime.lastError.message
          
          // 扩展上下文失效
          if (errorMsg.includes('Extension context invalidated')) {
            console.error('[VFS] 扩展已更新或禁用，请刷新页面')
            reject(new Error('扩展连接失效，请刷新页面'))
            return
          }
          
          // 无法建立连接
          if (errorMsg.includes('Could not establish connection')) {
            console.error('[VFS] 无法连接到扩展，尝试本地 VFS 服务器')
            return callLocalVFS(operation, ...args).then(resolve).catch(reject)
          }
          
          reject(new Error(errorMsg))
          return
        }
        
        // 检查响应
        if (!response) {
          reject(new Error('扩展无响应'))
          return
        }
        
        if (response?.success) {
          resolve(response.data)
        } else {
          reject(new Error(response?.error || '未知错误'))
        }
      })
    } catch (error) {
      console.error('[VFS] 发送消息失败:', error)
      reject(new Error('发送消息失败：' + error.message))
    }
  })
}

/**
 * VFS 代理类 - 用法与 VirtualFileSystem 完全相同
 */
export class VFSProxy {
  constructor() {
    this.initialized = false
    this.cache = new Map()
    this.cacheExpiry = 5000 // 5 秒缓存
    this.mode = VFS_MODE
  }
  
  /**
   * 初始化 VFS 连接
   * @returns {Promise<boolean>} 是否成功初始化
   */
  async init() {
    if (this.initialized) return true
    
    // 模式 1: Electron API（推荐用于 Electron 环境）
    if (this.mode === 'ELECTRON') {
      try {
        // 检查 Electron API 是否可用
        if (typeof window !== 'undefined' && window.electronAPI) {
          // 获取允许的根目录
          const roots = await window.electronAPI.getAllowedRoots()
          if (roots && roots.length > 0) {
            console.log('[VFSProxy] 已连接到 Electron API，允许的根目录:', roots)
          }
          this.initialized = true
          console.log('[VFSProxy] 使用 Electron API 模式')
          return true
        } else {
          console.warn('[VFSProxy] Electron API 不可用，降级到浏览器内 VFS 模式')
          this.mode = 'LOCAL_VFS'
        }
      } catch (error) {
        console.error('[VFSProxy] 连接 Electron API 失败:', error)
        console.warn('[VFSProxy] 降级到浏览器内 VFS 模式')
        this.mode = 'LOCAL_VFS'
      }
    }
    
    // 模式 2: 本地 VFS 服务器
    if (this.mode === 'LOCAL_SERVER') {
      try {
        await callVFS('pwd')
        this.initialized = true
        console.log('[VFSProxy] 已连接到本地 VFS 服务器:', LOCAL_VFS_URL)
        return true
      } catch (error) {
        console.error('[VFSProxy] 连接本地 VFS 服务器失败:', error)
        console.warn('[VFSProxy] 降级到浏览器内 VFS 模式')
        this.mode = 'LOCAL_VFS'
      }
    }
    
    // 模式 3: 扩展 VFS
    if (this.mode === 'EXTENSION') {
      try {
        await callVFS('pwd')
        this.initialized = true
        console.log('[VFSProxy] 已连接到扩展 VFS')
        return true
      } catch (error) {
        console.error('[VFSProxy] 连接扩展失败:', error)
        console.warn('[VFSProxy] 降级到浏览器内 VFS 模式')
        this.mode = 'LOCAL_VFS'
      }
    }
    
    // 模式 4: 浏览器内 VFS（降级模式）
    if (this.mode === 'LOCAL_VFS') {
      const { getSharedFileSystem } = await import('./virtualFileSystem.js')
      const localVFS = await getSharedFileSystem()
      
      // 将本地 VFS 的方法代理到当前实例
      Object.getOwnPropertyNames(Object.getPrototypeOf(localVFS)).forEach((key) => {
        if (typeof localVFS[key] === 'function' && key !== 'constructor') {
          this[key] = localVFS[key].bind(localVFS)
        }
      })
      
      // 复制属性
      Object.keys(localVFS).forEach(key => {
        this[key] = localVFS[key]
      })
      
      this.initialized = true
      console.log('[VFSProxy] 使用浏览器内 VFS 模式（IndexedDB）')
      return true
    }
    
    throw new Error('无法初始化 VFS，请检查配置')
  }
  
  // ==================== 目录操作 ====================
  
  /**
   * 列出目录内容
   * @param {string} path - 目录路径
   * @returns {Promise<Array>} 目录项列表
   */
  async listDirectory(path) {
    const cacheKey = `list:${path}`
    const cached = this.cache.get(cacheKey)
    if (cached && Date.now() - cached.time < this.cacheExpiry) {
      return cached.data
    }
    
    let data
    if (this.mode === 'ELECTRON') {
      // Electron 模式：直接使用 electronAPI
      if (typeof window !== 'undefined' && window.electronAPI?.listDirectory) {
        data = await window.electronAPI.listDirectory(path)
      } else {
        data = await callVFS('listDirectory', path)
      }
    } else {
      data = await callVFS('listDirectory', path)
    }
    
    this.cache.set(cacheKey, { data, time: Date.now() })
    return data
  }
  
  // 辅助函数：在 Electron 模式下调用 API
  _callAPI(operation, ...args) {
    if (this.mode === 'ELECTRON' && typeof window !== 'undefined' && window.electronAPI?.[operation]) {
      return window.electronAPI[operation](...args)
    }
    return callVFS(operation, ...args)
  }
  
  /**
   * 创建目录
   * @param {string} path - 目录路径
   * @param {boolean} recursive - 是否递归创建
   * @returns {Promise<string>} 创建的目录路径
   */
  async mkdir(path, recursive = false) {
    this.invalidateCache('list:')
    return this._callAPI('mkdir', path, recursive)
  }
  
  /**
   * 切换当前目录
   * @param {string} path - 目录路径
   * @returns {Promise<string>} 当前目录路径
   */
  async cd(path) {
    return this._callAPI('cd', path)
  }
  
  /**
   * 获取当前目录
   * @returns {Promise<string>} 当前目录路径
   */
  pwd() {
    return this._callAPI('pwd')
  }
  
  // ==================== 文件读取 ====================
  
  /**
   * 读取文件内容
   * @param {string} path - 文件路径
   * @param {string} encoding - 编码（默认 utf-8）
   * @returns {Promise<string|Blob>} 文件内容
   */
  async readFile(path, encoding = 'utf-8') {
    return this._callAPI('readFile', path, encoding)
  }
  
  /**
   * 读取 JSON 文件
   * @param {string} path - 文件路径
   * @returns {Promise<Object>} 解析后的 JSON 对象
   */
  async readJSON(path) {
    return this._callAPI('readJSON', path)
  }
  
  /**
   * 读取文件为 Blob
   * @param {string} path - 文件路径
   * @returns {Promise<Blob>} Blob 对象
   */
  async readFileAsBlob(path) {
    return this._callAPI('readFileAsBuffer', path).then(buffer => new Blob([buffer]))
  }
  
  /**
   * 读取文件为 DataURL
   * @param {string} path - 文件路径
   * @returns {Promise<string>} DataURL 字符串
   */
  async readFileAsDataURL(path) {
    return this._callAPI('readFileAsBuffer', path).then(buffer => {
      const blob = new Blob([buffer])
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
    })
  }
  
  // ==================== 文件写入 ====================
  
  /**
   * 写入文件
   * @param {string} path - 文件路径
   * @param {string|Blob|ArrayBuffer} content - 文件内容
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 文件信息
   */
  async writeFile(path, content, options = {}) {
    this.invalidateCache('list:')
    return this._callAPI('writeFile', path, content, options)
  }
  
  /**
   * 写入 JSON 文件
   * @param {string} path - 文件路径
   * @param {Object} data - JSON 数据
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 文件信息
   */
  async writeJSON(path, data, options = {}) {
    this.invalidateCache('list:')
    return this._callAPI('writeJSON', path, data, options)
  }
  
  // ==================== 文件管理 ====================
  
  /**
   * 删除文件或目录
   * @param {string} path - 文件/目录路径
   * @param {boolean} recursive - 是否递归删除（目录）
   * @returns {Promise<void>}
   */
  async delete(path, recursive = false) {
    this.invalidateCache('list:')
    return this._callAPI('delete', path, recursive)
  }
  
  /**
   * 移动/重命名文件或目录
   * @param {string} from - 源路径
   * @param {string} to - 目标路径
   * @returns {Promise<void>}
   */
  async move(from, to) {
    this.invalidateCache('list:')
    return this._callAPI('move', from, to)
  }
  
  /**
   * 复制文件或目录
   * @param {string} from - 源路径
   * @param {string} to - 目标路径
   * @returns {Promise<void>}
   */
  async copy(from, to) {
    this.invalidateCache('list:')
    return this._callAPI('copy', from, to)
  }
  
  /**
   * 检查路径是否存在
   * @param {string} path - 路径
   * @returns {Promise<boolean>} 是否存在
   */
  exists(path) {
    return this._callAPI('exists', path)
  }
  
  /**
   * 检查是否为目录
   * @param {string} path - 路径
   * @returns {Promise<boolean>} 是否为目录
   */
  isDirectory(path) {
    return this._callAPI('isDirectory', path)
  }
  
  /**
   * 检查是否为文件
   * @param {string} path - 路径
   * @returns {Promise<boolean>} 是否为文件
   */
  isFile(path) {
    return this._callAPI('isFile', path)
  }
  
  /**
   * 获取文件信息
   * @param {string} path - 文件路径
   * @returns {Promise<Object>} 文件信息
   */
  getFile(path) {
    return this._callAPI('getFile', path)
  }
  
  // ==================== 搜索 ====================
  
  /**
   * 搜索文件
   * @param {string|RegExp} pattern - 搜索模式
   * @param {Object} options - 选项
   * @returns {Promise<Array>} 搜索结果
   */
  search(pattern, options = {}) {
    return callVFS('search', pattern, options)
  }
  
  /**
   * 按类型搜索文件
   * @param {string} type - 文件类型
   * @param {Object} options - 选项
   * @returns {Promise<Array>} 搜索结果
   */
  searchByType(type, options = {}) {
    return callVFS('searchByType', type, options)
  }
  
  /**
   * 搜索视频文件
   * @returns {Promise<Array>} 视频文件列表
   */
  searchVideos() {
    return callVFS('searchVideos')
  }
  
  /**
   * 搜索音频文件
   * @returns {Promise<Array>} 音频文件列表
   */
  searchAudio() {
    return callVFS('searchAudio')
  }
  
  /**
   * 搜索字幕文件
   * @returns {Promise<Array>} 字幕文件列表
   */
  searchSubtitles() {
    return callVFS('searchSubtitles')
  }
  
  /**
   * 搜索 JSON 文件
   * @returns {Promise<Array>} JSON 文件列表
   */
  searchJSON() {
    return callVFS('searchJSON')
  }
  
  // ==================== 项目 ====================
  
  /**
   * 创建视频项目
   * @param {string} projectName - 项目名称
   * @param {Object} config - 项目配置
   * @returns {Promise<string>} 项目路径
   */
  async createVideoProject(projectName, config = {}) {
    this.invalidateCache('list:')
    return callVFS('createVideoProject', projectName, config)
  }
  
  /**
   * 获取视频项目列表
   * @returns {Promise<Array>} 项目列表
   */
  async getVideoProjects() {
    return callVFS('getVideoProjects')
  }
  
  // ==================== 存储 ====================
  
  /**
   * 获取存储空间使用情况
   * @returns {Promise<Object>} 存储信息
   */
  async getStorageInfo() {
    return callVFS('getStorageInfo')
  }
  
  // ==================== 缓存管理 ====================
  
  /**
   * 清除缓存
   * @param {string} pattern - 缓存键模式
   */
  invalidateCache(pattern) {
    if (pattern) {
      for (const key of this.cache.keys()) {
        if (key.includes(pattern)) {
          this.cache.delete(key)
        }
      }
    } else {
      this.cache.clear()
    }
  }
  
  /**
   * 检查是否已初始化
   * @returns {boolean} 是否已初始化
   */
  isInitialized() {
    return this.initialized
  }
}

// ==================== 单例模式 ====================

let vfsProxyInstance = null

/**
 * 获取 VFS 实例
 * @returns {VFSProxy} VFS 代理实例
 */
export function getVFS() {
  if (!vfsProxyInstance) {
    vfsProxyInstance = new VFSProxy()
  }
  return vfsProxyInstance
}

// 默认导出
export default VFSProxy