
# 视频处理工具使用说明

## 1. 准备工作

- 将完整代码文件替换现有的 `cut_transition.py` 和 `lip_sync.py`
- 确保 `video_utils.py`, `transitions.py`, `subtitle_effects.py` 等依赖模块存在

## 2. 示例脚本文件 `script.json`

```json
{
  "segments": [
    {
      "text": "大家好今天给大家介绍这款产品",
      "flag": "human"
    },
    {
      "text": "先来看一下它的整体外观",
      "flag": "scene",
      "scene_file": "scene_product.mp4"
    },
    {
      "text": "它采用了高密度材质",
      "flag": "scene",
      "scene_file": "scene_product.mp4"
    },
    {
      "text": "而且在使用体验上也非常稳定",
      "flag": "human"
    }
  ]
}
```

## 3. 工作流程

### 第一步：切分视频段

```bash
python cut_transition.py avatar.mp4 --script script.json -o ./output
```

### 第二步：合成最终视频

```bash
python lip_sync.py \
  --timeline output/avatar_timeline.json \
  --scene-dir ./scenes \
  -o output/avatar_final.mp4 \
  --effect karaoke \
  --use-transitions \
  --transition fade \
  --transition-duration 0.4
```

## 4. 文件结构

```
./output/
  ├── avatar_transcription.json
  ├── avatar_timeline.json
  ├── avatar_parts/
  │   ├── part_001.mp4
  │   ├── part_002.mp4
  │   ├── ...
  └── avatar_final.mp4
```

## 注意事项

- 场景素材文件需要放在 `--scene-dir` 指定的目录中
- 脚本中的 `scene_file` 可以是相对路径（相对于 scene-dir）或绝对路径
- 当前是"最小可用版"，只支持 human 和 scene 两种类型
- 场景段会循环播放直到时长匹配
- 字幕特效仍然支持卡拉OK、高亮、打字机等效果
- 这个完整代码已经包含了新旧两种模式，可以平滑切换使用


```bash
 python merge_videos.py output/鹿茸血视频_part01.mp4 output/鹿茸血视频_part02.mp4 -t wipeleft --td 2    --text "精彩回顾" --font fonts/SourceHanSerifCN-Light-5.otf    --font-size 48 --font-color yellow --text-pos center --show-from 0 --show-to 5
```