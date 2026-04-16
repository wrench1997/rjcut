#!/bin/bash
# monitor.sh - 实时监控面板

BATCH_OUTPUT_DIR="${1:-./batch_output}"
REFRESH_INTERVAL="${2:-5}"

if [ ! -d "$BATCH_OUTPUT_DIR" ]; then
  echo "❌ 输出目录不存在: $BATCH_OUTPUT_DIR"
  exit 1
fi

# 监控函数
monitor_loop() {
  while true; do
    clear
    
    echo "=========================================="
    echo "🎬 RJCut 批量处理实时监控"
    echo "=========================================="
    echo "更新时间: $(date +'%Y-%m-%d %H:%M:%S')"
    echo ""
    
    # 读取状态文件
    if [ -f "$BATCH_OUTPUT_DIR/batch_status.json" ]; then
      total=$(jq -r '.total' "$BATCH_OUTPUT_DIR/batch_status.json")
      completed=$(jq -r '.completed' "$BATCH_OUTPUT_DIR/batch_status.json")
      failed=$(jq -r '.failed' "$BATCH_OUTPUT_DIR/batch_status.json")
      in_progress=$((total - completed - failed))
      
      echo "📊 整体进度"
      echo "   总任务数: $total"
      echo "   ✅ 已完成: $completed"
      echo "   ⏳ 处理中: $in_progress"
      echo "   ❌ 失败: $failed"
      
      # 进度条
      if [ "$total" -gt 0 ]; then
        percent=$((completed * 100 / total))
        bar_length=50
        filled=$((percent * bar_length / 100))
        
        printf "   ["
        for i in $(seq 1 $filled); do printf "█"; done
        for i in $(seq $((filled + 1)) $bar_length); do printf "░"; done
        printf "] %d%%\n" "$percent"
      fi
      
      echo ""
    fi
    
    # 任务详情
    echo "📋 任务详情"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    printf "%-20s %-15s %-40s\n" "任务名称" "状态" "信息"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    for task_dir in "$BATCH_OUTPUT_DIR/tasks"/*/; do
      if [ -d "$task_dir" ]; then
        task_name=$(basename "$task_dir")
        
        if [ -f "$task_dir/status.json" ]; then
          status=$(jq -r '.status' "$task_dir/status.json")
          
          case "$status" in
            "succeeded")
              status_icon="✅"
              info="处理完成"
              ;;
            "draft_completed")
              status_icon="📝"
              info="草稿完成"
              ;;
            "failed")
              status_icon="❌"
              error=$(jq -r '.error' "$task_dir/status.json")
              info="错误: ${error:0:30}"
              ;;
            *)
              status_icon="⏳"
              info="处理中..."
              ;;
          esac
        else
          status_icon="⏳"
          info="等待中..."
        fi
        
        printf "%-20s %-15s %-40s\n" "${task_name:0:19}" "$status_icon $status" "${info:0:39}"
      fi
    done
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    # 系统资源
    if command -v free &> /dev/null; then
      mem_info=$(free -h | awk '/Mem:/ {print $3"/"$2}')
      echo "💻 系统资源"
      echo "   内存使用: $mem_info"
      
      if command -v nvidia-smi &> /dev/null; then
        gpu_info=$(nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits | head -1)
        IFS=',' read -r gpu_util gpu_mem_used gpu_mem_total <<< "$gpu_info"
        echo "   GPU 使用: ${gpu_util}% | 显存: ${gpu_mem_used}MB/${gpu_mem_total}MB"
      fi
      echo ""
    fi
    
    # 最新日志
    if [ -f "$BATCH_OUTPUT_DIR/batch_log.txt" ]; then
      echo "📝 最新日志 (最后 5 条)"
      echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      tail -5 "$BATCH_OUTPUT_DIR/batch_log.txt"
      echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    fi
    
    echo ""
    echo "按 Ctrl+C 退出监控"
    
    sleep "$REFRESH_INTERVAL"
  done
}

# 捕获退出信号
trap 'echo ""; echo "监控已停止"; exit 0' INT TERM

# 启动监控
monitor_loop