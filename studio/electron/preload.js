/**
 * RJCut Studio - Electron Preload 脚本
 * 
 * 功能：
 * 1. 在渲染进程和主进程之间建立安全的通信桥梁
 * 2. 暴露文件系统 API 给渲染进程使用
 * 3. 使用 contextBridge 确保安全性
 */

const { contextBridge, ipcRenderer } = require('electron')

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // ==================== 文件系统操作 ====================
  
  // 列出目录
  listDirectory: (dirPath) => ipcRenderer.invoke('fs:listDirectory', dirPath),
  
  // 创建目录
  mkdir: (dirPath, recursive = false) => ipcRenderer.invoke('fs:mkdir', dirPath, recursive),
  
  // 读取文件
  readFile: (filePath, encoding = 'utf-8') => ipcRenderer.invoke('fs:readFile', filePath, encoding),
  
  // 读取文件为 Buffer
  readFileAsBuffer: (filePath) => ipcRenderer.invoke('fs:readFileAsBuffer', filePath),
  
  // 读取 JSON
  readJSON: (filePath) => ipcRenderer.invoke('fs:readJSON', filePath),
  
  // 写入文件
  writeFile: (filePath, content, options = {}) => ipcRenderer.invoke('fs:writeFile', filePath, content, options),
  
  // 写入 JSON
  writeJSON: (filePath, data, options = {}) => ipcRenderer.invoke('fs:writeJSON', filePath, data, options),
  
  // 删除文件/目录
  delete: (targetPath, recursive = false) => ipcRenderer.invoke('fs:delete', targetPath, recursive),
  
  // 移动/重命名
  move: (fromPath, toPath) => ipcRenderer.invoke('fs:move', fromPath, toPath),
  
  // 复制文件
  copy: (fromPath, toPath) => ipcRenderer.invoke('fs:copy', fromPath, toPath),
  
  // 获取文件信息
  getFile: (filePath) => ipcRenderer.invoke('fs:getFile', filePath),
  
  // 检查路径是否存在
  exists: (targetPath) => ipcRenderer.invoke('fs:exists', targetPath),
  
  // 检查是否为目录
  isDirectory: (dirPath) => ipcRenderer.invoke('fs:isDirectory', dirPath),
  
  // 检查是否为文件
  isFile: (filePath) => ipcRenderer.invoke('fs:isFile', filePath),
  
  // 搜索文件
  search: (pattern, options = {}) => ipcRenderer.invoke('fs:search', pattern, options),
  
  // 按类型搜索
  searchByType: (type, options = {}) => ipcRenderer.invoke('fs:searchByType', type, options),
  
  // 搜索视频
  searchVideos: (options = {}) => ipcRenderer.invoke('fs:searchVideos', options),
  
  // 搜索音频
  searchAudio: (options = {}) => ipcRenderer.invoke('fs:searchAudio', options),
  
  // 搜索字幕
  searchSubtitles: (options = {}) => ipcRenderer.invoke('fs:searchSubtitles', options),
  
  // 搜索 JSON
  searchJSON: (options = {}) => ipcRenderer.invoke('fs:searchJSON', options),
  
  // 获取存储信息
  getStorageInfo: () => ipcRenderer.invoke('fs:getStorageInfo'),
  
  // ==================== 项目操作 ====================
  
  // 创建视频项目
  createVideoProject: (projectName, config = {}) => ipcRenderer.invoke('fs:createVideoProject', projectName, config),
  
  // 获取视频项目列表
  getVideoProjects: () => ipcRenderer.invoke('fs:getVideoProjects'),
  
  // 创建目录（别名，兼容 createDirectory 调用）
  createDirectory: (path, recursive = false) => ipcRenderer.invoke('fs:mkdir', path, recursive),
  
  // ==================== 对话框操作 ====================
  
  // 打开文件选择对话框
  openFile: (options = {}) => ipcRenderer.invoke('dialog:openFile', options),
  
  // 打开目录选择对话框
  openDirectory: (options = {}) => ipcRenderer.invoke('dialog:openDirectory', options),
  
  // 保存文件对话框
  saveFile: (options = {}) => ipcRenderer.invoke('dialog:saveFile', options),
  
  // 显示消息对话框
  showMessageBox: (options = {}) => ipcRenderer.invoke('dialog:showMessageBox', options),
  
  // ==================== 系统操作 ====================
  
  // 获取允许的根目录
  getAllowedRoots: () => ipcRenderer.invoke('system:getAllowedRoots'),
  
  // 设置允许的根目录
  setAllowedRoots: (roots) => ipcRenderer.invoke('system:setAllowedRoots', roots),
  
  // 获取应用路径
  getPath: (name) => ipcRenderer.invoke('system:getPath', name),
  
  // 在文件管理器中显示
  showInFolder: (filePath) => ipcRenderer.invoke('system:showInFolder', filePath),
  
  // 用默认应用打开文件
  openFile: (filePath) => ipcRenderer.invoke('system:openFile', filePath),
  
  // ==================== MCP 服务器操作 ====================
  
  // 启动 MCP 服务器
  mcpStart: (port) => ipcRenderer.invoke('mcp:start', port),
  
  // 停止 MCP 服务器
  mcpStop: () => ipcRenderer.invoke('mcp:stop'),
  
  // 获取 MCP 服务器状态
  mcpGetStatus: () => ipcRenderer.invoke('mcp:getStatus'),
  
  // ==================== 平台信息 ====================
  
  // 获取平台信息
  platform: process.platform,
  
  // 是否为开发模式
  isDev: process.env.NODE_ENV === 'development',
})

// 日志
console.log('[Preload] Electron API 已注入到 window.electronAPI')