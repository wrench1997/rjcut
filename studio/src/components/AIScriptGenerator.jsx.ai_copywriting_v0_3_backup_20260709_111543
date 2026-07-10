/**
 * AI 文案生成器 - 支持多种文案风格和自定义提示词
 */
import React, { useState } from 'react';

// 文案风格库（与后端保持一致）
export const TONE_STYLES = [
  { value: 'direct_sale', label: '🔥 直接促销型', description: '热情洋溢，强调优惠和购买冲动，适合直播带货' },
  { value: 'premium', label: '💎 高端品质型', description: '优雅有格调，强调生活品味，适合奢侈品/高端产品' },
  { value: 'social_review', label: '📝 种草推荐型', description: '真实分享感受，像朋友推荐，适合小红书/抖音' },
  { value: 'explainer', label: '📖 讲解说明型', description: '专业详细，解答用户疑问，适合科普/功能型产品' },
  { value: 'shakespeare', label: '🎭 文艺诗意型', description: '文艺优雅，富有诗意和哲理，适合品牌故事' },
  { value: 'humorous', label: '😄 幽默风趣型', description: '轻松搞笑，让人会心一笑，适合年轻群体' },
  { value: 'emotional', label: '💕 情感共鸣型', description: '温暖走心，触动内心柔软处，适合情感营销' },
  { value: 'story', label: '📚 故事叙述型', description: '用故事串联产品，引人入胜，适合品牌宣传' },
  { value: 'comparison', label: '⚖️ 对比评测型', description: '前后对比/竞品对比，突出优势，适合功能性产品' },
  { value: 'urgent', label: '⏰ 限时抢购型', description: '强调时间紧迫/库存有限，制造稀缺感，适合促销活动' },
  { value: 'expert', label: '👨‍⚕️ 专家背书型', description: '专业权威口吻，增强信任感，适合保健/科技产品' },
  { value: 'user_voice', label: '🗣️ 用户心声型', description: '模拟真实用户反馈，增强可信度，适合口碑营销' },
  { value: 'farm_direct', label: '🦌 鹿场直销型', description: '东北鹿场老板口吻，强对比 + 防踩坑 + 科普，适合农产品/滋补品' },
];

// 预设提示词模板库
export const PRESET_PROMPTS = {
  farm_direct: `你是一名抖音/快手农产品口播带货脚本专家。

请围绕【产品名称】生成一条"知识科普型 + 强对比 + 防踩坑 + 鹿场老板直销"的口播带货文案。

整体风格必须像真实东北鹿场老板/老妹在镜头前讲话：直接、接地气、有节奏、有情绪起伏，不要写成品牌广告，不要写得文绉绉，也不要出现"尊贵、臻选、匠心、品质生活"这类空话。

## 核心写法

文案必须严格按照下面的成交逻辑：

1. **开场制造焦虑和反差**
   - 用"想买 XX 的家人们，这条视频你必须看完，不然很容易买错/上当"开头。
   - 第一秒就点出消费者最关心的区别，例如：鹿茸血和鹿血的区别、真货和假货的区别、普通产品和源头产品的区别。
   - 要有明显的"一个字不同，东西差很多"的反差感。

2. **解释产品来源**
   - 用通俗、口语化方式讲清楚产品到底从哪里来、什么时候产生、为什么产量少。
   - 不要像百科解释，要像老板在现场给顾客讲。
   - 可以加入"每年什么时候""哪个环节""为什么难得"等信息，强化稀缺感。

3. **对比另一种容易混淆的产品**
   - 必须明确讲出两者来源、颜色、状态、工艺、价格或市场乱象的差别。
   - 对比要强，让观众自然觉得"懂行的人会选前者"。
   - 但不要出现医疗、治病、壮阳、治疗、包治等违规功效承诺。
   - 不要写"营养价值极高""效果特别好"等绝对化表述，改成"原料更稀缺""工艺和来源不同""懂行的人更看重原料来源"。

4. **加入市场造假提醒**
   - 必须有一段"市面上很多人拿 XX 冒充 XX"的提醒。
   - 语气要像提醒自家人，不要像恶意攻击同行。
   - 可写：用普通原料冒充稀缺原料、用颜色/香精/勾兑方式做得很像、价格特别低的不一定是真正源头货。

5. **给出简单辨别方法**
   - 至少给 2 个观众能听懂的辨别点。
   - 可从颜色、摇晃后的状态、沉淀、挂杯、包装标签、批次信息、鹿场溯源、生产信息等角度写。
   - 不要编造无法验证的检测方法。
   - 语气要像："你记住这两点，基本就不容易买错。"

6. **鹿场实力背书**
   - 加入"自家鹿场""养了多少头梅花鹿""从养殖到灌装自己做""有鹿场、有原料、有加工流程"等信息。
   - 让观众感觉是源头老板在卖，不是中间商。
   - 这里必须自然，不要连续堆参数。

7. **结尾成交引导**
   - 用"粉丝价""地板价""库存有限""想要的点链接""评论区扣 XX"等方式收口。
   - 结尾要带一点人情味，例如："你买不买都没关系，先把这个区别记住。""别花了鹿茸血的钱，买回去却是普通鹿血。"
   - 不能强迫、恐吓、虚假承诺。

## 输出格式要求

请直接输出完整口播文案。
每一段之间都用"转场"两个字隔开。
不要写镜头说明、不要写标题、不要写分段名称、不要解释创作思路。
全文控制在 450～650 字。
语言必须口语化，像真人一镜到底口播，节奏要快，句子不要太长。

## 产品信息
- 产品名称：{product_name}
- 核心对比对象：{comparison_product}
- 鹿场规模：{farm_scale}
- 主要卖点：{selling_points}
- 想强调的辨别点：{identification_points}
- 成交方式：{call_to_action}
- 目标人群：{target_audience}

请生成一条具有"鹿茸血和鹿血区别"这种强反差、强科普、强防坑、强成交风格的口播文案。`,

  direct_sale: `你是一名抖音/快手直播带货文案专家。

请为以下产品创作一条热情洋溢、强调优惠和购买冲动的口播带货文案。

## 核心要求
- 开场要用"家人们"、"兄弟姐妹们"等亲切称呼
- 强调"源头直供"、"没有中间商"、"价格打下来了"
- 制造紧迫感："库存有限"、"抢完下架"、"手慢无"
- 突出优惠力度和购买冲动
- 结尾引导点击链接或评论区留言

## 产品信息
- 产品名称：{product_name}
- 核心卖点：{selling_points}
- 目标人群：{target_audience}

请直接输出完整口播文案，每一段之间用"转场"隔开，全文控制在 400～600 字。`,

  premium: `你是一名高端品牌文案策划专家。

请为以下产品创作一条优雅有格调、强调生活品味的口播文案。

## 核心要求
- 语言优雅、有质感，避免过于直白的促销用语
- 强调生活方式、品味、格调
- 突出产品的稀缺性和独特价值
- 营造高端氛围和身份认同感
- 结尾含蓄而有力量

## 产品信息
- 产品名称：{product_name}
- 核心卖点：{selling_points}
- 目标人群：{target_audience}

请直接输出完整口播文案，每一段之间用"转场"隔开，全文控制在 400～600 字。`,
};

// 智能提示词构建器
export const buildPrompt = (selectedTone, customPrompt, productInfo) => {
  // 如果用户输入了自定义提示词，优先使用自定义提示词
  if (customPrompt && customPrompt.trim()) {
    return customPrompt;
  }

  // 如果选择了预设模板，使用模板并填充产品信息
  if (PRESET_PROMPTS[selectedTone]) {
    return PRESET_PROMPTS[selectedTone].format({
      product_name: productInfo.product_name || '【产品名称】',
      selling_points: productInfo.selling_points || '【核心卖点】',
      target_audience: productInfo.target_audience || '【目标人群】',
      comparison_product: productInfo.comparison_product || '普通产品/假冒产品',
      farm_scale: productInfo.farm_scale || '自家鹿场养殖',
      identification_points: productInfo.identification_points || '颜色、状态、溯源信息',
      call_to_action: productInfo.call_to_action || '点击下方链接/评论区留言',
    });
  }

  // 默认提示词
  return `请为以下产品创作文案。

【产品信息】
- 产品名称：${productInfo.product_name || '【产品名称】'}
- 核心卖点：${productInfo.selling_points || '【核心卖点】'}
- 目标人群：${productInfo.target_audience || '【目标人群】'}
- 文案风格：${TONE_STYLES.find(s => s.value === selectedTone)?.label || '通用风格'}

【要求】
- 口语化、接地气
- 文案连贯流畅，段落之间自然衔接
- scene 段落必须以"转场"开头，优雅自然地烘托氛围

请直接输出完整口播文案，每一段之间用"转场"隔开。`;
};

// 字符串 format 方法（如果环境不支持）
if (!String.prototype.format) {
  String.prototype.format = function (args) {
    return this.replace(/\{([^}]+)\}/g, function (match, key) {
      return args[key] !== undefined ? args[key] : match;
    });
  };
}

// AI 文案生成器组件
export default function AIScriptGenerator({ onGenerate, loading }) {
  const [selectedTone, setSelectedTone] = useState('direct_sale');
  const [customPrompt, setCustomPrompt] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [productInfo, setProductInfo] = useState({
    product_name: '',
    selling_points: '',
    target_audience: '',
    comparison_product: '',
    farm_scale: '',
    identification_points: '',
    call_to_action: '',
  });

  const handleGenerate = () => {
    const prompt = buildPrompt(selectedTone, customPrompt, productInfo);
    onGenerate({
      product_name: productInfo.product_name,
      selling_points: productInfo.selling_points,
      target_audience: productInfo.target_audience,
      tone: selectedTone,
      custom_prompt: customPrompt || undefined,
      prompt: prompt, // 完整的提示词（用于预览或调试）
    });
  };

  const handlePresetSelect = (presetKey) => {
    if (PRESET_PROMPTS[presetKey]) {
      setCustomPrompt(PRESET_PROMPTS[presetKey]);
      setSelectedTone(presetKey);
      setShowAdvanced(true);
    }
  };

  return (
    <div className="ai-script-generator">
      <h3>AI 文案生成</h3>

      {/* 产品信息 */}
      <div className="form-section">
        <label>产品名称 *</label>
        <input
          type="text"
          placeholder="例如：鹿茸血口服液"
          value={productInfo.product_name}
          onChange={(e) => setProductInfo({ ...productInfo, product_name: e.target.value })}
        />
      </div>

      <div className="form-section">
        <label>核心卖点</label>
        <textarea
          placeholder="例如：补血养颜、增强免疫力、改善睡眠（用逗号分隔）"
          rows={3}
          value={productInfo.selling_points}
          onChange={(e) => setProductInfo({ ...productInfo, selling_points: e.target.value })}
        />
      </div>

      <div className="form-section">
        <label>目标人群</label>
        <input
          type="text"
          placeholder="例如：气血不足的女性、经常熬夜的上班族"
          value={productInfo.target_audience}
          onChange={(e) => setProductInfo({ ...productInfo, target_audience: e.target.value })}
        />
      </div>

      {/* 文案风格选择器 */}
      <div className="form-section">
        <label>文案风格</label>
        <div className="tone-selector">
          {TONE_STYLES.map((style) => (
            <button
              key={style.value}
              className={`tone-option ${selectedTone === style.value ? 'active' : ''}`}
              onClick={() => setSelectedTone(style.value)}
              title={style.description}
            >
              {style.label}
            </button>
          ))}
        </div>
        <p className="tone-description">
          {TONE_STYLES.find((s) => s.value === selectedTone)?.description}
        </p>
      </div>

      {/* 预设模板快捷选择 */}
      <div className="form-section">
        <label>或使用预设模板</label>
        <div className="preset-templates">
          <button onClick={() => handlePresetSelect('farm_direct')}>🦌 鹿场直销模板</button>
          <button onClick={() => handlePresetSelect('direct_sale')}>🔥 直接促销模板</button>
          <button onClick={() => handlePresetSelect('premium')}>💎 高端品质模板</button>
        </div>
      </div>

      {/* 高级选项：自定义提示词 */}
      <div className="form-section">
        <button
          className="toggle-advanced"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          {showAdvanced ? '▼ 隐藏高级选项' : '▶ 显示高级选项（自定义提示词）'}
        </button>

        {showAdvanced && (
          <div className="advanced-options">
            <label>自定义提示词</label>
            <textarea
              placeholder="输入你的文案要求，AI 将严格按照你的要求创作文案..."
              rows={10}
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
            />
            <p className="help-text">
              💡 提示：如果输入了自定义提示词，AI 将优先使用你的提示词，而不是上面选择的风格模板。
            </p>
          </div>
        )}
      </div>

      {/* 生成按钮 */}
      <button
        className="generate-btn"
        onClick={handleGenerate}
        disabled={loading || !productInfo.product_name}
      >
        {loading ? '生成中...' : '生成文案'}
      </button>
    </div>
  );
}

// CSS 样式（可单独提取到 CSS 文件）
export const styles = `
.ai-script-generator {
  padding: 20px;
  max-width: 800px;
  margin: 0 auto;
}

.ai-script-generator h3 {
  margin-bottom: 20px;
  font-size: 20px;
  font-weight: 600;
}

.form-section {
  margin-bottom: 20px;
}

.form-section label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: #333;
}

.form-section input,
.form-section textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
}

.form-section textarea {
  resize: vertical;
}

.tone-selector {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 10px;
}

.tone-option {
  padding: 12px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  background: white;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
  font-size: 14px;
}

.tone-option:hover {
  border-color: #667eea;
  background: #f5f7ff;
}

.tone-option.active {
  border-color: #667eea;
  background: #667eea;
  color: white;
}

.tone-description {
  margin-top: 8px;
  font-size: 13px;
  color: #666;
}

.preset-templates {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.preset-templates button {
  padding: 8px 16px;
  border: 1px solid #667eea;
  border-radius: 6px;
  background: white;
  color: #667eea;
  cursor: pointer;
  transition: all 0.2s;
}

.preset-templates button:hover {
  background: #667eea;
  color: white;
}

.toggle-advanced {
  padding: 8px 16px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: #f5f5f5;
  cursor: pointer;
  font-size: 14px;
}

.advanced-options {
  margin-top: 15px;
  padding: 15px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  background: #fafafa;
}

.advanced-options label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
}

.advanced-options textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-family: monospace;
  font-size: 13px;
}

.help-text {
  margin-top: 8px;
  font-size: 13px;
  color: #666;
}

.generate-btn {
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: 8px;
  background: #667eea;
  color: white;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.generate-btn:hover:not(:disabled) {
  background: #5568d3;
  transform: translateY(-1px);
}

.generate-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}
`;