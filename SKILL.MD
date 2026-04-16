# RJCut 批量处理脚本 AI 使用指南

## 📋 给 AI 的标准提示词模板

---

### 🎯 基础使用模板

```
我需要使用 RJCut 批量处理脚本处理视频，请帮我：

**任务描述：**
- 视频数量：[数量]
- 视频类型：[电商/教育/宣传片/其他]
- 视频存放路径：[路径]

**处理需求：**
1. [是否需要字幕]
2. [是否需要背景音乐]
3. [是否需要场景素材]
4. [是否需要纠错字典]
5. [其他特殊要求]

**服务器配置：**
- API 地址：http://192.168.166.151:8001
- API Key：sk-xxxxx
- CPU 核心数：[数量]
- 是否有 GPU：[是/否]

请帮我生成批处理配置文件和运行命令。
```

---

### 📝 配置生成模板

#### 场景 1：简单批量处理

```
我有 20 个产品视频需要批量处理：

**视频信息：**
- 路径：./videos/
- 文件名：product_001.mp4 ~ product_020.mp4
- 无脚本文件
- 无场景素材

**处理要求：**
- 自动识别字幕
- 去除"转场"关键词
- 添加统一背景音乐：./bgm/default.mp3
- 字幕样式：广告效果，字号 88

**运行环境：**
- 服务器 4 核 CPU
- 建议并发数：3

请生成配置文件 batch_config.json
```

**AI 应该输出：**

```json
{
  "tasks": [
    {
      "name": "product_001",
      "video_file": "./videos/product_001.mp4",
      "bgm_file": "./bgm/default.mp3",
      "custom_config": {
        "pipeline": {
          "remove_keyword": "转场",
          "margin": 0.15
        },
        "subtitle": {
          "effect": "ad",
          "font_size": 88
        },
        "audio": {
          "bgm_volume": 0.3,
          "bgm_loop": true
        }
      }
    },
    {
      "name": "product_002",
      "video_file": "./videos/product_002.mp4",
      "bgm_file": "./bgm/default.mp3",
      "custom_config": {
        "pipeline": {
          "remove_keyword": "转场",
          "margin": 0.15
        },
        "subtitle": {
          "effect": "ad",
          "font_size": 88
        },
        "audio": {
          "bgm_volume": 0.3,
          "bgm_loop": true
        }
      }
    }
    // ... 其余 18 个任务
  ]
}
```

**运行命令：**
```bash
# 1. 保存配置
cat > batch_config.json << 'EOF'
{上面的 JSON}
EOF

# 2. 设置环境变量
export BASE_URL="http://192.168.166.151:8001"
export API_KEY="sk-xxxxx"
export MAX_CONCURRENT=3
export AUTO_COMPOSE=true

# 3. 运行脚本
./batch_process.sh

# 4. 监控进度（新开终端）
./monitor.sh
```

---

#### 场景 2：复杂批量处理（带脚本和场景）

```
我有 10 个教育视频需要处理：

**目录结构：**
```
project/
├── videos/
│   ├── lesson01.mp4
│   ├── lesson02.mp4
│   └── ...
├── scripts/
│   ├── lesson01_script.json
│   ├── lesson02_script.json
│   └── ...
├── scenes/
│   ├── lesson01/
│   │   ├── ppt_01.mp4
│   │   └── ppt_02.mp4
│   └── lesson02/
│       └── animation_01.mp4
└── bgm/
    ├── soft.mp3
    └── energetic.mp3
```

**处理要求：**
- 每个视频有独立脚本
- 需要插入场景素材
- 前 5 个用轻音乐，后 5 个用活力音乐
- 保留转场效果
- 字幕位置靠下（Y=1600）
- 纠错常见错别字：./corrections/common.json

**custom 配置：**
- 转场类型：fade
- 转场时长：0.5s
- 字幕字号：72

请生成配置文件。
```

**AI 应该输出：**

```json
{
  "tasks": [
    {
      "name": "lesson01",
      "video_file": "./videos/lesson01.mp4",
      "script_file": "./scripts/lesson01_script.json",
      "scenes_dir": "./scenes/lesson01",
      "corrections_file": "./corrections/common.json",
      "bgm_file": "./bgm/soft.mp3",
      "custom_config": {
        "pipeline": {
          "remove_keyword": "",
          "margin": 0.2
        },
        "subtitle": {
          "effect": "default",
          "font_size": 72,
          "position_y": 1600
        },
        "audio": {
          "bgm_volume": 0.15,
          "bgm_loop": true
        },
        "compose_pipeline": {
          "use_transitions": true,
          "transition_type": "fade",
          "transition_duration": 0.5,
          "resync_subtitle": true
        }
      }
    },
    {
      "name": "lesson02",
      "video_file": "./videos/lesson02.mp4",
      "script_file": "./scripts/lesson02_script.json",
      "scenes_dir": "./scenes/lesson02",
      "corrections_file": "./corrections/common.json",
      "bgm_file": "./bgm/soft.mp3",
      "custom_config": {
        "pipeline": {
          "remove_keyword": "",
          "margin": 0.2
        },
        "subtitle": {
          "effect": "default",
          "font_size": 72,
          "position_y": 1600
        },
        "audio": {
          "bgm_volume": 0.15,
          "bgm_loop": true
        },
        "compose_pipeline": {
          "use_transitions": true,
          "transition_type": "fade",
          "transition_duration": 0.5,
          "resync_subtitle": true
        }
      }
    }
    // ... lesson03-05 同上
    // ... lesson06-10 使用 energetic.mp3
  ]
}
```

---

#### 场景 3：自动扫描目录生成配置

```
我的视频文件都在 ./videos/ 目录下，文件名没有规律。

请帮我写一个 generate_batch_config.sh 的使用命令，要求：
- 自动扫描 ./videos/ 下的所有 mp4 文件
- 使用电商模板（ecommerce）
- 生成配置文件 ecommerce_batch.json
- 如果有对应的脚本文件（./scripts/视频名_script.json），自动关联
```

**AI 应该输出：**

```bash
# 方式 1：使用自动生成脚本
./generate_batch_config.sh ./videos ecommerce_batch.json ecommerce

# 方式 2：手动扫描并生成
cat > ecommerce_batch.json << 'EOF'
{
  "tasks": [
EOF

first=true
for video in ./videos/*.mp4; do
  name=$(basename "$video" .mp4)
  
  # 添加逗号分隔符
  if [ "$first" = true ]; then
    first=false
  else
    echo ',' >> ecommerce_batch.json
  fi
  
  # 检查是否有脚本文件
  script_file=""
  if [ -f "./scripts/${name}_script.json" ]; then
    script_file="./scripts/${name}_script.json"
  fi
  
  cat >> ecommerce_batch.json << EOJSON
    {
      "name": "$name",
      "video_file": "$video",
      "script_file": ${script_file:+\"$script_file\"},
      "bgm_file": "./bgm/default.mp3",
      "custom_config": {
        "subtitle": {
          "effect": "ad",
          "font_size": 88
        },
        "audio": {
          "bgm_volume": 0.3
        }
      }
    }
EOJSON
done

echo ']}' >> ecommerce_batch.json

# 格式化 JSON
jq '.' ecommerce_batch.json > tmp.json && mv tmp.json ecommerce_batch.json

echo "✅ 配置文件已生成：ecommerce_batch.json"
```

---

### 🔧 参数调优模板

```
我需要优化批处理性能：

**当前配置：**
- 视频数量：100 个
- 单个视频时长：平均 2 分钟
- 服务器配置：8 核 CPU，32GB 内存，有 NVIDIA GPU
- 当前并发数：3
- 处理速度：每个视频约 5 分钟

**问题：**
- CPU 使用率只有 40%
- 内存使用率只有 50%
- 处理速度偏慢

请帮我优化并发数和其他参数。
```

**AI 应该输出：**

```bash
# 优化建议

# 1. 提高并发数（基于 8 核 CPU）
export MAX_CONCURRENT=6  # CPU 核心数 × 0.75

# 2. 如果有 GPU，确保启用
# 在配置文件中确认：
{
  "custom_config": {
    "asr": {
      "model": "large-v3",
      "device": "cuda",  # ✅ 使用 GPU
      "language": "zh"
    }
  }
}

# 3. 使用 GNU parallel 加速
apt-get install parallel

# 4. 监控资源使用
# 运行时在另一个终端执行：
watch -n 2 'echo "=== CPU ==="; top -bn1 | head -20; echo "=== GPU ==="; nvidia-smi'

# 5. 如果仍有余量，可以尝试并发 7-8
MAX_CONCURRENT=8 ./batch_process.sh

# 6. 性能测试
time MAX_CONCURRENT=3 ./batch_process.sh  # 测试原配置
time MAX_CONCURRENT=6 ./batch_process.sh  # 测试优化后
time MAX_CONCURRENT=8 ./batch_process.sh  # 测试激进配置

# 选择最快的配置作为最终方案
```

---

### 🐛 故障排查模板

```
批处理过程中遇到问题：

**错误现象：**
[描述具体错误，如：任务卡住/上传失败/内存溢出等]

**错误日志：**
```
[粘贴 batch_output/batch_log.txt 中的相关日志]
```

**当前配置：**
- 并发数：[数量]
- 视频大小：[范围]
- 已处理/总数：[x/y]

请帮我诊断问题并给出解决方案。
```

**AI 应该输出：**

根据错误类型给出对应的解决方案...

#### 错误类型 1：上传失败

```bash
# 诊断步骤
# 1. 检查网络连接
curl -I http://192.168.166.151:8001/v1/merchant/info

# 2. 检查 API Key
curl -H "Authorization: Bearer $API_KEY" \
  http://192.168.166.151:8001/v1/merchant/info

# 3. 检查文件大小
ls -lh videos/*.mp4 | sort -k5 -h

# 解决方案
# 方案 1：增加重试次数
# 编辑 batch_process.sh，找到 upload_file 函数
# 将 max_retries=3 改为 max_retries=5

# 方案 2：减小并发数
MAX_CONCURRENT=1 ./batch_process.sh

# 方案 3：检查大文件
# 如果有超大文件（>1GB），单独处理
```

#### 错误类型 2：内存溢出

```bash
# 诊断
free -h
dmesg | grep -i "out of memory"

# 解决方案
# 方案 1：降低并发
MAX_CONCURRENT=1 ./batch_process.sh

# 方案 2：增加 swap
sudo fallocate -l 8G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# 方案 3：分批处理
# 使用 split_batch.sh 脚本
total_tasks=100
batch_size=20

for i in {0..4}; do
  start=$((i * batch_size))
  end=$((start + batch_size))
  
  jq --argjson start $start --argjson end $end \
    '{tasks: .tasks[$start:$end]}' \
    batch_config.json > batch_${i}.json
  
  BATCH_CONFIG=batch_${i}.json \
  BATCH_OUTPUT_DIR=./output_${i} \
  ./batch_process.sh
done
```

---

### 📊 进度监控模板

```
我想实时查看批处理进度，需要知道：
1. 当前完成了多少任务
2. 失败了多少任务
3. 预计还需要多长时间
4. 系统资源使用情况

请给我监控命令。
```

**AI 应该输出：**

```bash
# 方式 1：使用内置监控脚本
./monitor.sh ./batch_output 5  # 每 5 秒刷新

# 方式 2：简单查看进度
watch -n 5 'cat batch_output/batch_report.txt'

# 方式 3：查看实时日志
tail -f batch_output/batch_log.txt

# 方式 4：统计任务状态
echo "总任务数：$(jq '.tasks | length' batch_config.json)"
echo "已完成：$(find batch_output/tasks -name 'status.json' -exec jq -r 'select(.status=="succeeded")' {} \; | wc -l)"
echo "失败：$(find batch_output/tasks -name 'status.json' -exec jq -r 'select(.status=="failed")' {} \; | wc -l)"

# 方式 5：查看系统资源
# CPU 和内存
top -bn1 | head -20

# GPU（如果有）
nvidia-smi -l 1

# 磁盘空间
df -h

# 方式 6：预估剩余时间
start_time=$(stat -c %Y batch_output/batch_log.txt)
current_time=$(date +%s)
elapsed=$((current_time - start_time))
completed=$(find batch_output/tasks -name 'status.json' -exec jq -r 'select(.status=="succeeded")' {} \; | wc -l)
total=$(jq '.tasks | length' batch_config.json)
remaining=$((total - completed))

if [ $completed -gt 0 ]; then
  avg_time=$((elapsed / completed))
  eta=$((avg_time * remaining))
  echo "已用时间：$((elapsed / 60)) 分钟"
  echo "预计剩余：$((eta / 60)) 分钟"
fi
```

---

### 🔄 任务恢复模板

```
批处理中途中断了（服务器重启/意外关闭），需要恢复：

**当前状态：**
- 已处理任务：[数量]
- 中断前并发数：[数量]
- 输出目录：./batch_output

请帮我恢复处理。
```

**AI 应该输出：**

```bash
# 步骤 1：检查已完成的任务
./recover.sh ./batch_output list

# 步骤 2：查看具体状态
for dir in batch_output/tasks/*/; do
  name=$(basename "$dir")
  if [ -f "$dir/status.json" ]; then
    status=$(jq -r '.status' "$dir/status.json")
    echo "$name: $status"
  else
    echo "$name: 未开始"
  fi
done

# 步骤 3：生成续传配置
# 方式 1：只重试失败任务
./recover.sh ./batch_output retry
# 这会生成 batch_config_retry.json

# 运行重试
BATCH_CONFIG=batch_config_retry.json ./batch_process.sh

# 方式 2：跳过已完成，继续未完成
python3 << 'EOPY'
import json
import os

# 读取原配置
with open('batch_config.json', 'r') as f:
    config = json.load(f)

# 获取已完成任务
completed = set()
tasks_dir = 'batch_output/tasks'
if os.path.exists(tasks_dir):
    for task_name in os.listdir(tasks_dir):
        status_file = os.path.join(tasks_dir, task_name, 'status.json')
        if os.path.exists(status_file):
            with open(status_file, 'r') as f:
                status = json.load(f)
                if status.get('status') == 'succeeded':
                    completed.add(task_name)

# 过滤已完成任务
config['tasks'] = [t for t in config['tasks'] if t['name'] not in completed]

# 保存续传配置
with open('batch_config_resume.json', 'w') as f:
    json.dump(config, f, indent=2, ensure_ascii=False)

print(f"✅ 已完成任务：{len(completed)}")
print(f"📋 剩余任务：{len(config['tasks'])}")
print(f"💾 续传配置：batch_config_resume.json")
EOPY

# 运行续传
BATCH_CONFIG=batch_config_resume.json ./batch_process.sh
```

---

## 🎓 完整使用流程示例

### 示例：处理 50 个电商产品视频

**给 AI 的完整提示：**

```
【任务背景】
我是电商运营，需要批量处理 50 个产品视频用于投放广告。

【素材情况】
- 视频存放：/data/products/videos/ 下有 product_001.mp4 ~ product_050.mp4
- 部分视频有脚本：/data/products/scripts/ 下有 20 个对应的 _script.json 文件
- 统一背景音乐：/data/bgm/upbeat_shopping.mp3
- 纠错字典：/data/corrections/ecommerce_terms.json（修正品牌名、常见错别字）

【处理需求】
1. 自动识别字幕（如果没有脚本）
2. 去除"转场"、"过渡"等关键词片段
3. 添加背景音乐，音量 30%
4. 字幕样式：广告效果，金色，字号 92，位置偏下
5. 不使用转场效果（快速剪辑风格）

【服务器环境】
- 服务器：http://192.168.166.151:8001
- API Key：sk-abc123xyz
- CPU：16 核
- 内存：64GB
- GPU：NVIDIA RTX 3090

【需要你提供】
1. 完整的 batch_config.json 配置文件
2. 运行命令（包括环境变量设置）
3. 监控命令
4. 如何查看结果

请分步骤详细说明。
```

**AI 应该完整输出：**

```bash
# ============================================
# 步骤 1：准备工作目录
# ============================================

cd /data/products

# 创建输出目录
mkdir -p batch_output

# 备份原始素材（可选但建议）
tar -czf backup_$(date +%Y%m%d).tar.gz videos/ scripts/


# ============================================
# 步骤 2：生成配置文件
# ============================================

cat > batch_config.json << 'EOF'
{
  "tasks": [
    {
      "name": "product_001",
      "video_file": "/data/products/videos/product_001.mp4",
      "script_file": "/data/products/scripts/product_001_script.json",
      "corrections_file": "/data/corrections/ecommerce_terms.json",
      "bgm_file": "/data/bgm/upbeat_shopping.mp3",
      "custom_config": {
        "pipeline": {
          "remove_keyword": "转场|过渡",
          "margin": 0.15,
          "min_segment_duration": 0.1
        },
        "subtitle": {
          "effect": "ad",
          "font_size": 92,
          "primary_color": "&H00FFD700",
          "position_y": 1500,
          "bold": true
        },
        "audio": {
          "bgm_volume": 0.3,
          "original_volume": 1.0,
          "bgm_loop": true
        },
        "compose_pipeline": {
          "use_transitions": false
        }
      }
    }
    // ... 其余 49 个任务（格式相同）
    // 如果没有脚本文件，"script_file" 留空即可
  ]
}
EOF

# 或者使用自动生成脚本
./generate_batch_config.sh /data/products/videos batch_config.json ecommerce

# 手动编辑配置文件，补充自定义参数
nano batch_config.json


# ============================================
# 步骤 3：设置环境变量
# ============================================

export BASE_URL="http://192.168.166.151:8001"
export API_KEY="sk-abc123xyz"
export MAX_CONCURRENT=8  # 16 核 CPU，设置并发为 8
export AUTO_COMPOSE=true
export BATCH_CONFIG="batch_config.json"
export BATCH_OUTPUT_DIR="./batch_output"


# ============================================
# 步骤 4：测试配置（重要！）
# ============================================

# 先用 1 个任务测试
jq '{tasks: [.tasks[0]]}' batch_config.json > test_config.json

BATCH_CONFIG=test_config.json \
MAX_CONCURRENT=1 \
BATCH_OUTPUT_DIR=./test_output \
./batch_process.sh

# 检查测试结果
ls -lh test_output/tasks/product_001/
ffplay test_output/tasks/product_001/final_video.mp4

# 如果满意，继续全量处理


# ============================================
# 步骤 5：启动批量处理
# ============================================

# 方式 1：前台运行（适合测试）
./batch_process.sh

# 方式 2：后台运行（推荐）
nohup ./batch_process.sh > batch_run.log 2>&1 &

# 记录进程 ID
echo $! > batch_process.pid


# ============================================
# 步骤 6：实时监控
# ============================================

# 打开新终端，运行监控
./monitor.sh ./batch_output 5

# 或者查看日志
tail -f batch_output/batch_log.txt

# 或者简单查看进度
watch -n 10 'echo "完成: $(find batch_output/tasks -name "final_video.mp4" | wc -l)/50"'


# ============================================
# 步骤 7：资源监控（可选）
# ============================================

# 查看 CPU 和内存
htop

# 查看 GPU 使用
watch -n 2 nvidia-smi

# 查看磁盘空间
df -h /data


# ============================================
# 步骤 8：处理完成后检查
# ============================================

# 查看汇总报告
cat batch_output/batch_report.txt

# 统计结果
echo "总任务数：$(jq '.tasks | length' batch_config.json)"
echo "成功：$(find batch_output/tasks -name 'status.json' -exec jq -r 'select(.status=="succeeded")' {} \; | wc -l)"
echo "失败：$(find batch_output/tasks -name 'status.json' -exec jq -r 'select(.status=="failed")' {} \; | wc -l)"

# 质量检查
./quality_check.sh ./batch_output

# 查看具体失败原因
for dir in batch_output/tasks/*/; do
  if [ -f "$dir/status.json" ]; then
    status=$(jq -r '.status' "$dir/status.json")
    if [ "$status" == "failed" ]; then
      name=$(basename "$dir")
      error=$(jq -r '.error' "$dir/status.json")
      echo "❌ $name: $error"
    fi
  fi
done


# ============================================
# 步骤 9：处理失败任务（如果有）
# ============================================

# 生成重试配置
./recover.sh ./batch_output retry

# 重试失败任务
BATCH_CONFIG=batch_config_retry.json ./batch_process.sh


# ============================================
# 步骤 10：收集成果
# ============================================

# 创建最终输出目录
mkdir -p /data/products/final_videos

# 复制所有成功的视频
for dir in batch_output/tasks/*/; do
  if [ -f "$dir/final_video.mp4" ]; then
    name=$(basename "$dir")
    cp "$dir/final_video.mp4" "/data/products/final_videos/${name}.mp4"
  fi
done

# 打包
cd /data/products
tar -czf final_videos_$(date +%Y%m%d).tar.gz final_videos/

echo "✅ 全部完成！"
echo "📦 打包文件：final_videos_$(date +%Y%m%d).tar.gz"
echo "📁 单个视频：/data/products/final_videos/"
```

---

## 📌 快速参考卡片

### 配置文件必填字段
```json
{
  "tasks": [
    {
      "name": "必填_任务名",
      "video_file": "必填_视频路径"
    }
  ]
}
```

### 常用运行命令
```bash
# 标准运行
./batch_process.sh

# 自定义并发
MAX_CONCURRENT=5 ./batch_process.sh

# 仅生成草稿
AUTO_COMPOSE=false ./batch_process.sh

# 后台运行
nohup ./batch_process.sh &
```

### 监控命令
```bash
./monitor.sh                    # 实时监控
tail -f batch_output/batch_log.txt  # 查看日志
cat batch_output/batch_report.txt   # 查看报告
```

### 故障恢复
```bash
./recover.sh ./batch_output list   # 列出失败任务
./recover.sh ./batch_output retry  # 重试失败任务
```

---

**这就是标准的 AI 使用格式！** 🎉

AI 只需按照这些模板，根据用户的具体需求填充参数，即可生成完整可用的配置和命令。