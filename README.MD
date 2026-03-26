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