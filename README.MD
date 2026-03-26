# 安装依赖
pip install whisper-timestamped openai-whisper torch

# 最简用法
python cut_transition.py  鹿茸血视频.mp4

# GPU加速 + 大模型（推荐）
python cut_transition.py  鹿茸血视频.mp4  -m large-v3  --device cuda

# 加大边距，确保"转场"口型完全切干净
python cut_transition.py  鹿茸血视频.mp4  --margin 0.25

# 保留每个分段文件
python cut_transition.py  鹿茸血视频.mp4  --keep-parts  -o ./output




python cut_transition.py  鹿茸血视频.mp4 -m large-v3  --device cuda  --keep-parts  -o ./output













# merge_videos 快速上手
# 1. 基本合并（默认 fade 渐变转场）

```Bash
python merge_videos.py part1.mp4 part2.mp4 part3.mp4
```

# 2. 选择转场特效
```Bash
python merge_videos.py *.mp4 -t dissolve --td 0.8
```
# 随机（每个连接点不同）
```Bash
python merge_videos.py *.mp4 -t random
```
# 每个连接点分别指定
```Bash
python merge_videos.py a.mp4 b.mp4 c.mp4 -t fadeblack,circleopen
```
# 无转场快速拼接
```Bash
python merge_videos.py *.mp4 -t none
```
# 3. 字幕 + 字体
### 烧录 SRT 字幕，用指定中文字体
```Bash
python merge_videos.py *.mp4 --subtitle sub.srt --font ./SimHei.ttf --sub-font-size 28
```

# ASS 字幕（自带样式）
```
python merge_videos.py *.mp4 --subtitle sub.ass
```
# 4. 文字水印

```Bash
python merge_videos.py *.mp4 \
  --text "精彩回顾" \
  --font ./SimHei.ttf \
  --font-size 48 \
  --font-color yellow \
  --text-pos top \
  --show-from 0 --show-to 5
```
# 5. 背景音乐
```Bash
python merge_videos.py *.mp4 --bgm music.mp3 --bgm-volume 0.2
```

#  6. 查看全部 30+ 种转场特效
```Bash
python merge_videos.py --list-transitions
```




 python merge_videos.py output/鹿茸血视频_part01.mp4 output/鹿茸血视频_part02.mp4 -t wipeleft --td 2    --text "精彩回顾" --font fonts/SourceHanSerifCN-Light-5.otf    --font-size 48 --font-color yellow --text-pos center --show-from 0 --show-to 5