/**
 * 批量任务运行器 - 支持大文件分片上传与任务取消
 */
import pLimit from 'p-limit';
import * as api from './api';
import { getVFS } from '../utils/vfsClient';

/**
 * 任务项接口
 * @typedef {Object} BatchTaskItem
 * @property {string} id - 任务 ID
 * @property {string} vfsVideoPath - VFS 视频路径
 * @property {string} [vfsScriptPath] - VFS 脚本路径
 * @property {string} [vfsCorrectionsPath] - VFS 修正路径
 * @property {string} [vfsBgmPath] - VFS 背景音乐路径
 * @property {TaskStage} stage - 当前阶段
 * @property {number} progress - 进度 (0-100)
 * @property {string} [error] - 错误信息
 * @property {string} [draftTaskId] - 草稿任务 ID
 * @property {string} [composeTaskId] - 合成任务 ID
 */

/**
 * 任务阶段
 * @typedef {'idle'|'uploading'|'drafting'|'composing'|'downloading'|'succeeded'|'failed'|'cancelled'} TaskStage
 */

export class BatchTaskRunner {
  /**
   * @param {BatchTaskItem[]} tasks - 任务列表
   * @param {number} maxConcurrent - 最大并发数
   * @param {(tasks: BatchTaskItem[]) => void} onUpdate - 更新回调
   */
  constructor(tasks, maxConcurrent, onUpdate) {
    this.tasks = tasks;
    this.maxConcurrent = maxConcurrent;
    this.limit = pLimit(maxConcurrent);
    this.onUpdate = onUpdate;
    this.abortController = new AbortController();
    this.vfs = null;
  }

  /**
   * 更新任务状态
   * @param {string} id - 任务 ID
   * @param {Partial<BatchTaskItem>} partial - 部分更新
   */
  updateTask(id, partial) {
    const idx = this.tasks.findIndex(t => t.id === id);
    if (idx !== -1) {
      this.tasks[idx] = { ...this.tasks[idx], ...partial };
      this.onUpdate([...this.tasks]);
    }
  }

  /**
   * 检查是否被取消
   * @param {AbortSignal} signal 
   */
  checkAborted(signal) {
    if (signal.aborted) {
      throw new DOMException('Task cancelled by user', 'AbortError');
    }
  }

  /**
   * 获取 VFS 实例
   */
  async getVFS() {
    if (!this.vfs) {
      const vfsInstance = getVFS();
      await vfsInstance.init();
      this.vfs = vfsInstance;
    }
    return this.vfs;
  }

  /**
   * 核心：VFS Blob -> OSS Key（通过系统配置的 API relay）
   * @param {string} vfsPath - VFS 文件路径
   * @param {'input'|'scenes'} purpose - 上传目的
   * @param {AbortSignal} signal - 取消信号
   * @returns {Promise<string>} OSS Key
   */
  async uploadVFSFileToOSS(vfsPath, purpose, signal) {
    this.checkAborted(signal);
    
    const vfs = await this.getVFS();
    const fileBlob = await vfs.readFileAsBlob(vfsPath);
    const filename = vfsPath.split('/').pop() || 'file';
    const payload = await api.relayUpload(fileBlob, filename, purpose, { signal });
    return payload.data.oss_key;
  }

  /**
   * 轮询任务状态 (支持中断)
   * @param {string} taskId - 任务 ID
   * @param {string} currentTaskId - 当前运行任务 ID
   * @param {number} stageProgressBase - 阶段基础进度
   * @param {number} stageWeight - 阶段权重
   * @param {AbortSignal} signal - 取消信号
   * @returns {Promise<void>}
   */
  async pollTaskStatus(taskId, currentTaskId, stageProgressBase, stageWeight, signal) {
    return new Promise((resolve, reject) => {
      const interval = setInterval(async () => {
        if (signal.aborted) {
          clearInterval(interval);
          // 通知后端取消任务
          try { 
            await api.cancelTask(taskId, '用户主动取消'); 
          } catch (e) {
            console.warn('取消任务失败:', e);
          }
          reject(new DOMException('Task cancelled by user', 'AbortError'));
          return;
        }

        try {
          const { data } = await api.getTaskStatus(taskId);
          const progress = stageProgressBase + (data.data.progress / 100) * stageWeight;
          this.updateTask(currentTaskId, { progress: Math.min(progress, 100) });

          if (data.data.status === 'succeeded') {
            clearInterval(interval);
            resolve();
          } else if (data.data.status === 'failed') {
            clearInterval(interval);
            reject(new Error(data.data.error_message || 'Task failed on server'));
          }
        } catch (err) {
          clearInterval(interval);
          reject(err);
        }
      }, 3000);
    });
  }

  /**
   * 单个任务的全生命周期
   * @param {BatchTaskItem} task - 任务项
   * @param {AbortSignal} signal - 取消信号
   */
  async processTask(task, signal) {
    try {
      // 阶段 1: 上传 (0% - 20%)
      this.updateTask(task.id, { stage: 'uploading', progress: 0 });
      
      const video_oss_key = await this.uploadVFSFileToOSS(
        task.vfsVideoPath, 
        'input', 
        signal
      );
      
      const script_oss_key = task.vfsScriptPath 
        ? await this.uploadVFSFileToOSS(task.vfsScriptPath, 'input', signal) 
        : undefined;
      
      const corrections_oss_key = task.vfsCorrectionsPath 
        ? await this.uploadVFSFileToOSS(task.vfsCorrectionsPath, 'input', signal) 
        : undefined;
      
      this.checkAborted(signal);
      const { data: merchantData } = await api.getMerchantInfo();

      // 阶段 2: 草稿 (20% - 50%)
      this.updateTask(task.id, { stage: 'drafting', progress: 20 });
      
      const { data: draftRes } = await api.createDraftTask({
        input: {
          video_url: video_oss_key,
          script_url: script_oss_key,
          corrections_url: corrections_oss_key,
          scene_base_url: merchantData.data.merchant_id,
        },
        pipeline: { remove_keyword: "转场", margin: 0.15 },
        asr: { model: "large-v3", language: "zh" },
        draft: { need_transcription: true, need_timeline: true }
      });
      
      const draftTaskId = draftRes.data.task_id;
      this.updateTask(task.id, { draftTaskId });
      
      await this.pollTaskStatus(draftTaskId, task.id, 20, 30, signal);

      // 阶段 3: 合成 (50% - 90%)
      this.checkAborted(signal);
      this.updateTask(task.id, { stage: 'composing', progress: 50 });
      
      const bgm_oss_key = task.vfsBgmPath 
        ? await this.uploadVFSFileToOSS(task.vfsBgmPath, 'input', signal) 
        : undefined;
      
      const { data: composeRes } = await api.createComposeTask({
        draft_task_id: draftTaskId,
        pipeline: { use_transitions: false, resync_subtitle: true },
        subtitle: { effect: "ad", font_size: 88 },
        audio: { bgm_url: bgm_oss_key, bgm_volume: 0.3 }
      });

      const composeTaskId = composeRes.data.task_id;
      this.updateTask(task.id, { composeTaskId });
      
      await this.pollTaskStatus(composeTaskId, task.id, 50, 40, signal);

      // 阶段 4: 下载回 VFS (90% - 100%)
      this.checkAborted(signal);
      this.updateTask(task.id, { stage: 'downloading', progress: 90 });
      
      const { data: fileData } = await api.getTaskFileUrl(composeTaskId, 'final_video');
      const res = await fetch(fileData.data.download_url, { signal });
      const blob = await res.blob();
      
      const outputDir = task.vfsVideoPath.substring(0, task.vfsVideoPath.lastIndexOf('/'));
      const vfs = await this.getVFS();
      await vfs.writeFile(`${outputDir}/output/final.mp4`, blob);

      this.updateTask(task.id, { stage: 'succeeded', progress: 100 });
    } catch (error) {
      if (error.name === 'AbortError') {
        this.updateTask(task.id, { stage: 'cancelled', error: '用户主动取消' });
      } else {
        console.error('任务处理失败:', error);
        this.updateTask(task.id, { 
          stage: 'failed', 
          error: error.message || '未知错误' 
        });
      }
    }
  }

  /**
   * 启动批处理池
   * @returns {Promise<void>}
   */
  async run() {
    const signal = this.abortController.signal;
    const promises = this.tasks.map(task => 
      this.limit(() => this.processTask(task, signal))
    );
    await Promise.all(promises);
  }

  /**
   * 外部触发：取消所有任务
   */
  abort() {
    this.abortController.abort();
  }
}
