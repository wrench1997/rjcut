/**
 * API 客户端 - 支持分片上传与任务取消
 */
import axios from 'axios';

const DEFAULT_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8001';
const DEFAULT_API_KEY = 'rjk_oG3u1bRu10myprstb5o2AYVW6v9HipNT33ALuJTmFxaqemUC';

// 获取 API 地址（支持从 localStorage 读取用户配置）
const getBaseUrl = () => {
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem('rjcut_api_base_url') || DEFAULT_BASE_URL;
  }
  return DEFAULT_BASE_URL;
};

// 创建 axios 实例
const apiClient = axios.create({
  baseURL: getBaseUrl(),
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器 - 动态设置 baseURL 和 API Key
apiClient.interceptors.request.use((config) => {
  // 每次请求前检查是否有新的 API 地址配置
  const baseUrl = getBaseUrl();
  if (baseUrl && config.baseURL !== baseUrl) {
    config.baseURL = baseUrl;
  }
  return config;
});

// 设置 API Key
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

// =====================================================
// 数字人 API
// =====================================================

// 获取公共数字人列表
export const getCommonPersons = () => apiClient.get('/v1/dh/persons/common');

// 获取自定义数字人列表
export const getCustomPersons = () => apiClient.get('/v1/dh/persons/custom');

// 获取自定义数字人详情
export const getCustomPersonDetail = (person_id) => apiClient.get(`/v1/dh/persons/custom/${person_id}`);

// 同步自定义数字人
export const syncCustomPersons = () => apiClient.post('/v1/dh/persons/custom/sync');

// 删除自定义数字人
export const deleteCustomPerson = (person_id) => apiClient.post(`/v1/dh/persons/custom/${person_id}/delete`);

// 获取声音列表
export const getVoices = () => apiClient.get('/v1/dh/voices');

// 删除定制声音
export const deleteVoice = (audio_id) => apiClient.post(`/v1/dh/voices/${audio_id}/delete`);

// 创建视频生成任务
export const createDhGenerateTask = (payload) => apiClient.post('/v1/dh/tasks/generate', payload);

// 创建自定义数字人训练任务
export const createDhPersonTask = (payload) => apiClient.post('/v1/dh/tasks/create-person', payload);

// 删除视频任务
export const deleteDhTask = (task_id) => apiClient.post(`/v1/dh/tasks/${task_id}/delete`);

// 删除文件
export const deleteDhFile = (file_id) => apiClient.post(`/v1/dh/files/${file_id}/delete`);

// =====================================================
// 数字人视频任务管理
// =====================================================
// 获取视频任务列表（支持筛选 dh_generate 类型和数字人 ID）
export const getDhTaskList = (status = null, limit = 20, offset = 0, personId = null) => {
  const params = new URLSearchParams({ limit, offset });
  if (status) params.append('status', status);
  if (personId) params.append('person_id', personId);
  return apiClient.get(`/v1/tasks?${params.toString()}`);
};

// 获取单个视频任务详情
export const getDhTaskDetail = (task_id) => apiClient.get(`/v1/tasks/${task_id}`);

// 删除视频任务
export const deleteDhVideoTask = (task_id) => apiClient.post(`/v1/dh/tasks/${task_id}/delete`);

// 获取视频文件下载 URL
export const getDhVideoUrl = (task_id) => apiClient.get(`/v1/tasks/${task_id}/files/final_video`);
