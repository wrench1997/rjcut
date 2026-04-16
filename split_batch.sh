#!/bin/bash
# split_batch.sh - 分批处理

ORIGINAL_CONFIG="all_tasks.json"
BATCH_SIZE=50

total=$(jq '.tasks | length' "$ORIGINAL_CONFIG")
batches=$(( (total + BATCH_SIZE - 1) / BATCH_SIZE ))

echo "总任务数: $total"
echo "分成 $batches 批次，每批 $BATCH_SIZE 个"

for i in $(seq 0 $((batches - 1))); do
  start=$((i * BATCH_SIZE))
  end=$((start + BATCH_SIZE))
  
  batch_config="batch_${i}.json"
  
  jq --argjson start $start --argjson end $end \
    '{tasks: .tasks[$start:$end]}' \
    "$ORIGINAL_CONFIG" > "$batch_config"
  
  echo "生成批次 $i: $batch_config"
done

# 顺序执行各批次
for i in $(seq 0 $((batches - 1))); do
  echo ""
  echo "=========================================="
  echo "执行批次 $i"
  echo "=========================================="
  
  BATCH_CONFIG="batch_${i}.json" \
  BATCH_OUTPUT_DIR="./batch_output_${i}" \
  ./batch_process.sh
  
  echo "批次 $i 完成"
  
  # 等待一段时间再继续
  if [ $i -lt $((batches - 1)) ]; then
    echo "等待 60 秒后继续下一批次..."
    sleep 60
  fi
done

# 合并结果
echo ""
echo "合并所有批次结果..."
mkdir -p ./final_output

for i in $(seq 0 $((batches - 1))); do
  cp -r "./batch_output_${i}/tasks"/* ./final_output/
done

echo "✅ 全部完成！最终输出: ./final_output/"