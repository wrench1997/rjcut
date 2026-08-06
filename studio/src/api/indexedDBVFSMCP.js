/**
 * IndexedDB VFS MCP - 为 RJCut Studio 提供基于 IndexedDB 的虚拟文件系统 MCP 服务
 * 
 * 此模块将 VirtualFileSystem 通过 MCP 协议暴露给外部 AI agent，
 * 支持文件读写、目录管理、项目操作等功能。
 * 
 * @example
 * import { IndexedDBVFSMCP } from './indexedDBVFSMCP'
 * 
 * const vfsMCP = new IndexedDBVFSMCP(vfsInstance)
 * await vfsMCP.register(mcpServer)
 */

import { VirtualFileSystem } from '../utils/virtualFileSystem.js'

// =====================================================
// IndexedDB VFS MCP 类
// =====================================================
export class IndexedDBVFSMCP {
  constructor(vfs = null, options = {}) {
    this.vfs = vfs
    this.options = {
      // 是否允许删除操作
      allowDelete: options.allowDelete ?? true,
      // 是否允许写入操作
      allowWrite: options.allowWrite ?? true,
      // 最大文件大小（字节），默认 100MB
      maxFileSize: options.maxFileSize ?? 100 * 1024 * 1024,
      // 允许的文件类型白名单（null 表示不限制）
      allowedMimeTypes: options.allowedMimeTypes ?? null,
      // 是否记录操作日志
      logOperations: options.logOperations ?? true,
    }
    this.operationLog = []
  }

  // =====================================================
  // 初始化
  // =====================================================
  
  /**
   * 设置 VFS 实例
   */
  setVFS(vfs) {
    this.vfs = vfs
    return this
  }

  /**
   * 注册到 MCP 服务器
   */
  async register(mcpServer) {
    if (!this.vfs) {
      throw new Error('必须先设置 VFS 实例')
    }

    // 确保 VFS 已初始化
    if (!this.vfs.initialized) {
      await this.vfs.init()
    }

    // 注册工具
    this._registerTools(mcpServer)
    
    // 注册资源
    this._registerResources(mcpServer)
    
    // 注册提示
    this._registerPrompts(mcpServer)

    console.log('[IndexedDB VFS MCP] 已注册到 MCP 服务器')
    return this
  }

  // =====================================================
  // 工具注册
  // =====================================================

  _registerTools(mcpServer) {
    // 1. 列出目录
    mcpServer.registerTool({
      name: 'vfs_list_directory',
      description: '列出指定目录的内容，包括文件和子目录',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '目录路径，默认为当前目录',
            default: '/'
          }
        },
        required: []
      },
      handler: async ({ path } = {}) => {
        try {
          const items = this.vfs.listDirectory(path)
          if (items.length === 0) {
            return '📂 目录为空'
          }
          
          const formatted = items.map(item => {
            const icon = item.isDirectory ? '📁' : '📄'
            const sizeInfo = item.size ? ` (${this._formatSize(item.size)})` : ''
            return `${icon} ${item.name}${sizeInfo}`
          }).join('\n')
          
          return `📁 ${path || this.vfs.currentPath}\n\n${formatted}`
        } catch (error) {
          throw new Error(`列出目录失败：${error.message}`)
        }
      }
    })

    // 2. 读取文件
    mcpServer.registerTool({
      name: 'vfs_read_file',
      description: '读取文件内容，支持文本和二进制文件',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: '文件路径'
          },
          encoding: {
            type: 'string',
            description: '文本文件编码，默认 utf-8',
            default: 'utf-8'
          },
          maxLength: {
            type: 'integer',
            description: '最大返回字符数（用于大文件截断），0 表示不限制',
            default: 0
          }
        },
        required: ['filePath']
      },
      handler: async ({ filePath, encoding = 'utf-8', maxLength = 0 }) => {
        try {
          const content = await this.vfs.readFile(filePath, encoding)
          
          if (typeof content === 'string' && maxLength > 0 && content.length > maxLength) {
            return content.substring(0, maxLength) + '\n\n...（内容已截断）'
          }
          
          if (content instanceof Blob || content instanceof ArrayBuffer) {
            const size = content.size || content.byteLength
            return `[二进制文件，大小：${this._formatSize(size)}]`
          }
          
          return content
        } catch (error) {
          throw new Error(`读取文件失败：${error.message}`)
        }
      }
    })

    // 3. 写入文件
    mcpServer.registerTool({
      name: 'vfs_write_file',
      description: '写入文件内容，支持文本、JSON 和二进制数据',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: '文件路径'
          },
          content: {
            type: 'string',
            description: '文件内容'
          },
          contentType: {
            type: 'string',
            description: '内容类型 (MIME type)',
            default: 'text/plain'
          },
          createParent: {
            type: 'boolean',
            description: '是否自动创建父目录',
            default: true
          },
          overwrite: {
            type: 'boolean',
            description: '是否覆盖已存在的文件',
            default: true
          }
        },
        required: ['filePath', 'content']
      },
      handler: async ({ filePath, content, contentType = 'text/plain', createParent = true, overwrite = true }) => {
        if (!this.options.allowWrite) {
          throw new Error('写入操作已被禁用')
        }

        try {
          // 检查文件大小
          const size = new Blob([content]).size
          if (size > this.options.maxFileSize) {
            throw new Error(`文件大小超出限制：${this._formatSize(size)} > ${this._formatSize(this.options.maxFileSize)}`)
          }

          // 检查文件是否已存在
          if (this.vfs.exists(filePath) && !overwrite) {
            throw new Error(`文件已存在：${filePath}`)
          }

          await this.vfs.writeFile(filePath, content, {
            type: contentType,
            createParent
          })

          this._logOperation('write', filePath, size)
          
          return `✅ 文件已写入：${filePath}\n大小：${this._formatSize(size)}`
        } catch (error) {
          throw new Error(`写入文件失败：${error.message}`)
        }
      }
    })

    // 4. 读取 JSON 文件
    mcpServer.registerTool({
      name: 'vfs_read_json',
      description: '读取并解析 JSON 文件',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'JSON 文件路径'
          }
        },
        required: ['filePath']
      },
      handler: async ({ filePath }) => {
        try {
          const data = await this.vfs.readJSON(filePath)
          return JSON.stringify(data, null, 2)
        } catch (error) {
          throw new Error(`读取 JSON 失败：${error.message}`)
        }
      }
    })

    // 5. 写入 JSON 文件
    mcpServer.registerTool({
      name: 'vfs_write_json',
      description: '将数据写入 JSON 文件',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'JSON 文件路径'
          },
          data: {
            type: 'object',
            description: '要写入的 JSON 数据（对象或数组）'
          },
          createParent: {
            type: 'boolean',
            description: '是否自动创建父目录',
            default: true
          }
        },
        required: ['filePath', 'data']
      },
      handler: async ({ filePath, data, createParent = true }) => {
        if (!this.options.allowWrite) {
          throw new Error('写入操作已被禁用')
        }

        try {
          await this.vfs.writeJSON(filePath, data, { createParent })
          this._logOperation('write_json', filePath)
          return `✅ JSON 文件已写入：${filePath}`
        } catch (error) {
          throw new Error(`写入 JSON 失败：${error.message}`)
        }
      }
    })

    // 6. 删除文件/目录
    mcpServer.registerTool({
      name: 'vfs_delete',
      description: '删除文件或目录',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '要删除的文件或目录路径'
          },
          recursive: {
            type: 'boolean',
            description: '删除目录时是否递归删除子内容',
            default: false
          }
        },
        required: ['path']
      },
      handler: async ({ path, recursive = false }) => {
        if (!this.options.allowDelete) {
          throw new Error('删除操作已被禁用')
        }

        try {
          await this.vfs.delete(path, recursive)
          this._logOperation('delete', path)
          return `✅ 已删除：${path}`
        } catch (error) {
          throw new Error(`删除失败：${error.message}`)
        }
      }
    })

    // 7. 移动/重命名
    mcpServer.registerTool({
      name: 'vfs_move',
      description: '移动或重命名文件/目录',
      inputSchema: {
        type: 'object',
        properties: {
          from: {
            type: 'string',
            description: '源路径'
          },
          to: {
            type: 'string',
            description: '目标路径'
          }
        },
        required: ['from', 'to']
      },
      handler: async ({ from, to }) => {
        try {
          await this.vfs.move(from, to)
          this._logOperation('move', from, to)
          return `✅ 已移动：${from} -> ${to}`
        } catch (error) {
          throw new Error(`移动失败：${error.message}`)
        }
      }
    })

    // 8. 复制文件
    mcpServer.registerTool({
      name: 'vfs_copy',
      description: '复制文件到新位置',
      inputSchema: {
        type: 'object',
        properties: {
          from: {
            type: 'string',
            description: '源路径'
          },
          to: {
            type: 'string',
            description: '目标路径'
          }
        },
        required: ['from', 'to']
      },
      handler: async ({ from, to }) => {
        try {
          const content = await this.vfs.readFile(from)
          const file = this.vfs.getFile(from)
          await this.vfs.writeFile(to, content, { type: file?.type || 'application/octet-stream' })
          this._logOperation('copy', from, to)
          return `✅ 已复制：${from} -> ${to}`
        } catch (error) {
          throw new Error(`复制失败：${error.message}`)
        }
      }
    })

    // 9. 创建目录
    mcpServer.registerTool({
      name: 'vfs_mkdir',
      description: '创建新目录',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '目录路径'
          },
          recursive: {
            type: 'boolean',
            description: '是否递归创建父目录',
            default: false
          }
        },
        required: ['path']
      },
      handler: async ({ path, recursive = false }) => {
        try {
          await this.vfs.mkdir(path, recursive)
          this._logOperation('mkdir', path)
          return `✅ 目录已创建：${path}`
        } catch (error) {
          throw new Error(`创建目录失败：${error.message}`)
        }
      }
    })

    // 10. 获取文件信息
    mcpServer.registerTool({
      name: 'vfs_get_file_info',
      description: '获取文件的详细信息（大小、类型、创建时间等）',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: '文件路径'
          }
        },
        required: ['filePath']
      },
      handler: async ({ filePath }) => {
        try {
          const file = this.vfs.getFile(filePath)
          if (!file) {
            throw new Error(`文件不存在：${filePath}`)
          }
          
          return `📄 **${file.name}**
- 路径：${file.path}
- 类型：${file.type}
- 大小：${this._formatSize(file.size)}
- 创建：${file.createdAt}
- 更新：${file.updatedAt}`
        } catch (error) {
          throw new Error(`获取文件信息失败：${error.message}`)
        }
      }
    })

    // 11. 搜索文件
    mcpServer.registerTool({
      name: 'vfs_search',
      description: '搜索匹配的文件',
      inputSchema: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: '搜索模式（支持正则表达式）'
          },
          includeDirectories: {
            type: 'boolean',
            description: '是否包含目录',
            default: false
          },
          maxResults: {
            type: 'integer',
            description: '最大结果数',
            default: 50
          }
        },
        required: ['pattern']
      },
      handler: async ({ pattern, includeDirectories = false, maxResults = 50 }) => {
        try {
          const results = this.vfs.search(pattern, { includeDirectories })
          if (results.length === 0) {
            return '未找到匹配的文件'
          }
          
          const limited = results.slice(0, maxResults)
          const formatted = limited.map(item => {
            const icon = item.isDirectory ? '📁' : '📄'
            const sizeInfo = item.size ? ` (${this._formatSize(item.size)})` : ''
            return `${icon} ${item.path}${sizeInfo}`
          }).join('\n')
          
          const moreInfo = results.length > maxResults ? `\n... 还有 ${results.length - maxResults} 个结果` : ''
          return `找到 ${results.length} 个匹配项：\n\n${formatted}${moreInfo}`
        } catch (error) {
          throw new Error(`搜索失败：${error.message}`)
        }
      }
    })

    // 12. 按类型搜索文件
    mcpServer.registerTool({
      name: 'vfs_search_by_type',
      description: '按文件类型搜索（如视频、音频、图片等）',
      inputSchema: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            description: '文件类型：video, audio, image, json, subtitle 等',
            enum: ['video', 'audio', 'image', 'json', 'subtitle', 'text']
          },
          maxResults: {
            type: 'integer',
            description: '最大结果数',
            default: 50
          }
        },
        required: ['type']
      },
      handler: async ({ type, maxResults = 50 }) => {
        try {
          let results = []
          
          switch (type) {
            case 'video':
              results = this.vfs.searchVideos()
              break
            case 'audio':
              results = this.vfs.searchAudio()
              break
            case 'image':
              results = this.vfs.searchByType(/\.png$|\.jpg$|\.jpeg$|\.gif$|\.webp$/i)
              break
            case 'json':
              results = this.vfs.searchJSON()
              break
            case 'subtitle':
              results = this.vfs.searchSubtitles()
              break
            case 'text':
              results = this.vfs.searchByType(/\.txt$|\.md$|\.js$|\.jsx$|\.ts$|\.tsx$|\.css$|\.html$/i)
              break
            default:
              throw new Error(`未知的文件类型：${type}`)
          }
          
          if (results.length === 0) {
            return `未找到 ${type} 类型的文件`
          }
          
          const limited = results.slice(0, maxResults)
          const formatted = limited.map(item => {
            const sizeInfo = item.size ? ` (${this._formatSize(item.size)})` : ''
            return `📄 ${item.path}${sizeInfo}`
          }).join('\n')
          
          const moreInfo = results.length > maxResults ? `\n... 还有 ${results.length - maxResults} 个结果` : ''
          return `找到 ${results.length} 个 ${type} 文件：\n\n${formatted}${moreInfo}`
        } catch (error) {
          throw new Error(`搜索失败：${error.message}`)
        }
      }
    })

    // 13. 获取存储状态
    mcpServer.registerTool({
      name: 'vfs_get_storage_info',
      description: '获取 IndexedDB 存储空间使用情况',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      },
      handler: async () => {
        try {
          const info = await this.vfs.getStorageInfo()
          
          const formatSize = (bytes) => {
            if (bytes === null) return '未知'
            if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
            if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`
            if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`
            return `${bytes} B`
          }
          
          return `💾 **存储状态**
- 文件数：${info.fileCount}
- 已用：${formatSize(info.totalSize)}
- 配额：${formatSize(info.quota)}
- 可用：${formatSize(info.available)}`
        } catch (error) {
          throw new Error(`获取存储信息失败：${error.message}`)
        }
      }
    })

    // 14. 切换当前目录
    mcpServer.registerTool({
      name: 'vfs_cd',
      description: '切换当前工作目录',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '目标目录路径'
          }
        },
        required: ['path']
      },
      handler: async ({ path }) => {
        try {
          this.vfs.cd(path)
          return `✅ 已切换到：${this.vfs.currentPath}`
        } catch (error) {
          throw new Error(`切换目录失败：${error.message}`)
        }
      }
    })

    // 15. 获取当前路径
    mcpServer.registerTool({
      name: 'vfs_pwd',
      description: '获取当前工作目录',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      },
      handler: async () => {
        return `📁 ${this.vfs.currentPath}`
      }
    })

    // 16. 创建视频项目
    mcpServer.registerTool({
      name: 'vfs_create_video_project',
      description: '创建新的视频项目（目录即项目，标准子目录按需生成）',
      inputSchema: {
        type: 'object',
        properties: {
          projectName: {
            type: 'string',
            description: '项目名称'
          },
          config: {
            type: 'object',
            description: '兼容旧调用，当前不写入项目配置文件',
            properties: {
              pipeline: {
                type: 'object',
                properties: {
                  remove_keyword: { type: 'string' },
                  margin: { type: 'number' },
                  min_segment_duration: { type: 'number' }
                }
              },
              subtitle: {
                type: 'object',
                properties: {
                  effect: { type: 'string' },
                  font_size: { type: 'number' }
                }
              }
            }
          }
        },
        required: ['projectName']
      },
      handler: async ({ projectName, config }) => {
        try {
          const projectPath = await this.vfs.createVideoProject(projectName, config || {})
          this._logOperation('create_project', projectPath)
          return `✅ 项目已创建：${projectName}\n路径：${projectPath}`
        } catch (error) {
          throw new Error(`创建项目失败：${error.message}`)
        }
      }
    })

    // 17. 获取视频项目列表
    mcpServer.registerTool({
      name: 'vfs_get_video_projects',
      description: '获取所有视频项目列表',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      },
      handler: async () => {
        try {
          const projects = await this.vfs.getVideoProjects()
          if (projects.length === 0) {
            return '📂 当前没有任何项目'
          }
          
          const formatted = projects.map((p, i) => {
            const date = new Date(p.updatedAt).toLocaleDateString('zh-CN')
            return `${i + 1}. **${p.name}** - ${p.path}\n   更新时间：${date}`
          }).join('\n\n')
          
          return `📁 视频项目列表：\n\n${formatted}`
        } catch (error) {
          throw new Error(`获取项目列表失败：${error.message}`)
        }
      }
    })

    // 18. 获取操作日志
    mcpServer.registerTool({
      name: 'vfs_get_operation_log',
      description: '获取最近的 VFS 操作日志',
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'integer',
            description: '返回最近的 N 条记录',
            default: 20
          }
        },
        required: []
      },
      handler: async ({ limit = 20 }) => {
        if (!this.options.logOperations) {
          return '操作日志未启用'
        }
        
        const recent = this.operationLog.slice(-limit)
        if (recent.length === 0) {
          return '暂无操作记录'
        }
        
        const formatted = recent.map((log, i) => {
          const time = new Date(log.timestamp).toLocaleTimeString('zh-CN')
          const details = log.to ? ` -> ${log.to}` : ''
          const sizeInfo = log.size ? ` (${this._formatSize(log.size)})` : ''
          return `${i + 1}. [${time}] ${log.operation.toUpperCase()} ${log.path}${details}${sizeInfo}`
        }).join('\n')
        
        return `📋 最近操作记录：\n\n${formatted}`
      }
    })

    // 19. 导出文件为 DataURL
    mcpServer.registerTool({
      name: 'vfs_export_data_url',
      description: '将文件导出为 DataURL（适用于图片等小文件）',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: '文件路径'
          }
        },
        required: ['filePath']
      },
      handler: async ({ filePath }) => {
        try {
          const dataURL = await this.vfs.readFileAsDataURL(filePath)
          return dataURL
        } catch (error) {
          throw new Error(`导出 DataURL 失败：${error.message}`)
        }
      }
    })

    // 20. 检查路径是否存在
    mcpServer.registerTool({
      name: 'vfs_exists',
      description: '检查文件或路径是否存在',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '要检查的路径'
          }
        },
        required: ['path']
      },
      handler: async ({ path }) => {
        const exists = this.vfs.exists(path)
        const isDir = this.vfs.isDirectory(path)
        const isFile = this.vfs.isFile(path)
        
        if (!exists) {
          return `❌ 路径不存在：${path}`
        }
        
        return `✅ 路径存在：${path}\n类型：${isDir ? '目录' : isFile ? '文件' : '未知'}`
      }
    })
  }

  // =====================================================
  // 资源注册
  // =====================================================

  _registerResources(mcpServer) {
    // 1. 当前目录
    mcpServer.registerResource({
      uri: 'vfs://current-directory',
      name: '当前目录',
      description: '当前工作目录的信息',
      mimeType: 'application/json',
      handler: async () => ({
        text: JSON.stringify({
          path: this.vfs.currentPath,
          items: this.vfs.listDirectory()
        }, null, 2)
      })
    })

    // 2. 项目列表
    mcpServer.registerResource({
      uri: 'vfs://projects',
      name: '视频项目列表',
      description: '所有视频项目的列表',
      mimeType: 'application/json',
      handler: async () => ({
        text: JSON.stringify(await this.vfs.getVideoProjects(), null, 2)
      })
    })

    // 3. 存储状态
    mcpServer.registerResource({
      uri: 'vfs://storage-status',
      name: '存储状态',
      description: 'IndexedDB 存储空间使用情况',
      mimeType: 'application/json',
      handler: async () => ({
        text: JSON.stringify(await this.vfs.getStorageInfo(), null, 2)
      })
    })

    // 4. 操作日志
    mcpServer.registerResource({
      uri: 'vfs://operation-log',
      name: '操作日志',
      description: '最近的 VFS 操作记录',
      mimeType: 'application/json',
      handler: async () => ({
        text: JSON.stringify(this.operationLog.slice(-100), null, 2)
      })
    })

    // 5. 文件系统树
    mcpServer.registerResource({
      uri: 'vfs://file-tree',
      name: '文件系统树',
      description: '完整的文件系统目录树结构',
      mimeType: 'application/json',
      handler: async () => {
        const buildTree = (path) => {
          const dir = this.vfs.getDirectory(path)
          if (!dir) return null
          
          const node = {
            name: path.split('/').pop() || 'root',
            path,
            isDirectory: true,
            children: []
          }
          
          for (const childPath of dir.children) {
            if (this.vfs.isDirectory(childPath)) {
              const childNode = buildTree(childPath)
              if (childNode) node.children.push(childNode)
            } else {
              const file = this.vfs.getFile(childPath)
              if (file) {
                node.children.push({
                  name: file.name,
                  path: childPath,
                  isDirectory: false,
                  size: file.size,
                  type: file.type
                })
              }
            }
          }
          
          return node
        }
        
        const tree = buildTree('/')
        return { text: JSON.stringify(tree, null, 2) }
      }
    })
  }

  // =====================================================
  // 提示注册
  // =====================================================

  _registerPrompts(mcpServer) {
    // 1. 项目初始化提示
    mcpServer.registerPrompt({
      name: 'vfs_project_init',
      description: '帮助初始化一个新的视频项目结构',
      arguments: [
        {
          name: 'projectName',
          description: '项目名称',
          required: true
        },
        {
          name: 'projectType',
          description: '项目类型（口播、纪录片、短视频等）',
          required: false
        }
      ],
      handler: async ({ projectName, projectType = '通用' }) => ({
        description: '视频项目初始化向导',
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `请帮我初始化一个名为"${projectName}"的${projectType}视频项目。
              
我需要：
1. 创建项目目录
2. 按需准备文案、场景素材和成片目录
3. 了解需要哪些素材

项目将包含：
- /文案：存放文案和数字人输入
- /场景素材：存放模板混剪素材
- /成片：存放最终输出
（以上目录在实际使用时按需生成）`
            }
          }
        ]
      })
    })

    // 2. 文件组织提示
    mcpServer.registerPrompt({
      name: 'vfs_file_organization',
      description: '帮助组织和管理项目文件',
      arguments: [
        {
          name: 'projectPath',
          description: '项目路径',
          required: true
        }
      ],
      handler: async ({ projectPath }) => ({
        description: '文件组织建议',
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `请帮我分析项目 ${projectPath} 的文件结构，并给出组织建议：

1. 当前有哪些文件和目录？
2. 文件命名是否规范？
3. 目录结构是否合理？
4. 有什么优化建议？`
            }
          }
        ]
      })
    })

    // 3. 存储空间清理提示
    mcpServer.registerPrompt({
      name: 'vfs_storage_cleanup',
      description: '分析存储空间并给出清理建议',
      arguments: [],
      handler: async () => ({
        description: '存储空间清理建议',
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `请分析当前 IndexedDB 存储使用情况：

1. 哪些文件占用空间最大？
2. 是否有可以清理的临时文件或旧项目？
3. 给出存储空间优化建议。

请列出前 10 个最大的文件，并建议哪些可以安全删除。`
            }
          }
        ]
      })
    })
  }

  // =====================================================
  // 辅助方法
  // =====================================================

  /**
   * 格式化文件大小
   */
  _formatSize(bytes) {
    if (bytes === null || bytes === undefined) return '未知'
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`
    return `${bytes} B`
  }

  /**
   * 记录操作日志
   */
  _logOperation(operation, path, to = null, size = null) {
    if (!this.options.logOperations) return
    
    this.operationLog.push({
      timestamp: new Date().toISOString(),
      operation,
      path,
      to,
      size
    })
    
    // 限制日志长度
    if (this.operationLog.length > 1000) {
      this.operationLog = this.operationLog.slice(-500)
    }
  }

  /**
   * 清空操作日志
   */
  clearOperationLog() {
    this.operationLog = []
  }

  /**
   * 获取操作日志
   */
  getOperationLog(limit = 100) {
    return this.operationLog.slice(-limit)
  }

  /**
   * 设置选项
   */
  setOptions(options) {
    this.options = { ...this.options, ...options }
    return this
  }
}

// =====================================================
// 工厂函数
// =====================================================

/**
 * 创建并注册 IndexedDB VFS MCP
 */
export async function createIndexedDBVFSMCP(vfs = null, options = {}) {
  const mcp = new IndexedDBVFSMCP(vfs, options)
  
  // 如果没有传入 VFS，创建默认的
  if (!vfs) {
    const { getVFS } = await import('../utils/vfsClient.js')
    const vfsInstance = getVFS()
    await vfsInstance.init()
    mcp.setVFS(vfsInstance)
  }
  
  return mcp
}

// =====================================================
// 默认导出
// =====================================================
export default IndexedDBVFSMCP
