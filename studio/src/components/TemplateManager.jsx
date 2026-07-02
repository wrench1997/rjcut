import { useState } from 'react'
import { Book, Plus, Edit, Trash2, Copy, Check, X, Palette, ChevronRight, FileText, Sparkles, Loader2 } from 'lucide-react'
import { DEFAULT_TEMPLATES, getTemplateConfig, getTemplateCategories, aiGenerateTemplate } from '../features/template-batch/aiAssistant.js'
import Tooltip from './Tooltip'

/**
 * 模板管理组件
 * 支持查看、选择、编辑和创建文案模板
 * @param {Function} onSelectTemplate - 选择模板时的回调（可选）
 * @param {string} selectedTemplateId - 当前选中的模板 ID（可选）
 * @param {Function} onClose - 关闭回调（可选，不传则显示为独立页面）
 */
export default function TemplateManager({ onSelectTemplate, selectedTemplateId, onClose }) {
  const isStandalone = !onClose // 没有 onClose 时，作为独立页面显示
  
  // 初始化时从 localStorage 加载自定义模板
  const [templates, setTemplates] = useState(() => {
    try {
      const stored = localStorage.getItem('rjcut_custom_templates')
      if (stored) {
        const customTemplates = JSON.parse(stored)
        return [...DEFAULT_TEMPLATES, ...customTemplates]
      }
    } catch (e) {
      console.error('加载自定义模板失败:', e)
    }
    return DEFAULT_TEMPLATES
  })
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showAIGenerateForm, setShowAIGenerateForm] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)

  const categories = ['all', ...getTemplateCategories()]

  const filteredTemplates = selectedCategory === 'all'
    ? templates
    : templates.filter(t => t.category === selectedCategory)

  const handleSelectTemplate = (template) => {
    console.log('[TemplateManager] 选择模板:', template?.id, template?.name)
    if (onSelectTemplate) {
      onSelectTemplate(template)
    }
    if (onClose) {
      onClose()
    }
  }

  const handleSaveTemplate = (template) => {
    let newTemplates
    if (editingTemplate) {
      // 编辑现有模板
      newTemplates = templates.map(t => t.id === template.id ? template : t)
    } else {
      // 创建新模板
      const newTemplate = {
        ...template,
        id: `custom_${Date.now()}`,
      }
      newTemplates = [...templates, newTemplate]
    }
    setTemplates(newTemplates)
    
    // 保存自定义模板到 localStorage（只保存自定义模板，不保存默认模板）
    const customTemplates = newTemplates.filter(t => t.id?.startsWith('custom_'))
    try {
      localStorage.setItem('rjcut_custom_templates', JSON.stringify(customTemplates))
    } catch (e) {
      console.error('保存自定义模板失败:', e)
    }
    
    setEditingTemplate(null)
    setShowCreateForm(false)
  }

  const handleDeleteTemplate = (templateId) => {
    if (confirm('确定要删除这个模板吗？')) {
      const newTemplates = templates.filter(t => t.id !== templateId)
      setTemplates(newTemplates)
      
      // 更新 localStorage 中的自定义模板
      const customTemplates = newTemplates.filter(t => t.id?.startsWith('custom_'))
      try {
        localStorage.setItem('rjcut_custom_templates', JSON.stringify(customTemplates))
      } catch (e) {
        console.error('更新自定义模板失败:', e)
      }
    }
  }

  const handleDuplicateTemplate = (template) => {
    const duplicated = {
      ...template,
      id: `copy_${template.id}_${Date.now()}`,
      name: `${template.name} (副本)`,
    }
    const newTemplates = [...templates, duplicated]
    setTemplates(newTemplates)
    
    // 更新 localStorage 中的自定义模板
    const customTemplates = newTemplates.filter(t => t.id?.startsWith('custom_') || t.id?.startsWith('copy_'))
    try {
      localStorage.setItem('rjcut_custom_templates', JSON.stringify(customTemplates))
    } catch (e) {
      console.error('更新自定义模板失败:', e)
    }
  }

  const handleAIGenerateTemplate = async (params) => {
    setIsGenerating(true)
    try {
      const aiTemplate = await aiGenerateTemplate(params)
      // 确保 AI 生成的模板有 id
      const newTemplate = {
        ...aiTemplate,
        id: aiTemplate.id || `ai_${Date.now()}`,
      }
      const newTemplates = [...templates, newTemplate]
      setTemplates(newTemplates)
      
      // 保存自定义模板到 localStorage（包括手动创建、AI 生成、复制的模板）
      const customTemplates = newTemplates.filter(t => 
        t.id?.startsWith('custom_') || 
        t.id?.startsWith('copy_') || 
        t.id?.startsWith('ai_') ||
        !DEFAULT_TEMPLATES.find(dt => dt.id === t.id)
      )
      try {
        localStorage.setItem('rjcut_custom_templates', JSON.stringify(customTemplates))
      } catch (e) {
        console.error('保存自定义模板失败:', e)
      }
      
      setShowAIGenerateForm(false)
      // 自动选新生成的模板
      if (onSelectTemplate) {
        onSelectTemplate(newTemplate)
      }
    } catch (err) {
      alert('AI 生成模板失败：' + err.message)
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className={isStandalone ? "min-h-screen bg-slate-50" : "fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"}>
      <div className={isStandalone ? "max-w-6xl mx-auto py-8 px-4" : "bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"}>
        {/* 头部 */}
        <div className={isStandalone ? "bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6" : "border-b border-slate-200 flex justify-between items-center bg-gradient-to-r from-blue-50 to-purple-50"}>
          <div className={isStandalone ? "p-4 flex items-center gap-2" : "p-4 flex items-center gap-2"}>
            <Book size={20} className="text-blue-600" />
            <h2 className="text-lg font-bold text-slate-800">文案模板管理</h2>
          </div>
          {!isStandalone && (
            <div className="p-4 flex items-center gap-2">
              <button
                onClick={() => setShowAIGenerateForm(true)}
                className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 flex items-center gap-1"
                disabled={isGenerating}
              >
                {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                AI 生成模板
              </button>
              <button
                onClick={() => setShowCreateForm(true)}
                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 flex items-center gap-1"
              >
                <Plus size={14} />
                新建模板
              </button>
              {onClose && (
                <button
                  onClick={onClose}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <X size={20} />
                </button>
              )}
            </div>
          )}
        </div>
        
        {/* 独立页面时的顶部操作栏 */}
        {isStandalone && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAIGenerateForm(true)}
                className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 flex items-center gap-2"
                disabled={isGenerating}
              >
                {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                AI 生成模板
              </button>
              <button
                onClick={() => setShowCreateForm(true)}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 flex items-center gap-2"
              >
                <Plus size={14} />
                新建模板
              </button>
            </div>
            <p className="text-xs text-slate-500">
              💡 管理文案模板，AI 根据模板结构自动生成带转场的文案
            </p>
          </div>
        )}

        {/* 分类筛选 */}
        <div className="p-3 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-2 overflow-x-auto">
            <span className="text-xs font-medium text-slate-600">分类：</span>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 text-xs rounded-full whitespace-nowrap transition-colors ${
                  selectedCategory === cat
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-slate-600 border border-slate-200 hover:border-blue-300'
                }`}
              >
                {cat === 'all' ? '全部' : cat}
              </button>
            ))}
          </div>
        </div>

        {/* 模板列表 */}
        <div className={isStandalone ? "bg-white rounded-xl shadow-sm border border-slate-200 p-4" : "flex-1 overflow-y-auto p-4 custom-scrollbar"}>
          {filteredTemplates.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <FileText size={48} className="mx-auto mb-2 opacity-50" />
              <p>暂无模板</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTemplates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  isSelected={selectedTemplateId === template.id}
                  onSelect={() => handleSelectTemplate(template)}
                  onEdit={() => setEditingTemplate(template)}
                  onDuplicate={() => handleDuplicateTemplate(template)}
                  onDelete={() => handleDeleteTemplate(template.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* 底部说明 */}
        {!isStandalone && (
          <div className="p-3 border-t border-slate-100 bg-slate-50 text-xs text-slate-500">
            💡 提示：选择模板后，AI 将根据模板的段落结构自动生成对应数量的文案和转场提示
          </div>
        )}
      </div>

      {/* AI 生成模板弹窗 */}
      {showAIGenerateForm && (
        <AIGenerateTemplateForm
          onGenerate={handleAIGenerateTemplate}
          onCancel={() => setShowAIGenerateForm(false)}
          isGenerating={isGenerating}
        />
      )}

      {/* 编辑/创建模板弹窗 */}
      {(editingTemplate || showCreateForm) && (
        <TemplateEditor
          template={editingTemplate}
          onSave={handleSaveTemplate}
          onCancel={() => {
            setEditingTemplate(null)
            setShowCreateForm(false)
          }}
        />
      )}
    </div>
  )
}

/**
 * 模板卡片组件
 */
function TemplateCard({ template, isSelected, onSelect, onEdit, onDuplicate, onDelete }) {
  return (
    <div
      className={`border rounded-lg p-4 transition-all cursor-pointer hover:shadow-md ${
        isSelected
          ? 'border-blue-500 bg-blue-50 shadow-md'
          : 'border-slate-200 bg-white hover:border-blue-300'
      }`}
      onClick={(e) => {
        e.stopPropagation()
        console.log('[TemplateCard] 点击选择:', template?.id, template?.name)
        onSelect(template)
      }}
    >
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
          <Palette size={16} className="text-blue-500" />
          <h3 className="text-sm font-bold text-slate-800">{template.name}</h3>
        </div>
        {isSelected && (
          <div className="bg-blue-500 text-white rounded-full p-0.5">
            <Check size={12} strokeWidth={3} />
          </div>
        )}
      </div>

      <p className="text-xs text-slate-500 mb-3">{template.description}</p>

      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">
          {template.category}
        </span>
        <span className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-600 rounded-full flex items-center gap-1">
          <FileText size={10} />
          {template.segments?.length || 0} 段落
        </span>
      </div>

      {/* 段落预览 */}
      <div className="space-y-1 mb-3">
        {template.segments?.slice(0, 3).map((segment, idx) => (
          <div key={idx} className="flex items-center gap-1 text-[10px] text-slate-400">
            <ChevronRight size={10} />
            <span>{segment.flag}: {segment.note}</span>
          </div>
        ))}
        {(template.segments?.length || 0) > 3 && (
          <p className="text-[10px] text-slate-400 pl-3">
            还有 {template.segments.length - 3} 个段落...
          </p>
        )}
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
        <Tooltip tip="编辑模板" delay={1000}>
          <button
            onClick={(e) => { e.stopPropagation(); onEdit() }}
            className="text-slate-400 hover:text-blue-600 p-1"
          >
            <Edit size={14} />
          </button>
        </Tooltip>
        <Tooltip tip="复制模板" delay={1000}>
          <button
            onClick={(e) => { e.stopPropagation(); onDuplicate() }}
            className="text-slate-400 hover:text-green-600 p-1"
          >
            <Copy size={14} />
          </button>
        </Tooltip>
        <Tooltip tip="删除模板" delay={1000}>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="text-slate-400 hover:text-red-600 p-1"
          >
            <Trash2 size={14} />
          </button>
        </Tooltip>
      </div>
    </div>
  )
}

/**
 * 模板编辑器组件
 */
function TemplateEditor({ template, onSave, onCancel }) {
  const [formData, setFormData] = useState({
    id: template?.id || '',
    name: template?.name || '',
    description: template?.description || '',
    category: template?.category || '促销',
    segments: template?.segments || [
      { flag: 'hook', note: '开场吸引' },
      { flag: 'ending', note: '结尾引导' }
    ],
    style: template?.style || {
      hook: '',
      ending: ''
    }
  })

  const handleAddSegment = () => {
    setFormData({
      ...formData,
      segments: [...formData.segments, { flag: 'custom', note: '自定义段落' }]
    })
  }

  const handleRemoveSegment = (index) => {
    setFormData({
      ...formData,
      segments: formData.segments.filter((_, i) => i !== index)
    })
  }

  const handleUpdateSegment = (index, field, value) => {
    const newSegments = [...formData.segments]
    newSegments[index] = { ...newSegments[index], [field]: value }
    setFormData({ ...formData, segments: newSegments })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!formData.name.trim()) {
      alert('请输入模板名称')
      return
    }
    if (formData.segments.length < 2) {
      alert('模板至少需要包含 2 个段落')
      return
    }
    onSave(formData)
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* 头部 */}
        <div className="p-4 border-b border-slate-200 bg-gradient-to-r from-purple-50 to-pink-50">
          <h3 className="text-base font-bold text-slate-800">
            {template ? '编辑模板' : '创建新模板'}
          </h3>
        </div>

        {/* 表单内容 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          <form id="template-form" onSubmit={handleSubmit}>
            {/* 基本信息 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  模板名称 *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="例如：直接促销型"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-blue-400"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  分类
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-blue-400 bg-white"
                >
                  <option value="促销">促销</option>
                  <option value="品牌">品牌</option>
                  <option value="种草">种草</option>
                  <option value="讲解">讲解</option>
                  <option value="其他">其他</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                描述
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="描述这个模板的特点和适用场景"
                rows={2}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-blue-400 resize-none"
              />
            </div>

            {/* 段落配置 */}
            <div className="mt-4">
              <div className="flex justify-between items-center mb-2">
                <label className="block text-xs font-medium text-slate-700">
                  段落结构 *
                </label>
                <button
                  type="button"
                  onClick={handleAddSegment}
                  className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  <Plus size={12} />
                  添加段落
                </button>
              </div>

              <div className="space-y-2">
                {formData.segments.map((segment, index) => (
                  <div key={index} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-xs text-slate-400 w-6">{index + 1}.</span>
                    <input
                      type="text"
                      value={segment.flag}
                      onChange={(e) => handleUpdateSegment(index, 'flag', e.target.value)}
                      placeholder="段落标识"
                      className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded outline-none focus:border-blue-400"
                    />
                    <input
                      type="text"
                      value={segment.note}
                      onChange={(e) => handleUpdateSegment(index, 'note', e.target.value)}
                      placeholder="段落说明"
                      className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded outline-none focus:border-blue-400"
                    />
                    {formData.segments.length > 2 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveSegment(index)}
                        className="text-slate-400 hover:text-red-600 p-1"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <p className="text-[10px] text-slate-400 mt-2">
                💡 段落数量将决定 AI 生成的文案数量和转场提示数量
              </p>
            </div>

            {/* 文案风格配置 */}
            <div className="mt-4">
              <label className="block text-xs font-medium text-slate-700 mb-2">
                文案风格配置
              </label>
              <div className="space-y-2">
                <div>
                  <label className="block text-[10px] text-slate-500 mb-1">
                    开场文案模板（支持 {'{'}product{'}'}、{'{'}points{'}'}、{'{'}audience{'}'} 变量）
                  </label>
                  <textarea
                    value={formData.style.hook}
                    onChange={(e) => setFormData({ ...formData, style: { ...formData.style, hook: e.target.value } })}
                    placeholder="例如：还在为{pain_point}烦恼吗？今天这款{product}绝对能帮到你！"
                    rows={2}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-blue-400 resize-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 mb-1">
                    结尾文案模板
                  </label>
                  <textarea
                    value={formData.style.ending}
                    onChange={(e) => setFormData({ ...formData, style: { ...formData.style, ending: e.target.value } })}
                    placeholder="例如：现在下单还有优惠，点击链接了解更多吧！"
                    rows={2}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-blue-400 resize-none"
                  />
                </div>
              </div>
            </div>
          </form>
        </div>

        {/* 底部按钮 */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded-lg"
          >
            取消
          </button>
          <button
            type="submit"
            form="template-form"
            className="px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-lg"
          >
            保存模板
          </button>
        </div>
      </div>
    </div>
  )
}/**
 * AI 生成模板表单组件
 */
function AIGenerateTemplateForm({ onGenerate, onCancel, isGenerating }) {
  const [productName, setProductName] = useState('')
  const [productType, setProductType] = useState('通用产品')
  const [sellingPoints, setSellingPoints] = useState('')
  const [targetAudience, setTargetAudience] = useState('')
  const [style, setStyle] = useState('direct_sale')
  const [transitionCount, setTransitionCount] = useState(4)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!productName.trim()) {
      alert('请输入产品名称')
      return
    }
    onGenerate({
      productName,
      productType,
      sellingPoints,
      targetAudience,
      style,
      transitionCount,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col">
        {/* 头部 */}
        <div className="p-4 border-b border-slate-200 bg-gradient-to-r from-purple-50 to-pink-50 flex justify-between items-center">
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Sparkles size={18} className="text-purple-600" />
            AI 自动生成模板
          </h3>
          <button type="button" onClick={onCancel} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        {/* 表单内容 */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 custom-scrollbar">
          {/* 第一行：产品名称 + 产品类型 */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                产品名称 *
              </label>
              <input
                type="text"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="例如：XX 牌鹿茸血"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-purple-400"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                产品类型
              </label>
              <select
                value={productType}
                onChange={(e) => setProductType(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-purple-400 bg-white"
              >
                <option value="通用产品">通用产品</option>
                <option value="滋补品">滋补品</option>
                <option value="保健品">保健品</option>
                <option value="电子产品">电子产品</option>
                <option value="服装">服装</option>
                <option value="食品">食品</option>
                <option value="化妆品">化妆品</option>
              </select>
            </div>
          </div>

          {/* 第二行：卖点 + 目标人群 */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                核心卖点
              </label>
              <textarea
                value={sellingPoints}
                onChange={(e) => setSellingPoints(e.target.value)}
                placeholder="例如：纯天然、增强免疫力"
                rows={2}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-purple-400 resize-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                目标人群
              </label>
              <input
                type="text"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                placeholder="例如：30-50 岁中年人"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-purple-400"
              />
            </div>
          </div>

          {/* 风格选择 */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              文案风格
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setStyle('direct_sale')}
                className={`px-3 py-2 text-xs rounded-lg border transition-all ${
                  style === 'direct_sale'
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-purple-300'
                }`}
              >
                🔥 直接促销型
              </button>
              <button
                type="button"
                onClick={() => setStyle('premium')}
                className={`px-3 py-2 text-xs rounded-lg border transition-all ${
                  style === 'premium'
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-purple-300'
                }`}
              >
                💎 高端品质型
              </button>
              <button
                type="button"
                onClick={() => setStyle('social_review')}
                className={`px-3 py-2 text-xs rounded-lg border transition-all ${
                  style === 'social_review'
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-purple-300'
                }`}
              >
                📝 种草推荐型
              </button>
              <button
                type="button"
                onClick={() => setStyle('explainer')}
                className={`px-3 py-2 text-xs rounded-lg border transition-all ${
                  style === 'explainer'
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-purple-300'
                }`}
              >
                📖 讲解说明型
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              💡 风格将决定开场和结尾的文案调性
            </p>
          </div>

          {/* 转场数量 */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              转场数量：{transitionCount} 个
            </label>
            <input
              type="range"
              min="2"
              max="6"
              step="1"
              value={transitionCount}
              onChange={(e) => setTransitionCount(parseInt(e.target.value))}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-500"
            />
            <div className="flex justify-between text-[10px] text-slate-400 mt-1">
              <span>2 个</span>
              <span>4 个</span>
              <span>6 个</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              💡 转场数量决定后期合成时的场景切换次数
            </p>
          </div>

          {/* 预览提示 */}
          <div className="bg-purple-50 p-3 rounded-lg border border-purple-100">
            <p className="text-xs text-purple-700">
              <strong>生成预览：</strong>
            </p>
            <ul className="text-[10px] text-purple-600 space-y-1 mt-2">
              <li>• 模板名称：{productType}{style === 'direct_sale' ? '·促销' : style === 'premium' ? '·品质' : '·推荐'}</li>
              <li>• 段落结构：开场 + {transitionCount}个转场 + 结尾 = {transitionCount + 2}段</li>
              <li>• 风格：{style === 'direct_sale' ? '直接促销' : style === 'premium' ? '高端品质' : style === 'social_review' ? '种草推荐' : '讲解说明'}</li>
            </ul>
          </div>
        </form>

        {/* 底部按钮 */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isGenerating}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded-lg disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={isGenerating}
            className="px-4 py-2 text-sm bg-purple-600 text-white hover:bg-purple-700 rounded-lg disabled:opacity-50 flex items-center gap-2"
          >
            {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {isGenerating ? '生成中...' : '立即生成'}
          </button>
        </div>
      </div>
    </div>
  )
}
