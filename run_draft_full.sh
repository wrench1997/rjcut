

#!/bin/bash
# ==========================================================
# RJCut 草稿模式全量测试脚本 (含视频，脚本，纠错，场景素材，背景音乐)
# 运行前请确保安装了 jq: apt-get install jq / yum install jq
# ==========================================================

# --- 环境配置 ---
BASE_URL=${BASE_URL:-"http://192.168.166.151:8001"}
API_KEY=${API_KEY:-"替换成你的_API_KEY"} # 请确保环境变量中设置了真实的 API_KEY

# --- 文件路径配置 ---
VIDEO_FILE=${1:-"./鹿茸血广告.mp4"}
SCRIPT_FILE="./script.json"
CORRECTIONS_FILE="./corrections.json"
SCENES_DIR="./scenes"
BGM_FILE="./qc007-ai-song-435745.mp3"  # 🆕 背景音乐文件

# --- 输出目录 ---
OUTPUT_DIR="./draft_output"
PARTS_DIR="$OUTPUT_DIR/parts"
FINAL_DIR="$OUTPUT_DIR/final"

if [ ! -f "$VIDEO_FILE" ]; then
  echo "❌ 找不到主视频文件：$VIDEO_FILE"
  exit 1
fi
if [ ! -x "$(command -v jq)" ]; then
  echo "❌ 缺少依赖 jq，请先安装 (例：apt-get install jq)"
  exit 1
fi

# 创建输出目录
mkdir -p "$OUTPUT_DIR" "$PARTS_DIR" "$FINAL_DIR"

echo "=========================================================="
echo "🎬 启动 RJCut 完整草稿任务自动化流程"
echo "=========================================================="

# 通用上传函数，返回 oss_key
upload_file() {
  local file_path="$1"
  local purpose="$2"
  local req_filename="$3"
  local content_type="$4"

  local max_retries=3
  local attempt=1
  local delay=2

  while [ "$attempt" -le "$max_retries" ]; do
    local err=""
    local presign_body presign_res upload_id upload_url oss_key confirm_body confirm_res confirmed

    # 1. 预签名
    presign_body=$(jq -n \
      --arg filename "$req_filename" \
      --arg content_type "$content_type" \
      --arg purpose "$purpose" \
      '{filename:$filename, content_type:$content_type, purpose:$purpose}')

    presign_res=$(curl -fsS -X POST "$BASE_URL/v1/uploads/presign" \
      -H "Authorization: Bearer $API_KEY" \
      -H "Content-Type: application/json" \
      -d "$presign_body") || err="预签名请求失败"

    if [ -z "$err" ]; then
      upload_id=$(echo "$presign_res" | jq -r '.data.upload_id // empty')
      upload_url=$(echo "$presign_res" | jq -r '.data.upload_url // empty')
      oss_key=$(echo "$presign_res" | jq -r '.data.oss_key // empty')

      if [ -z "$upload_id" ] || [ -z "$upload_url" ] || [ -z "$oss_key" ]; then
        err="预签名返回异常：$presign_res"
      fi
    fi

    # 2. 上传到 MinIO
    if [ -z "$err" ]; then
      if ! curl -fsS -X PUT "$upload_url" \
        -H "Content-Type: $content_type" \
        --upload-file "$file_path" >/dev/null; then
        err="PUT 上传失败"
      fi
    fi

    # 3. 确认上传
    if [ -z "$err" ]; then
      confirm_body=$(jq -n --arg upload_id "$upload_id" '{upload_id:$upload_id}')

      confirm_res=$(curl -fsS -X POST "$BASE_URL/v1/uploads/confirm" \
        -H "Authorization: Bearer $API_KEY" \
        -H "Content-Type: application/json" \
        -d "$confirm_body") || err="上传确认请求失败"

      if [ -z "$err" ]; then
        confirmed=$(echo "$confirm_res" | jq -r '.data.confirmed // empty')
        if [ "$confirmed" != "true" ]; then
          err="上传确认失败：$confirm_res"
        fi
      fi
    fi

    if [ -z "$err" ]; then
      echo "$oss_key"
      return 0
    fi

    if [ "$attempt" -lt "$max_retries" ]; then
      echo "⚠️  上传失败（第 $attempt/$max_retries 次）: $file_path" >&2
      echo "   原因：$err" >&2
      echo "   ${delay}s 后重试..." >&2
      sleep "$delay"
      delay=$((delay * 2))
    else
      echo "❌ 上传失败，已重试 $max_retries 次仍不成功：$file_path" >&2
      echo "   最后原因：$err" >&2
      return 1
    fi

    attempt=$((attempt + 1))
  done
}

# 下载文件函数
download_file() {
  local task_id="$1"
  local file_key="$2"
  local output_path="$3"

  local max_retries=3
  local attempt=1
  local delay=2
  local tmp_path="${output_path}.part"

  mkdir -p "$(dirname "$output_path")"

  while [ "$attempt" -le "$max_retries" ]; do
    local err=""
    local url_res download_url

    rm -f "$tmp_path"

    url_res=$(curl -fsS "$BASE_URL/v1/tasks/$task_id/files/$file_key" \
      -H "Authorization: Bearer $API_KEY") || err="获取下载链接失败"

    if [ -z "$err" ]; then
      download_url=$(echo "$url_res" | jq -r '.data.download_url // empty')
      if [ -z "$download_url" ]; then
        err="无法获取下载链接：$url_res"
      fi
    fi

    if [ -z "$err" ]; then
      if curl -fsSL "$download_url" -o "$tmp_path"; then
        if [ -s "$tmp_path" ]; then
          mv -f "$tmp_path" "$output_path"
          return 0
        else
          err="下载文件为空"
        fi
      else
        err="下载文件失败"
      fi
    fi

    rm -f "$tmp_path"

    if [ "$attempt" -lt "$max_retries" ]; then
      echo "⚠️  下载失败（第 $attempt/$max_retries 次）: $file_key" >&2
      echo "   原因：$err" >&2
      echo "   ${delay}s 后重试..." >&2
      sleep "$delay"
      delay=$((delay * 2))
    else
      echo "❌ 下载失败，已重试 $max_retries 次仍不成功：$file_key" >&2
      echo "   最后原因：$err" >&2
      return 1
    fi

    attempt=$((attempt + 1))
  done
}
# ---------------------------------------------------------
# 1. 获取商户 ID 
# ---------------------------------------------------------
MERCHANT_ID=$(curl -s "$BASE_URL/v1/merchant/info" -H "Authorization: Bearer $API_KEY" | jq -r '.data.merchant_id')
if [ "$MERCHANT_ID" == "null" ] || [ -z "$MERCHANT_ID" ]; then
  echo "❌ 无法获取 Merchant ID，请检查 API_KEY"
  exit 1
fi
echo "👤 当前商户 ID: $MERCHANT_ID"

# ---------------------------------------------------------
# 2. 上传素材
# ---------------------------------------------------------
echo "🚀 1/5 上传主视频..."
VIDEO_OSS_KEY=$(upload_file "$VIDEO_FILE" "input" "$(basename "$VIDEO_FILE")" "video/mp4") || exit 1
echo "   ✅ $VIDEO_OSS_KEY"


# ================= 关键修复区域 开始 =================
# 我们先复制一份 script.json，用来动态替换真实生成的文件名
cp "$SCRIPT_FILE" /tmp/fmt_script.json
SCENE_BASE_URL="$MERCHANT_ID"

echo "🚀 2/5 批量上传场景素材 (并动态更新 JSON 脚本)..."

# 创建一个临时映射文件
> /tmp/scene_mapping.txt

for scene_file in "$SCENES_DIR"/*; do
  if [ -f "$scene_file" ]; then
    bname=$(basename "$scene_file")
    echo "   - 上传 $bname ..."
    
    real_oss_key=$(upload_file "$scene_file" "scenes" "$bname" "video/mp4") || {
    echo "     ❌ 场景素材上传失败：$bname"
    exit 1
    }
    # 检查上传是否成功
    if [ $? -ne 0 ] || [ -z "$real_oss_key" ] || [[ "$real_oss_key" == *"<Error>"* ]]; then
      echo "     ⚠️  上传失败，将从脚本中移除此素材"
      continue
    fi
    
    echo "     -> 成功放入：$real_oss_key"
    
    # 从 OSS KEY 中提取后端重命名后的纯文件名
    real_name=$(basename "$real_oss_key")
    
    # 记录映射关系
    echo "$bname|$real_name" >> /tmp/scene_mapping.txt
  fi
done

# 使用 jq 处理 JSON，只保留成功上传的素材
if [ -s /tmp/scene_mapping.txt ]; then
  python3 << 'EOPY'
import json
import sys

# 读取映射关系
mapping = {}
with open('/tmp/scene_mapping.txt', 'r') as f:
    for line in f:
        old_name, new_name = line.strip().split('|')
        mapping[old_name] = new_name

# 读取原始脚本
with open('script.json', 'r', encoding='utf-8') as f:
    script = json.load(f)

# 更新 scene_file
new_segments = []
for seg in script.get('segments', []):
    if seg.get('flag') == 'scene' and seg.get('scene_file'):
        old_path = seg['scene_file']
        basename = old_path.split('/')[-1]
        
        if basename in mapping:
            # 替换成功上传的文件名
            seg['scene_file'] = f"scenes/{mapping[basename]}"
            new_segments.append(seg)
        else:
            # 上传失败，移除此段落或转为 human
            print(f"⚠️  警告：{basename} 上传失败，已从脚本中移除", file=sys.stderr)
            # 选项 1: 直接跳过（不加入 new_segments）
            # 选项 2: 转为 human 类型
            seg['flag'] = 'human'
            seg['scene_file'] = None
            new_segments.append(seg)
    else:
        new_segments.append(seg)

script['segments'] = new_segments

# 保存更新后的脚本
with open('/tmp/fmt_script.json', 'w', encoding='utf-8') as f:
    json.dump(script, f, ensure_ascii=False, indent=2)
EOPY
else
  cp "$SCRIPT_FILE" /tmp/fmt_script.json
fi

echo "   ✅ 场景素材上传并映射完毕"

echo "🚀 3/5 上传映射后的脚本文档..."
SCRIPT_OSS_KEY=$(upload_file "/tmp/fmt_script.json" "input" "script.json" "application/json") || exit 1
echo "   ✅ $SCRIPT_OSS_KEY"
# ================= 关键修复区域 结束 =================


echo "🚀 4/5 处理并上传错别字字典..."
if [ "$(jq type "$CORRECTIONS_FILE")" == "\"object\"" ]; then
  jq '[.corrections | to_entries | .[] | {src: .key, dst: .value}]' "$CORRECTIONS_FILE" > /tmp/fmt_corrections.json
else
  cp "$CORRECTIONS_FILE" /tmp/fmt_corrections.json
fi
CORRECTIONS_OSS_KEY=$(upload_file "/tmp/fmt_corrections.json" "input" "corrections.json" "application/json") || exit 1
echo "   ✅ $CORRECTIONS_OSS_KEY"

# ---------------------------------------------------------
# 🆕 上传背景音乐文件
# ---------------------------------------------------------
BGM_OSS_KEY=""
if [ -f "$BGM_FILE" ]; then
  echo "🚀 5/5 上传背景音乐..."
  BGM_OSS_KEY=$(upload_file "$BGM_FILE" "input" "$(basename "$BGM_FILE")" "audio/mpeg") || {
    echo "   ⚠️  背景音乐上传失败，将跳过"
    BGM_OSS_KEY=""
  }
  if [ -n "$BGM_OSS_KEY" ]; then
    echo "   ✅ $BGM_OSS_KEY"
  fi
else
  echo "⚠️  未找到背景音乐文件：$BGM_FILE (跳过)"
fi

# ---------------------------------------------------------
# 3. 发起完整草稿任务
# ---------------------------------------------------------
echo "=========================================================="
echo "🚀 提交草稿任务 (包含 script, corrections 和 scenes)"
req_json=$(cat <<EOF
{
  "input": {
    "video_url": "$VIDEO_OSS_KEY",
    "script_url": "$SCRIPT_OSS_KEY",
    "corrections_url": "$CORRECTIONS_OSS_KEY",
    "scene_base_url": "$SCENE_BASE_URL"
  },
  "pipeline": {
    "remove_keyword": "转场",
    "margin": 0.15,
    "min_segment_duration": 0.1
  },
  "asr": {
    "model": "large-v3",
    "device": "cuda",
    "language": "zh"
  },
  "draft": {
    "need_transcription": true,
    "need_timeline": true
  },
  "timeout_seconds": 1800
}
EOF
)

task_res=$(curl -s -X POST "$BASE_URL/v1/tasks/agent-draft" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d "$req_json")

TASK_ID=$(echo "$task_res" | jq -r '.data.task_id')
if [ "$TASK_ID" == "null" ] || [ -z "$TASK_ID" ]; then
  echo "❌ 任务提交失败：$task_res"
  exit 1
fi
echo "   ✅ 任务创建成功：$TASK_ID"

# 保存任务 ID 到文件，方便后续恢复
echo "$TASK_ID" > "$OUTPUT_DIR/task_id.txt"

# ---------------------------------------------------------
# 4. 轮询任务状态
# ---------------------------------------------------------
echo "⏳ 等待执行..."
while true; do
  status_res=$(curl -s "$BASE_URL/v1/tasks/$TASK_ID" -H "Authorization: Bearer $API_KEY")
  status=$(echo "$status_res" | jq -r '.data.status')
  progress=$(echo "$status_res" | jq -r '.data.progress')
  stage=$(echo "$status_res" | jq -r '.data.stage')
  
  echo -ne "\r   [$status] 进度：${progress}% - 当前阶段：$stage       "
  
  if [ "$status" == "succeeded" ]; then
    echo -e "\n🎉 任务处理完毕！"
    break
  elif [ "$status" == "failed" ] || [ "$status" == "cancelled" ]; then
    error=$(echo "$status_res" | jq -r '.data.error')
    echo -e "\n❌ 任务失败：$error"
    exit 1
  fi
  sleep 5
done

# ---------------------------------------------------------
# 5. 查看草稿结果
# ---------------------------------------------------------
echo "=========================================================="
echo "📊 拉取最终草稿详情..."
curl -s "$BASE_URL/v1/drafts/$TASK_ID" -H "Authorization: Bearer $API_KEY" > "$OUTPUT_DIR/draft_detail.json"

PARTS_COUNT=$(jq -r '.data.parts_count' "$OUTPUT_DIR/draft_detail.json")
SCENE_COUNT=$(jq '.data.scene_assets | length' "$OUTPUT_DIR/draft_detail.json")

echo "👇 切片数量：$PARTS_COUNT"
echo "👇 场景素材数 (Scene Assets): $SCENE_COUNT"
echo "👇 Editable Script 预览 (前 2 段):"
jq '.data.editable_script.segments[:2]' "$OUTPUT_DIR/draft_detail.json"
echo "✅ 草稿详情已保存到：$OUTPUT_DIR/draft_detail.json"

# ==========================================================
# 6. 工作流选择
# ==========================================================
echo ""
echo "=========================================================="
echo "📋 请选择后续工作流:"
echo "=========================================================="
echo ""
echo "  1️⃣  人工审核模式"
echo "     - 下载所有切片文件和脚本"
echo "     - 人工检查后可修改脚本"
echo "     - 确认无误后再合成最终视频"
echo ""
echo "  2️⃣  直接合成模式"
echo "     - 跳过人工审核"
echo "     - 直接合成最终视频并下载"
echo ""
echo "  3️⃣  仅下载草稿产物 (不合成)"
echo "     - 下载切片、脚本等文件"
echo "     - 不进行最终合成"
echo ""
echo "  0️⃣  退出"
echo ""

read -p "请输入选项 [0-3]: " workflow_choice

case $workflow_choice in
  1)
    # ==========================================================
    # 工作流 1: 人工审核模式
    # ==========================================================
    echo ""
    echo "=========================================================="
    echo "📥 工作流 1: 人工审核模式"
    echo "=========================================================="
    
    # 下载草稿相关文件
    echo "📦 下载草稿产物..."
    
    # 下载 editable_script
    echo "   - 保存 editable_script.json ..."
    jq '.data.editable_script' "$OUTPUT_DIR/draft_detail.json" > "$OUTPUT_DIR/editable_script.json"
    
    # 下载 transcription
    echo "   - 下载 transcription.json ..."
    download_file "$TASK_ID" "transcription_json" "$OUTPUT_DIR/transcription.json" || exit 1
    
    # 下载 timeline
    echo "   - 下载 timeline.json ..."
    download_file "$TASK_ID" "timeline_json" "$OUTPUT_DIR/timeline.json" || exit 1

    
    # 下载 cleaned_video
    echo "   - 下载 cleaned_video.mp4 ..."
    download_file "$TASK_ID" "cleaned_video" "$OUTPUT_DIR/cleaned_video.mp4" || exit 1

    
    # 下载所有 part 文件
    echo "   - 下载切片文件..."
    part_keys=$(jq -r '.data.parts | keys[]' "$OUTPUT_DIR/draft_detail.json" 2>/dev/null)
    if [ -n "$part_keys" ]; then
      for key in $part_keys; do
        echo "     - $key.mp4"
        download_file "$TASK_ID" "$key" "$PARTS_DIR/${key}.mp4"
      done
    fi
    
    echo ""
    echo "✅ 所有文件已下载到：$OUTPUT_DIR"
    echo ""
    echo "=========================================================="
    echo "📝 人工审核说明"
    echo "=========================================================="
    echo ""
    echo "请检查以下文件:"
    echo "  - $OUTPUT_DIR/editable_script.json  (可编辑脚本)"
    echo "  - $PARTS_DIR/                       (切片视频文件)"
    echo ""
    echo "如需修改脚本，请编辑 editable_script.json 后继续。"
    echo ""
    
    # 循环等待人工审核
    while true; do
      echo "=========================================================="
      echo "🔄 审核操作菜单"
      echo "=========================================================="
      echo ""
      echo "  a) 查看当前脚本内容"
      echo "  b) 使用 merge 模式更新单个段落"
      echo "  c) 使用 replace 模式替换整份脚本"
      echo "  d) 应用 corrections 批量替换"
      echo "  e) 调用 AI 修稿"
      echo "  f) 重新拉取最新草稿详情"
      echo "  g) ✅ 确认无误，开始合成最终视频"
      echo "  q) 退出 (稍后可手动继续)"
      echo ""
      
      read -p "请选择操作 [a-g/q]: " review_action
      
      case $review_action in
        a)
          echo ""
          echo "📄 当前 editable_script 内容:"
          echo "----------------------------------------"
          jq '.' "$OUTPUT_DIR/editable_script.json"
          echo "----------------------------------------"
          ;;
          
        b)
          echo ""
          read -p "请输入要修改的段落 ID: " seg_id
          read -p "请输入新的文本内容：$new_text"
          
          update_json=$(cat <<EOF
{
  "replace_mode": "merge",
  "editable_script": {
    "segments": [
      {
        "id": $seg_id,
        "text": "$new_text"
      }
    ]
  }
}
EOF
)
          echo "📤 提交 merge 更新..."
          update_res=$(curl -s -X POST "$BASE_URL/v1/drafts/$TASK_ID/update" \
            -H "Authorization: Bearer $API_KEY" \
            -H "Content-Type: application/json" \
            -d "$update_json")
          
          echo "$update_res" | jq '.data.message // .message'
          
          # 重新拉取
          curl -s "$BASE_URL/v1/drafts/$TASK_ID" -H "Authorization: Bearer $API_KEY" > "$OUTPUT_DIR/draft_detail.json"
          jq '.data.editable_script' "$OUTPUT_DIR/draft_detail.json" > "$OUTPUT_DIR/editable_script.json"
          echo "✅ 已更新本地脚本文件"
          ;;
          
        c)
          echo ""
          echo "请编辑 $OUTPUT_DIR/editable_script.json 文件"
          echo "编辑完成后按 Enter 继续上传..."
          read -p ""
          
          # 读取编辑后的脚本
          edited_script=$(cat "$OUTPUT_DIR/editable_script.json")
          update_json=$(cat <<EOF
{
  "replace_mode": "replace",
  "editable_script": $edited_script
}
EOF
)
          echo "📤 提交 replace 更新..."
          update_res=$(curl -s -X POST "$BASE_URL/v1/drafts/$TASK_ID/update" \
            -H "Authorization: Bearer $API_KEY" \
            -H "Content-Type: application/json" \
            -d "$update_json")
          
          echo "$update_res" | jq '.data.message // .message'
          
          # 重新拉取
          curl -s "$BASE_URL/v1/drafts/$TASK_ID" -H "Authorization: Bearer $API_KEY" > "$OUTPUT_DIR/draft_detail.json"
          jq '.data.editable_script' "$OUTPUT_DIR/draft_detail.json" > "$OUTPUT_DIR/editable_script.json"
          echo "✅ 已更新本地脚本文件"
          ;;
          
        d)
          echo ""
          echo "请输入 corrections JSON (格式：[{\"src\":\"错\",\"dst\":\"对\"}])"
          echo "或直接按 Enter 使用默认 corrections.json:"
          read -p "" corrections_input
          
          if [ -z "$corrections_input" ]; then
            corrections_data=$(cat /tmp/fmt_corrections.json)
          else
            corrections_data="$corrections_input"
          fi
          
          update_json=$(cat <<EOF
{
  "replace_mode": "merge",
  "corrections": $corrections_data
}
EOF
)
          echo "📤 提交 corrections 更新..."
          update_res=$(curl -s -X POST "$BASE_URL/v1/drafts/$TASK_ID/update" \
            -H "Authorization: Bearer $API_KEY" \
            -H "Content-Type: application/json" \
            -d "$update_json")
          
          echo "$update_res" | jq '.'
          
          # 重新拉取
          curl -s "$BASE_URL/v1/drafts/$TASK_ID" -H "Authorization: Bearer $API_KEY" > "$OUTPUT_DIR/draft_detail.json"
          jq '.data.editable_script' "$OUTPUT_DIR/draft_detail.json" > "$OUTPUT_DIR/editable_script.json"
          echo "✅ 已更新本地脚本文件"
          ;;
          
        e)
          echo ""
          read -p "请输入 AI 修稿 prompt (默认：请修正常见错别字): " ai_prompt
          ai_prompt=${ai_prompt:-"请修正常见错别字，保持原意不变"}
          
          ai_json=$(cat <<EOF
{
  "mode": "rewrite",
  "prompt": "$ai_prompt"
}
EOF
)
          echo "📤 调用 AI 修稿..."
          ai_res=$(curl -s -X POST "$BASE_URL/v1/drafts/$TASK_ID/ai-correct" \
            -H "Authorization: Bearer $API_KEY" \
            -H "Content-Type: application/json" \
            -d "$ai_json")
          
          echo "$ai_res" | jq '.'
          
          # 重新拉取
          curl -s "$BASE_URL/v1/drafts/$TASK_ID" -H "Authorization: Bearer $API_KEY" > "$OUTPUT_DIR/draft_detail.json"
          jq '.data.editable_script' "$OUTPUT_DIR/draft_detail.json" > "$OUTPUT_DIR/editable_script.json"
          echo "✅ 已更新本地脚本文件"
          ;;
          
        f)
          echo "🔄 重新拉取草稿详情..."
          curl -s "$BASE_URL/v1/drafts/$TASK_ID" -H "Authorization: Bearer $API_KEY" > "$OUTPUT_DIR/draft_detail.json"
          jq '.data.editable_script' "$OUTPUT_DIR/draft_detail.json" > "$OUTPUT_DIR/editable_script.json"
          echo "✅ 已更新"
          ;;
          
        g)
          echo ""
          echo "=========================================================="
          echo "🚀 开始合成最终视频..."
          echo "=========================================================="
          
          # 进入合成流程
          compose_json=$(cat <<EOF
{
  "draft_task_id": "$TASK_ID",
  "pipeline": {
    "use_transitions": false,
    "transition_type": "fade",
    "transition_duration": 0.8,
    "resync_subtitle": true
  },
  "asr": {
    "model": "large-v3",
    "device": "cuda",
    "language": "zh"
  },
  "subtitle": {
    "effect": "ad",
    "font_size": 88
  },
  "audio": {
    "bgm_url": "$BGM_OSS_KEY",
    "bgm_volume": 0.3,
    "original_volume": 1.0,
    "bgm_start_time": 0.0,
    "bgm_loop": true,
    "fade_in_duration": 0.5,
    "fade_out_duration": 0.5
  },
  "output": {
    "need_ass": true
  },
  "timeout_seconds": 1800
}
EOF
)

          compose_res=$(curl -s -X POST "$BASE_URL/v1/tasks/compose-from-draft" \
            -H "Authorization: Bearer $API_KEY" \
            -H "Content-Type: application/json" \
            -d "$compose_json")
          
          COMPOSE_TASK_ID=$(echo "$compose_res" | jq -r '.data.task_id')
          
          if [ "$COMPOSE_TASK_ID" == "null" ] || [ -z "$COMPOSE_TASK_ID" ]; then
            echo "❌ 合成任务创建失败：$compose_res"
            continue
          fi
          
          echo "   ✅ 合成任务创建成功：$COMPOSE_TASK_ID"
          echo "$COMPOSE_TASK_ID" > "$OUTPUT_DIR/compose_task_id.txt"
          
          # 轮询合成任务状态
          echo "⏳ 等待合成..."
          while true; do
            compose_status_res=$(curl -s "$BASE_URL/v1/tasks/$COMPOSE_TASK_ID" -H "Authorization: Bearer $API_KEY")
            compose_status=$(echo "$compose_status_res" | jq -r '.data.status')
            compose_progress=$(echo "$compose_status_res" | jq -r '.data.progress')
            compose_stage=$(echo "$compose_status_res" | jq -r '.data.stage')
            
            echo -ne "\r   [$compose_status] 进度：${compose_progress}% - 当前阶段：$compose_stage       "
            
            if [ "$compose_status" == "succeeded" ]; then
              echo -e "\n🎉 合成完毕！"
              break
            elif [ "$compose_status" == "failed" ] || [ "$compose_status" == "cancelled" ]; then
              compose_error=$(echo "$compose_status_res" | jq -r '.data.error')
              echo -e "\n❌ 合成失败：$compose_error"
              break 2
            fi
            sleep 5
          done
          
          # 下载最终产物
          echo ""
          echo "📥 下载最终产物..."
          
          echo "   - 下载 final_video.mp4 ..."
          download_file "$COMPOSE_TASK_ID" "final_video" "$FINAL_DIR/final_video.mp4" || exit 1
          
          echo "   - 下载 final.ass ..."
          download_file "$COMPOSE_TASK_ID" "ass_file" "$FINAL_DIR/final.ass" || exit 1
          
          echo "   - 下载 resync.json ..."
          download_file "$COMPOSE_TASK_ID" "resync_json" "$FINAL_DIR/resync.json" || exit 1
          
          echo ""
          echo "=========================================================="
          echo "🎉 全部完成!"
          echo "=========================================================="
          echo ""
          echo "📁 输出目录：$OUTPUT_DIR"
          echo ""
          echo "草稿产物:"
          ls -lh "$OUTPUT_DIR"/*.json "$OUTPUT_DIR"/*.mp4 2>/dev/null
          echo ""
          echo "切片文件:"
          ls -lh "$PARTS_DIR"/ 2>/dev/null
          echo ""
          echo "最终视频:"
          ls -lh "$FINAL_DIR"/ 2>/dev/null
          echo ""
          
          exit 0
          ;;
          
        q)
          echo ""
          echo "=========================================================="
          echo "📌 已保存当前状态，稍后可手动继续"
          echo "=========================================================="
          echo ""
          echo "任务 ID: $TASK_ID"
          echo "恢复命令:"
          echo ""
          echo "  # 查看草稿详情"
          echo "  curl -s \"\$BASE_URL/v1/drafts/$TASK_ID\" -H \"Authorization: Bearer \$API_KEY\" | jq ."
          echo ""
          echo "  # 合成最终视频"
          echo "  curl -s -X POST \"\$BASE_URL/v1/tasks/compose-from-draft\" \\"
          echo "    -H \"Authorization: Bearer \$API_KEY\" \\"
          echo "    -H \"Content-Type: application/json\" \\"
          echo "    -d '{\"draft_task_id\":\"$TASK_ID\", ...}'"
          echo ""
          exit 0
          ;;
          
        *)
          echo "❓ 无效选项，请重新选择"
          ;;
      esac
      
      echo ""
    done
    ;;
    
  2)
    # ==========================================================
    # 工作流 2: 直接合成模式
    # ==========================================================
    echo ""
    echo "=========================================================="
    echo "🚀 工作流 2: 直接合成最终视频"
    echo "=========================================================="
    
    compose_json=$(cat <<EOF
{
  "draft_task_id": "$TASK_ID",
  "pipeline": {
    "use_transitions": false,
    "transition_type": "fade",
    "transition_duration": 0.8,
    "resync_subtitle": true
  },
  "asr": {
    "model": "large-v3",
    "device": "cuda",
    "language": "zh"
  },
  "subtitle": {
    "effect": "ad",
    "font_size": 88
  },
  "audio": {
    "bgm_url": "$BGM_OSS_KEY",
    "bgm_volume": 0.3,
    "original_volume": 1.0,
    "bgm_start_time": 0.0,
    "bgm_loop": true,
    "fade_in_duration": 0.5,
    "fade_out_duration": 0.5
  },
  "output": {
    "need_ass": true
  },
  "timeout_seconds": 1800
}
EOF
)

    compose_res=$(curl -s -X POST "$BASE_URL/v1/tasks/compose-from-draft" \
      -H "Authorization: Bearer $API_KEY" \
      -H "Content-Type: application/json" \
      -d "$compose_json")
    
    COMPOSE_TASK_ID=$(echo "$compose_res" | jq -r '.data.task_id')
    
    if [ "$COMPOSE_TASK_ID" == "null" ] || [ -z "$COMPOSE_TASK_ID" ]; then
      echo "❌ 合成任务创建失败：$compose_res"
      exit 1
    fi
    
    echo "   ✅ 合成任务创建成功：$COMPOSE_TASK_ID"
    echo "$COMPOSE_TASK_ID" > "$OUTPUT_DIR/compose_task_id.txt"
    
    # 轮询合成任务状态
    echo "⏳ 等待合成..."
    while true; do
      compose_status_res=$(curl -s "$BASE_URL/v1/tasks/$COMPOSE_TASK_ID" -H "Authorization: Bearer $API_KEY")
      compose_status=$(echo "$compose_status_res" | jq -r '.data.status')
      compose_progress=$(echo "$compose_status_res" | jq -r '.data.progress')
      compose_stage=$(echo "$compose_status_res" | jq -r '.data.stage')
      
      echo -ne "\r   [$compose_status] 进度：${compose_progress}% - 当前阶段：$compose_stage       "
      
      if [ "$compose_status" == "succeeded" ]; then
        echo -e "\n🎉 合成完毕！"
        break
      elif [ "$compose_status" == "failed" ] || [ "$compose_status" == "cancelled" ]; then
        compose_error=$(echo "$compose_status_res" | jq -r '.data.error')
        echo -e "\n❌ 合成失败：$compose_error"
        exit 1
      fi
      sleep 5
    done
    
    # 下载最终产物
    echo ""
    echo "📥 下载最终产物..."
    
    echo "   - 下载 final_video.mp4 ..."
    download_file "$COMPOSE_TASK_ID" "final_video" "$FINAL_DIR/final_video.mp4" || exit 1
    
    echo "   - 下载 final.ass ..."
    download_file "$COMPOSE_TASK_ID" "ass_file" "$FINAL_DIR/final.ass" || exit 1
    
    echo "   - 下载 resync.json ..."
    download_file "$COMPOSE_TASK_ID" "resync_json" "$FINAL_DIR/resync.json" || exit 1
    
    # 同时下载草稿产物
    echo "   - 保存 editable_script.json ..."
    jq '.data.editable_script' "$OUTPUT_DIR/draft_detail.json" > "$OUTPUT_DIR/editable_script.json"
    
    echo ""
    echo "=========================================================="
    echo "🎉 全部完成!"
    echo "=========================================================="
    echo ""
    echo "📁 输出目录：$OUTPUT_DIR"
    echo ""
    echo "最终视频:"
    ls -lh "$FINAL_DIR"/ 2>/dev/null
    echo ""
    ;;
    
  3)
    # ==========================================================
    # 工作流 3: 仅下载草稿产物
    # ==========================================================
    echo ""
    echo "=========================================================="
    echo "📥 工作流 3: 仅下载草稿产物"
    echo "=========================================================="
    
    # 下载草稿相关文件
    echo "📦 下载草稿产物..."
    
    # 下载 editable_script
    echo "   - 保存 editable_script.json ..."
    jq '.data.editable_script' "$OUTPUT_DIR/draft_detail.json" > "$OUTPUT_DIR/editable_script.json"
    
    # 下载 transcription
    echo "   - 下载 transcription.json ..."
    download_file "$TASK_ID" "transcription_json" "$OUTPUT_DIR/transcription.json" || exit 1
    
    # 下载 timeline
    echo "   - 下载 timeline.json ..."
    download_file "$TASK_ID" "timeline_json" "$OUTPUT_DIR/timeline.json" || exit 1

    
    # 下载 cleaned_video
    echo "   - 下载 cleaned_video.mp4 ..."
    download_file "$TASK_ID" "cleaned_video" "$OUTPUT_DIR/cleaned_video.mp4" || exit 1

    
    # 下载所有 part 文件
    echo "   - 下载切片文件..."
    part_keys=$(jq -r '.data.parts | keys[]' "$OUTPUT_DIR/draft_detail.json" 2>/dev/null)
    if [ -n "$part_keys" ]; then
      for key in $part_keys; do
        echo "     - $key.mp4"
        download_file "$TASK_ID" "$key" "$PARTS_DIR/${key}.mp4"
      done
    fi
    
    echo ""
    echo "=========================================================="
    echo "✅ 下载完成!"
    echo "=========================================================="
    echo ""
    echo "📁 输出目录：$OUTPUT_DIR"
    echo ""
    echo "草稿产物:"
    ls -lh "$OUTPUT_DIR"/*.json "$OUTPUT_DIR"/*.mp4 2>/dev/null
    echo ""
    echo "切片文件:"
    ls -lh "$PARTS_DIR"/ 2>/dev/null
    echo ""
    echo "📌 任务 ID: $TASK_ID"
    echo ""
    echo "稍后可使用以下命令继续合成:"
    echo ""
    echo "  curl -s -X POST \"\$BASE_URL/v1/tasks/compose-from-draft\" \\"
    echo "    -H \"Authorization: Bearer \$API_KEY\" \\"
    echo "    -H \"Content-Type: application/json\" \\"
    echo "    -d '{\"draft_task_id\":\"$TASK_ID\", ...}'"
    echo ""
    ;;
    
  0)
    echo ""
    echo "👋 已退出"
    echo ""
    echo "📌 任务 ID: $TASK_ID"
    echo "📌 草稿详情已保存到：$OUTPUT_DIR/draft_detail.json"
    echo ""
    exit 0
    ;;
    
  *)
    echo "❓ 无效选项"
    exit 1
    ;;
esac

echo "=========================================================="
echo "📊 任务汇总"
echo "=========================================================="
echo ""
echo "草稿任务 ID:    $TASK_ID"
[ -n "$COMPOSE_TASK_ID" ] && echo "合成任务 ID:    $COMPOSE_TASK_ID"
echo "输出目录：       $OUTPUT_DIR"
echo ""
echo "=========================================================="