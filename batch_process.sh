#!/bin/bash
# ==========================================================
# RJCut 批量处理脚本 v2.0
# 支持批量视频处理、并发控制、断点续传
# ==========================================================

set -e

# --- 全局配置 ---
BASE_URL=${BASE_URL:-"http://192.168.166.151:8001"}
API_KEY=${API_KEY:-"替换成你的_API_KEY"}

# 批处理配置
BATCH_CONFIG=${BATCH_CONFIG:-"./batch_config.json"}
MAX_CONCURRENT=${MAX_CONCURRENT:-3}  # 最大并发任务数
AUTO_COMPOSE=${AUTO_COMPOSE:-"true"}  # 是否自动合成
BATCH_OUTPUT_DIR=${BATCH_OUTPUT_DIR:-"./batch_output"}

# 创建批处理输出目录
mkdir -p "$BATCH_OUTPUT_DIR"
BATCH_LOG="$BATCH_OUTPUT_DIR/batch_log.txt"
BATCH_STATUS="$BATCH_OUTPUT_DIR/batch_status.json"
TASKS_DIR="$BATCH_OUTPUT_DIR/tasks"

# 初始化日志
echo "========================================================== " > "$BATCH_LOG"
echo "批量处理开始: $(date)" >> "$BATCH_LOG"
echo "========================================================== " >> "$BATCH_LOG"

# 检查依赖
if [ ! -x "$(command -v jq)" ]; then
  echo "❌ 缺少依赖 jq，请先安装"
  exit 1
fi

if [ ! -x "$(command -v parallel)" ]; then
  echo "⚠️  建议安装 GNU parallel 以提升批处理性能: apt-get install parallel"
  USE_PARALLEL=false
else
  USE_PARALLEL=true
fi

# ==========================================================
# 工具函数库
# ==========================================================

# 日志函数
log() {
  local level="$1"
  shift
  local msg="$*"
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] [$level] $msg" | tee -a "$BATCH_LOG"
}

# 上传文件函数（带重试）
upload_file() {
  local file_path="$1"
  local purpose="$2"
  local req_filename="$3"
  local content_type="$4"
  local max_retries=3
  local attempt=1

  while [ "$attempt" -le "$max_retries" ]; do
    local presign_body presign_res upload_id upload_url oss_key

    presign_body=$(jq -n \
      --arg filename "$req_filename" \
      --arg content_type "$content_type" \
      --arg purpose "$purpose" \
      '{filename:$filename, content_type:$content_type, purpose:$purpose}')

    presign_res=$(curl -fsS -X POST "$BASE_URL/v1/uploads/presign" \
      -H "Authorization: Bearer $API_KEY" \
      -H "Content-Type: application/json" \
      -d "$presign_body" 2>/dev/null) || {
      if [ "$attempt" -lt "$max_retries" ]; then
        sleep $((attempt * 2))
        attempt=$((attempt + 1))
        continue
      else
        return 1
      fi
    }

    upload_id=$(echo "$presign_res" | jq -r '.data.upload_id // empty')
    upload_url=$(echo "$presign_res" | jq -r '.data.upload_url // empty')
    oss_key=$(echo "$presign_res" | jq -r '.data.oss_key // empty')

    if [ -z "$upload_id" ] || [ -z "$upload_url" ] || [ -z "$oss_key" ]; then
      if [ "$attempt" -lt "$max_retries" ]; then
        sleep $((attempt * 2))
        attempt=$((attempt + 1))
        continue
      else
        return 1
      fi
    fi

    curl -fsS -X PUT "$upload_url" \
      -H "Content-Type: $content_type" \
      --upload-file "$file_path" >/dev/null 2>&1 || {
      if [ "$attempt" -lt "$max_retries" ]; then
        sleep $((attempt * 2))
        attempt=$((attempt + 1))
        continue
      else
        return 1
      fi
    }

    local confirm_body confirm_res confirmed
    confirm_body=$(jq -n --arg upload_id "$upload_id" '{upload_id:$upload_id}')
    confirm_res=$(curl -fsS -X POST "$BASE_URL/v1/uploads/confirm" \
      -H "Authorization: Bearer $API_KEY" \
      -H "Content-Type: application/json" \
      -d "$confirm_body" 2>/dev/null) || {
      if [ "$attempt" -lt "$max_retries" ]; then
        sleep $((attempt * 2))
        attempt=$((attempt + 1))
        continue
      else
        return 1
      fi
    }

    confirmed=$(echo "$confirm_res" | jq -r '.data.confirmed // empty')
    if [ "$confirmed" == "true" ]; then
      echo "$oss_key"
      return 0
    fi

    attempt=$((attempt + 1))
    sleep $((attempt * 2))
  done

  return 1
}

# 下载文件函数
download_file() {
  local task_id="$1"
  local file_key="$2"
  local output_path="$3"
  local max_retries=3
  local attempt=1

  mkdir -p "$(dirname "$output_path")"

  while [ "$attempt" -le "$max_retries" ]; do
    local url_res download_url tmp_path="${output_path}.part"

    url_res=$(curl -fsS "$BASE_URL/v1/tasks/$task_id/files/$file_key" \
      -H "Authorization: Bearer $API_KEY" 2>/dev/null) || {
      if [ "$attempt" -lt "$max_retries" ]; then
        sleep $((attempt * 2))
        attempt=$((attempt + 1))
        continue
      else
        return 1
      fi
    }

    download_url=$(echo "$url_res" | jq -r '.data.download_url // empty')
    
    if [ -z "$download_url" ]; then
      if [ "$attempt" -lt "$max_retries" ]; then
        sleep $((attempt * 2))
        attempt=$((attempt + 1))
        continue
      else
        return 1
      fi
    fi

    if curl -fsSL "$download_url" -o "$tmp_path" 2>/dev/null && [ -s "$tmp_path" ]; then
      mv -f "$tmp_path" "$output_path"
      return 0
    fi

    rm -f "$tmp_path"
    attempt=$((attempt + 1))
    sleep $((attempt * 2))
  done

  return 1
}

# 等待任务完成
wait_for_task() {
  local task_id="$1"
  local task_name="${2:-任务}"
  
  while true; do
    local status_res status progress stage
    
    status_res=$(curl -fsS "$BASE_URL/v1/tasks/$task_id" \
      -H "Authorization: Bearer $API_KEY" 2>/dev/null) || {
      sleep 5
      continue
    }
    
    status=$(echo "$status_res" | jq -r '.data.status')
    progress=$(echo "$status_res" | jq -r '.data.progress')
    stage=$(echo "$status_res" | jq -r '.data.stage')
    
    log "INFO" "$task_name [$task_id]: $status - ${progress}% - $stage"
    
    if [ "$status" == "succeeded" ]; then
      return 0
    elif [ "$status" == "failed" ] || [ "$status" == "cancelled" ]; then
      local error=$(echo "$status_res" | jq -r '.data.error')
      log "ERROR" "$task_name 失败: $error"
      return 1
    fi
    
    sleep 10
  done
}

# ==========================================================
# 单个任务处理函数
# ==========================================================
process_single_task() {
  local task_config="$1"
  local task_index="$2"
  
  # 解析任务配置
  local task_name=$(echo "$task_config" | jq -r '.name // "task_'$task_index'"')
  local video_file=$(echo "$task_config" | jq -r '.video_file')
  local script_file=$(echo "$task_config" | jq -r '.script_file // ""')
  local corrections_file=$(echo "$task_config" | jq -r '.corrections_file // ""')
  local scenes_dir=$(echo "$task_config" | jq -r '.scenes_dir // ""')
  local bgm_file=$(echo "$task_config" | jq -r '.bgm_file // ""')
  local custom_config=$(echo "$task_config" | jq -r '.custom_config // "{}"')
  
  # 创建任务输出目录
  local task_output_dir="$TASKS_DIR/$task_name"
  mkdir -p "$task_output_dir"
  
  log "INFO" "========== 开始处理任务: $task_name =========="
  
  # 检查视频文件
  if [ ! -f "$video_file" ]; then
    log "ERROR" "视频文件不存在: $video_file"
    echo "{\"name\":\"$task_name\",\"status\":\"failed\",\"error\":\"视频文件不存在\"}" > "$task_output_dir/status.json"
    return 1
  fi
  
  # 获取商户ID
  local merchant_id=$(curl -fsS "$BASE_URL/v1/merchant/info" \
    -H "Authorization: Bearer $API_KEY" 2>/dev/null | jq -r '.data.merchant_id')
  
  if [ -z "$merchant_id" ] || [ "$merchant_id" == "null" ]; then
    log "ERROR" "无法获取 Merchant ID"
    echo "{\"name\":\"$task_name\",\"status\":\"failed\",\"error\":\"无法获取商户ID\"}" > "$task_output_dir/status.json"
    return 1
  fi
  
  # 上传主视频
  log "INFO" "[$task_name] 上传主视频..."
  local video_oss_key=$(upload_file "$video_file" "input" "$(basename "$video_file")" "video/mp4")
  if [ $? -ne 0 ] || [ -z "$video_oss_key" ]; then
    log "ERROR" "[$task_name] 视频上传失败"
    echo "{\"name\":\"$task_name\",\"status\":\"failed\",\"error\":\"视频上传失败\"}" > "$task_output_dir/status.json"
    return 1
  fi
  log "INFO" "[$task_name] 视频已上传: $video_oss_key"
  
  # 上传脚本（如果有）
  local script_oss_key=""
  if [ -f "$script_file" ]; then
    log "INFO" "[$task_name] 处理并上传脚本..."
    
    # 处理场景素材映射
    if [ -d "$scenes_dir" ]; then
      cp "$script_file" /tmp/${task_name}_script.json
      > /tmp/${task_name}_scene_mapping.txt
      
      for scene_file in "$scenes_dir"/*; do
        if [ -f "$scene_file" ]; then
          local bname=$(basename "$scene_file")
          log "INFO" "[$task_name] 上传场景素材: $bname"
          
          local real_oss_key=$(upload_file "$scene_file" "scenes" "$bname" "video/mp4")
          if [ $? -eq 0 ] && [ -n "$real_oss_key" ]; then
            local real_name=$(basename "$real_oss_key")
            echo "$bname|$real_name" >> /tmp/${task_name}_scene_mapping.txt
          fi
        fi
      done
      
      # 使用 Python 更新脚本
      if [ -s /tmp/${task_name}_scene_mapping.txt ]; then
        python3 << EOPY
import json
import sys

mapping = {}
with open('/tmp/${task_name}_scene_mapping.txt', 'r') as f:
    for line in f:
        old_name, new_name = line.strip().split('|')
        mapping[old_name] = new_name

with open('$script_file', 'r', encoding='utf-8') as f:
    script = json.load(f)

new_segments = []
for seg in script.get('segments', []):
    if seg.get('flag') == 'scene' and seg.get('scene_file'):
        old_path = seg['scene_file']
        basename = old_path.split('/')[-1]
        
        if basename in mapping:
            seg['scene_file'] = f"scenes/{mapping[basename]}"
            new_segments.append(seg)
        else:
            seg['flag'] = 'human'
            seg['scene_file'] = None
            new_segments.append(seg)
    else:
        new_segments.append(seg)

script['segments'] = new_segments

with open('/tmp/${task_name}_script.json', 'w', encoding='utf-8') as f:
    json.dump(script, f, ensure_ascii=False, indent=2)
EOPY
      fi
      
      script_oss_key=$(upload_file "/tmp/${task_name}_script.json" "input" "script.json" "application/json")
    else
      script_oss_key=$(upload_file "$script_file" "input" "script.json" "application/json")
    fi
    
    if [ $? -ne 0 ] || [ -z "$script_oss_key" ]; then
      log "WARN" "[$task_name] 脚本上传失败，将跳过脚本"
      script_oss_key=""
    else
      log "INFO" "[$task_name] 脚本已上传: $script_oss_key"
    fi
  fi
  
  # 上传纠错字典（如果有）
  local corrections_oss_key=""
  if [ -f "$corrections_file" ]; then
    log "INFO" "[$task_name] 处理并上传纠错字典..."
    
    if [ "$(jq type "$corrections_file" 2>/dev/null)" == "\"object\"" ]; then
      jq '[.corrections | to_entries | .[] | {src: .key, dst: .value}]' "$corrections_file" > /tmp/${task_name}_corrections.json
    else
      cp "$corrections_file" /tmp/${task_name}_corrections.json
    fi
    
    corrections_oss_key=$(upload_file "/tmp/${task_name}_corrections.json" "input" "corrections.json" "application/json")
    if [ $? -ne 0 ] || [ -z "$corrections_oss_key" ]; then
      log "WARN" "[$task_name] 纠错字典上传失败，将跳过"
      corrections_oss_key=""
    else
      log "INFO" "[$task_name] 纠错字典已上传: $corrections_oss_key"
    fi
  fi
  
  # 上传背景音乐（如果有）
  local bgm_oss_key=""
  if [ -f "$bgm_file" ]; then
    log "INFO" "[$task_name] 上传背景音乐..."
    bgm_oss_key=$(upload_file "$bgm_file" "input" "$(basename "$bgm_file")" "audio/mpeg")
    if [ $? -ne 0 ] || [ -z "$bgm_oss_key" ]; then
      log "WARN" "[$task_name] 背景音乐上传失败，将跳过"
      bgm_oss_key=""
    else
      log "INFO" "[$task_name] 背景音乐已上传: $bgm_oss_key"
    fi
  fi
  
  # 构建草稿任务请求
  local draft_request=$(jq -n \
    --arg video_url "$video_oss_key" \
    --arg script_url "$script_oss_key" \
    --arg corrections_url "$corrections_oss_key" \
    --arg scene_base_url "$merchant_id" \
    --argjson custom "$custom_config" \
    '{
      input: {
        video_url: $video_url,
        script_url: ($script_url | if . == "" then null else . end),
        corrections_url: ($corrections_url | if . == "" then null else . end),
        scene_base_url: $scene_base_url
      },
      pipeline: ($custom.pipeline // {
        remove_keyword: "转场",
        margin: 0.15,
        min_segment_duration: 0.1
      }),
      asr: ($custom.asr // {
        model: "large-v3",
        device: "cuda",
        language: "zh"
      }),
      draft: {
        need_transcription: true,
        need_timeline: true
      },
      timeout_seconds: 1800
    }')
  
  # 提交草稿任务
  log "INFO" "[$task_name] 提交草稿任务..."
  local draft_res=$(curl -fsS -X POST "$BASE_URL/v1/tasks/agent-draft" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d "$draft_request" 2>/dev/null)
  
  local draft_task_id=$(echo "$draft_res" | jq -r '.data.task_id')
  if [ -z "$draft_task_id" ] || [ "$draft_task_id" == "null" ]; then
    log "ERROR" "[$task_name] 草稿任务创建失败: $draft_res"
    echo "{\"name\":\"$task_name\",\"status\":\"failed\",\"error\":\"草稿任务创建失败\"}" > "$task_output_dir/status.json"
    return 1
  fi
  
  log "INFO" "[$task_name] 草稿任务ID: $draft_task_id"
  echo "$draft_task_id" > "$task_output_dir/draft_task_id.txt"
  
  # 等待草稿任务完成
  if ! wait_for_task "$draft_task_id" "[$task_name] 草稿任务"; then
    echo "{\"name\":\"$task_name\",\"status\":\"failed\",\"error\":\"草稿任务执行失败\",\"draft_task_id\":\"$draft_task_id\"}" > "$task_output_dir/status.json"
    return 1
  fi
  
  # 获取草稿详情
  log "INFO" "[$task_name] 获取草稿详情..."
  curl -fsS "$BASE_URL/v1/drafts/$draft_task_id" \
    -H "Authorization: Bearer $API_KEY" > "$task_output_dir/draft_detail.json" 2>/dev/null
  
  # 下载草稿产物
  log "INFO" "[$task_name] 下载草稿产物..."
  jq '.data.editable_script' "$task_output_dir/draft_detail.json" > "$task_output_dir/editable_script.json"
  download_file "$draft_task_id" "transcription_json" "$task_output_dir/transcription.json"
  download_file "$draft_task_id" "timeline_json" "$task_output_dir/timeline.json"
  download_file "$draft_task_id" "cleaned_video" "$task_output_dir/cleaned_video.mp4"
  
  # 判断是否自动合成
  if [ "$AUTO_COMPOSE" != "true" ]; then
    log "INFO" "[$task_name] 草稿处理完成，跳过自动合成"
    echo "{\"name\":\"$task_name\",\"status\":\"draft_completed\",\"draft_task_id\":\"$draft_task_id\"}" > "$task_output_dir/status.json"
    return 0
  fi
  
  # 提交合成任务
  log "INFO" "[$task_name] 提交合成任务..."
  local compose_request=$(jq -n \
    --arg draft_task_id "$draft_task_id" \
    --arg bgm_url "$bgm_oss_key" \
    --argjson custom "$custom_config" \
    '{
      draft_task_id: $draft_task_id,
      pipeline: ($custom.compose_pipeline // {
        use_transitions: false,
        transition_type: "fade",
        transition_duration: 0.8,
        resync_subtitle: true
      }),
      asr: ($custom.asr // {
        model: "large-v3",
        device: "cuda",
        language: "zh"
      }),
      subtitle: ($custom.subtitle // {
        effect: "ad",
        font_size: 88
      }),
      audio: {
        bgm_url: ($bgm_url | if . == "" then null else . end),
        bgm_volume: ($custom.audio.bgm_volume // 0.3),
        original_volume: ($custom.audio.original_volume // 1.0),
        bgm_start_time: ($custom.audio.bgm_start_time // 0.0),
        bgm_loop: ($custom.audio.bgm_loop // true),
        fade_in_duration: ($custom.audio.fade_in_duration // 0.5),
        fade_out_duration: ($custom.audio.fade_out_duration // 0.5)
      },
      output: {
        need_ass: true
      },
      timeout_seconds: 1800
    }')
  
  local compose_res=$(curl -fsS -X POST "$BASE_URL/v1/tasks/compose-from-draft" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d "$compose_request" 2>/dev/null)
  
  local compose_task_id=$(echo "$compose_res" | jq -r '.data.task_id')
  if [ -z "$compose_task_id" ] || [ "$compose_task_id" == "null" ]; then
    log "ERROR" "[$task_name] 合成任务创建失败: $compose_res"
    echo "{\"name\":\"$task_name\",\"status\":\"failed\",\"error\":\"合成任务创建失败\",\"draft_task_id\":\"$draft_task_id\"}" > "$task_output_dir/status.json"
    return 1
  fi
  
  log "INFO" "[$task_name] 合成任务ID: $compose_task_id"
  echo "$compose_task_id" > "$task_output_dir/compose_task_id.txt"
  
  # 等待合成任务完成
  if ! wait_for_task "$compose_task_id" "[$task_name] 合成任务"; then
    echo "{\"name\":\"$task_name\",\"status\":\"failed\",\"error\":\"合成任务执行失败\",\"draft_task_id\":\"$draft_task_id\",\"compose_task_id\":\"$compose_task_id\"}" > "$task_output_dir/status.json"
    return 1
  fi
  
  # 下载最终产物
  log "INFO" "[$task_name] 下载最终产物..."
  download_file "$compose_task_id" "final_video" "$task_output_dir/final_video.mp4"
  download_file "$compose_task_id" "ass_file" "$task_output_dir/final.ass"
  download_file "$compose_task_id" "resync_json" "$task_output_dir/resync.json"
  
  # 记录成功状态
  echo "{\"name\":\"$task_name\",\"status\":\"succeeded\",\"draft_task_id\":\"$draft_task_id\",\"compose_task_id\":\"$compose_task_id\"}" > "$task_output_dir/status.json"
  
  log "INFO" "[$task_name] ========== 任务处理完成 =========="
  return 0
}

# ==========================================================
# 批量处理主流程
# ==========================================================

log "INFO" "开始批量处理..."
log "INFO" "配置文件: $BATCH_CONFIG"
log "INFO" "最大并发数: $MAX_CONCURRENT"
log "INFO" "自动合成: $AUTO_COMPOSE"

# 检查配置文件
if [ ! -f "$BATCH_CONFIG" ]; then
  log "ERROR" "配置文件不存在: $BATCH_CONFIG"
  exit 1
fi

# 读取任务列表
TASKS_JSON=$(cat "$BATCH_CONFIG")
TASKS_COUNT=$(echo "$TASKS_JSON" | jq '.tasks | length')

log "INFO" "共 $TASKS_COUNT 个任务待处理"

# 初始化状态文件
echo "{\"total\":$TASKS_COUNT,\"completed\":0,\"failed\":0,\"tasks\":[]}" > "$BATCH_STATUS"

# 处理任务
if [ "$USE_PARALLEL" == "true" ] && [ "$MAX_CONCURRENT" -gt 1 ]; then
  # 使用 GNU parallel 并发处理
  log "INFO" "使用并发模式 (GNU parallel)"
  
  export -f process_single_task upload_file download_file wait_for_task log
  export BASE_URL API_KEY TASKS_DIR BATCH_LOG
  
  echo "$TASKS_JSON" | jq -c '.tasks[]' | parallel -j "$MAX_CONCURRENT" --line-buffer \
    'process_single_task {} {#}'
else
  # 串行处理
  log "INFO" "使用串行模式"
  
  for i in $(seq 0 $((TASKS_COUNT - 1))); do
    task_config=$(echo "$TASKS_JSON" | jq -c ".tasks[$i]")
    process_single_task "$task_config" "$i"
  done
fi

# 生成汇总报告
log "INFO" "生成汇总报告..."

COMPLETED=0
FAILED=0
REPORT="$BATCH_OUTPUT_DIR/batch_report.txt"

echo "========================================================== " > "$REPORT"
echo "批量处理汇总报告" >> "$REPORT"
echo "========================================================== " >> "$REPORT"
echo "" >> "$REPORT"
echo "处理时间: $(date)" >> "$REPORT"
echo "总任务数: $TASKS_COUNT" >> "$REPORT"
echo "" >> "$REPORT"

for task_dir in "$TASKS_DIR"/*/; do
  if [ -f "$task_dir/status.json" ]; then
    task_name=$(basename "$task_dir")
    status=$(jq -r '.status' "$task_dir/status.json")
    
    echo "任务: $task_name" >> "$REPORT"
    echo "  状态: $status" >> "$REPORT"
    
    if [ "$status" == "succeeded" ]; then
      COMPLETED=$((COMPLETED + 1))
      draft_id=$(jq -r '.draft_task_id' "$task_dir/status.json")
      compose_id=$(jq -r '.compose_task_id' "$task_dir/status.json")
      echo "  草稿任务ID: $draft_id" >> "$REPORT"
      echo "  合成任务ID: $compose_id" >> "$REPORT"
      echo "  输出文件: $task_dir/final_video.mp4" >> "$REPORT"
    elif [ "$status" == "draft_completed" ]; then
      COMPLETED=$((COMPLETED + 1))
      draft_id=$(jq -r '.draft_task_id' "$task_dir/status.json")
      echo "  草稿任务ID: $draft_id" >> "$REPORT"
      echo "  输出目录: $task_dir/" >> "$REPORT"
    else
      FAILED=$((FAILED + 1))
      error=$(jq -r '.error' "$task_dir/status.json")
      echo "  错误信息: $error" >> "$REPORT"
    fi
    
    echo "" >> "$REPORT"
  fi
done

echo "========================================================== " >> "$REPORT"
echo "统计信息:" >> "$REPORT"
echo "  成功: $COMPLETED" >> "$REPORT"
echo "  失败: $FAILED" >> "$REPORT"
echo "========================================================== " >> "$REPORT"

# 更新状态文件
jq --arg completed "$COMPLETED" --arg failed "$FAILED" \
  '.completed = ($completed | tonumber) | .failed = ($failed | tonumber)' \
  "$BATCH_STATUS" > "$BATCH_STATUS.tmp" && mv "$BATCH_STATUS.tmp" "$BATCH_STATUS"

log "INFO" "批量处理完成！"
log "INFO" "成功: $COMPLETED, 失败: $FAILED"
log "INFO" "详细报告: $REPORT"

cat "$REPORT"

exit 0