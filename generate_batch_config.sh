#!/bin/bash
# generate_batch_config.sh - 自动生成批处理配置

VIDEOS_DIR="$1"
OUTPUT_CONFIG="${2:-batch_config.json}"

if [ ! -d "$VIDEOS_DIR" ]; then
  echo "用法: $0 <视频目录> [输出配置文件]"
  exit 1
fi

echo '{"tasks":[' > "$OUTPUT_CONFIG"

first=true
for video in "$VIDEOS_DIR"/*.mp4; do
  if [ -f "$video" ]; then
    name=$(basename "$video" .mp4)
    
    if [ "$first" = true ]; then
      first=false
    else
      echo ',' >> "$OUTPUT_CONFIG"
    fi
    
    cat >> "$OUTPUT_CONFIG" << EOF
{
  "name": "$name",
  "video_file": "$video",
  "script_file": "./scripts/${name}_script.json",
  "corrections_file": "./corrections/common.json",
  "scenes_dir": "./scenes/$name",
  "bgm_file": "./bgm/default.mp3"
}
EOF
  fi
done

echo ']}' >> "$OUTPUT_CONFIG"

echo "✅ 配置文件已生成: $OUTPUT_CONFIG"
jq '.' "$OUTPUT_CONFIG"