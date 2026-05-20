/**
 * API 客户端 - 支持分片上传与任务取消
 */
import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8001';
const DEFAULT_API_KEY = 'rjk_oG3u1bRu10myprstb5o2AYVW6v9HipNT33ALuJTmFxaqemUC';

// 创建 axios 实例
const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器 - 添加 API Key
export const setApiKey = (apiKey) => {
  apiClient.defaults.headers.common['Authorization'] = `Bearer ${apiKey}`;
};

// 初始化 API Key
setApiKey(DEFAULT_API_KEY);

// =====================================================
// 商户信息
// =====================================================
export const getMerchantInfo = () => apiClient.get('/v1/merchant/info');

// =====================================================
// 文件上传流程 (普通/分片)
// =====================================================

// 小文件直传 - 获取预签名 URL
export const presignUpload = (filename, content_type, purpose) =>
  apiClient.post('/v1/uploads/presign', { filename, content_type, purpose });

// 确认上传完成
export const confirmUpload = (upload_id) =>
  apiClient.post('/v1/uploads/confirm', { upload_id });

// 大文件分片上传 - 初始化
export const initMultipartUpload = (filename, content_type, purpose, parts_count) =>
  apiClient.post('/v1/uploads/multipart/start', { filename, content_type, purpose, parts_count });

// 获取分片预签名 URLs
export const getMultipartPresignedUrls = (upload_id, part_numbers) =>
  apiClient.post('/v1/uploads/multipart/presign-parts', { upload_id, part_numbers });

// 完成分片上传
export const completeMultipartUpload = (upload_id, parts) =>
  apiClient.post('/v1/uploads/multipart/complete', { upload_id, parts });

// =====================================================
// 任务发起
// =====================================================
export const createDraftTask = (payload) => apiClient.post('/v1/tasks/agent-draft', payload);
export const createComposeTask = (payload) => apiClient.post('/v1/tasks/compose-from-draft', payload);

// =====================================================
// 轮询与详情
// =====================================================
export const getTaskStatus = (task_id) => apiClient.get(`/v1/tasks/${task_id}`);
export const getDraftDetail = (task_id) => apiClient.get(`/v1/drafts/${task_id}`);

// =====================================================
// 下载产物
// =====================================================
export const getTaskFileUrl = (task_id, file_key) => 
  apiClient.get(`/v1/tasks/${task_id}/files/${file_key}`);

// =====================================================
// 取消任务
// =====================================================
export const cancelTask = (task_id, reason = '用户取消') => 
  apiClient.post(`/v1/tasks/${task_id}/cancel`, { reason });

// =====================================================
// 任务列表
// =====================================================
export const getTaskList = (limit = 50) => apiClient.get(`/v1/tasks?limit=${limit}`);
