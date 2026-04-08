#!/bin/bash
# ==========================================================
# RJCut 草稿模式全量测试脚本 (含视频, 脚本, 纠错, 场景素材)
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

if [ ! -f "$VIDEO_FILE" ]; then
  echo "❌ 找不到主视频文件: $VIDEO_FILE"
  exit 1
fi
if [ ! -x "$(command -v jq)" ]; then
  echo "❌ 缺少依赖 jq，请先安装 (例: apt-get install jq)"
  exit 1
fi

echo "=========================================================="
echo "🎬 启动 RJCut 完整草稿任务自动化流程"
echo "=========================================================="

# 通用上传函数，返回 oss_key
upload_file() {
  local file_path=$1
  local purpose=$2
  local req_filename=$3
  local content_type=$4

  # 1. 预签名
  local presign_res=$(curl -s -X POST "$BASE_URL/v1/uploads/presign" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{
      "filename": "'"$req_filename"'",
      "content_type": "'"$content_type"'",
      "purpose": "'"$purpose"'"
    }')
    
  local upload_id=$(echo "$presign_res" | jq -r '.data.upload_id')
  local upload_url=$(echo "$presign_res" | jq -r '.data.upload_url')
  local oss_key=$(echo "$presign_res" | jq -r '.data.oss_key')

  if [ "$upload_id" == "null" ] || [ -z "$upload_id" ]; then
    echo "预签名失败: $presign_res" >&2
    exit 1
  fi

  # 2. 上传到 MinIO
  curl -s -X PUT "$upload_url" -H "Content-Type: $content_type" --upload-file "$file_path"

  # 3. 确认上传
  local confirm_res=$(curl -s -X POST "$BASE_URL/v1/uploads/confirm" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"upload_id\":\"$upload_id\"}")
    
  local confirmed=$(echo "$confirm_res" | jq -r '.data.confirmed')
  if [ "$confirmed" != "true" ]; then
    echo "上传确认失败: $confirm_res" >&2
    exit 1
  fi
  
  echo "$oss_key"
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
echo "🚀 1/4 上传主视频..."
VIDEO_OSS_KEY=$(upload_file "$VIDEO_FILE" "input" "$(basename "$VIDEO_FILE")" "video/mp4")
echo "   ✅ $VIDEO_OSS_KEY"


# ================= 关键修复区域 开始 =================
# 我们先复制一份 script.json，用来动态替换真实生成的文件名
cp "$SCRIPT_FILE" /tmp/fmt_script.json
SCENE_BASE_URL="$MERCHANT_ID"

echo "🚀 2/4 批量上传场景素材 (并动态更新 JSON 脚本)..."

# 创建一个临时映射文件
> /tmp/scene_mapping.txt

for scene_file in "$SCENES_DIR"/*; do
  if [ -f "$scene_file" ]; then
    bname=$(basename "$scene_file")
    echo "   - 上传 $bname ..."
    
    real_oss_key=$(upload_file "$scene_file" "scenes" "$bname" "video/mp4")
    
    # 检查上传是否成功
    if [ $? -ne 0 ] || [ -z "$real_oss_key" ] || [[ "$real_oss_key" == *"<Error>"* ]]; then
      echo "     ⚠️  上传失败，将从脚本中移除此素材"
      continue
    fi
    
    echo "     -> 成功放入: $real_oss_key"
    
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
            print(f"⚠️  警告: {basename} 上传失败，已从脚本中移除", file=sys.stderr)
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

echo "🚀 3/4 上传映射后的脚本文档..."
SCRIPT_OSS_KEY=$(upload_file "/tmp/fmt_script.json" "input" "script.json" "application/json")
echo "   ✅ $SCRIPT_OSS_KEY"
# ================= 关键修复区域 结束 =================


echo "🚀 4/4 处理并上传错别字字典..."
if [ "$(jq type "$CORRECTIONS_FILE")" == "\"object\"" ]; then
  jq '[.corrections | to_entries | .[] | {src: .key, dst: .value}]' "$CORRECTIONS_FILE" > /tmp/fmt_corrections.json
else
  cp "$CORRECTIONS_FILE" /tmp/fmt_corrections.json
fi
CORRECTIONS_OSS_KEY=$(upload_file "/tmp/fmt_corrections.json" "input" "corrections.json" "application/json")
echo "   ✅ $CORRECTIONS_OSS_KEY"

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
  echo "❌ 任务提交失败: $task_res"
  exit 1
fi
echo "   ✅ 任务创建成功: $TASK_ID"

# ---------------------------------------------------------
# 4. 轮询任务状态
# ---------------------------------------------------------
echo "⏳ 等待执行..."
while true; do
  status_res=$(curl -s "$BASE_URL/v1/tasks/$TASK_ID" -H "Authorization: Bearer $API_KEY")
  status=$(echo "$status_res" | jq -r '.data.status')
  progress=$(echo "$status_res" | jq -r '.data.progress')
  stage=$(echo "$status_res" | jq -r '.data.stage')
  
  echo -ne "\r   [$status] 进度: ${progress}% - 当前阶段: $stage       "
  
  if [ "$status" == "succeeded" ]; then
    echo -e "\n🎉 任务处理完毕！"
    break
  elif [ "$status" == "failed" ] || [ "$status" == "cancelled" ]; then
    error=$(echo "$status_res" | jq -r '.data.error')
    echo -e "\n❌ 任务失败: $error"
    exit 1
  fi
  sleep 5
done

# ---------------------------------------------------------
# 5. 查看草稿结果
# ---------------------------------------------------------
echo "=========================================================="
echo "📊 拉取最终草稿详情..."
curl -s "$BASE_URL/v1/drafts/$TASK_ID" -H "Authorization: Bearer $API_KEY" > /tmp/draft_detail.json

echo "👇 切片数量: $(jq -r '.data.parts_count' /tmp/draft_detail.json)"
echo "👇 场景素材数 (Scene Assets): $(jq '.data.scene_assets | length' /tmp/draft_detail.json)"
echo "👇 Editable Script 预览 (前 2 段):"
jq '.data.editable_script.segments[:2]' /tmp/draft_detail.json
echo "✅ 所有细节已保存到: /tmp/draft_detail.json"