/**
 * RJCut Studio - Electron 主进程
 * 
 * 功能：
 * 1. 创建浏览器窗口
 * 2. 提供 IPC 通信访问本地文件系统
 * 3. 完全脱离浏览器沙盒限制
 */

const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')
const fsUtils = require('./fs-utils')
const { ElectronMCPServer } = require('./mcp-server')

// 1. 注册特权协议 (必须在 app ready 之前调用)
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true, corsEnabled: true } }
])

// 保持 window 对象的全局引用
let mainWindow = null

// 允许的根目录（安全限制）
let allowedRoots = []

// MCP 服务器实例
let mcpServer = null

/**
 * 创建主窗口
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false, // 生产环境中加载本地 file:// 可能遇到跨域问题，建议关闭 webSecurity
    },
    icon: path.join(__dirname, '../public/icon.png'),
    titleBarStyle: 'hiddenInset',
    show: false,
    backgroundColor: '#f8fafc',
  })

  // 判断是否为打包后的环境
  const isPackaged = app.isPackaged || process.env.NODE_ENV === 'production';
  
  if (!isPackaged) {
    // 开发模式：加载 localhost
    mainWindow.loadURL('http://localhost:3000')
    mainWindow.webContents.openDevTools()
  } else {
    // 生产模式（exe）：使用我们自定义的 app:// 协议加载
    mainWindow.loadURL('app://localhost/index.html')
  }

  // 窗口准备好后再显示
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  // 关闭窗口
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // 阻止新窗口打开（所有链接都在浏览器中打开）
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}


/**
 * 注册 IPC 处理器
 */
function registerIPCHandlers() {
  // ==================== 文件系统操作 ====================
  
  // 列出目录（如果不存在则自动创建）
  ipcMain.handle('fs:listDirectory', async (event, dirPath) => {
    return fsUtils.listDirectory(dirPath)
  })

  // 创建目录
  ipcMain.handle('fs:mkdir', async (event, dirPath, recursive = false) => {
    return fsUtils.mkdir(dirPath, recursive)
  })

  // 读取文件
  ipcMain.handle('fs:readFile', async (event, filePath, encoding = 'utf-8') => {
    return fsUtils.readFile(filePath, encoding)
  })

  // 读取文件为 Buffer（用于视频/图片等二进制文件）
  ipcMain.handle('fs:readFileAsBuffer', async (event, filePath) => {
    return fsUtils.readFileAsBuffer(filePath)
  })

  // 读取 JSON
  ipcMain.handle('fs:readJSON', async (event, filePath) => {
    return fsUtils.readJSON(filePath)
  })

  // 写入文件
  ipcMain.handle('fs:writeFile', async (event, filePath, content, options = {}) => {
    return fsUtils.writeFile(filePath, content, options)
  })

  // 写入 JSON
  ipcMain.handle('fs:writeJSON', async (event, filePath, data, options = {}) => {
    return fsUtils.writeJSON(filePath, data, options)
  })

  // 删除文件/目录
  ipcMain.handle('fs:delete', async (event, targetPath, recursive = false) => {
    return fsUtils.deleteFile(targetPath, recursive)
  })

  // 移动/重命名
  ipcMain.handle('fs:move', async (event, fromPath, toPath) => {
    return fsUtils.moveFile(fromPath, toPath)
  })

  // 复制文件
  ipcMain.handle('fs:copy', async (event, fromPath, toPath) => {
    return fsUtils.copyFile(fromPath, toPath)
  })

  // 获取文件信息
  ipcMain.handle('fs:getFile', async (event, filePath) => {
    return fsUtils.getFile(filePath)
  })

  // 检查路径是否存在
  ipcMain.handle('fs:exists', async (event, targetPath) => {
    return fsUtils.exists(targetPath)
  })

  // 检查是否为目录
  ipcMain.handle('fs:isDirectory', async (event, dirPath) => {
    return fsUtils.isDirectory(dirPath)
  })

  // 检查是否为文件
  ipcMain.handle('fs:isFile', async (event, filePath) => {
    return fsUtils.isFile(filePath)
  })

  // 搜索文件
  ipcMain.handle('fs:search', async (event, pattern, options = {}) => {
    return fsUtils.search(pattern, options)
  })

  // 按类型搜索
  ipcMain.handle('fs:searchByType', async (event, type, options = {}) => {
    return fsUtils.searchByType(type, options)
  })

  // 搜索视频
  ipcMain.handle('fs:searchVideos', async (event, options = {}) => {
    return fsUtils.searchVideos(options)
  })

  // 搜索音频
  ipcMain.handle('fs:searchAudio', async (event, options = {}) => {
    return fsUtils.searchAudio(options)
  })

  // 搜索字幕
  ipcMain.handle('fs:searchSubtitles', async (event, options = {}) => {
    return fsUtils.searchSubtitles(options)
  })

  // 搜索 JSON
  ipcMain.handle('fs:searchJSON', async (event, options = {}) => {
    return fsUtils.searchJSON(options)
  })

  // 获取存储信息
  ipcMain.handle('fs:getStorageInfo', async () => {
    return fsUtils.getStorageInfo()
  })

  // ==================== 项目操作 ====================
  
  // 创建视频项目
  ipcMain.handle('fs:createVideoProject', async (event, projectName, config = {}) => {
    return fsUtils.createVideoProject(projectName, config)
  })

  // 获取视频项目列表
  ipcMain.handle('fs:getVideoProjects', async () => {
    return fsUtils.getVideoProjects()
  })

  // ==================== 外部文件导入 ====================
  
  // 分析外部文件夹
  ipcMain.handle('fs:analyzeExternalFolder', async (event, externalPath) => {
    return fsUtils.analyzeExternalFolder(externalPath)
  })

  // 导入外部文件夹到 VFS
  ipcMain.handle('fs:importExternalFolder', async (event, externalPath, vfsTargetPath, options = {}) => {
    return fsUtils.importExternalFolder(externalPath, vfsTargetPath, options)
  })

  // 智能组织外部文件到项目
  ipcMain.handle('fs:smartOrganizeToProject', async (event, externalPath, projectPath, options = {}) => {
    return fsUtils.smartOrganizeToProject(externalPath, projectPath, options)
  })

  // ==================== 对话框操作 ====================
  
  // 打开文件选择对话框
  ipcMain.handle('dialog:openFile', async (event, options = {}) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: options.filters || [
        { name: '视频文件', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm'] },
        { name: '所有文件', extensions: ['*'] },
      ],
      ...options,
    })
    
    if (result.canceled) {
      return null
    }
    
    return result.filePaths[0]
  })

  // 打开目录选择对话框
  ipcMain.handle('dialog:openDirectory', async (event, options = {}) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      ...options,
    })
    
    if (result.canceled) {
      return null
    }
    
    return result.filePaths[0]
  })

  // 保存文件对话框
  ipcMain.handle('dialog:saveFile', async (event, options = {}) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      filters: options.filters || [
        { name: '所有文件', extensions: ['*'] },
      ],
      ...options,
    })
    
    if (result.canceled) {
      return null
    }
    
    return result.filePath
  })

  // 显示消息对话框
  ipcMain.handle('dialog:showMessageBox', async (event, options = {}) => {
    const result = await dialog.showMessageBox(mainWindow, {
      type: options.type || 'info',
      title: options.title,
      message: options.message,
      detail: options.detail,
      buttons: options.buttons || ['确定'],
      ...options,
    })
    
    return result.response
  })

  // ==================== 系统操作 ====================
  
  // 获取允许根目录
  ipcMain.handle('system:getAllowedRoots', async () => {
    return allowedRoots
  })

  // 设置允许根目录
  ipcMain.handle('system:setAllowedRoots', async (event, roots) => {
    allowedRoots = roots.map(r => path.normalize(r))
    fsUtils.setAllowedRoots(allowedRoots)
    return allowedRoots
  })

  // ==================== MCP 服务器操作 ====================
  
  // 启动 MCP 服务器
  ipcMain.handle('mcp:start', async (event, port = 8001) => {
    try {
      if (mcpServer && mcpServer.running) {
        await mcpServer.stop()
      }
      
      mcpServer = new ElectronMCPServer()
      
      // 注册文件系统工具
      mcpServer.registerTool({
        name: 'fs_list',
        description: '列出目录内容',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '目录路径' }
          },
          required: ['path']
        },
        handler: async ({ path: dirPath }) => {
          const items = await ipcMain.handlers['fs:listDirectory'](null, dirPath)
          return items.map(item => `${item.isDirectory ? '📁' : '📄'} ${item.name}`).join('\n')
        }
      })
      
      mcpServer.registerTool({
        name: 'fs_read',
        description: '读取文件内容',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '文件路径' }
          },
          required: ['path']
        },
        handler: async ({ path: filePath }) => {
          return await ipcMain.handlers['fs:readFile'](null, filePath, 'utf-8')
        }
      })
      
      mcpServer.registerTool({
        name: 'fs_write',
        description: '写入文件内容',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '文件路径' },
            content: { type: 'string', description: '文件内容' }
          },
          required: ['path', 'content']
        },
        handler: async ({ path: filePath, content }) => {
          await ipcMain.handlers['fs:writeFile'](null, filePath, content)
          return `✅ 文件已写入：${filePath}`
        }
      })
      
      mcpServer.registerTool({
        name: 'fs_delete',
        description: '删除文件或目录',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '文件/目录路径' },
            recursive: { type: 'boolean', description: '是否递归删除', default: false }
          },
          required: ['path']
        },
        handler: async ({ path: targetPath, recursive = false }) => {
          await ipcMain.handlers['fs:delete'](null, targetPath, recursive)
          return `✅ 已删除：${targetPath}`
        }
      })
      
      mcpServer.registerTool({
        name: 'fs_move',
        description: '移动/重命名文件',
        inputSchema: {
          type: 'object',
          properties: {
            from: { type: 'string', description: '源路径' },
            to: { type: 'string', description: '目标路径' }
          },
          required: ['from', 'to']
        },
        handler: async ({ from: fromPath, to: toPath }) => {
          await ipcMain.handlers['fs:move'](null, fromPath, toPath)
          return `✅ 已移动：${fromPath} -> ${toPath}`
        }
      })
      
      mcpServer.registerTool({
        name: 'fs_copy',
        description: '复制文件',
        inputSchema: {
          type: 'object',
          properties: {
            from: { type: 'string', description: '源路径' },
            to: { type: 'string', description: '目标路径' }
          },
          required: ['from', 'to']
        },
        handler: async ({ from: fromPath, to: toPath }) => {
          await ipcMain.handlers['fs:copy'](null, fromPath, toPath)
          return `✅ 已复制：${fromPath} -> ${toPath}`
        }
      })
      
      mcpServer.registerTool({
        name: 'project_list',
        description: '列出所有视频项目',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        },
        handler: async () => {
          const projects = await ipcMain.handlers['fs:getVideoProjects'](null)
          if (projects.length === 0) return '📂 当前没有任何项目'
          return projects.map((p, i) => `${i + 1}. **${p.name}** - ${p.path}`).join('\n')
        }
      })
      
      mcpServer.registerTool({
        name: 'project_create',
        description: '创建新的视频项目',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '项目名称' },
            config: { type: 'object', description: '项目配置 (可选)' }
          },
          required: ['name']
        },
        handler: async ({ name: projectName, config }) => {
          const projectPath = await ipcMain.handlers['fs:createVideoProject'](null, projectName, config || {})
          return `✅ 项目已创建：${projectName}\n路径：${projectPath}`
        }
      })
      
      await mcpServer.start(port)
      
      return { success: true, port, status: mcpServer.getStatus() }
    } catch (error) {
      console.error('[IPC] mcp:start error:', error)
      throw error
    }
  })

  // 停止 MCP 服务器
  ipcMain.handle('mcp:stop', async () => {
    try {
      if (mcpServer) {
        await mcpServer.stop()
        mcpServer = null
        return { success: true }
      }
      return { success: false, message: 'MCP 服务器未运行' }
    } catch (error) {
      console.error('[IPC] mcp:stop error:', error)
      throw error
    }
  })

  // 获取 MCP 服务器状态
  ipcMain.handle('mcp:getStatus', async () => {
    if (mcpServer) {
      return {
        running: mcpServer.running,
        status: mcpServer.getStatus(),
        tools: mcpServer.getRegisteredTools(),
        resources: mcpServer.getRegisteredResources(),
        prompts: mcpServer.getRegisteredPrompts()
      }
    }
    return { running: false }
  })

  // 获取应用路径
  ipcMain.handle('system:getPath', async (event, name) => {
    return app.getPath(name)
  })

  // 在文件管理器中显示
  ipcMain.handle('system:showInFolder', async (event, filePath) => {
    try {
      const resolved = validatePath(filePath)
      shell.showItemInFolder(resolved)
      return true
    } catch (error) {
      console.error('[IPC] showInFolder error:', error)
      throw error
    }
  })

  // 用默认应用打开文件
  ipcMain.handle('system:openFile', async (event, filePath) => {
    try {
      const resolved = validatePath(filePath)
      shell.openPath(resolved)
      return true
    } catch (error) {
      console.error('[IPC] openFile error:', error)
      throw error
    }
  })
}


/**
 * 应用初始化
 */
app.whenReady().then(async () => {
  // 2. 拦截并处理 app:// 协议的请求
  protocol.handle('app', (request) => {
    const url = new URL(request.url)
    let relativePath = url.pathname
    
    // 如果是根路径，指向 index.html
    if (relativePath === '/' || relativePath === '') {
      relativePath = '/index.html'
    }
    
    // 拼接出本地真实路径 (假设 Next.js 打包在 out 目录)
    let absolutePath = path.join(__dirname, '../out', relativePath)
    
    // SPA 路由 fallback：如果文件不存在，返回 index.html
    if (!fs.existsSync(absolutePath)) {
      absolutePath = path.join(__dirname, '../out/index.html')
    }
    
    // 转换为 file:// 协议供 net.fetch 读取
    const fileUrl = 'file:///' + absolutePath.replace(/\\/g, '/')
    return net.fetch(fileUrl)
  })

  // 设置允许的根目录 - 以 RJCut 目录为主要根目录
  const documentsPath = app.getPath('documents')
  const videosPath = app.getPath('videos')
  const rjcutPath = path.join(documentsPath, 'RJCut')
  
  allowedRoots = [
    rjcutPath,      // 主要根目录：Documents/RJCut
    documentsPath,  // 备用：Documents
    videosPath,     // 备用：Videos
  ]
  
  // 初始化 fs-utils 的允许根目录
  fsUtils.setAllowedRoots(allowedRoots)
  
  console.log('[Main] 允许的根目录:', allowedRoots)
  
  // 注册 IPC 处理器
  registerIPCHandlers()
  
  
  // 创建窗口
  createWindow()
  
  // 自动启动 MCP 服务器 - 注册完整的虚拟文件系统工具
  try {
    const { ElectronMCPServer } = require('./mcp-server')
    mcpServer = new ElectronMCPServer()
    
    // ==================== 基础文件系统操作 ====================
    
    // 使用 fsUtils 直接调用文件系统函数
    mcpServer.registerTool({
      name: 'vfs_list',
      description: '列出虚拟文件系统目录内容',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '目录路径，例如 /projects', default: '/' }
        },
        required: []
      },
      handler: async ({ path = '/' }) => {
        const items = await fsUtils.listDirectory(path)
        if (!items || items.length === 0) return '📂 目录为空'
        return items.map(item => 
          `${item.isDirectory ? '📁' : '📄'} ${item.name}${item.size ? ` (${(item.size / 1024).toFixed(1)} KB)` : ''}`
        ).join('\n')
      }
    })
    
    mcpServer.registerTool({
      name: 'vfs_read',
      description: '读取虚拟文件系统文件内容',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径，例如 /projects/test.json' }
        },
        required: ['path']
      },
      handler: async ({ path }) => {
        return await fsUtils.readFile(path, 'utf-8')
      }
    })
    
    mcpServer.registerTool({
      name: 'vfs_write',
      description: '写入文件到虚拟文件系统',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径' },
          content: { type: 'string', description: '文件内容' }
        },
        required: ['path', 'content']
      },
      handler: async ({ path, content }) => {
        await fsUtils.writeFile(path, content)
        return `✅ 文件已写入：${path}`
      }
    })
    
    mcpServer.registerTool({
      name: 'vfs_delete',
      description: '删除虚拟文件系统中的文件或目录',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件/目录路径' },
          recursive: { type: 'boolean', description: '是否递归删除目录', default: false }
        },
        required: ['path']
      },
      handler: async ({ path, recursive = false }) => {
        await fsUtils.deleteFile(path, recursive)
        return `✅ 已删除：${path}`
      }
    })
    
    mcpServer.registerTool({
      name: 'vfs_move',
      description: '移动/重命名虚拟文件系统中的文件或目录',
      inputSchema: {
        type: 'object',
        properties: {
          from: { type: 'string', description: '源路径' },
          to: { type: 'string', description: '目标路径' }
        },
        required: ['from', 'to']
      },
      handler: async ({ from, to }) => {
        await fsUtils.moveFile(from, to)
        return `✅ 已移动：${from} -> ${to}`
      }
    })
    
    mcpServer.registerTool({
      name: 'vfs_copy',
      description: '复制虚拟文件系统中的文件',
      inputSchema: {
        type: 'object',
        properties: {
          from: { type: 'string', description: '源路径' },
          to: { type: 'string', description: '目标路径' }
        },
        required: ['from', 'to']
      },
      handler: async ({ from, to }) => {
        await fsUtils.copyFile(from, to)
        return `✅ 已复制：${from} -> ${to}`
      }
    })
    
    mcpServer.registerTool({
      name: 'vfs_mkdir',
      description: '在虚拟文件系统中创建目录',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '目录路径' },
          recursive: { type: 'boolean', description: '是否递归创建', default: true }
        },
        required: ['path']
      },
      handler: async ({ path, recursive = true }) => {
        await fsUtils.mkdir(path, recursive)
        return `✅ 目录已创建：${path}`
      }
    })
    
    mcpServer.registerTool({
      name: 'vfs_exists',
      description: '检查虚拟文件系统中路径是否存在',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '要检查的路径' }
        },
        required: ['path']
      },
      handler: async ({ path }) => {
        const exists = await fsUtils.exists(path)
        return exists ? `✅ 路径存在：${path}` : `❌ 路径不存在：${path}`
      }
    })
    
    // ==================== 文件搜索 ====================
    
    mcpServer.registerTool({
      name: 'vfs_search',
      description: '在虚拟文件系统中搜索文件',
      inputSchema: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: '搜索模式（支持正则）' },
          maxResults: { type: 'number', description: '最大结果数', default: 50 }
        },
        required: ['pattern']
      },
      handler: async ({ pattern, maxResults = 50 }) => {
        const results = await fsUtils.search(pattern, { maxResults })
        if (!results || results.length === 0) return '🔍 未找到匹配的文件'
        return results.map(item => `${item.isDirectory ? '📁' : '📄'} ${item.path}`).join('\n')
      }
    })
    
    mcpServer.registerTool({
      name: 'vfs_search_videos',
      description: '搜索虚拟文件系统中的视频文件',
      inputSchema: {
        type: 'object',
        properties: {
          maxResults: { type: 'number', description: '最大结果数', default: 50 }
        },
        required: []
      },
      handler: async ({ maxResults = 50 }) => {
        const results = await fsUtils.searchVideos({ maxResults })
        if (!results || results.length === 0) return '🎬 未找到视频文件'
        return results.map(item => `📄 ${item.path}`).join('\n')
      }
    })
    
    mcpServer.registerTool({
      name: 'vfs_search_json',
      description: '搜索虚拟文件系统中的 JSON 文件',
      inputSchema: {
        type: 'object',
        properties: {
          maxResults: { type: 'number', description: '最大结果数', default: 50 }
        },
        required: []
      },
      handler: async ({ maxResults = 50 }) => {
        const results = await fsUtils.searchJSON({ maxResults })
        if (!results || results.length === 0) return '📋 未找到 JSON 文件'
        return results.map(item => `📄 ${item.path}`).join('\n')
      }
    })
    
    // ==================== 项目管理 ====================
    
    mcpServer.registerTool({
      name: 'vfs_project_list',
      description: '列出所有视频项目',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      },
      handler: async () => {
        const projects = await fsUtils.getVideoProjects()
        if (!projects || projects.length === 0) return '📂 当前没有任何项目'
        return projects.map((p, i) => 
          `${i + 1}. **${p.name}**\n   路径：${p.path}\n   更新：${p.updatedAt}`
        ).join('\n\n')
      }
    })
    
    mcpServer.registerTool({
      name: 'vfs_project_create',
      description: '创建新的视频项目',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '项目名称' },
          config: { type: 'object', description: '项目配置 (可选)' }
        },
        required: ['name']
      },
      handler: async ({ name, config }) => {
        const projectPath = await fsUtils.createVideoProject(name, config || {})
        return `✅ 项目已创建：${name}\n路径：${projectPath}`
      }
    })
    
    mcpServer.registerTool({
      name: 'vfs_project_read',
      description: '读取项目配置文件',
      inputSchema: {
        type: 'object',
        properties: {
          projectPath: { type: 'string', description: '项目路径' }
        },
        required: ['projectPath']
      },
      handler: async ({ projectPath }) => {
        const configPath = `${projectPath}/project.json`
        const config = await fsUtils.readJSON(configPath)
        return JSON.stringify(config, null, 2)
      }
    })
    
    mcpServer.registerTool({
      name: 'vfs_project_update',
      description: '更新项目配置文件',
      inputSchema: {
        type: 'object',
        properties: {
          projectPath: { type: 'string', description: '项目路径' },
          config: { type: 'object', description: '新的项目配置' }
        },
        required: ['projectPath', 'config']
      },
      handler: async ({ projectPath, config }) => {
        const configPath = `${projectPath}/project.json`
        config.updatedAt = new Date().toISOString()
        await fsUtils.writeJSON(configPath, config)
        return `✅ 项目配置已更新：${projectPath}`
      }
    })
    
    // ==================== 存储信息 ====================
    
    mcpServer.registerTool({
      name: 'vfs_storage_info',
      description: '获取虚拟文件系统存储使用情况',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      },
      handler: async () => {
        const info = await fsUtils.getStorageInfo()
        return `📊 存储信息:\n- 根目录：${info.root}\n- 文件总数：${info.fileCount}\n- 总大小：${(info.totalSize / 1024 / 1024).toFixed(2)} MB`
      }
    })
    
    // ==================== 外部文件导入工具 ====================
    
    mcpServer.registerTool({
      name: 'vfs_analyze_external',
      description: '分析外部文件夹内容（视频、音频、图片、文档等），返回详细的文件分类和统计信息。💡 提示：分析后可配合 vfs_smart_organize 将文件智能组织到 /projects/项目名 目录中',
      inputSchema: {
        type: 'object',
        properties: {
          externalPath: { 
            type: 'string', 
            description: '外部文件夹的绝对路径，例如 "C:\\Users\\admin\\Desktop\\MyFiles" 或 "C:/Users/admin/Desktop/MyFiles"' 
          }
        },
        required: ['externalPath']
      },
      handler: async ({ externalPath }) => {
        try {
          const analysis = await fsUtils.analyzeExternalFolder(externalPath)
          
          let report = `📂 外部文件夹分析报告\n`
          report += `━━━━━━━━━━━━━━━━━━━━━━\n`
          report += `📍 路径：${analysis.path}\n`
          report += `📊 文件总数：${analysis.summary.videoCount + analysis.summary.audioCount + analysis.summary.imageCount + analysis.summary.documentCount + analysis.summary.scriptCount + analysis.summary.subtitleCount + analysis.summary.otherCount}\n`
          report += `💾 总大小：${analysis.summary.totalSizeMB} MB\n\n`
          report += `📁 文件分类:\n`
          report += `  🎬 视频：${analysis.summary.videoCount} 个\n`
          report += `  🎵 音频：${analysis.summary.audioCount} 个\n`
          report += `  🖼️  图片：${analysis.summary.imageCount} 个\n`
          report += `  📄 文档：${analysis.summary.documentCount} 个\n`
          report += `  💻 脚本：${analysis.summary.scriptCount} 个\n`
          report += `  📝 字幕：${analysis.summary.subtitleCount} 个\n`
          report += `  📦 其他：${analysis.summary.otherCount} 个\n`
          
          if (analysis.filesByType.video.length > 0) {
            report += `\n🎬 视频文件:\n`
            analysis.filesByType.video.slice(0, 10).forEach(f => {
              report += `  - ${f.name} (${(f.size / 1024 / 1024).toFixed(1)} MB)\n`
            })
            if (analysis.filesByType.video.length > 10) {
              report += `  ... 还有 ${analysis.filesByType.video.length - 10} 个视频文件\n`
            }
          }
          
          return report
        } catch (error) {
          return `❌ 分析失败：${error.message}`
        }
      }
    })
    
    mcpServer.registerTool({
      name: 'vfs_import_external',
      description: '将外部文件夹导入到 VFS 虚拟文件系统中，支持文件过滤、目录结构保持或扁平化。⚠️ 重要：vfsTargetPath 必须指向 /projects/项目名/xxx 目录，例如 /projects/我的视频项目/素材',
      inputSchema: {
        type: 'object',
        properties: {
          externalPath: { 
            type: 'string', 
            description: '外部文件夹的绝对路径' 
          },
          vfsTargetPath: { 
            type: 'string', 
            description: '⚠️ 必须指向 /projects/项目名/xxx 目录！例如：/projects/我的视频项目/素材 或 /projects/我的视频项目/原始视频。不允许使用其他路径。' 
          },
          includePatterns: { 
            type: 'array', 
            items: { type: 'string' },
            description: '包含的文件正则模式（可选），例如 ["\\.mp4$", "\\.mov$"] 只导入视频',
            default: []
          },
          excludePatterns: { 
            type: 'array', 
            items: { type: 'string' },
            description: '排除的文件正则模式（可选），例如 ["\\.tmp$", "~$"]',
            default: []
          },
          flatten: { 
            type: 'boolean', 
            description: '是否扁平化目录结构（true=所有文件放到同一层，false=保持原目录结构）',
            default: false
          },
          maxFileSize: { 
            type: 'number', 
            description: '最大文件大小（字节），默认 500MB (524288000)',
            default: 524288000
          }
        },
        required: ['externalPath', 'vfsTargetPath']
      },
      handler: async ({ externalPath, vfsTargetPath, includePatterns = [], excludePatterns = [], flatten = false, maxFileSize = 524288000 }) => {
        try {
          const result = await fsUtils.importExternalFolder(externalPath, vfsTargetPath, {
            includePatterns,
            excludePatterns,
            flatten,
            maxFileSize,
          })
          
          let report = `✅ 导入完成\n`
          report += `━━━━━━━━━━━━━━━━━━━━━━\n`
          report += `📥 源路径：${result.sourcePath}\n`
          report += `📤 目标路径：${result.targetPath}\n`
          report += `📊 成功复制：${result.summary.totalCopied} 个文件\n`
          report += `💾 总大小：${result.summary.totalSizeMB} MB\n`
          
          if (result.summary.totalSkipped > 0) {
            report += `⚠️  跳过：${result.summary.totalSkipped} 个文件\n`
          }
          if (result.summary.totalErrors > 0) {
            report += `❌ 错误：${result.summary.totalErrors} 个\n`
          }
          
          return report
        } catch (error) {
          return `❌ 导入失败：${error.message}`
        }
      }
    })
    
    mcpServer.registerTool({
      name: 'vfs_smart_organize',
      description: '智能组织外部文件到项目结构中。如果检测到 script.json 脚本文件，会根据 flag 自动分类视频（human→原始视频，scene→剪辑视频），其他文件按类型分类（字幕、音乐、文案等放主目录）。⚠️ 重要：projectPath 必须指向 /projects/项目名 目录，例如 /projects/我的视频项目',
      inputSchema: {
        type: 'object',
        properties: {
          externalPath: { 
            type: 'string', 
            description: '外部文件夹的绝对路径' 
          },
          projectPath: { 
            type: 'string', 
            description: '⚠️ 必须指向 /projects/项目名 目录！例如：/projects/我的视频项目。不允许使用其他路径。' 
          },
          autoRename: { 
            type: 'boolean', 
            description: '是否自动重命名重复文件（添加时间戳）',
            default: true
          },
          createSubfolders: { 
            type: 'boolean', 
            description: '是否创建分类子文件夹',
            default: true
          },
          useScriptAnalysis: { 
            type: 'boolean', 
            description: '是否使用脚本文件分析（检测 script.json 并根据 flag 分类视频：human→原始视频，scene→剪辑视频）',
            default: true
          }
        },
        required: ['externalPath', 'projectPath']
      },
      handler: async ({ externalPath, projectPath, autoRename = true, createSubfolders = true, useScriptAnalysis = true }) => {
        try {
          const result = await fsUtils.smartOrganizeToProject(externalPath, projectPath, {
            autoRename,
            createSubfolders,
            useScriptAnalysis,
          })
          
          let report = `🎯 智能组织完成\n`
          report += `━━━━━━━━━━━━━━━━━━━━━━\n`
          report += `📥 源路径：${result.sourcePath}\n`
          report += `📤 项目路径：${result.projectPath}\n`
          
          if (result.scriptFound) {
            report += `✅ 检测到脚本文件：${result.scriptAnalysis.scriptPath}\n`
            report += `   - human 视频（数字人）：${result.scriptAnalysis.humanVideos.length} 个\n`
            report += `   - scene 视频（场景）：${result.scriptAnalysis.sceneVideos.length} 个\n\n`
          }
          
          report += `📊 总文件数：${result.summary.totalFiles}\n\n`
          report += `📁 分类结果:\n`
          report += `  🎬 原始视频 (human)：${result.summary.humanVideoCount} 个\n`
          report += `  🎬 剪辑视频 (scene)：${result.summary.sceneVideoCount} 个\n`
          report += `  🎵 音频素材：${result.summary.audioCount} 个\n`
          report += `  🖼️  图片素材：${result.summary.imageCount} 个\n`
          report += `  📄 文案文档：${result.summary.documentCount} 个\n`
          report += `  📝 字幕文件：${result.summary.subtitleCount} 个\n`
          report += `  💻 脚本代码：${result.summary.scriptCount} 个\n`
          report += `  📦 其他文件：${result.summary.otherCount} 个\n`
          
          if (result.summary.errorCount > 0) {
            report += `\n⚠️  处理错误：${result.summary.errorCount} 个\n`
            result.errors.slice(0, 5).forEach(e => {
              report += `  - ${e.path}: ${e.error}\n`
            })
          }
          
          return report
        } catch (error) {
          return `❌ 组织失败：${error.message}`
        }
      }
    })
    
    await mcpServer.start(8001)
    console.log('[Main] MCP 服务器已自动启动在端口 8001')
  } catch (error) {
    console.error('[Main] MCP 服务器启动失败:', error)
  }
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// 所有窗口关闭时退出应用（macOS 除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 安全验证
app.on('web-contents-created', (event, contents) => {
  // 阻止导航到外部 URL
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl)
    // 开发模式允许 localhost，生产模式允许 app:// 协议
    const isDev = !app.isPackaged
    if (isDev) {
      if (parsedUrl.origin !== 'http://localhost:3000') {
        event.preventDefault()
      }
    } else {
      // 生产模式只允许 app:// 协议
      if (parsedUrl.protocol !== 'app:') {
        event.preventDefault()
      }
    }
  })
})