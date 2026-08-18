/**
 * API 客户端 - 统一使用系统 API 地址上传与处理任务
 */
import axios from 'axios';

const DEFAULT_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://112.111.7.91:8801';
const DEFAULT_API_KEY = 'rjk_oG3u1bRu10myprstb5o2AYVW6v9HipNT33ALuJTmFxaqemUC';
const LEGACY_BASE_URLS = new Set([
  'http://localhost:8000',
  'http://127.0.0.1:8000',
  'http://192.168.166.151:8000',
  'http://112.111.7.91:8801',
  'http://host.docker.internal:8000',
  'http://localhost:8001',
  'http://127.0.0.1:8001',
  'http://host.docker.internal:8001',
]);

// 获取 API 地址（支持从 localStorage 读取用户配置）
export const getBaseUrl = () => {
  if (typeof localStorage !== 'undefined') {
    const configured = (localStorage.getItem('rjcut_api_base_url') || '').replace(/\/$/, '');
    if (configured && !LEGACY_BASE_URLS.has(configured)) return configured;
  }
  return DEFAULT_BASE_URL;
};

export const getApiKey = () => {
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem('rjcut_api_key') || DEFAULT_API_KEY;
  }
  return DEFAULT_API_KEY;
};

// =====================================================
// 上游服务 Key（由 exe 设置页填写，随请求透传给后端，后端再用于调用上游）
// 因各上游尚未统一管控，数字人(蝉镜)、生成视频/文案(GenVideos)各自配置。
// =====================================================
const UPSTREAM_KEYS_STORAGE = 'rjcut_upstream_keys';
const DEFAULT_UPSTREAM_KEYS = {
  genvideos: '',       // GenVideos 网关 API Key（H3 视频与 DeepSeek 文案共用一把）
  chanjing_app_id: '', // 蝉镜数字人 App ID
  chanjing_secret: '', // 蝉镜数字人 Secret Key
};

export const getUpstreamKeys = () => {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_UPSTREAM_KEYS };
  try {
    const stored = JSON.parse(localStorage.getItem(UPSTREAM_KEYS_STORAGE) || 'null');
    return { ...DEFAULT_UPSTREAM_KEYS, ...(stored || {}) };
  } catch {
    return { ...DEFAULT_UPSTREAM_KEYS };
  }
};

export const setUpstreamKeys = (keys) => {
  if (typeof localStorage === 'undefined') return;
  const merged = { ...getUpstreamKeys(), ...(keys || {}) };
  localStorage.setItem(UPSTREAM_KEYS_STORAGE, JSON.stringify(merged));
  return merged;
};

function trimSlash(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

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
  // 设置 API Key
  const apiKey = getApiKey();
  if (apiKey) {
    config.headers.Authorization = `Bearer ${apiKey}`;
  }
  // 上游服务 Key 透传给后端（后端优先使用，未传则回退环境变量）
  const upstream = getUpstreamKeys();
  if (upstream.genvideos) config.headers['X-Genvideos-Api-Key'] = upstream.genvideos;
  if (upstream.chanjing_app_id) config.headers['X-Chanjing-App-Id'] = upstream.chanjing_app_id;
  if (upstream.chanjing_secret) config.headers['X-Chanjing-Secret-Key'] = upstream.chanjing_secret;
  return config;
});

// 响应拦截器 - 统一错误处理
apiClient.interceptors.response.use(
  (response) => {
    // 检查后端返回的业务错误码
    const data = response.data;
    if (data && typeof data === 'object') {
      // 如果后端返回了 code 字段且不为 0，表示业务错误
      if (data.code !== undefined && data.code !== 0 && data.code !== 200) {
        const detailMessage =
          (typeof data.detail === 'string' ? data.detail : data.detail?.message) ||
          data.error?.message ||
          data.msg ||
          data.message ||
          `请求失败（业务码 ${data.code}）`;
        const error = new Error(detailMessage);
        error.code = data.code;
        error.data = data.data;
        error.responseData = data;
        error.isBusinessError = true;
        error.isTokenExpired =
          detailMessage.includes('Token') ||
          detailMessage.includes('token') ||
          data.code === 401;
        throw error;
      }
    }
    return response;
  },
  (error) => {
    // 统一处理 HTTP 错误
    const errorMsg = error.response?.data?.message || error.message || '网络错误';
    const errorCode = error.response?.data?.code || error.response?.status || -1;
    
    // 创建带详细信息的错误对象
    const enhancedError = new Error(errorMsg);
    enhancedError.code = errorCode;
    enhancedError.originalError = error;
    enhancedError.responseData = error.response?.data;
    
    // 打印错误日志（开发环境）
    if (process.env.NODE_ENV === 'development') {
      console.error('[API Error]', {
        url: error.config?.url,
        method: error.config?.method,
        code: errorCode,
        message: errorMsg,
        responseData: error.response?.data,
      });
    }
    
    return Promise.reject(enhancedError);
  }
);

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
// 文件上传流程
// =====================================================

// 所有浏览器上传都经过系统配置的 API 地址，由 API 服务端转存到对象存储。
export const relayUpload = async (
  file,
  filename,
  purpose = 'input',
  { signal, apiBaseUrl, apiKey } = {},
) => {
  const baseUrl = (apiBaseUrl || getBaseUrl()).replace(/\/$/, '');
  const formData = new FormData();
  formData.append('file', file, filename);
  formData.append('purpose', purpose);

  const response = await fetch(`${baseUrl}/v1/uploads/relay`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey || getApiKey()}`,
    },
    body: formData,
    signal,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || (payload.code !== undefined && payload.code !== 0 && payload.code !== 200)) {
    const message = payload?.message || payload?.detail || `文件上传失败（HTTP ${response.status}）`;
    throw new Error(message);
  }
  return payload;
};

// 上传声音样本并创建蝉镜定制声音，密钥只由系统 API 服务端持有。
export const createCustomVoice = async ({
  file,
  name,
  language = 'cn',
  text = '',
  denoiseFlag = true,
  signal,
  apiBaseUrl,
  apiKey,
} = {}) => {
  if (!file) throw new Error('请选择声音文件');
  const baseUrl = (apiBaseUrl || getBaseUrl()).replace(/\/$/, '');
  const formData = new FormData();
  formData.append('file', file, file.name || 'custom-voice.audio');
  formData.append('name', name || file.name || '我的声音');
  formData.append('language', language);
  formData.append('text', text);
  formData.append('denoise_flag', String(Boolean(denoiseFlag)));

  const response = await fetch(`${baseUrl}/v1/dh/voices/customize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey || getApiKey()}`,
    },
    body: formData,
    signal,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || (payload.code !== undefined && payload.code !== 0 && payload.code !== 200)) {
    const message = payload?.message || payload?.detail || `声音上传失败（HTTP ${response.status}）`;
    throw new Error(message);
  }
  return payload;
};

export const getCustomVoiceStatus = (audioId) =>
  apiClient.get(`/v1/dh/voices/${encodeURIComponent(audioId)}`);

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

// H3 AI 视频生成：文生/图生请求都经过 RJCut 系统 API，EXE 不直接连接上游服务。
export const getTextToVideoHealth = (config = {}) => apiClient.get('/v1/text-to-video/health', config);
export const createTextToVideoTask = (payload) => apiClient.post('/v1/text-to-video/tasks', payload);
export const downloadTaskFileContent = (task_id, file_key = 'final_video') =>
  apiClient.get(`/v1/tasks/${encodeURIComponent(task_id)}/files/${encodeURIComponent(file_key)}/content`, {
    responseType: 'blob',
  });

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
// AI 辅助功能
// =====================================================

// AI 生成模板
export const aiGenerateTemplate = (data) => apiClient.post('/v1/ai/generate-template', data);

// AI 推荐模板
export const aiRecommendTemplates = (data) => apiClient.post('/v1/ai/recommend-templates', data);

// AI 生成文案
export const aiGenerateScript = (data) => apiClient.post('/v1/ai/generate-script', data);

// =====================================================
// 数字人 API
// =====================================================

// 获取公共数字人列表
export const getCommonPersons = () => apiClient.get('/v1/dh/persons/common');

// 探测公共数字人上游和 token 链路（用于部署监控/排障）
export const getDigitalHumanHealth = () => apiClient.get('/v1/dh/health');

// 获取公共数字人详情（包含可用动作）
export const getCommonPersonDetail = (person_id) => apiClient.get(`/v1/dh/persons/common/${person_id}`);

// 获取自定义数字人列表
export const getCustomPersons = () => apiClient.get('/v1/dh/persons/custom');

// 获取自定义数字人详情（包含可用动作）
export const getCustomPersonDetail = (person_id) => apiClient.get(`/v1/dh/persons/custom/${person_id}`);

// 同步自定义数字人
export const syncCustomPersons = () => apiClient.post('/v1/dh/persons/custom/sync');

// 删除自定义数字人
export const deleteCustomPerson = (person_id) => apiClient.post(`/v1/dh/persons/custom/${person_id}/delete`);

const VOICES_CACHE_KEY = 'rjcut_dh_voices_cache_v1';
const VOICES_CACHE_TTL_MS = 30 * 60 * 1000;
let voicesCache = null;
let voicesRequest = null;

function readVoicesCache() {
  if (voicesCache && Date.now() - voicesCache.savedAt < VOICES_CACHE_TTL_MS) {
    return voicesCache.response;
  }
  if (typeof localStorage === 'undefined') return null;

  try {
    const stored = JSON.parse(localStorage.getItem(VOICES_CACHE_KEY) || 'null');
    if (!stored?.savedAt || !stored?.data || Date.now() - stored.savedAt >= VOICES_CACHE_TTL_MS) {
      return null;
    }
    const response = { data: stored.data, status: 200, statusText: 'OK (cache)', headers: {}, config: {} };
    voicesCache = { savedAt: stored.savedAt, response };
    return response;
  } catch {
    return null;
  }
}

// 声音列表变化频率低：复用页内请求并短时持久化，避免每次进入创作页都重新等待慢接口。
export const getVoices = ({ force = false } = {}) => {
  if (!force) {
    const cached = readVoicesCache();
    if (cached) return Promise.resolve(cached);
    if (voicesRequest) return voicesRequest;
  }

  voicesRequest = apiClient.get('/v1/dh/voices')
    .then((response) => {
      const savedAt = Date.now();
      voicesCache = { savedAt, response };
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(VOICES_CACHE_KEY, JSON.stringify({ savedAt, data: response.data }));
        } catch {}
      }
      return response;
    })
    .finally(() => {
      voicesRequest = null;
    });
  return voicesRequest;
};

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

// 获取数字人示例视频列表（用于预览）
export const getPersonSampleVideos = (person_id, limit = 10) => {
  const params = new URLSearchParams({ limit });
  if (person_id) params.append('person_id', person_id);
  return apiClient.get(`/v1/tasks?${params.toString()}&type=dh_generate`);
};

function toDigitalHumanPublicFilesPath(path) {
  const value = String(path || '').trim();
  if (!value) return '';
  if (value.startsWith('/files/')) return value;
  if (value.startsWith('/root/MuseTalk/data/')) return `/files${value.slice('/root/MuseTalk'.length)}`;
  if (value.startsWith('/app/data/')) return `/files${value.slice('/app'.length)}`;
  if (value.startsWith('/app/')) return `/files${value.slice('/app'.length)}`;
  if (value.startsWith('/data/')) return `/files${value}`;
  return '';
}

export const getDigitalHumanMediaUrl = (mediaUrl, baseUrl = getBaseUrl()) => {
  const value = String(mediaUrl || '').trim();
  if (!value) return '';

  const base = trimSlash(baseUrl);

  if (value.startsWith('data:') || value.startsWith('blob:')) {
    return value;
  }

  if (value.startsWith('/dh/files/')) {
    return `${base}${value}`;
  }

  if (value.startsWith('/files/')) {
    return `${base}/dh${value}`;
  }

  if (
    value.startsWith('/api_tasks/') ||
    value.startsWith('/tasks/') ||
    value.startsWith('/api-tasks/')
  ) {
    return `${base}/dh${value.startsWith('/') ? value : `/${value}`}`;
  }

  const normalizedPath = toDigitalHumanPublicFilesPath(value);
  if (normalizedPath) {
    return `${base}/dh${normalizedPath}`;
  }

  const v1DigitalHumanMatch = value.match(/^\/v1\/digital-human\/tasks\/([^/]+)\/files\/(.+)$/);
  if (v1DigitalHumanMatch) {
    return `${base}/dh/files/${v1DigitalHumanMatch[1]}/${v1DigitalHumanMatch[2]}`;
  }

  if (value.startsWith('/v1/dh/proxy-image')) {
    try {
      const parsed = new URL(value, base);
      const proxyPath = parsed.searchParams.get('path');
      if (proxyPath) {
        const decoded = decodeURIComponent(proxyPath);
        const resolved = getDigitalHumanMediaUrl(decoded, baseUrl);
        if (resolved) return resolved;
      }
    } catch {}
  }

  if (/^https?:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      const pathname = parsed.pathname || '';
      const mappedPath = toDigitalHumanPublicFilesPath(pathname);
      if (mappedPath) return `${base}/dh${mappedPath}${parsed.search}`;
      if (pathname.startsWith('/files/')) return `${base}/dh${pathname}${parsed.search}`;
      if (pathname.startsWith('/api_tasks/')) return `${base}/dh${pathname}`;

      const match = pathname.match(/^\/v1\/digital-human\/tasks\/([^/]+)\/files\/(.+)$/);
      if (match) {
        return `${base}/dh/files/${match[1]}/${match[2]}`;
      }
    } catch {}
  }

  return value;
};

// =====================================================
// 图片代理
// =====================================================
// 获取图片代理 URL（用于解决跨域问题）
export const getImageProxyUrl = (imageUrl) => {
  if (!imageUrl) return null;
  const baseUrl = getBaseUrl();
  const value = String(imageUrl || '').trim();
  
  // 获取 API Key
  const apiKey = typeof localStorage !== 'undefined'
    ? localStorage.getItem('rjcut_api_key') || DEFAULT_API_KEY
    : DEFAULT_API_KEY;

  if (!value) return null;

  const publicMediaUrl = getDigitalHumanMediaUrl(value, baseUrl);
  if (publicMediaUrl && publicMediaUrl !== value) return publicMediaUrl;

  // /files 路径直接走后端 /dh 反代，避免 fallback 到本地 proxy-image 接口。
  if (value.startsWith('/files/')) {
    return `${baseUrl}/dh${value}`;
  }
  
  // 如果是 proxy-image 的返回式 URL，解析 path 参数后优先改写到 /dh/files。
  if (value.startsWith('/v1/dh/proxy-image')) {
    try {
      const parsed = new URL(value, baseUrl);
      const proxyPath = parsed.searchParams.get('path');
      if (proxyPath) {
        const decoded = decodeURIComponent(proxyPath);
        if (decoded.startsWith('/files/')) {
          return `${baseUrl}/dh${decoded}`;
        }
      }
    } catch {}
    
    return `${baseUrl}${value}`;
  }
  
  try {
    const parsed = new URL(value, baseUrl);
    if (parsed.pathname === '/v1/dh/proxy-image') {
      const proxyPath = parsed.searchParams.get('path');
      if (proxyPath) {
        const decoded = decodeURIComponent(proxyPath);
        if (decoded.startsWith('/files/')) {
          return `${baseUrl}/dh${decoded}`;
        }
      }
    }
    if (parsed.pathname.startsWith('/files/')) {
      return `${baseUrl}/dh${parsed.pathname}${parsed.search}`;
    }
  } catch {
    // 不是合法 URL，交给后端 proxy-image 兜底。
  }
  
  // 直接使用完整 URL 作为 path 参数（后端支持远程 URL 代理）
  const path = value;
  
  // 使用 URL 编码传递图片路径和 API Key（通过 URL 参数传递，因为<img>标签无法携带 header）
  return `${baseUrl}/v1/dh/proxy-image?path=${encodeURIComponent(path)}&api_key=${encodeURIComponent(apiKey)}`;
};

// 统一解析数字人封面地址。后台可能返回完整 URL、/files/... 路径或已经生成的代理路径，
// 不能把这些相对路径直接交给前端页面，否则浏览器会错误请求 localhost:30099/files/...
export const getDigitalHumanImageUrl = (imageUrl) => {
  if (!imageUrl) return null;
  const value = String(imageUrl).trim();
  if (!value || value.startsWith('data:') || value.startsWith('blob:')) return value || null;

  if (value.startsWith('/v1/dh/proxy-image')) {
    return getImageProxyUrl(value);
  }

  try {
    const parsed = new URL(value, getBaseUrl());
    if (parsed.pathname === '/v1/dh/proxy-image') {
      return getImageProxyUrl(`${parsed.pathname}${parsed.search}`);
    }

    // 文件服务地址可能来自后端数据库，也可能已经被旧前端拼成
    // localhost:30099/files/...。只保留 /files/... 路径交给 151 后端代理，
    // 避免代理容器再次请求它自己的 localhost。
    if (parsed.pathname.startsWith('/files/')) {
      return getImageProxyUrl(`${parsed.pathname}${parsed.search}`);
    }
  } catch {
    // 相对路径交给后端代理处理。
  }

  return getImageProxyUrl(value) || value;
};

// AI 结构化文案 v0.3：Python 后端版，不再让数字人朗读“转场”
export const aiCopywritingPresets = () => apiClient.get('/v1/ai-copywriting/presets');
export const aiCopywritingValidatePrompt = (data) => apiClient.post('/v1/ai-copywriting/validate-prompt', data);
export const aiCopywritingGeneratePlan = (data) => apiClient.post('/v1/ai-copywriting/generate-plan', data);
export const aiCopywritingBuildTimeline = (data) => apiClient.post('/v1/ai-copywriting/build-timeline', data);
