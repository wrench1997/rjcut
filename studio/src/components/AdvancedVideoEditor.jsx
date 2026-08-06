import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Code2,
  Download,
  FileJson,
  Film,
  FolderOpen,
  Layers3,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Save,
  Smile,
  SlidersHorizontal,
  Sparkles,
  Type,
  WandSparkles,
  Zap,
} from 'lucide-react'

import { useTimelineStore, mediaFileRegistry, timelineStore } from '../stores/timelineStore'
import ExportPanelVFS from './VideoEditor/ExportPanelVFS'
import MediaLibraryVFS from './VideoEditor/MediaLibraryVFS'
import Timeline from './VideoEditor/Timeline'
import VideoPreview from './VideoEditor/VideoPreview'
import {
  ADVANCED_EDIT_SCHEMA,
  buildAdvancedEditedProject,
  getAdvancedProjectStats,
  metadataPathForVideo,
  validateAdvancedProject,
} from '../features/advanced-editor/advancedEditorModel.js'
import { readDigitalHumanProject, sidecarPathForVideo } from '../features/digital-human-project/digitalHumanProject.js'
import { closeTimelineSegmentGaps, getTimelineGaps } from '../features/template-batch/templateTimeline.js'
import { persistGlobalParams } from '../utils/subtitleConfig'

const VIDEO_TYPES = new Set(['video', 'human', 'scene'])
const IMPORTABLE_MEDIA_EXTENSIONS = new Set(['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v', 'mp3', 'wav', 'm4a', 'aac', 'png', 'jpg', 'jpeg', 'gif', 'webp'])

function mediaTypeFromName(name) {
  const extension = String(name || '').split('.').pop()?.toLowerCase()
  if (['mp3', 'wav', 'm4a', 'aac'].includes(extension)) return 'audio'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(extension)) return 'image'
  return 'video'
}

function mediaMimeType(name, type) {
  const extension = String(name || '').split('.').pop()?.toLowerCase() || 'mp4'
  if (type === 'audio') return `audio/${extension === 'm4a' ? 'mp4' : extension}`
  if (type === 'image') return `image/${extension === 'jpg' ? 'jpeg' : extension}`
  return `video/${extension === 'mov' ? 'quicktime' : extension}`
}

async function readMediaDetails(blob, name, type) {
  const details = { duration: 0, width: 0, height: 0 }
  if (type === 'image') {
    const url = URL.createObjectURL(blob)
    try {
      const image = new Image()
      image.src = url
      await new Promise((resolve) => { image.onload = resolve; image.onerror = resolve })
      details.width = image.naturalWidth || 0
      details.height = image.naturalHeight || 0
    } finally {
      URL.revokeObjectURL(url)
    }
    return details
  }
  if (type !== 'video') return details
  const url = URL.createObjectURL(blob)
  try {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.src = url
    await new Promise((resolve) => { video.onloadedmetadata = resolve; video.onerror = resolve })
    details.duration = Number.isFinite(video.duration) ? video.duration : 0
    details.width = video.videoWidth || 0
    details.height = video.videoHeight || 0
  } finally {
    URL.revokeObjectURL(url)
  }
  return details
}

function formatDuration(ms) {
  const seconds = Math.max(0, Number(ms) || 0) / 1000
  if (!seconds) return '00:00'
  const minutes = Math.floor(seconds / 60)
  const rest = Math.floor(seconds % 60)
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

function parseJson(raw) {
  try {
    return { value: JSON.parse(raw), error: '' }
  } catch (error) {
    return { value: null, error: error.message || 'JSON 格式无效' }
  }
}

/**
 * OpenCut 风格的 RJCut 高级剪辑工作区。
 * 复用现有媒体库、预览、时间轴和导出器，右侧增加数字人 JSON 信息层。
 */
export default function AdvancedVideoEditor({ vfs, initialMediaRequest = null, onExitFocusMode = null }) {
  const {
    isWasmReady,
    isWasmInitializing,
    clips,
    mediaFiles,
    selectedClipId,
    totalDuration_ms,
  } = useTimelineStore((snapshot) => ({
    isWasmReady: snapshot.isWasmReady,
    isWasmInitializing: snapshot.isWasmInitializing,
    clips: snapshot.clips,
    mediaFiles: snapshot.mediaFiles,
    selectedClipId: snapshot.selectedClipId,
    totalDuration_ms: snapshot.totalDuration_ms,
  }))
  const initWasm = timelineStore.initWasm
  const [isBooting, setIsBooting] = useState(true)
  const [engineError, setEngineError] = useState('')
  const [sceneFilesMap, setSceneFilesMap] = useState({})
  const [requestImportError, setRequestImportError] = useState('')
  const [isImportingRequest, setIsImportingRequest] = useState(false)
  const [lastImportedRequest, setLastImportedRequest] = useState('')
  const [panel, setPanel] = useState('inspector')
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [metadataByMediaId, setMetadataByMediaId] = useState({})
  const [timelineProjectByMediaId, setTimelineProjectByMediaId] = useState({})
  const [activeMediaId, setActiveMediaId] = useState(null)
  const [activeProject, setActiveProject] = useState(null)
  const [activeProjectPath, setActiveProjectPath] = useState('')
  const [jsonDraft, setJsonDraft] = useState('')
  const [jsonError, setJsonError] = useState('')
  const [metadataError, setMetadataError] = useState('')
  const [metadataDirty, setMetadataDirty] = useState(false)
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false)
  const [isSavingMetadata, setIsSavingMetadata] = useState(false)

  const mediaSignature = Object.values(mediaFiles)
    .map((media) => `${media.id}:${media.vfsPath || ''}:${media.name}`)
    .join('|')

  const selectedClip = clips.find((clip) => clip.id === selectedClipId) || null
  const selectedMedia = selectedClip ? mediaFiles[selectedClip.mediaId] : null
  const activeMedia = activeMediaId ? mediaFiles[activeMediaId] : null
  const stats = getAdvancedProjectStats(activeProject)
  const importedTimelineProject = activeMediaId ? timelineProjectByMediaId[activeMediaId]?.project : null
  const subtitleProject = importedTimelineProject
    || activeProject
    || Object.values(metadataByMediaId).find((metadata) => metadata?.project)?.project
    || null

  const clipSignature = clips
    .filter((clip) => clip.mediaId === activeMediaId)
    .map((clip) => `${clip.id}:${clip.start_ms}:${clip.duration_ms}:${clip.offset_ms}`)
    .join('|')

  const requestKey = `${initialMediaRequest?.path || ''}:${initialMediaRequest?.requestedAt || ''}`

  useEffect(() => {
    let cancelled = false
    const boot = async () => {
      setIsBooting(true)
      setEngineError('')
      try {
        await initWasm()
      } catch (error) {
        // 编辑器仍可打开，导出时会再次给出明确错误；不要把整个页面卡在加载态。
        if (!cancelled) setEngineError(error.message || '视频处理引擎初始化失败')
      } finally {
        if (!cancelled) setIsBooting(false)
      }
    }
    boot()
    return () => { cancelled = true }
  }, [initWasm])

  // 高级剪辑统一接管空格键，避免 Timeline 和页面各自监听造成一次按键切换两次。
  useEffect(() => {
    const handleSpaceKey = (event) => {
      if (event.code !== 'Space' && event.key !== ' ') return
      const target = event.target
      if (target?.closest?.('input, textarea, select, button, [contenteditable="true"]')) return
      event.preventDefault()
      event.stopPropagation()
      if (event.repeat) return
      const state = timelineStore.getState()
      state.isPlaying ? timelineStore.pause() : timelineStore.play()
    }
    window.addEventListener('keydown', handleSpaceKey, true)
    return () => window.removeEventListener('keydown', handleSpaceKey, true)
  }, [])

  // 文件浏览器右键“二次加工”后，自动把成片和同目录的关联素材接入当前 VFS 工作区。
  useEffect(() => {
    if (!vfs || !initialMediaRequest?.path || requestKey === lastImportedRequest) return undefined
    let cancelled = false
    const importRequestedVideo = async () => {
      const requestPath = initialMediaRequest.path
      const requestName = initialMediaRequest.name || requestPath.split('/').pop() || 'video.mp4'
      if (timelineStore.getState().clips.length > 0) {
        const continueImport = window.confirm('当前高级剪辑时间轴已有内容，打开新的成片会清空当前未保存编辑，是否继续？')
        if (!continueImport) return
        timelineStore.reset()
      }
      setIsImportingRequest(true)
      setRequestImportError('')
      try {
        const requestParentPath = requestPath.slice(0, requestPath.lastIndexOf('/')) || '/'
        let linkedPathRoots = [requestParentPath]
        const findVfsFileByName = async (value) => {
          const wantedName = String(value || '').split('/').pop()?.trim()
          if (!wantedName || !vfs?.listDirectory) return ''
          const queue = ['/']
          const visited = new Set()
          let scannedEntries = 0
          while (queue.length > 0 && scannedEntries < 3000) {
            const directory = queue.shift()
            if (!directory || visited.has(directory)) continue
            visited.add(directory)
            let entries = []
            try {
              entries = await vfs.listDirectory(directory)
            } catch (error) {
              console.warn('[AdvancedVideoEditor] VFS 目录扫描失败:', directory, error)
              continue
            }
            for (const entry of entries || []) {
              scannedEntries += 1
              const entryPath = String(entry.path || '').replace(/\\+/gu, '/')
              if ((entry.isFile || entry.type === 'file') && entry.name === wantedName) return entryPath
              if (entry.isDirectory || entry.type === 'directory') queue.push(entryPath)
              if (scannedEntries >= 3000) break
            }
          }
          return ''
        }
        const resolveExistingLinkedPath = async (value) => {
          const rawPath = String(value || '').trim()
          if (!rawPath) return ''
          const candidates = rawPath.startsWith('/')
            ? [rawPath]
            : linkedPathRoots.map((root) => `${root}/${rawPath}`.replace(/\\+/gu, '/'))
          for (const candidate of [...new Set(candidates)]) {
            try {
              if (await vfs.exists(candidate)) return candidate
            } catch (error) {
              console.warn('[AdvancedVideoEditor] VFS 路径检查失败:', candidate, error)
            }
          }
          return findVfsFileByName(rawPath)
        }

        // 二次加工遵循非破坏性原则：右键点的是成片时，优先从旁车 JSON
        // 找回原生数字人视频作为 human 主轨；找不到或路径失效时才回退到当前成片。
        let sidecarProject = null
        let sidecarPath = ''
        try {
          const timelinePath = /\.timeline\.json$/iu.test(requestPath)
            ? requestPath
            : requestPath.replace(/\.[^.\/]+$/u, '.timeline.json')
          const metadataCandidates = [...new Set([
            sidecarPathForVideo(requestPath),
            metadataPathForVideo(requestPath),
            timelinePath,
          ].filter(Boolean))]
          for (const candidate of metadataCandidates) {
            if (!(await vfs.exists(candidate))) continue
            const raw = await vfs.readFile(candidate)
            const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw)
            sidecarProject = JSON.parse(text)
            sidecarPath = candidate
            break
          }
        } catch (error) {
          console.warn('[AdvancedVideoEditor] 读取成片 JSON 失败:', error)
        }

        // 🎨 成片全局参数旁车 JSON：若存在，把全局参数整体还原，方便二次加工
        // 预览与再导出沿用同一套全局参数（含模板混剪字体配置等）。VideoPreview
        // 每 500ms 会重新读取全局参数，还原后预览自动跟随。
        try {
          const globalConfigPath = requestPath.replace(/\.[^./\\]+$/u, '.rjcut-global.json')
          if (await vfs.exists(globalConfigPath)) {
            const rawGlobal = await vfs.readFile(globalConfigPath)
            const globalText = typeof rawGlobal === 'string' ? rawGlobal : new TextDecoder().decode(rawGlobal)
            const globalConfig = JSON.parse(globalText)
            if (globalConfig?.global_params) {
              persistGlobalParams(globalConfig.global_params)
              console.log('[AdvancedVideoEditor] 已从成片全局参数 JSON 还原全局参数')
            }
          }
        } catch (globalErr) {
          console.warn('[AdvancedVideoEditor] 读取成片全局参数 JSON 失败:', globalErr)
        }

        const timelinePayload = sidecarProject?.timeline || sidecarProject || null

        const sourceCandidates = await Promise.all([
          sidecarProject?.advanced_edit?.source_video_vfs_path,
          sidecarProject?.source_video_vfs_path,
          sidecarProject?.digital_human?.video_vfs_path,
        ].map(resolveExistingLinkedPath))
        const sourceCandidate = sourceCandidates.find((path) => path && path !== requestPath) || ''
        const primaryPath = sourceCandidate || requestPath
        const primaryName = primaryPath.split('/').pop() || requestName
        const primaryBlob = await vfs.readFileAsBlob(primaryPath)
        const primaryType = mediaTypeFromName(primaryName)
        const primaryFile = new File([primaryBlob], primaryName, { type: mediaMimeType(primaryName, primaryType) })
        const primaryDetails = await readMediaDetails(primaryBlob, primaryName, primaryType)
        const primaryId = `vfs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        const mediaIdByPath = new Map([[primaryPath, primaryId]])
        const primaryParentPath = primaryPath.slice(0, primaryPath.lastIndexOf('/')) || '/'
        // 成片 JSON 经常只保存素材文件名；原片所在目录优先于成片目录。
        linkedPathRoots = [...new Set([primaryParentPath, requestParentPath])]
        const parentPath = primaryParentPath

        timelineStore.addMediaFile({
          id: primaryId,
          name: primaryName,
          duration_ms: Math.round(primaryDetails.duration * 1000),
          type: primaryType,
          width: primaryDetails.width,
          height: primaryDetails.height,
          size: primaryBlob.size,
          vfsPath: primaryPath,
          source: sourceCandidate ? 'file-browser-context-source-video' : 'file-browser-context-menu',
        }, primaryFile)

        const importMedia = async (path, name, source) => {
          const normalizedPath = await resolveExistingLinkedPath(path)
          if (!normalizedPath || mediaIdByPath.has(normalizedPath) || cancelled) {
            return mediaIdByPath.get(normalizedPath) || null
          }
          const mediaName = name || normalizedPath.split('/').pop() || '关联素材'
          const type = mediaTypeFromName(mediaName)
          const blob = await vfs.readFileAsBlob(normalizedPath)
          const details = await readMediaDetails(blob, mediaName, type)
          const file = new File([blob], mediaName, { type: mediaMimeType(mediaName, type) })
          const mediaId = `vfs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
          timelineStore.addMediaFile({
            id: mediaId,
            name: mediaName,
            duration_ms: Math.round(details.duration * 1000),
            type,
            width: details.width,
            height: details.height,
            size: blob.size,
            vfsPath: normalizedPath,
            source,
          }, file)
          mediaIdByPath.set(normalizedPath, mediaId)
          return mediaId
        }

        // 成片旁边的同名音频/画面素材先进入 VFS 素材库，轨道会在 JSON 关联关系
        // 读取完后一次性生成。
        const stem = primaryName.replace(/\.[^.]+$/u, '')
        const siblings = await vfs.listDirectory(parentPath)
        for (const entry of siblings) {
          if (cancelled || !entry.isFile || entry.path === primaryPath) continue
          const entryStem = String(entry.name || '').replace(/\.[^.]+$/u, '')
          const extension = String(entry.name || '').split('.').pop()?.toLowerCase()
          if (entryStem !== stem || !IMPORTABLE_MEDIA_EXTENSIONS.has(extension)) continue
          await importMedia(entry.path, entry.name, 'vfs-related-media')
        }

        // JSON 明确绑定的音频、场景视频、旧高级剪辑片段也都接入同一套媒体 ID 映射。
        if (sidecarProject) {
          const linkedPathValues = [
            sidecarProject.digital_human?.audio_vfs_path,
            ...(timelinePayload?.segments || []).flatMap((segment) => [
              segment.scene_vfs_path,
              segment.scene_file,
            ]),
            ...(sidecarProject.advanced_edit?.clips || []).map((clip) => clip.media_vfs_path),
          ]
          const linkedPaths = []
          for (const linkedPathValue of linkedPathValues) {
            const linkedPath = await resolveExistingLinkedPath(linkedPathValue)
            if (linkedPath && linkedPath !== primaryPath) linkedPaths.push(linkedPath)
          }
          for (const linkedPath of new Set(linkedPaths)) {
            const linkedName = linkedPath.split('/').pop() || '关联素材'
            await importMedia(linkedPath, linkedName, 'vfs-json-linked-media')
          }
        }

        // 有数字人 JSON 时按原始 segment 建立可见的“原生视频 / 素材视频 / 配音”
        // 三层结构。原生视频始终保留，素材视频叠在上方，用户可以独立移动、切割、
        // 隐藏或替换；导出仍能通过 clip 元数据回到原始 JSON。
        const rawSegments = Array.isArray(timelinePayload?.segments)
          ? timelinePayload.segments
          : []
        const toTimelineMs = (milliseconds, seconds, fallback = 0) => {
          const ms = Number(milliseconds)
          if (Number.isFinite(ms)) return Math.max(0, Math.round(ms))
          const sec = Number(seconds)
          return Number.isFinite(sec) ? Math.max(0, Math.round(sec * 1000)) : fallback
        }
        const importedSegments = rawSegments.map((segment, index) => {
          const startMs = toTimelineMs(segment.start_ms, segment.start, 0)
          const rawEndMs = toTimelineMs(
            segment.end_ms,
            segment.end,
            startMs + Number(segment.duration_ms || 0),
          )
          const endMs = Math.max(startMs + 100, rawEndMs)
          return {
            ...segment,
            id: segment.id || `segment_${index + 1}`,
            start_ms: startMs,
            end_ms: endMs,
            duration_ms: endMs - startMs,
          }
        }).filter((segment) => segment.end_ms > segment.start_ms)
        const rawGaps = getTimelineGaps(importedSegments)
        if (rawGaps.length) {
          console.warn('[AdvancedVideoEditor] 已封闭源时间轴空档:', rawGaps)
        }
        const segments = closeTimelineSegmentGaps(importedSegments)
        let generatedSegmentClips = 0
        for (const [index, segment] of segments.entries()) {
          const startMs = segment.start_ms
          const endMs = segment.end_ms
          const durationMs = endMs - startMs
          const segmentId = segment.id || `segment_${index + 1}`

          timelineStore.addClip({
            mediaId: primaryId,
            start_ms: startMs,
            duration_ms: durationMs,
            track: 'human_1',
            type: 'human',
            offset_ms: startMs,
            source_segment_id: segmentId,
            char_start: segment.char_start,
            char_end: segment.char_end,
            source_vfs_path: primaryPath,
          })
          generatedSegmentClips += 1

          const scenePath = await resolveExistingLinkedPath(segment.scene_vfs_path || segment.scene_file)
          const sceneMediaId = mediaIdByPath.get(scenePath)
          if (sceneMediaId) {
            timelineStore.addClip({
              mediaId: sceneMediaId,
              start_ms: startMs,
              duration_ms: durationMs,
              track: 'scene_1',
              type: 'scene',
              offset_ms: 0,
              source_segment_id: segmentId,
              scene_file: segment.scene_file || scenePath.split('/').pop(),
              scene_vfs_path: scenePath,
            })
          }
        }

        const audioPath = await resolveExistingLinkedPath(
          sidecarProject?.digital_human?.audio_vfs_path || sidecarProject?.audio_vfs_path,
        )
        const audioMediaId = mediaIdByPath.get(audioPath)
        const audioMedia = audioMediaId ? timelineStore.getState().mediaFiles[audioMediaId] : null
        if (audioMediaId && audioMedia) {
          timelineStore.addClip({
            mediaId: audioMediaId,
            start_ms: 0,
            duration_ms: Math.max(1000, Number(audioMedia.duration_ms || totalDuration_ms || 1000)),
            track: 'audio_1',
            type: 'audio',
            offset_ms: 0,
            source_vfs_path: audioPath,
          })
        }

        if (generatedSegmentClips === 0 && primaryType === 'video') {
          timelineStore.addClip({
            mediaId: primaryId,
            start_ms: 0,
            duration_ms: Math.max(1000, Math.round(primaryDetails.duration * 1000)),
            track: 'video_1',
            type: 'video',
            offset_ms: 0,
            source_vfs_path: primaryPath,
          })
        }

        if (!cancelled) {
          // 🎨 二次加工进入高级剪辑时，必须让“保存 JSON / 同步时间轴到 JSON”可用。
          // activeProject 由 metadataByMediaId[activeMediaId] 派生（见下方 effect），
          // 而普通模板混剪成片没有数字人 .rjdh.json 旁车，自动发现不会写入 metadataByMediaId，
          // 导致 activeProject 为 null、保存按钮整体禁用。这里显式补一份可保存的项目。
          const editProject = sidecarProject || {
            schema: 'rjcut.advanced-edit/v1',
            advanced_edit: {
              schema: 'rjcut.advanced-edit/v1',
              source_video_vfs_path: primaryPath,
              edited_at: new Date().toISOString(),
            },
          }
          const editProjectPath = sidecarPath || metadataPathForVideo(primaryPath)
          setTimelineProjectByMediaId((current) => ({
            ...current,
            [primaryId]: { project: editProject, path: editProjectPath },
          }))
          setActiveMediaId(primaryId)
          setLastImportedRequest(requestKey)
        }
      } catch (error) {
        if (!cancelled) setRequestImportError(error.message || '从文件浏览器载入素材失败')
      } finally {
        if (!cancelled) setIsImportingRequest(false)
      }
    }
    importRequestedVideo()
    return () => { cancelled = true }
  }, [initialMediaRequest, lastImportedRequest, requestKey, vfs])

  // 保留旧高级剪辑容器的场景素材映射，供数字人模式导出时按素材名替换画面。
  useEffect(() => {
    const nextSceneFiles = {}
    clips.filter((clip) => clip.type === 'scene').forEach((clip) => {
      const file = mediaFileRegistry.get(clip.mediaId)
      const media = mediaFiles[clip.mediaId]
      if (file && media?.name) nextSceneFiles[media.name] = file
    })
    setSceneFilesMap(nextSceneFiles)
  }, [clips, mediaFiles])

  // 媒体库导入后，按统一的“视频旁边放 .rjdh.json”规则发现数字人信息。
  useEffect(() => {
    if (!vfs || !mediaSignature) return undefined
    let cancelled = false
    const loadMetadata = async () => {
      setIsLoadingMetadata(true)
      const next = {}
      for (const media of Object.values(mediaFiles)) {
        if (!VIDEO_TYPES.has(media.type) || !media.vfsPath) continue
        const projectPath = sidecarPathForVideo(media.vfsPath)
        try {
          if (await vfs.exists(projectPath)) {
            const project = await readDigitalHumanProject(vfs, projectPath)
            next[media.id] = { project, path: projectPath, kind: 'digital-human' }
            continue
          }
          const genericPath = metadataPathForVideo(media.vfsPath)
          if (genericPath !== projectPath && await vfs.exists(genericPath)) {
            const raw = await vfs.readFile(genericPath)
            const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw)
            next[media.id] = { project: JSON.parse(text), path: genericPath, kind: 'generic' }
          }
        } catch (error) {
          console.warn('[AdvancedVideoEditor] 读取旁车 JSON 失败:', media.vfsPath, error)
        }
      }
      if (cancelled) return
      setMetadataByMediaId(next)
      setIsLoadingMetadata(false)
    }
    loadMetadata()
    return () => { cancelled = true }
  }, [vfs, mediaSignature])

  // 选择时间轴片段时，右侧自动跟随对应视频的 JSON。
  useEffect(() => {
    const nextMediaId = selectedMedia?.id
      || Object.keys(metadataByMediaId).find((mediaId) => mediaFiles[mediaId])
      || Object.values(mediaFiles).find((media) => VIDEO_TYPES.has(media.type))?.id
      || null
    if (!nextMediaId || nextMediaId === activeMediaId) return
    setActiveMediaId(nextMediaId)
  }, [selectedMedia?.id, mediaSignature, activeMediaId, metadataByMediaId])

  useEffect(() => {
    // 🎨 二次加工进入高级剪辑时，普通模板混剪成片没有数字人 .rjdh.json 旁车，
    // 自动发现不会写入 metadataByMediaId；这里回退到 timelineProjectByMediaId
    // （载入流程里显式写入），保证 activeProject 不为 null、保存按钮可用。
    const entry = activeMediaId
      ? (metadataByMediaId[activeMediaId] || timelineProjectByMediaId[activeMediaId])
      : null
    setActiveProject(entry?.project || null)
    setActiveProjectPath(entry?.path || '')
    setJsonDraft(entry?.project ? JSON.stringify(entry.project, null, 2) : '')
    setJsonError('')
    setMetadataError('')
    setMetadataDirty(false)
  }, [activeMediaId, metadataByMediaId, timelineProjectByMediaId])

  // 时间轴发生切割、修剪或移动后，提示 JSON 需要同步保存。
  useEffect(() => {
    if (activeProject && activeMediaId && clipSignature) setMetadataDirty(true)
  }, [clipSignature, activeMediaId, activeProject])

  useEffect(() => {
    if (!onExitFocusMode) return undefined
    const handleEscape = (event) => {
      if (event.key === 'Escape') onExitFocusMode()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onExitFocusMode])

  const handleSaveMetadata = useCallback(async () => {
    if (!activeProject || !activeMediaId || !vfs) return
    const media = mediaFiles[activeMediaId]
    const targetPath = activeProjectPath || metadataPathForVideo(media?.vfsPath)
    if (!targetPath) {
      setMetadataError('当前素材没有 VFS 路径，无法保存旁车 JSON。请先从素材库导入。')
      return
    }

    setIsSavingMetadata(true)
    setMetadataError('')
    try {
      const nextProject = Array.isArray(activeProject.char_timings)
        ? buildAdvancedEditedProject(activeProject, clips, mediaFiles, activeMediaId)
        : {
            ...activeProject,
            advanced_edit: {
              ...(activeProject.advanced_edit || {}),
              schema: ADVANCED_EDIT_SCHEMA,
              edited_at: new Date().toISOString(),
              clips: clips.filter((clip) => clip.mediaId === activeMediaId).map((clip) => ({
                id: clip.id,
                start_ms: clip.start_ms,
                duration_ms: clip.duration_ms,
                offset_ms: clip.offset_ms,
                track: clip.track,
              })),
            },
          }
      await vfs.writeFile(targetPath, new TextEncoder().encode(JSON.stringify(nextProject, null, 2)))
      setActiveProject(nextProject)
      setJsonDraft(JSON.stringify(nextProject, null, 2))
      setMetadataByMediaId((current) => ({ ...current, [activeMediaId]: { project: nextProject, path: targetPath, kind: 'digital-human' } }))
      setActiveProjectPath(targetPath)
      setMetadataDirty(false)
    } catch (error) {
      setMetadataError(error.message || '保存 JSON 失败')
    } finally {
      setIsSavingMetadata(false)
    }
  }, [activeMediaId, activeProject, activeProjectPath, clips, mediaFiles, vfs])

  // 🎨 随"导出视频"一起保存加工后的项目数据到 JSON（<成片>.rjdh.json 旁车）。
  // 这样点一次导出即可同时：重新生成加工后视频 + 落盘加工后数据，下一轮二次加工能完整还原。
  const handleExportComplete = useCallback(async (exportInfo) => {
    const { savePath, primarySourceVideoVfsPath } = exportInfo || {}
    if (!savePath || !activeProject || !activeMediaId || !vfs) return
    try {
      const nextProject = Array.isArray(activeProject.char_timings)
        ? buildAdvancedEditedProject(activeProject, clips, mediaFiles, activeMediaId)
        : {
            ...activeProject,
            advanced_edit: {
              ...(activeProject.advanced_edit || {}),
              schema: ADVANCED_EDIT_SCHEMA,
              edited_at: new Date().toISOString(),
              clips: clips
                .filter((clip) => clip.mediaId === activeMediaId)
                .map((clip) => ({
                  id: clip.id,
                  start_ms: clip.start_ms,
                  duration_ms: clip.duration_ms,
                  offset_ms: clip.offset_ms,
                  track: clip.track,
                })),
            },
          }
      // source_video_vfs_path 指向本次加工所用的原生视频，方便下一轮二次加工还原主轨
      const sourcePath = primarySourceVideoVfsPath || mediaFiles[activeMediaId]?.vfsPath || ''
      if (sourcePath) {
        nextProject.source_video_vfs_path = sourcePath
        if (nextProject.advanced_edit) nextProject.advanced_edit.source_video_vfs_path = sourcePath
      }
      const stem = savePath.replace(/\.[^./\\]+$/u, '')
      const projectPath = `${stem}.rjdh.json`
      await vfs.writeFile(projectPath, new TextEncoder().encode(JSON.stringify(nextProject, null, 2)))
      console.log('[AdvancedVideoEditor] 已随导出保存加工后项目 JSON:', projectPath)
    } catch (error) {
      console.warn('[AdvancedVideoEditor] 导出时保存加工后项目 JSON 失败（不影响成片）:', error)
    }
  }, [activeMediaId, activeProject, clips, mediaFiles, vfs])

  const handleApplyJson = () => {
    const parsed = parseJson(jsonDraft)
    if (parsed.error) {
      setJsonError(parsed.error)
      return
    }
    try {
      validateAdvancedProject(parsed.value)
      setActiveProject(parsed.value)
      setJsonError('')
      setMetadataDirty(true)
    } catch (error) {
      setJsonError(error.message || 'JSON 校验失败')
    }
  }

  const handleResetJson = () => {
    if (activeProject) setJsonDraft(JSON.stringify(activeProject, null, 2))
    setJsonError('')
  }

  if (isBooting) {
    return (
      <div className="advanced-editor-loading video-editor-theme">
        <div className="advanced-editor-loading-card">
          <div className="loading-spinner" />
          <p>正在准备高级剪辑工作区</p>
          <span>首次加载视频处理引擎可能需要几秒钟</span>
        </div>
      </div>
    )
  }

  return (
    <div className={`video-editor-theme advanced-editor-shell flex flex-col overflow-hidden w-full h-full rounded-none ${leftCollapsed ? 'is-left-collapsed' : ''} ${rightCollapsed ? 'is-right-collapsed' : ''}`}>
      <header className="advanced-editor-topbar flex items-center justify-between px-5 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {onExitFocusMode && (
            <button className="advanced-editor-nav-toggle" onClick={onExitFocusMode} title="返回主创作台">
              <ArrowLeft size={15} />
              <span>返回创作台</span>
            </button>
          )}
          <div className="advanced-editor-brand-mark"><Film size={17} /></div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-[15px] font-bold text-white">高级剪辑</h1>
              <span className="advanced-editor-badge"><Sparkles size={11} />传统剪辑 + JSON</span>
            </div>
            <p className="text-[11px] text-slate-500 truncate">原生视频二次剪辑，同时保留字级时间与场景绑定</p>
          </div>
          <span className={`advanced-editor-engine ${isWasmReady ? 'ready' : 'warning'}`}>
            <Zap size={11} /> {isWasmReady ? '引擎就绪' : isWasmInitializing ? '初始化中' : '预览模式'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {metadataDirty && <span className="text-[11px] text-amber-300">JSON 有未保存修改</span>}
          <button
            className="advanced-editor-panel-toggle"
            onClick={() => setLeftCollapsed((value) => !value)}
            title={leftCollapsed ? '展开素材面板' : '收起素材面板'}
          >
            {leftCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
          </button>
          <button
            className="advanced-editor-panel-toggle"
            onClick={() => setRightCollapsed((value) => !value)}
            title={rightCollapsed ? '展开信息面板' : '收起信息面板'}
          >
            {rightCollapsed ? <PanelRightOpen size={15} /> : <PanelRightClose size={15} />}
          </button>
          <button
            onClick={handleSaveMetadata}
            disabled={!activeProject || isSavingMetadata}
            className="advanced-editor-action secondary"
            title="把时间轴切割结果同步到旁车 JSON"
          >
            <Save size={14} /> {isSavingMetadata ? '保存中…' : '保存 JSON'}
          </button>
          <button onClick={() => setPanel('export')} className="advanced-editor-action primary">
            <Download size={14} /> 导出视频
          </button>
        </div>
      </header>

      {engineError && (
        <div className="advanced-editor-notice warning"><AlertCircle size={14} /> {engineError}，当前仍可进行时间轴编辑。</div>
      )}
      {isImportingRequest && (
        <div className="advanced-editor-notice info"><Film size={14} /> 正在从 VFS 载入原生视频、旁车 JSON 和关联场景素材…</div>
      )}
      {requestImportError && (
        <div className="advanced-editor-notice warning"><AlertCircle size={14} /> {requestImportError}</div>
      )}

      <div className="advanced-editor-workspace flex flex-1 min-h-0 overflow-hidden">
        <aside className="advanced-editor-assets flex-shrink-0">
          <div className="advanced-editor-rail">
            <button className="active" title="素材"><FolderOpen size={18} /></button>
            <button title="文字"><Type size={18} /></button>
            <button title="贴纸"><Smile size={18} /></button>
            <button title="效果"><WandSparkles size={18} /></button>
            <button title="字幕"><FileJson size={18} /></button>
            <div className="advanced-editor-rail-spacer" />
            <button title="工作区设置"><SlidersHorizontal size={18} /></button>
          </div>
          <div className="advanced-editor-assets-content">
            <div className="advanced-editor-panel-heading">
              <div><span className="eyebrow">PROJECT</span><h2>素材</h2></div>
              <Layers3 size={16} className="text-slate-400" />
            </div>
            <div className="advanced-editor-tool-tabs">
              <span className="active"><Film size={14} /> 媒体库</span>
              <span><SlidersHorizontal size={14} /> 工具</span>
            </div>
            <MediaLibraryVFS vfs={vfs} />
          </div>
        </aside>

        <main className="advanced-editor-center flex flex-col min-w-0 min-h-0 flex-1">
          <div className="advanced-editor-canvas flex-1 min-h-0">
            <VideoPreview project={subtitleProject} />
          </div>
          <div className="advanced-editor-timeline flex-shrink-0">
            <Timeline />
          </div>
        </main>

        <aside className="advanced-editor-inspector flex-shrink-0">
          <div className="advanced-editor-inspector-tabs">
            <button className={panel === 'inspector' ? 'active' : ''} onClick={() => setPanel('inspector')}><SlidersHorizontal size={14} /> 属性</button>
            <button className={panel === 'json' ? 'active' : ''} onClick={() => setPanel('json')}><FileJson size={14} /> JSON 信息</button>
            <button className={panel === 'export' ? 'active' : ''} onClick={() => setPanel('export')}><Download size={14} /> 导出</button>
          </div>

          {panel === 'export' ? (
            <ExportPanelVFS vfs={vfs} sceneFilesMap={sceneFilesMap} onExportComplete={handleExportComplete} />
          ) : panel === 'json' ? (
            <JsonInspector
              project={activeProject}
              projectPath={activeProjectPath}
              jsonDraft={jsonDraft}
              jsonError={jsonError}
              isLoading={isLoadingMetadata}
              onChange={setJsonDraft}
              onApply={handleApplyJson}
              onReset={handleResetJson}
            />
          ) : (
            <MetadataInspector
              activeMedia={activeMedia}
              activeProject={activeProject}
              selectedClip={selectedClip}
              selectedMedia={selectedMedia}
              stats={stats}
              totalDurationMs={totalDuration_ms}
              metadataError={metadataError}
              onSelectMedia={setActiveMediaId}
              mediaFiles={mediaFiles}
              metadataByMediaId={metadataByMediaId}
              onSave={handleSaveMetadata}
              isSaving={isSavingMetadata}
            />
          )}
        </aside>
      </div>
    </div>
  )
}

function MetadataInspector({
  activeMedia,
  activeProject,
  selectedClip,
  selectedMedia,
  stats,
  totalDurationMs,
  metadataError,
  mediaFiles,
  metadataByMediaId,
  onSelectMedia,
  onSave,
  isSaving,
}) {
  const metadataMedia = Object.keys(metadataByMediaId)
    .map((id) => mediaFiles[id])
    .filter(Boolean)

  return (
    <div className="advanced-editor-inspector-body">
      <div className="advanced-editor-panel-heading compact">
        <div><span className="eyebrow">INSPECTOR</span><h2>剪辑信息</h2></div>
        <Code2 size={16} className="text-slate-500" />
      </div>

      {metadataMedia.length > 0 && (
        <div className="advanced-editor-field">
          <label>当前 JSON 素材</label>
          <select value={activeMedia?.id || ''} onChange={(event) => onSelectMedia(event.target.value)}>
            {metadataMedia.map((media) => <option key={media.id} value={media.id}>{media.name}</option>)}
          </select>
        </div>
      )}

      {activeProject ? (
        <>
          <div className="advanced-editor-json-status success"><CheckCircle2 size={14} /><span>已发现旁车 JSON</span></div>
          <div className="advanced-editor-path" title={activeProject?.digital_human?.video_vfs_path}>{activeProject?.digital_human?.video_vfs_path || activeMedia?.vfsPath || '未记录 VFS 路径'}</div>
          <div className="advanced-editor-stat-grid">
            <Stat label="时长" value={formatDuration(stats.durationMs || totalDurationMs)} />
            <Stat label="字级时间" value={`${stats.charTimingCount} 条`} />
            <Stat label="场景段" value={`${stats.sceneCount} 段`} />
            <Stat label="时间轴" value={`${stats.segmentCount} 段`} />
          </div>
          {stats.hasAdvancedEdit && <div className="advanced-editor-json-status info"><Code2 size={14} /> 已记录非破坏性剪辑映射</div>}
        </>
      ) : (
        <div className="advanced-editor-empty-inspector">
          <FileJson size={30} />
          <strong>{activeMedia ? '未找到旁车 JSON' : '先把视频加入时间轴'}</strong>
          <p>{activeMedia ? '数字人素材应与视频放在同一目录，并使用同名 .rjdh.json。' : '从左侧导入素材，双击或点击 + 加入时间轴。'}</p>
        </div>
      )}

      {selectedClip && (
        <div className="advanced-editor-section">
          <div className="advanced-editor-section-title">选中片段</div>
          <div className="advanced-editor-detail-list">
            <Detail label="素材" value={selectedMedia?.name || selectedClip.mediaId} />
            <Detail label="轨道" value={selectedClip.track} />
            <Detail label="时间轴入点" value={formatDuration(selectedClip.start_ms)} />
            <Detail label="源素材入点" value={formatDuration(selectedClip.offset_ms)} />
            <Detail label="片段时长" value={formatDuration(selectedClip.duration_ms)} />
          </div>
        </div>
      )}

      {metadataError && <div className="advanced-editor-json-status error"><AlertCircle size={14} /> {metadataError}</div>}
      <button className="advanced-editor-wide-button" onClick={onSave} disabled={!activeProject || isSaving}>
        <Save size={14} /> {isSaving ? '正在同步…' : '同步时间轴到 JSON'}
      </button>
      <p className="advanced-editor-hint">分割、修剪、移动后，原始字级时间会保存在 <code>advanced_edit.source_char_timings</code>，当前时间轴使用重定位后的映射。</p>
    </div>
  )
}

function JsonInspector({ project, projectPath, jsonDraft, jsonError, isLoading, onChange, onApply, onReset }) {
  return (
    <div className="advanced-editor-inspector-body json-panel">
      <div className="advanced-editor-panel-heading compact">
        <div><span className="eyebrow">DATA</span><h2>JSON 信息</h2></div>
        <FileJson size={16} className="text-slate-500" />
      </div>
      <div className="advanced-editor-path" title={projectPath}>{projectPath || '尚未选择旁车 JSON'}</div>
      {isLoading && <div className="advanced-editor-loading-line">正在读取素材旁车 JSON…</div>}
      {!project && !isLoading && <div className="advanced-editor-empty-inspector small"><FileJson size={24} /><p>选择带有 .rjdh.json 的数字人视频后，这里会显示完整信息。</p></div>}
      {(project || jsonDraft) && (
        <>
          <textarea className="advanced-editor-json-editor" value={jsonDraft} onChange={(event) => onChange(event.target.value)} spellCheck="false" />
          {jsonError && <div className="advanced-editor-json-status error"><AlertCircle size={14} /> {jsonError}</div>}
          <div className="advanced-editor-json-actions">
            <button onClick={onReset}><span>还原</span></button>
            <button onClick={onApply} className="primary"><CheckCircle2 size={14} /> 应用 JSON</button>
          </div>
          <p className="advanced-editor-hint">编辑后先点“应用 JSON”校验，再点顶部“保存 JSON”写回素材旁车文件。</p>
        </>
      )}
    </div>
  )
}

function Stat({ label, value }) {
  return <div className="advanced-editor-stat"><span>{label}</span><strong>{value}</strong></div>
}

function Detail({ label, value }) {
  return <div><span>{label}</span><strong title={value}>{value}</strong></div>
}
