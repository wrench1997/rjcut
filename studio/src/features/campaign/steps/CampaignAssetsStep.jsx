/**
 * 第二步：环境素材管理
 * 用户将视频素材分配到四个栏目：开场、产品、使用、结尾
 */

import { Film, Upload, X, Play, Folder } from 'lucide-react'
import { ASSET_ROLES } from '../campaignDefaults'

export default function CampaignAssetsStep({ draft, updateDraft, vfs, apiKey }) {
  const handleAddAsset = (role) => {
    // 触发文件选择，这里简化处理，实际应打开文件浏览器
    const newAsset = {
      id: `asset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: '示例视频.mp4',
      path: '/素材/example.mp4',
      role,
      mimeType: 'video/mp4',
      size: 0,
      durationSeconds: null,
      aspectRatio: null,
      createdAt: new Date().toISOString(),
    }

    updateDraft((prev) => ({
      ...prev,
      assets: [...prev.assets, newAsset],
    }))
  }

  const handleRemoveAsset = (assetId) => {
    updateDraft((prev) => ({
      ...prev,
      assets: prev.assets.filter((a) => a.id !== assetId),
    }))
  }

  const handleMoveAsset = (assetId, newRole) => {
    updateDraft((prev) => ({
      ...prev,
      assets: prev.assets.map((a) =>
        a.id === assetId ? { ...a, role: newRole } : a
      ),
    }))
  }

  const getAssetsByRole = (role) => {
    return draft.assets.filter((a) => a.role === role)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-800">添加环境视频</h2>
        <p className="text-sm text-slate-500 mt-1">
          将视频素材分配到不同栏目，用于丰富视频内容
        </p>
      </div>

      {/* 素材角色说明 */}
      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">素材栏目说明</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {ASSET_ROLES.map((role) => {
            const count = getAssetsByRole(role.id).length
            return (
              <div
                key={role.id}
                className="p-3 bg-white rounded-lg border border-slate-200"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800">{role.title}</p>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      count > 0
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {count} 个
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">{role.description}</p>
                <p className="text-xs text-slate-400 mt-1">
                  建议：{role.maxRecommended}个以内
                </p>
              </div>
            )
          })}
        </div>
      </div>

      {/* 各栏目素材管理 */}
      <div className="space-y-6">
        {ASSET_ROLES.map((role) => {
          const roleAssets = getAssetsByRole(role.id)
          return (
            <div key={role.id} className="border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-base font-bold text-slate-800">{role.title}</h3>
                  <p className="text-xs text-slate-500">{role.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleAddAsset(role.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <Upload size={14} />
                  添加视频
                </button>
              </div>

              {roleAssets.length === 0 ? (
                <div className="py-6 text-center text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-lg">
                  暂无视频，点击上方按钮添加
                </div>
              ) : (
                <div className="space-y-2">
                  {roleAssets.map((asset) => (
                    <div
                      key={asset.id}
                      className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200"
                    >
                      <div className="w-16 h-16 bg-slate-200 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Film size={24} className="text-slate-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">
                          {asset.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {asset.path?.split('/').pop() || '未知路径'}
                        </p>
                      </div>

                      {/* 移动到其他栏目 */}
                      <select
                        value={asset.role}
                        onChange={(e) => handleMoveAsset(asset.id, e.target.value)}
                        className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
                      >
                        {ASSET_ROLES.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.title}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => handleRemoveAsset(asset.id)}
                        className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 从 VFS 选择提示 */}
      <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
        <div className="flex items-start gap-3">
          <Folder size={20} className="text-blue-600 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-blue-800">从文件浏览器选择</p>
            <p className="text-xs text-blue-600 mt-1">
              您可以先在"文件浏览"页面上传视频，然后回到这里选择。
              支持 mp4、mov、webm 格式。
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}