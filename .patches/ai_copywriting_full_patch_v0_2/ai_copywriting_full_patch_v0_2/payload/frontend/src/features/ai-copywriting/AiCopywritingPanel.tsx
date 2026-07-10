import React, { useEffect, useMemo, useState } from "react";
import { fetchAiCopywritingPresets, generateAiCopywritingPlan } from "./api";
import { FALLBACK_PROMPT_PRESETS } from "./presets";
import type { GenerateCopywritingResult, MaterialAsset, PromptPreset } from "./types";
import "./AiCopywritingPanel.css";

export type AiCopywritingPanelProps = {
  apiBase?: string;
  materialLibrary?: MaterialAsset[];
  defaultProduct?: string;
  onGenerated?: (result: GenerateCopywritingResult) => void;
};

function linesToArray(text: string): string[] {
  return text.split(/\r?\n|,|，|、/).map((x) => x.trim()).filter(Boolean);
}

function formatMs(ms: number | undefined): string {
  if (typeof ms !== "number" || Number.isNaN(ms)) return "-";
  return `${(ms / 1000).toFixed(2)}s`;
}

export function AiCopywritingPanel(props: AiCopywritingPanelProps) {
  const { apiBase = "", materialLibrary = [], defaultProduct = "" } = props;
  const [presets, setPresets] = useState<PromptPreset[]>(FALLBACK_PROMPT_PRESETS);
  const [presetId, setPresetId] = useState(FALLBACK_PROMPT_PRESETS[0].id);
  const [product, setProduct] = useState(defaultProduct);
  const [durationSeconds, setDurationSeconds] = useState(25);
  const [sellingPointsText, setSellingPointsText] = useState("");
  const [userStylePrompt, setUserStylePrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerateCopywritingResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAiCopywritingPresets(apiBase).then((items) => {
      if (cancelled) return;
      setPresets(items.length ? items : FALLBACK_PROMPT_PRESETS);
      if (items.length && !items.some((x) => x.id === presetId)) setPresetId(items[0].id);
    });
    return () => { cancelled = true; };
  }, [apiBase]);

  const selectedPreset = useMemo(
    () => presets.find((item) => item.id === presetId) || presets[0],
    [presets, presetId]
  );

  async function handleGenerate() {
    setLoading(true);
    setResult(null);
    try {
      const next = await generateAiCopywritingPlan({
        product,
        presetId,
        userStylePrompt,
        durationSeconds,
        sellingPoints: linesToArray(sellingPointsText),
        materialLibrary
      }, apiBase);
      setResult(next);
      props.onGenerated?.(next);
    } catch (err) {
      setResult({ ok: false, error: "FRONTEND_REQUEST_FAILED", message: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="ai-copywriting-panel">
      <div className="ai-copywriting-panel__head">
        <div>
          <h2>AI 广告文案生成</h2>
          <p>文案只给数字人读；转场由后端根据字级时间轴生成 timeline。</p>
        </div>
        <button className="ai-copywriting-panel__primary" disabled={loading || !product.trim()} onClick={handleGenerate}>
          {loading ? "生成中..." : "生成文案 + Timeline"}
        </button>
      </div>

      <div className="ai-copywriting-panel__grid">
        <label>
          <span>商品名称</span>
          <input value={product} onChange={(e) => setProduct(e.target.value)} placeholder="例如：鹿茸血" />
        </label>

        <label>
          <span>目标时长/秒</span>
          <input type="number" min={5} max={120} value={durationSeconds} onChange={(e) => setDurationSeconds(Number(e.target.value) || 25)} />
        </label>
      </div>

      <div className="ai-copywriting-panel__presets">
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={preset.id === presetId ? "is-active" : ""}
            onClick={() => setPresetId(preset.id)}
          >
            <strong>{preset.name}</strong>
            <small>{preset.desc}</small>
          </button>
        ))}
      </div>

      {selectedPreset && <div className="ai-copywriting-panel__hint">当前模板：{selectedPreset.name} / 风险：{selectedPreset.riskLevel || "-"}</div>}

      <label className="ai-copywriting-panel__block">
        <span>商品卖点，一行一个</span>
        <textarea value={sellingPointsText} onChange={(e) => setSellingPointsText(e.target.value)} placeholder="例如：源头实拍\n批次灌装\n适合送礼" />
      </label>

      <label className="ai-copywriting-panel__block">
        <span>用户自定义提示词，只控制风格，不覆盖合规规则</span>
        <textarea value={userStylePrompt} onChange={(e) => setUserStylePrompt(e.target.value)} placeholder="例如：更像直播间口播，开头狠一点，语气接地气，不要太官方。" />
      </label>

      {materialLibrary.length > 0 && (
        <div className="ai-copywriting-panel__assets">
          <strong>已传入素材标签：</strong>
          {Array.from(new Set(materialLibrary.flatMap((x) => x.tags || []))).slice(0, 20).map((tag) => <span key={tag}>{tag}</span>)}
        </div>
      )}

      {result && (
        <div className="ai-copywriting-panel__result">
          {!result.ok ? (
            <pre>{JSON.stringify(result, null, 2)}</pre>
          ) : (
            <>
              <h3>口播文案</h3>
              <p className="ai-copywriting-panel__spoken">{result.script?.spoken_text}</p>

              <h3>语义段落</h3>
              <div className="ai-copywriting-panel__segments">
                {result.script?.segments?.map((seg) => (
                  <div key={seg.id}>
                    <b>{seg.id} / {seg.purpose}</b>
                    <p>{seg.text}</p>
                    <small>素材标签：{seg.visual_tags?.join("、") || "-"} / 段后转场：{seg.transition_after ? "是" : "否"}</small>
                  </div>
                ))}
              </div>

              <h3>Timeline</h3>
              <table className="ai-copywriting-panel__timeline">
                <thead><tr><th>类型</th><th>开始</th><th>结束</th><th>素材</th><th>原因</th></tr></thead>
                <tbody>
                  {result.timeline?.clips?.map((clip, index) => (
                    <tr key={`${clip.type}-${index}`}>
                      <td>{clip.type}</td>
                      <td>{formatMs(clip.start_ms)}</td>
                      <td>{formatMs(clip.end_ms)}</td>
                      <td>{clip.asset_name || clip.asset_id || "-"}</td>
                      <td>{clip.reason || clip.segment_id || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </section>
  );
}

export default AiCopywritingPanel;
