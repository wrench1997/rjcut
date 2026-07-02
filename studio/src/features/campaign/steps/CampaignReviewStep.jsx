/**
 * 第五步：确认与生成
 * 展示所有配置摘要，用户确认后开始生成
 */

import { useState } from 'react'
import { Film, FileText, User, Settings, Sparkles } from 'lucide-react'
import { buildCampaignExecutionPlan, convertToBatchProcessorTasks } from '../campaignTaskAdapter'
import useBatchStore from '../../../api/useBatchProcessStore'

export default function CampaignReviewStep({
  draft,
  updateDraft,
  vfs,
  apiKey,
  onCreated,
}) {
  const [isCreating, setIsCreating] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const { startBatch } = useBatchStore()

  // 计算摘要
  const assetCount = draft.assets.length

  const handleCreateTasks = async () => {
    setIsCreating(true)
    try {
      // 构建执行计划
      const executionPlan = buildCampaignExecutionPlan({
        draft,
        existingGlobalParams: draft.advanced.enabled ? draft.advanced.globalParams : null,
        availableAssets: draft.assets,
      })

      // 转换为 BatchProcessor 任务格式
      const tasks = convertToBatchProcessorTasks(executionPlan, vfs)

      // 启动批量处理
      const maxConcurrent = draft.advanced.maxConcurrent || 3
      startBatch(tasks, maxConcurrent, draft.advanced.globalParams || null)

      // 通知父组件切换到执行中心
      onCreated?.()
    } catch (error) {
      console.error('创建任务失败:', error)
      alert('创建任务失败：' + error.message)
    } finally {
      setIsCreating(false)
    }
  }

  const getMainButtonText = () => {
    if (draft.batchPlan.generationMode === 'sample_first') {
      return '生成 1 条样片'
    }
    return `开始生成${draft.batchPlan.copyVariants}条视频`
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-800">确认生成</h2>
        <p className="text-sm text-slate-500 mt-1">
          请检查所有配置，确认无误后开始生成
        </p>
      </div>

      {/* 配置摘要 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 栏目信息 */}
        <div className="p-4 bg-white border border-slate-200 rounded-xl">
          <div className="flex items-center gap-2 mb-3">
            <FileText size={18} className="text-blue-600" />
            <h3 className="text-sm font-bold text-slate-800">栏目信息</h3>
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">栏目名称</dt>
              <dd className="font-medium text-slate-800">{draft.name || '-'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">发布平台</dt>
              <dd className="font-medium text-slate-800">
                {draft.platform === 'douyin' ? '抖音' :
                 draft.platform === 'xiaohongshu' ? '小红书' :
                 draft.platform === 'video_account' ? '视频号' :
                 draft.platform === 'bilibili' ? '哔哩哔哩' : '自定义'}
                <span className="text-slate-400 ml-2">({draft.aspectRatio})</span>
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">产品/主题</dt>
              <dd className="font-medium text-slate-800 truncate max-w-[150px]">
                {draft.productBrief.productName || '-'}
              </dd>
            </div>
          </dl>
        </div>

        {/* 数字人 */}
        <div className="p-4 bg-white border border-slate-200 rounded-xl">
          <div className="flex items-center gap-2 mb-3">
            <User size={18} className="text-purple-600" />
            <h3 className="text-sm font-bold text-slate-800">数字人</h3>
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">形象</dt>
              <dd className="font-medium text-slate-800">
                {draft.digitalHuman.personName || '未选择'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">声音</dt>
              <dd className="font-medium text-slate-800">
                {draft.digitalHuman.voiceName || '默认'}
              </dd>
            </div>
          </dl>
        </div>

        {/* 素材统计 */}
        <div className="p-4 bg-white border border-slate-200 rounded-xl">
          <div className="flex items-center gap-2 mb-3">
            <Film size={18} className="text-green-600" />
            <h3 className="text-sm font-bold text-slate-800">素材统计</h3>
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">环境视频总数</dt>
              <dd className="font-medium text-slate-800">{assetCount} 个</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">脚本段落数</dt>
              <dd className="font-medium text-slate-800">{enabledScenes.length} 段</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">文案总字数</dt>
              <dd className="font-medium text-slate-800">{totalWords} 字</dd>
            </div>
          </dl>
        </div>

        {/* 生成策略 */}
        <div className="p-4 bg-white border border-slate-200 rounded-xl">
          <div className="flex items-center gap-2 mb-3">
            <Settings size={18} className="text-amber-600" />
            <h3 className="text-sm font-bold text-slate-800">生成策略</h3>
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">生成方式</dt>
              <dd className="font-medium text-slate-800">
                {draft.batchPlan.generationMode === 'sample_first' ? '样片优先' : '直接批量'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">文案版本</dt>
              <dd className="font-medium text-slate-800">{draft.batchPlan.copyVariants} 个</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">素材组合</dt>
              <dd className="font-medium text-slate-800">
                {draft.batchPlan.assetStrategy === 'rotate' ? '轮换' :
                 draft.batchPlan.assetStrategy === 'random' ? '随机' : '全部组合'}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      

      {/* 高级设置 */}
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100 text-left text-sm font-medium text-slate-700 flex items-center justify-between"
        >
          <span>高级设置（适合熟悉视频生成参数的用户）</span>
          <span className="transform transition-transform">{showAdvanced ? '▲' : '▼'}</span>
        </button>

        {showAdvanced && (
          <div className="p-4 bg-white space-y-4">
            <p className="text-xs text-slate-500">
              以下是技术参数配置，普通用户无需修改。
            </p>
            <div className="text-xs font-mono bg-slate-50 p-3 rounded-lg overflow-x-auto">
              <pre className="text-slate-600">
                {JSON.stringify({
                  generationMode: draft.batchPlan.generationMode,
                  copyVariants: draft.batchPlan.copyVariants,
                  assetStrategy: draft.batchPlan.assetStrategy,
                  totalLimit: draft.batchPlan.totalLimit,
                }, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center justify-center gap-4 pt-4 border-t border-slate-100">
        <button
          type="button"
          onClick={handleCreateTasks}
          disabled={isCreating}
          className="inline-flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-slate-400 disabled:to-slate-500 text-white text-base font-bold rounded-xl shadow-lg shadow-blue-500/30 transition-all disabled:shadow-none"
        >
          <Sparkles size={20} />
          {isCreating ? '创建任务中...' : getMainButtonText()}
        </button>
      </div>

      <p className="text-center text-xs text-slate-500">
        生成任务将在"任务执行中心"显示，您可以随时查看进度、暂停或取消
      </p>
    </div>
  )
}