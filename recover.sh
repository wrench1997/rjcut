#!/bin/bash
# recover.sh - 故障恢复工具

BATCH_OUTPUT_DIR="${1:-./batch_output}"
ACTION="${2:-list}"  # list, retry, resume

if [ ! -d "$BATCH_OUTPUT_DIR" ]; then
  echo "❌ 输出目录不存在: $BATCH_OUTPUT_DIR"
  exit 1
fi

case "$ACTION" in
  "list")
    # 列出失败任务
    echo "Failed Tasks:"
    for task_dir in "$BATCH_OUTPUT_DIR/tasks"/*/; do
      if [ -f "$task_dir/status.json" ]; then
        status=$(jq -r '.status' "$task_dir/status.json")
        if [ "$status" == "failed" ]; then
          task_name=$(basename "$task_dir")
          error=$(jq -r '.error' "$task_dir/status.json")
          echo "  - $task_name: $error"
        fi
      fi
    done
    ;;
    
  "retry")
    # 重试失败任务
    echo "🔄 重试失败任务..."
    
    # 生成重试配置
    original_config="batch_config.json"
    retry_config="batch_config_retry.json"
    
    jq '{tasks: [.tasks[] | select(.name as $name | 
      any(["'"$BATCH_OUTPUT_DIR"'/tasks/" + $name + "/status.json"] | 
      .[0] | test("failed")))]}' "$original_config" > "$retry_config"
    
    retry_count=$(jq '.tasks | length' "$retry_config")
    
    if [ "$retry_count" -gt 0 ]; then
      echo "   找到 $retry_count 个失败任务"
      echo "   生成重试配置: $retry_config"
      
      # 清理失败任务的输出
      for task_dir in "$BATCH_OUTPUT_DIR/tasks"/*/; do
        if [ -f "$task_dir/status.json" ]; then
          status=$(jq -r '.status' "$task_dir/status.json")
          if [ "$status" == "failed" ]; then
            echo "   清理: $(basename "$task_dir")"
            rm -rf "$task_dir"
          fi
        fi
      done
      
      echo ""
      echo "运行重试命令:"
      echo "  BATCH_CONFIG=$retry_config ./batch_process.sh"
    else
      echo "   没有失败任务需要重试"
    fi
    ;;
    
  "resume")
    # 恢复中断的任务
    echo "▶️  恢复中断任务..."
    
    for task_dir in "$BATCH_OUTPUT_DIR/tasks"/*/; do
      task_name=$(basename "$task_dir")
      
      if [ -f "$task_dir/draft_task_id.txt" ]; then
        draft_id=$(cat "$task_dir/draft_task_id.txt")
        
        # 检查草稿任务状态
        status_res=$(curl -s "$BASE_URL/v1/tasks/$draft_id" \
          -H "Authorization: Bearer $API_KEY")
        status=$(echo "$status_res" | jq -r '.data.status')
        
        if [ "$status" == "succeeded" ]; then
          if [ ! -f "$task_dir/compose_task_id.txt" ]; then
            echo "   [$task_name] 草稿完成但未合成，可手动提交合成"
            echo "     draft_task_id: $draft_id"
          fi
        elif [ "$status" == "failed" ]; then
          echo "   [$task_name] 草稿任务失败: $draft_id"
        else
          echo "   [$task_name] 草稿任务进行中: $draft_id ($status)"
        fi
      fi
    done
    ;;
    
  *)
    echo "用法: $0 <输出目录> <操作>"
    echo ""
    echo "操作:"
    echo "  list   - 列出失败任务"
    echo "  retry  - 生成重试配置"
    echo "  resume - 恢复中断任务"
    ;;
esac