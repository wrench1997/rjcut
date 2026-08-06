/**
 * 增强虚拟文件系统 - 使用 IndexedDB 存储，支持大文件和视频管理
 * 避免使用 Chrome 受限的本地文件系统 API
 */

import { PROJECT_DISCOVERY_EXCLUDED_FOLDERS } from './project-structure'

// =====================================================
// IndexedDB 封装
// =====================================================
const DB_NAME = 'RJCut_VFS'
const DB_VERSION = 1
const STORE_FILES = 'files'
const STORE_DIRECTORIES = 'directories'
const STORE_METADATA = 'metadata'

// 打开数据库
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    
    request.onerror = () => reject(new Error('无法打开数据库'))
    request.onsuccess = () => resolve(request.result)
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result
      
      // 创建文件存储
      if (!db.objectStoreNames.contains(STORE_FILES)) {
        const fileStore = db.createObjectStore(STORE_FILES, { keyPath: 'path' })
        fileStore.createIndex('name', 'name', { unique: false })
        fileStore.createIndex('type', 'type', { unique: false })
        fileStore.createIndex('createdAt', 'createdAt', { unique: false })
        fileStore.createIndex('updatedAt', 'updatedAt', { unique: false })
      }
      
      // 创建目录存储
      if (!db.objectStoreNames.contains(STORE_DIRECTORIES)) {
        const dirStore = db.createObjectStore(STORE_DIRECTORIES, { keyPath: 'path' })
        dirStore.createIndex('parent', 'parent', { unique: false })
      }
      
      // 创建元数据存储
      if (!db.objectStoreNames.contains(STORE_METADATA)) {
        db.createObjectStore(STORE_METADATA, { keyPath: 'key' })
      }
    }
  })
}

// 数据库操作
const dbOperations = {
  async getAllFiles() {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_FILES, 'readonly')
      const store = tx.objectStore(STORE_FILES)
      const request = store.getAll()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(new Error('获取文件失败'))
    })
  },

  async getFile(path) {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_FILES, 'readonly')
      const store = tx.objectStore(STORE_FILES)
      const request = store.get(path)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(new Error('获取文件失败'))
    })
  },

  async putFile(fileData) {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_FILES, 'readwrite')
      const store = tx.objectStore(STORE_FILES)
      const request = store.put(fileData)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(new Error('保存文件失败'))
    })
  },

  async deleteFile(path) {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_FILES, 'readwrite')
      const store = tx.objectStore(STORE_FILES)
      const request = store.delete(path)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(new Error('删除文件失败'))
    })
  },

  async getAllDirectories() {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_DIRECTORIES, 'readonly')
      const store = tx.objectStore(STORE_DIRECTORIES)
      const request = store.getAll()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(new Error('获取目录失败'))
    })
  },

  async getDirectory(path) {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_DIRECTORIES, 'readonly')
      const store = tx.objectStore(STORE_DIRECTORIES)
      const request = store.get(path)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(new Error('获取目录失败'))
    })
  },

  async putDirectory(dirData) {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_DIRECTORIES, 'readwrite')
      const store = tx.objectStore(STORE_DIRECTORIES)
      const request = store.put(dirData)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(new Error('保存目录失败'))
    })
  },

  async deleteDirectory(path) {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_DIRECTORIES, 'readwrite')
      const store = tx.objectStore(STORE_DIRECTORIES)
      const request = store.delete(path)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(new Error('删除目录失败'))
    })
  },

  async getMetadata(key) {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_METADATA, 'readonly')
      const store = tx.objectStore(STORE_METADATA)
      const request = store.get(key)
      request.onsuccess = () => resolve(request.result?.value)
      request.onerror = () => reject(new Error('获取元数据失败'))
    })
  },

  async setMetadata(key, value) {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_METADATA, 'readwrite')
      const store = tx.objectStore(STORE_METADATA)
      const request = store.put({ key, value })
      request.onsuccess = () => resolve()
      request.onerror = () => reject(new Error('保存元数据失败'))
    })
  },
}

// =====================================================
// 文件系统根目录
// =====================================================
const ROOT_PATH = '/'

// =====================================================
// 虚拟文件系统类
// =====================================================
export class VirtualFileSystem {
  constructor(initialState = {}) {
    this.files = new Map(initialState.files || [])
    this.directories = new Map(initialState.directories || [
      [ROOT_PATH, { name: 'root', parent: null, children: new Set() }],
    ])
    this.currentPath = ROOT_PATH
    this.history = []
    this.historyIndex = -1
    this.initialized = false
  }

  // 初始化（从 IndexedDB 加载）
  async init() {
    if (this.initialized) return true
    
    try {
      // 尝试从 IndexedDB 加载
      const [files, directories] = await Promise.all([
        dbOperations.getAllFiles(),
        dbOperations.getAllDirectories(),
      ])
      
      if (files.length > 0 || directories.length > 0) {
        // 从数据库恢复
        files.forEach(file => {
          this.files.set(file.path, {
            ...file,
            children: file.children ? new Set(file.children) : undefined,
          })
        })
        directories.forEach(dir => {
          this.directories.set(dir.path, {
            ...dir,
            children: new Set(dir.children || []),
          })
        })
      } else {
        // 初始化默认结构
        await this.createDefaultStructure()
      }
      
      // 加载当前路径
      const savedPath = await dbOperations.getMetadata('currentPath')
      if (savedPath && this.directories.has(savedPath)) {
        this.currentPath = savedPath
      }
      
      this.initialized = true
      return true
    } catch (e) {
      console.warn('初始化文件系统失败，使用内存模式:', e)
      // 降级到内存模式
      await this.createDefaultStructure()
      this.initialized = true
      return false
    }
  }

  // 创建默认目录结构
  async createDefaultStructure() {
    // 项目是唯一的顶层组织单位，子目录按项目使用情况创建。
    return true
    
    // 项目目录、配置目录和模板目录均按需创建，避免首次打开时出现历史空目录。
    await this.saveState()
  }

  // 解析路径
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

  // 获取目录信息
  getDirectory(path = this.currentPath) {
    const normalizedPath = this.normalizePath(path)
    return this.directories.get(normalizedPath)
  }

  // 获取文件信息
  getFile(path) {
    const normalizedPath = this.normalizePath(path)
    return this.files.get(normalizedPath)
  }

  // 列出目录内容
  listDirectory(path = this.currentPath) {
    const dir = this.getDirectory(path)
    if (!dir) {
      throw new Error(`目录不存在：${path}`)
    }
    
    const items = []
    
    // 添加子目录
    for (const childPath of dir.children) {
      const isDir = this.directories.has(childPath)
      const name = childPath.split('/').pop()
      const item = {
        name,
        path: childPath,
        isDirectory: isDir,
        isFile: !isDir,
      }
      
      // 添加额外信息
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
      // 目录排在前面
      if (a.isDirectory && !b.isDirectory) return -1
      if (!a.isDirectory && b.isDirectory) return 1
      return a.name.localeCompare(b.name)
    })
  }

  // 创建目录
  async mkdir(path, recursive = false) {
    const normalizedPath = this.normalizePath(path)
    // 如果目录已存在，直接返回（不报错，智能处理）
    if (this.directories.has(normalizedPath)) {
      return normalizedPath
    }
    // 如果路径被文件占用，才报错
    if (this.files.has(normalizedPath)) {
      throw new Error(`路径已存在（文件）：${path}`)
    }
    
    const parts = normalizedPath.split('/').filter(Boolean)
    let currentPath = ''
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const parentPath = currentPath
      currentPath = currentPath + '/' + part
      
      if (!this.directories.has(currentPath)) {
        if (i < parts.length - 1 && !recursive) {
          throw new Error(`父目录不存在：${parentPath}`)
        }
        
        const dirData = {
          path: currentPath,
          name: part,
          parent: parentPath || null,
          children: [],
          createdAt: new Date().toISOString(),
        }
        
        this.directories.set(currentPath, {
          ...dirData,
          children: new Set(),
        })
        
        // 保存到数据库
        await dbOperations.putDirectory(dirData)
        
        // 添加到父目录的 children
        const actualParentPath = parentPath || ROOT_PATH
        const parent = this.directories.get(actualParentPath)
        if (parent) {
          parent.children.add(currentPath)
          await dbOperations.putDirectory({
            path: actualParentPath,
            name: parent.name,
            parent: parent.parent,
            children: Array.from(parent.children),
            createdAt: parent.createdAt,
          })
        }
      }
    }
    
    await this.saveState()
    return normalizedPath
  }

  // 创建目录（别名，兼容 createDirectory 调用）
  async createDirectory(path, recursive = false) {
    return this.mkdir(path, recursive)
  }

  // 写入文件
  async writeFile(path, content, options = {}) {
    const normalizedPath = this.normalizePath(path)
    const dirPath = normalizedPath.substring(0, normalizedPath.lastIndexOf('/')) || ROOT_PATH
    
    // 确保父目录存在
    if (!this.directories.has(dirPath)) {
      if (options.createParent) {
        await this.mkdir(dirPath, true)
      } else {
        throw new Error(`父目录不存在：${dirPath}`)
      }
    }
    
    // 计算文件大小
    let size
    if (content instanceof Blob) {
      size = content.size
    } else if (typeof content === 'string') {
      size = new Blob([content]).size
    } else if (content instanceof ArrayBuffer) {
      size = content.byteLength
    } else {
      size = new Blob([JSON.stringify(content)]).size
    }
    
    const fileInfo = {
      path: normalizedPath,
      name: normalizedPath.split('/').pop(),
      content,
      size,
      type: options.type || this.getMimeType(normalizedPath),
      createdAt: options.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: options.metadata || {},
    }
    
    this.files.set(normalizedPath, fileInfo)
    
    // 添加到目录
    const dir = this.directories.get(dirPath)
    if (dir && !dir.children.has(normalizedPath)) {
      dir.children.add(normalizedPath)
      await dbOperations.putDirectory({
        path: dirPath,
        name: dir.name,
        parent: dir.parent,
        children: Array.from(dir.children),
        createdAt: dir.createdAt,
      })
    }
    
    // 保存到数据库
    await dbOperations.putFile({
      ...fileInfo,
      children: undefined, // Set 不能序列化
    })
    
    await this.saveState()
    return fileInfo
  }

  // 获取文件 MIME 类型
  getMimeType(path) {
    const ext = path.split('.').pop().toLowerCase()
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

  // 读取文件
  async readFile(path, encoding = 'utf-8') {
    const file = this.getFile(path)
    if (!file) {
      throw new Error(`文件不存在：${path}`)
    }
    return file.content
  }

  // 读取文件为 Blob
  async readFileAsBlob(path) {
    const file = this.getFile(path)
    if (!file) {
      throw new Error(`文件不存在：${path}`)
    }
    
    if (file.content instanceof Blob) {
      return file.content
    }
    
    return new Blob([file.content], { type: file.type })
  }

  // 读取文件为 DataURL
  async readFileAsDataURL(path) {
    const blob = await this.readFileAsBlob(path)
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('读取文件失败'))
      reader.readAsDataURL(blob)
    })
  }

  // 删除文件或目录
  async delete(path, recursive = false) {
    const normalizedPath = this.normalizePath(path)
    
    if (normalizedPath === ROOT_PATH) {
      throw new Error('不能删除根目录')
    }
    
    const isDir = this.directories.has(normalizedPath)
    const isFile = this.files.has(normalizedPath)
    
    if (!isDir && !isFile) {
      throw new Error(`路径不存在：${path}`)
    }
    
    if (isDir) {
      const dir = this.directories.get(normalizedPath)
      if (dir.children.size > 0 && !recursive) {
        throw new Error(`目录非空，请使用递归删除：${path}`)
      }
      
      // 递归删除子项
      for (const childPath of [...dir.children]) {
        await this.delete(childPath, true)
      }
      
      // 从父目录移除
      const parentPath = dir.parent !== undefined ? (dir.parent || ROOT_PATH) : ROOT_PATH
      if (dir.parent !== undefined) {
        const parent = this.directories.get(parentPath)
        if (parent) {
          parent.children.delete(normalizedPath)
          await dbOperations.putDirectory({
            path: parentPath,
            name: parent.name,
            parent: parent.parent,
            children: Array.from(parent.children),
            createdAt: parent.createdAt,
          })
        }
      }
      
      this.directories.delete(normalizedPath)
      await dbOperations.deleteDirectory(normalizedPath)
    }
    
    if (isFile) {
      const file = this.files.get(normalizedPath)
      if (file) {
        const dirPath = normalizedPath.substring(0, normalizedPath.lastIndexOf('/')) || ROOT_PATH
        const dir = this.directories.get(dirPath)
        if (dir) {
          dir.children.delete(normalizedPath)
          await dbOperations.putDirectory({
            path: dirPath,
            name: dir.name,
            parent: dir.parent,
            children: Array.from(dir.children),
            createdAt: dir.createdAt,
          })
        }
      }
      this.files.delete(normalizedPath)
      await dbOperations.deleteFile(normalizedPath)
    }
    
    await this.saveState()
  }

  // 移动/重命名文件或目录
  async move(fromPath, toPath) {
    const fromNormalized = this.normalizePath(fromPath)
    const toNormalized = this.normalizePath(toPath)
    
    if (fromNormalized === ROOT_PATH) {
      throw new Error('不能移动根目录')
    }
    
    if (!this.files.has(fromNormalized) && !this.directories.has(fromNormalized)) {
      throw new Error(`路径不存在：${fromPath}`)
    }
    
    if (this.files.has(toNormalized) || this.directories.has(toNormalized)) {
      throw new Error(`目标路径已存在：${toPath}`)
    }
    
    const isFile = this.files.has(fromNormalized)
    
    if (isFile) {
      const file = this.files.get(fromNormalized)
      const newFile = {
        ...file,
        name: toNormalized.split('/').pop(),
        path: toNormalized,
        updatedAt: new Date().toISOString(),
      }
      this.files.delete(fromNormalized)
      this.files.set(toNormalized, newFile)
      
      // 更新父目录
      const oldDirPath = fromNormalized.substring(0, fromNormalized.lastIndexOf('/')) || ROOT_PATH
      const newDirPath = toNormalized.substring(0, toNormalized.lastIndexOf('/')) || ROOT_PATH
      
      if (oldDirPath !== newDirPath) {
        const oldDir = this.directories.get(oldDirPath)
        const newDir = this.directories.get(newDirPath)
        if (oldDir) {
          oldDir.children.delete(fromNormalized)
          await dbOperations.putDirectory({
            path: oldDirPath,
            name: oldDir.name,
            parent: oldDir.parent,
            children: Array.from(oldDir.children),
            createdAt: oldDir.createdAt,
          })
        }
        if (newDir && !newDir.children.has(toNormalized)) {
          newDir.children.add(toNormalized)
          await dbOperations.putDirectory({
            path: newDirPath,
            name: newDir.name,
            parent: newDir.parent,
            children: Array.from(newDir.children),
            createdAt: newDir.createdAt,
          })
        }
      }
      
      // 保存到数据库
      await dbOperations.putFile({
        ...newFile,
        children: undefined,
      })
      await dbOperations.deleteFile(fromNormalized)
    } else {
      // 移动目录（递归更新所有子路径）
      const oldDir = this.directories.get(fromNormalized)
      
      // 收集所有需要更新的项目
      const itemsToUpdate = []
      const collectItems = (path, isDir) => {
        if (isDir) {
          const dir = this.directories.get(path)
          if (dir) {
            for (const child of dir.children) {
              const childIsDir = this.directories.has(child)
              itemsToUpdate.push({ path: child, isDir: childIsDir })
              if (childIsDir) {
                collectItems(child, true)
              }
            }
          }
        }
      }
      
      itemsToUpdate.push({ path: fromNormalized, isDir: true })
      collectItems(fromNormalized, true)
      
      // 更新所有路径
      for (const { path: oldPath, isDir: itemIsDir } of itemsToUpdate.reverse()) {
        const newPath = toNormalized + oldPath.substring(fromNormalized.length)
        if (itemIsDir) {
          const dir = this.directories.get(oldPath)
          const newDirData = {
            ...dir,
            name: newPath.split('/').pop(),
            parent: newPath.substring(0, newPath.lastIndexOf('/')) || null,
            path: newPath,
          }
          this.directories.delete(oldPath)
          this.directories.set(newPath, {
            ...newDirData,
            children: new Set(dir.children),
          })
          await dbOperations.putDirectory(newDirData)
          await dbOperations.deleteDirectory(oldPath)
        } else {
          const file = this.files.get(oldPath)
          const newFileData = {
            ...file,
            path: newPath,
            updatedAt: new Date().toISOString(),
          }
          this.files.delete(oldPath)
          this.files.set(newPath, newFileData)
          await dbOperations.putFile({
            ...newFileData,
            children: undefined,
          })
          await dbOperations.deleteFile(oldPath)
        }
      }
      
      // 更新父目录引用
      if (oldDir.parent) {
        const parent = this.directories.get(oldDir.parent)
        if (parent) {
          parent.children.delete(fromNormalized)
          parent.children.add(toNormalized)
          await dbOperations.putDirectory({
            path: oldDir.parent,
            name: parent.name,
            parent: parent.parent,
            children: Array.from(parent.children),
            createdAt: parent.createdAt,
          })
        }
      }
    }
    
    await this.saveState()
  }

  // 复制文件/目录
  async copy(fromPath, toPath) {
    const fromNormalized = this.normalizePath(fromPath)
    const toNormalized = this.normalizePath(toPath)
    
    if (fromNormalized === ROOT_PATH) {
      throw new Error('不能复制根目录')
    }
    
    if (!this.files.has(fromNormalized) && !this.directories.has(fromNormalized)) {
      throw new Error(`路径不存在：${fromPath}`)
    }
    
    // 检查目标路径的父目录是否存在
    const toParentPath = toNormalized.substring(0, toNormalized.lastIndexOf('/')) || ROOT_PATH
    if (!this.directories.has(toParentPath)) {
      throw new Error(`目标父目录不存在：${toParentPath}`)
    }
    
    const isFile = this.files.has(fromNormalized)
    
    if (isFile) {
      // 复制文件
      const file = this.files.get(fromNormalized)
      const newFile = {
        ...file,
        name: toNormalized.split('/').pop(),
        path: toNormalized,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      this.files.set(toNormalized, newFile)
      
      // 更新父目录
      const parentDir = this.directories.get(toParentPath)
      if (parentDir && !parentDir.children.has(toNormalized)) {
        parentDir.children.add(toNormalized)
        await dbOperations.putDirectory({
          path: toParentPath,
          name: parentDir.name,
          parent: parentDir.parent,
          children: Array.from(parentDir.children),
          createdAt: parentDir.createdAt,
        })
      }
      
      // 保存到数据库
      await dbOperations.putFile({
        ...newFile,
        children: undefined,
      })
    } else {
      // 复制目录（递归）
      const copyDirectory = async (srcPath, destPath) => {
        const srcDir = this.directories.get(srcPath)
        if (!srcDir) return
        
        // 创建目标目录
        await this.mkdir(destPath, false)
        
        // 递归复制子项
        for (const childPath of srcDir.children) {
          const childName = childPath.split('/').pop()
          const childDestPath = `${destPath}/${childName}`
          
          if (this.directories.has(childPath)) {
            // 子目录
            await copyDirectory(childPath, childDestPath)
          } else if (this.files.has(childPath)) {
            // 子文件
            const file = this.files.get(childPath)
            const newFile = {
              ...file,
              name: childName,
              path: childDestPath,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }
            this.files.set(childDestPath, newFile)
            
            const destDir = this.directories.get(destPath)
            if (destDir && !destDir.children.has(childDestPath)) {
              destDir.children.add(childDestPath)
              await dbOperations.putDirectory({
                path: destPath,
                name: destDir.name,
                parent: destDir.parent,
                children: Array.from(destDir.children),
                createdAt: destDir.createdAt,
              })
            }
            
            await dbOperations.putFile({
              ...newFile,
              children: undefined,
            })
          }
        }
      }
      
      await copyDirectory(fromNormalized, toNormalized)
    }
    
    await this.saveState()
  }

  // 读取文件为 JSON
  async readJSON(path) {
    const content = await this.readFile(path)
    return JSON.parse(content)
  }

  // 写入 JSON 文件
  async writeJSON(path, data, options = {}) {
    return this.writeFile(path, JSON.stringify(data, null, 2), {
      ...options,
      type: 'application/json',
    })
  }

  // 检查路径是否存在
  exists(path) {
    const normalized = this.normalizePath(path)
    return this.files.has(normalized) || this.directories.has(normalized)
  }

  // 检查是否为目录
  isDirectory(path) {
    return this.directories.has(this.normalizePath(path))
  }

  // 检查是否为文件
  isFile(path) {
    return this.files.has(this.normalizePath(path))
  }

  // 切换当前目录
  cd(path) {
    const dir = this.getDirectory(path)
    if (!dir) {
      throw new Error(`目录不存在：${path}`)
    }
    this.currentPath = this.normalizePath(path)
    return this.currentPath
  }

  // 获取当前路径
  pwd() {
    return this.currentPath
  }

  // 搜索文件
  search(pattern, options = {}) {
    const results = []
    const regex = typeof pattern === 'string' 
      ? new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      : pattern
    
    for (const [path, file] of this.files) {
      if (regex.test(file.name) || regex.test(path)) {
        results.push({
          name: file.name,
          path,
          isDirectory: false,
          isFile: true,
          size: file.size,
          type: file.type,
          updatedAt: file.updatedAt,
          metadata: file.metadata,
        })
      }
    }
    
    if (options.includeDirectories) {
      for (const [path, dir] of this.directories) {
        if (path !== ROOT_PATH && regex.test(dir.name)) {
          results.push({
            name: dir.name,
            path,
            isDirectory: true,
            isFile: false,
          })
        }
      }
    }
    
    return results
  }

  // 按类型搜索文件
  searchByType(typePattern, options = {}) {
    const results = []
    const regex = typeof typePattern === 'string' 
      ? new RegExp(typePattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      : typePattern
    
    for (const [path, file] of this.files) {
      if (regex.test(file.type) || regex.test(file.name.split('.').pop())) {
        results.push({
          name: file.name,
          path,
          isDirectory: false,
          isFile: true,
          size: file.size,
          type: file.type,
          updatedAt: file.updatedAt,
          metadata: file.metadata,
        })
      }
    }
    
    return results
  }

  // 搜索视频文件
  searchVideos() {
    return this.searchByType(/video\/|\.mp4$|\.mov$|\.avi$|\.mkv$|\.webm$/i)
  }

  // 搜索音频文件
  searchAudio() {
    return this.searchByType(/audio\/|\.mp3$|\.wav$|\.m4a$/i)
  }

  // 搜索字幕文件
  searchSubtitles() {
    return this.searchByType(/\.srt$|\.vtt$|\.ass$|\.ssa$/i)
  }

  // 搜索 JSON 文件
  searchJSON() {
    return this.searchByType(/\.json$/i)
  }

  // 获取存储空间使用情况
  async getStorageInfo() {
    let totalSize = 0
    let fileCount = 0
    
    for (const file of this.files.values()) {
      totalSize += file.size
      fileCount++
    }
    
    // 尝试获取 IndexedDB 配额
    let quota = null
    let usage = null
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate()
      quota = estimate.quota
      usage = estimate.usage
    }
    
    return {
      totalSize,
      fileCount,
      quota,
      usage,
      available: quota !== null ? quota - (usage || 0) : null,
    }
  }

  // 保存状态到 IndexedDB
  async saveState() {
    try {
      // 保存当前路径
      await dbOperations.setMetadata('currentPath', this.currentPath)
      
      // 保存历史记录
      this.history = this.history.slice(0, this.historyIndex + 1)
      this.history.push(JSON.stringify({
        files: Array.from(this.files.entries()).map(([path, file]) => ({
          ...file,
          children: undefined,
        })),
        directories: Array.from(this.directories.entries()).map(([path, dir]) => ({
          path,
          name: dir.name,
          parent: dir.parent,
          children: Array.from(dir.children),
          createdAt: dir.createdAt,
        })),
        currentPath: this.currentPath,
      }))
      this.historyIndex++
      
      // 限制历史记录长度
      if (this.history.length > 50) {
        this.history.shift()
        this.historyIndex--
      }
      
      // 保存元数据
      await dbOperations.setMetadata('history', this.history)
      await dbOperations.setMetadata('historyIndex', this.historyIndex)
    } catch (e) {
      console.warn('保存文件系统状态失败:', e)
    }
  }

  // 从 IndexedDB 加载状态
  async loadState() {
    try {
      const history = await dbOperations.getMetadata('history')
      const historyIndex = await dbOperations.getMetadata('historyIndex')
      
      if (history && history.length > 0) {
        this.history = history
        this.historyIndex = historyIndex || 0
        
        // 恢复最新状态
        if (this.history[this.historyIndex]) {
          const state = JSON.parse(this.history[this.historyIndex])
          this.files = new Map(
            state.files.map(([path, file]) => [
              path,
              { ...file, children: file.children ? new Set(file.children) : undefined },
            ])
          )
          this.directories = new Map(
            state.directories.map(([path, dir]) => [
              path,
              { ...dir, children: new Set(dir.children) },
            ])
          )
          this.currentPath = state.currentPath || ROOT_PATH
        }
        return true
      }
      return false
    } catch (e) {
      console.warn('加载文件系统状态失败:', e)
      return false
    }
  }

  // 撤销
  async undo() {
    if (this.historyIndex > 0) {
      this.historyIndex--
      await this.restoreState(this.history[this.historyIndex])
      return true
    }
    return false
  }

  // 重做
  async redo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++
      await this.restoreState(this.history[this.historyIndex])
      return true
    }
    return false
  }

  // 恢复状态
  async restoreState(stateStr) {
    try {
      const state = JSON.parse(stateStr)
      this.files = new Map(
        state.files.map(([path, file]) => [
          path,
          { ...file, children: file.children ? new Set(file.children) : undefined },
        ])
      )
      this.directories = new Map(
        state.directories.map(([path, dir]) => [
          path,
          { ...dir, children: new Set(dir.children) },
        ])
      )
      this.currentPath = state.currentPath || ROOT_PATH
      
      // 同步到数据库
      for (const [path, file] of this.files) {
        await dbOperations.putFile({
          ...file,
          children: undefined,
        })
      }
      for (const [path, dir] of this.directories) {
        await dbOperations.putDirectory({
          path,
          name: dir.name,
          parent: dir.parent,
          children: Array.from(dir.children),
          createdAt: dir.createdAt,
        })
      }
      await dbOperations.setMetadata('currentPath', this.currentPath)
    } catch (e) {
      console.error('恢复状态失败:', e)
    }
  }

  // 导出整个文件系统
  async export() {
    return {
      files: Array.from(this.files.entries()).map(([path, file]) => ({
        ...file,
        children: undefined,
      })),
      directories: Array.from(this.directories.entries()).map(([path, dir]) => ({
        path,
        name: dir.name,
        parent: dir.parent,
        children: Array.from(dir.children),
        createdAt: dir.createdAt,
      })),
    }
  }

  // 导入文件系统
  async import(data) {
    this.files = new Map(
      (data.files || []).map(file => [
        file.path,
        { ...file, children: file.children ? new Set(file.children) : undefined },
      ])
    )
    this.directories = new Map(
      (data.directories || []).map(dir => [
        dir.path,
        { ...dir, children: new Set(dir.children || []) },
      ])
    )
    this.currentPath = ROOT_PATH
    
    // 保存到数据库
    for (const [path, file] of this.files) {
      await dbOperations.putFile({
        ...file,
        children: undefined,
      })
    }
    for (const [path, dir] of this.directories) {
      await dbOperations.putDirectory({
        path,
        name: dir.name,
        parent: dir.parent,
        children: Array.from(dir.children),
        createdAt: dir.createdAt,
      })
    }
    
    await this.saveState()
  }

  // 清空文件系统
  async clear() {
    this.files.clear()
    this.directories.clear()
    this.directories.set(ROOT_PATH, { name: 'root', parent: null, children: new Set() })
    this.currentPath = ROOT_PATH
    this.history = []
    this.historyIndex = -1
    
    // 清空数据库
    const db = await openDB()
    
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_FILES, 'readwrite')
      const store = tx.objectStore(STORE_FILES)
      const request = store.clear()
      request.onsuccess = () => resolve()
      request.onerror = () => reject()
    })
    
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_DIRECTORIES, 'readwrite')
      const store = tx.objectStore(STORE_DIRECTORIES)
      const request = store.clear()
      request.onsuccess = () => resolve()
      request.onerror = () => reject()
    })
    
    await this.createDefaultStructure()
  }

  // 创建视频项目
  async createVideoProject(projectName, config = {}) {
    // 与 Electron 实体文件系统保持一致：项目直接位于根目录。
    const projectPath = `/${projectName}`
    
    // 只创建项目根目录；文案、场景素材和成片目录在首次使用时按需创建。
    await this.mkdir(projectPath, true)
    
    return projectPath
  }

  // 获取视频项目列表
  async getVideoProjects() {
    const projects = []
    const seenPaths = new Set()
    const now = new Date().toISOString()

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

    const collectProject = (childPath, isRootDirectory) => {
      if (seenPaths.has(childPath) || !this.directories.has(childPath)) return
      const name = childPath.split('/').pop()
      if (isRootDirectory && PROJECT_DISCOVERY_EXCLUDED_FOLDERS.includes(name)) return

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

    // 根目录下的文件夹就是项目。
    const rootDir = this.getDirectory('/')
    if (rootDir) {
      for (const childPath of rootDir.children) {
        collectProject(childPath, true)
      }
    }
    
    return projects.sort((a, b) => 
      new Date(b.updatedAt) - new Date(a.updatedAt)
    )
  }
}

// =====================================================
// Electron VFS 客户端 - 通过 IPC 与 Electron 主进程通信
// =====================================================
class ElectronVFSClient {
  constructor() {
    this.isElectron = typeof window !== 'undefined' && window.electronAPI
    this.currentPath = '/'
  }

  // 检查是否在 Electron 环境中
  isAvailable() {
    return this.isElectron
  }

  // 列出目录
  async listDirectory(path = this.currentPath) {
    if (!this.isElectron) throw new Error('Electron API 不可用')
    const items = await window.electronAPI.listDirectory(path)
    return items.map(item => ({
      ...item,
      isDirectory: item.isDirectory,
      isFile: item.isFile,
    }))
  }

  // 创建目录
  async mkdir(path, recursive = false) {
    if (!this.isElectron) throw new Error('Electron API 不可用')
    return await window.electronAPI.mkdir(path, recursive)
  }

  // 读取文件
  async readFile(path, encoding = 'utf-8') {
    if (!this.isElectron) throw new Error('Electron API 不可用')
    return await window.electronAPI.readFile(path, encoding)
  }

  // 读取文件为 Blob
  async readFileAsBlob(path) {
    if (!this.isElectron) throw new Error('Electron API 不可用')
    const buffer = await window.electronAPI.readFileAsBuffer(path)
    const uint8Array = new Uint8Array(buffer)
    const file = await this.getFile(path)
    return new Blob([uint8Array], { type: file?.type || 'application/octet-stream' })
  }

  // 读取文件为 DataURL
  async readFileAsDataURL(path) {
    const blob = await this.readFileAsBlob(path)
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('读取文件失败'))
      reader.readAsDataURL(blob)
    })
  }

  // 写入文件
  async writeFile(path, content, options = {}) {
    if (!this.isElectron) throw new Error('Electron API 不可用')
    return await window.electronAPI.writeFile(path, content, options)
  }

  // 删除文件/目录
  async delete(path, recursive = false) {
    if (!this.isElectron) throw new Error('Electron API 不可用')
    return await window.electronAPI.delete(path, recursive)
  }

  // 移动/重命名
  async move(fromPath, toPath) {
    if (!this.isElectron) throw new Error('Electron API 不可用')
    return await window.electronAPI.move(fromPath, toPath)
  }

  // 复制文件
  async copy(fromPath, toPath) {
    if (!this.isElectron) throw new Error('Electron API 不可用')
    return await window.electronAPI.copy(fromPath, toPath)
  }

  // 获取文件信息
  async getFile(path) {
    if (!this.isElectron) throw new Error('Electron API 不可用')
    return await window.electronAPI.getFile(path)
  }

  // 检查路径是否存在
  async exists(path) {
    if (!this.isElectron) throw new Error('Electron API 不可用')
    return await window.electronAPI.exists(path)
  }

  // 检查是否为目录
  async isDirectory(path) {
    if (!this.isElectron) throw new Error('Electron API 不可用')
    return await window.electronAPI.isDirectory(path)
  }

  // 检查是否为文件
  async isFile(path) {
    if (!this.isElectron) throw new Error('Electron API 不可用')
    return await window.electronAPI.isFile(path)
  }

  // 读取 JSON
  async readJSON(path) {
    if (!this.isElectron) throw new Error('Electron API 不可用')
    return await window.electronAPI.readJSON(path)
  }

  // 写入 JSON
  async writeJSON(path, data, options = {}) {
    if (!this.isElectron) throw new Error('Electron API 不可用')
    return await window.electronAPI.writeJSON(path, data, options)
  }

  // 切换当前目录
  cd(path) {
    this.currentPath = path
    return this.currentPath
  }

  // 获取当前路径
  pwd() {
    return this.currentPath
  }

  // 搜索文件
  async search(pattern, options = {}) {
    if (!this.isElectron) throw new Error('Electron API 不可用')
    return await window.electronAPI.search(pattern, options)
  }

  // 按类型搜索
  async searchByType(type, options = {}) {
    if (!this.isElectron) throw new Error('Electron API 不可用')
    return await window.electronAPI.searchByType(type, options)
  }

  // 搜索视频
  async searchVideos(options = {}) {
    if (!this.isElectron) throw new Error('Electron API 不可用')
    return await window.electronAPI.searchVideos(options)
  }

  // 搜索音频
  async searchAudio(options = {}) {
    if (!this.isElectron) throw new Error('Electron API 不可用')
    return await window.electronAPI.searchAudio(options)
  }

  // 搜索字幕
  async searchSubtitles(options = {}) {
    if (!this.isElectron) throw new Error('Electron API 不可用')
    return await window.electronAPI.searchSubtitles(options)
  }

  // 搜索 JSON
  async searchJSON(options = {}) {
    if (!this.isElectron) throw new Error('Electron API 不可用')
    return await window.electronAPI.searchJSON(options)
  }

  // 获取存储信息
  async getStorageInfo() {
    if (!this.isElectron) throw new Error('Electron API 不可用')
    return await window.electronAPI.getStorageInfo()
  }

  // 创建视频项目
  async createVideoProject(projectName, config = {}) {
    if (!this.isElectron) throw new Error('Electron API 不可用')
    return await window.electronAPI.createVideoProject(projectName, config)
  }

  // 获取视频项目列表
  async getVideoProjects() {
    if (!this.isElectron) throw new Error('Electron API 不可用')
    return await window.electronAPI.getVideoProjects()
  }
}

// =====================================================
// 混合文件系统 - 优先使用 Electron VFS，回退到 IndexedDB
// =====================================================
class HybridVirtualFileSystem extends VirtualFileSystem {
  constructor() {
    super()
    this.electronClient = new ElectronVFSClient()
    this.useElectron = false
    this.initialized = false
  }

  async init() {
    // 检测 Electron 环境
    if (this.electronClient.isAvailable()) {
      this.useElectron = true
      console.log('[VFS] 使用 Electron 虚拟文件系统')
      this.initialized = true
      return true
    } else {
      console.log('[VFS] Electron 不可用，使用 IndexedDB 虚拟文件系统')
      // 回退到 IndexedDB 实现
      return await super.init()
    }
  }

  // 代理所有方法到 Electron 客户端或 IndexedDB 实现
  async listDirectory(path) {
    if (this.useElectron) {
      return await this.electronClient.listDirectory(path)
    }
    return super.listDirectory(path)
  }

  async mkdir(path, recursive = false) {
    if (this.useElectron) {
      return await this.electronClient.mkdir(path, recursive)
    }
    return await super.mkdir(path, recursive)
  }

  async readFile(path, encoding = 'utf-8') {
    if (this.useElectron) {
      return await this.electronClient.readFile(path, encoding)
    }
    return await super.readFile(path, encoding)
  }

  async readFileAsBlob(path) {
    if (this.useElectron) {
      return await this.electronClient.readFileAsBlob(path)
    }
    return await super.readFileAsBlob(path)
  }

  async readFileAsDataURL(path) {
    if (this.useElectron) {
      return await this.electronClient.readFileAsDataURL(path)
    }
    return await super.readFileAsDataURL(path)
  }

  async writeFile(path, content, options = {}) {
    if (this.useElectron) {
      return await this.electronClient.writeFile(path, content, options)
    }
    return await super.writeFile(path, content, options)
  }

  async delete(path, recursive = false) {
    if (this.useElectron) {
      return await this.electronClient.delete(path, recursive)
    }
    return await super.delete(path, recursive)
  }

  async move(fromPath, toPath) {
    if (this.useElectron) {
      return await this.electronClient.move(fromPath, toPath)
    }
    return await super.move(fromPath, toPath)
  }

  async copy(fromPath, toPath) {
    if (this.useElectron) {
      return await this.electronClient.copy(fromPath, toPath)
    }
    return await super.copy(fromPath, toPath)
  }

  async getFile(path) {
    if (this.useElectron) {
      return await this.electronClient.getFile(path)
    }
    return super.getFile(path)
  }

  async exists(path) {
    if (this.useElectron) {
      return await this.electronClient.exists(path)
    }
    return super.exists(path)
  }

  async isDirectory(path) {
    if (this.useElectron) {
      return await this.electronClient.isDirectory(path)
    }
    return super.isDirectory(path)
  }

  async isFile(path) {
    if (this.useElectron) {
      return await this.electronClient.isFile(path)
    }
    return super.isFile(path)
  }

  async readJSON(path) {
    if (this.useElectron) {
      return await this.electronClient.readJSON(path)
    }
    return await super.readJSON(path)
  }

  async writeJSON(path, data, options = {}) {
    if (this.useElectron) {
      return await this.electronClient.writeJSON(path, data, options)
    }
    return await super.writeJSON(path, data, options)
  }

  cd(path) {
    if (this.useElectron) {
      return this.electronClient.cd(path)
    }
    return super.cd(path)
  }

  pwd() {
    if (this.useElectron) {
      return this.electronClient.pwd()
    }
    return super.pwd()
  }

  async search(pattern, options = {}) {
    if (this.useElectron) {
      return await this.electronClient.search(pattern, options)
    }
    return super.search(pattern, options)
  }

  async searchByType(type, options = {}) {
    if (this.useElectron) {
      return await this.electronClient.searchByType(type, options)
    }
    return super.searchByType(type, options)
  }

  async searchVideos(options = {}) {
    if (this.useElectron) {
      return await this.electronClient.searchVideos(options)
    }
    return super.searchVideos(options)
  }

  async searchAudio(options = {}) {
    if (this.useElectron) {
      return await this.electronClient.searchAudio(options)
    }
    return super.searchAudio(options)
  }

  async searchSubtitles(options = {}) {
    if (this.useElectron) {
      return await this.electronClient.searchSubtitles(options)
    }
    return super.searchSubtitles(options)
  }

  async searchJSON(options = {}) {
    if (this.useElectron) {
      return await this.electronClient.searchJSON(options)
    }
    return super.searchJSON(options)
  }

  async getStorageInfo() {
    if (this.useElectron) {
      return await this.electronClient.getStorageInfo()
    }
    return await super.getStorageInfo()
  }

  async createVideoProject(projectName, config = {}) {
    if (this.useElectron) {
      return await this.electronClient.createVideoProject(projectName, config)
    }
    return await super.createVideoProject(projectName, config)
  }

  async getVideoProjects() {
    if (this.useElectron) {
      return await this.electronClient.getVideoProjects()
    }
    return await super.getVideoProjects()
  }

  // 获取当前模式
  getMode() {
    return this.useElectron ? 'electron' : 'indexeddb'
  }
}

// =====================================================
// 创建默认的文件系统实例
// =====================================================
export async function createDefaultFileSystem() {
  const vfs = new HybridVirtualFileSystem()
  await vfs.init()
  return vfs
}

// =====================================================
// 创建共享的文件系统实例（单例）
// =====================================================
let sharedVFS = null

export async function getSharedFileSystem() {
  if (!sharedVFS) {
    sharedVFS = new HybridVirtualFileSystem()
    await sharedVFS.init()
  }
  return sharedVFS
}

export default HybridVirtualFileSystem
