#!/bin/bash
# group_tasks.sh - 任务智能分组

CONFIG_FILE="$1"
GROUP_BY="${2:-priority}"  # priority, duration, category

if [ ! -f "$CONFIG_FILE" ]; then
  echo "用法: $0 <配置文件> [分组方式]"
  echo "分组方式: priority, duration, category"
  exit 1
fi

case "$GROUP_BY" in
  "priority")
    # 按优先级分组
    jq '.tasks |= sort_by(.priority // 5)' "$CONFIG_FILE" > "${CONFIG_FILE}.sorted"
    echo "✅ 已按优先级排序"
    ;;
    
  "duration")
    # 按视频时长分组（需要预先获取时长）
    python3 << 'EOPY'
import json
import subprocess
import sys

with open(sys.argv[1], 'r') as f:
    config = json.load(f)

for task in config['tasks']:
    video = task['video_file']
    try:
        result = subprocess.run(
            ['ffprobe', '-v', 'error', '-show_entries', 
             'format=duration', '-of', 'json', video],
            capture_output=True, text=True, timeout=10
        )
        data = json.loads(result.stdout)
        task['_duration'] = float(data['format']['duration'])
    except:
        task['_duration'] = 0

config['tasks'] = sorted(config['tasks'], key=lambda x: x.get('_duration', 0))

with open(sys.argv[1] + '.sorted', 'w') as f:
    json.dump(config, f, indent=2, ensure_ascii=False)
EOPY
    python3 - "$CONFIG_FILE"
    echo "✅ 已按时长排序"
    ;;
    
  "category")
    # 按类别分组
    jq 'group_by(.category // "default") | 
        map({category: .[0].category, tasks: .}) | 
        {groups: .}' "$CONFIG_FILE" > "${CONFIG_FILE}.grouped"
    echo "✅ 已按类别分组"
    ;;
esac

mv "${CONFIG_FILE}.sorted" "$CONFIG_FILE" 2>/dev/null || true