#!/bin/bash
# ==========================================================
# RJCut 数字人视频生成测试脚本 (蝉镜 API 集成)
# 支持两种模式：
#   1. 生成数字人视频 (使用已有数字人)
#   2. 创建自定义数字人 (训练新数字人)
# ==========================================================

# --- 环境配置 ---
BASE_URL=${BASE_URL:-"http://127.0.0.1:8001"}
API_KEY=${API_KEY:-"替换成你的_API_KEY"}

# --- 输出目录 ---
OUTPUT_DIR="./digital_human_output"
mkdir -p "$OUTPUT_DIR"

if [ ! -x "$(command -v jq)" ]; then
  echo "❌ 缺少依赖 jq，请先安装 (例：apt-get install jq)"
  exit 1
fi

echo "=========================================================="
echo "🤖 数字人视频生成测试工具"
echo "=========================================================="
echo ""
echo "请选择测试模式:"
echo ""
echo "  1️⃣  生成数字人视频 (使用已有数字人)"
echo "     - 选择公共数字人或自定义数字人"
echo "     - 输入文案"
echo "     - 选择音色"
echo "     - 生成视频"
echo ""
echo "  2️⃣  创建自定义数字人 (训练新数字人)"
echo "     - 上传训练视频"
echo "     - 设置数字人名称"
echo "     - 等待训练完成"
echo ""
echo "  3️⃣  查看资源列表"
echo "     - 查看公共数字人"
echo "     - 查看自定义数字人"
echo "     - 查看音色列表"
echo ""
echo "  0️⃣  退出"
echo ""

read -p "请选择模式 [0-3]: " mode_choice

case $mode_choice in
  1)
    # ==========================================================
    # 模式 1: 生成数字人视频
    # ==========================================================
    echo ""
    echo "=========================================================="
    echo "🎬 生成数字人视频"
    echo "=========================================================="
    
    # 获取数字人列表
    echo ""
    echo "📋 获取公共数字人列表..."
    persons_res=$(curl -s "$BASE_URL/v1/dh/persons/common" -H "Authorization: Bearer $API_KEY")
    persons=$(echo "$persons_res" | jq -r '.data[] | "\(.id)|\(.name)"' 2>/dev/null)
    
    if [ -z "$persons" ]; then
      echo "⚠️  未获取到公共数字人列表"
    else
      echo "✅ 公共数字人:"
      echo "$persons" | while IFS='|' read -r id name; do
        echo "   - $id: $name"
      done
    fi
    
    echo ""
    echo "📋 获取自定义数字人列表..."
    custom_persons_res=$(curl -s "$BASE_URL/v1/dh/persons/custom" -H "Authorization: Bearer $API_KEY")
    custom_persons=$(echo "$custom_persons_res" | jq -r '.data[] | "\(.id)|\(.name)"' 2>/dev/null)
    
    if [ -n "$custom_persons" ]; then
      echo "✅ 自定义数字人:"
      echo "$custom_persons" | while IFS='|' read -r id name; do
        echo "   - $id: $name"
      done
    else
      echo "   (无自定义数字人)"
    fi
    
    echo ""
    read -p "请输入数字人 ID (留空使用公共数字人): " person_id_input
    person_id_input=${person_id_input:-""}
    
    # 获取音色列表
    echo ""
    echo "📋 获取音色列表..."
    voices_res=$(curl -s "$BASE_URL/v1/dh/voices" -H "Authorization: Bearer $API_KEY")
    voices=$(echo "$voices_res" | jq -r '.data[] | "\(.id)|\(.name)"' 2>/dev/null)
    
    if [ -z "$voices" ]; then
      echo "❌ 未获取到音色列表"
      exit 1
    fi
    
    echo "✅ 可用音色:"
    echo "$voices" | while IFS='|' read -r id name; do
      echo "   - $id: $name"
    done
    
    echo ""
    read -p "请输入音色 ID: " audio_man_id
    if [ -z "$audio_man_id" ]; then
      echo "❌ 音色 ID 不能为空"
      exit 1
    fi
    
    # 输入文案
    echo ""
    echo "请输入文案内容 (多行输入，空行结束):"
    text_content=""
    while IFS= read -r line; do
      [ -z "$line" ] && break
      text_content="$text_content$line\n"
    done
    
    if [ -z "$text_content" ]; then
      echo "❌ 文案内容不能为空"
      exit 1
    fi
    
    # 选择背景类型
    echo ""
    echo "选择背景类型:"
    echo "  1) 纯色背景"
    echo "  2) 图片背景"
    read -p "请选择 [1-2]: " bg_choice
    
    if [ "$bg_choice" = "1" ]; then
      bg_type="color"
      read -p "请输入背景颜色 (默认 #EDEDED): " bg_color
      bg_color=${bg_color:-"#EDEDED"}
      bg_file_oss_key=""
    else
      bg_type="image"
      read -p "请输入背景图片路径: " bg_file
      if [ -f "$bg_file" ]; then
        echo "📤 上传背景图片..."
        bg_file_oss_key=$(upload_file "$bg_file" "input" "$(basename "$bg_file")" "image/jpeg")
        if [ -z "$bg_file_oss_key" ]; then
          echo "⚠️  背景上传失败，将使用纯色背景"
          bg_type="color"
          bg_color="#EDEDED"
        fi
      else
        echo "⚠️  背景文件不存在，将使用纯色背景"
        bg_type="color"
        bg_color="#EDEDED"
      fi
    fi
    
    # 构建请求
    req_json=$(cat <<EOF
{
  "text": "$(echo -e "$text_content" | tr '\n' ' ')",
  "person_id": "$person_id_input",
  "audio_man_id": "$audio_man_id",
  "figure_type": "sit_body",
  "drive_mode": "random",
  "bg_type": "$bg_type",
  "bg_color": "$bg_color",
  "timeout_seconds": 3600
}
EOF
)
    
    if [ -n "$bg_file_oss_key" ]; then
      req_json=$(echo "$req_json" | jq --arg key "$bg_file_oss_key" '. + {bg_file_oss_key: $key}')
    fi
    
    echo ""
    echo "📤 提交生成任务..."
    task_res=$(curl -s -X POST "$BASE_URL/v1/dh/tasks/generate" \
      -H "Authorization: Bearer $API_KEY" \
      -H "Content-Type: application/json" \
      -d "$req_json")
    
    TASK_ID=$(echo "$task_res" | jq -r '.data.task_id')
    if [ "$TASK_ID" == "null" ] || [ -z "$TASK_ID" ]; then
      echo "❌ 任务提交失败：$task_res"
      exit 1
    fi
    
    echo "   ✅ 任务创建成功：$TASK_ID"
    echo "$TASK_ID" > "$OUTPUT_DIR/task_id.txt"
    
    # 轮询任务状态
    echo "⏳ 等待生成..."
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
    
    # 下载结果
    echo ""
    echo "📥 下载结果..."
    download_file "$TASK_ID" "final_video" "$OUTPUT_DIR/final_video.mp4"
    
    echo ""
    echo "=========================================================="
    echo "🎉 生成完成!"
    echo "=========================================================="
    echo ""
    echo "📁 输出文件：$OUTPUT_DIR/final_video.mp4"
    echo ""
    ls -lh "$OUTPUT_DIR"
    ;;
    
  2)
    # ==========================================================
    # 模式 2: 创建自定义数字人
    # ==========================================================
    echo ""
    echo "=========================================================="
    echo "👤 创建自定义数字人 (训练)"
    echo "=========================================================="
    
    read -p "请输入数字人名称: " person_name
    if [ -z "$person_name" ]; then
      echo "❌ 名称不能为空"
      exit 1
    fi
    
    read -p "请输入训练视频路径: " source_video
    if [ ! -f "$source_video" ]; then
      echo "❌ 视频文件不存在：$source_video"
      exit 1
    fi
    
    # 上传训练视频
    echo ""
    echo "📤 上传训练视频..."
    source_oss_key=$(upload_file "$source_video" "input" "$(basename "$source_video")" "video/mp4")
    if [ -z "$source_oss_key" ]; then
      echo "❌ 上传失败"
      exit 1
    fi
    echo "   ✅ 上传成功：$source_oss_key"
    
    # 选择训练类型
    echo ""
    echo "选择训练类型:"
    echo "  1) both (声音 + 形象)"
    echo "  2) voice (仅声音)"
    echo "  3) video (仅形象)"
    read -p "请选择 [1-3]: " train_choice
    
    case $train_choice in
      1) train_type="both" ;;
      2) train_type="voice" ;;
      3) train_type="video" ;;
      *) train_type="both" ;;
    esac
    
    # 提交训练任务
    req_json=$(cat <<EOF
{
  "name": "$person_name",
  "source_video_oss_key": "$source_oss_key",
  "train_type": "$train_type",
  "language": "cn",
  "error_skip": false,
  "resolution_rate": 0
}
EOF
)
    
    echo ""
    echo "📤 提交训练任务..."
    task_res=$(curl -s -X POST "$BASE_URL/v1/dh/tasks/create-person" \
      -H "Authorization: Bearer $API_KEY" \
      -H "Content-Type: application/json" \
      -d "$req_json")
    
    TASK_ID=$(echo "$task_res" | jq -r '.data.task_id')
    if [ "$TASK_ID" == "null" ] || [ -z "$TASK_ID" ]; then
      echo "❌ 任务提交失败：$task_res"
      exit 1
    fi
    
    echo "   ✅ 任务创建成功：$TASK_ID"
    echo "$TASK_ID" > "$OUTPUT_DIR/train_task_id.txt"
    
    # 轮询任务状态
    echo "⏳ 等待训练 (可能需要较长时间)..."
    while true; do
      status_res=$(curl -s "$BASE_URL/v1/tasks/$TASK_ID" -H "Authorization: Bearer $API_KEY")
      status=$(echo "$status_res" | jq -r '.data.status')
      progress=$(echo "$status_res" | jq -r '.data.progress')
      stage=$(echo "$status_res" | jq -r '.data.stage')
      
      echo -ne "\r   [$status] 进度：${progress}% - 当前阶段：$stage       "
      
      if [ "$status" == "succeeded" ]; then
        echo -e "\n🎉 训练完成！"
        break
      elif [ "$status" == "failed" ] || [ "$status" == "cancelled" ]; then
        error=$(echo "$status_res" | jq -r '.data.error')
        echo -e "\n❌ 训练失败：$error"
        exit 1
      fi
      sleep 10
    done
    
    # 查看结果
    echo ""
    echo "📊 训练结果:"
    result=$(echo "$status_res" | jq '.data.result')
    echo "$result" | jq '.'
    
    echo ""
    echo "=========================================================="
    echo "🎉 自定义数字人创建完成!"
    echo "=========================================================="
    echo ""
    echo "💡 提示：现在可以使用该数字人生成视频了"
    echo "   数字人 ID: $(echo "$result" | jq -r '.person_id')"
    echo ""
    ;;
    
  3)
    # ==========================================================
    # 模式 3: 查看资源列表
    # ==========================================================
    echo ""
    echo "=========================================================="
    echo "📋 资源列表"
    echo "=========================================================="
    
    echo ""
    echo "--- 公共数字人 ---"
    persons_res=$(curl -s "$BASE_URL/v1/dh/persons/common" -H "Authorization: Bearer $API_KEY")
    echo "$persons_res" | jq '.data[] | {id: .id, name: .name}'
    
    echo ""
    echo "--- 自定义数字人 ---"
    custom_persons_res=$(curl -s "$BASE_URL/v1/dh/persons/custom" -H "Authorization: Bearer $API_KEY")
    echo "$custom_persons_res" | jq '.data[] | {id: .id, name: .name, status: .status}'
    
    echo ""
    echo "--- 音色列表 ---"
    voices_res=$(curl -s "$BASE_URL/v1/dh/voices" -H "Authorization: Bearer $API_KEY")
    echo "$voices_res" | jq '.data[] | {id: .id, name: .name}'
    
    echo ""
    echo "=========================================================="
    ;;
    
  0)
    echo ""
    echo "👋 已退出"
    echo ""
    exit 0
    ;;
    
  *)
    echo "❓ 无效选项"
    exit 1
    ;;
esac

# ==========================================================
# 工具函数
# ==========================================================

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
