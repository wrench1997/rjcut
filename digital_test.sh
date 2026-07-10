API_KEY="rjk_d3-i0KAiox54q57PWmv5qHtCdR5iasvvlw3odTYoXzK7TF3_"
BASE_URL="http://127.0.0.1:8001"

# ── 1. 获取公共数字人列表（挑选一个 person_id） ──
curl -s "$BASE_URL/v1/dh/persons/common" \
  -H "Authorization: Bearer $API_KEY" | jq .

# ── 2. 获取声音模型列表（挑选一个 audio_man_id） ──
curl -s "$BASE_URL/v1/dh/voices" \
  -H "Authorization: Bearer $API_KEY" | jq .

# ── 3. 提交生成数字人视频任务 ──
# 假设挑选的 person_id 为 "dp_12345", audio_man_id 为 "voice_01"
curl -s -X POST "$BASE_URL/v1/dh/tasks/generate" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "大家好，这是我通过 API 生成的数字人测试视频。感谢使用 RJCut 系统。",
    "person_id": "替换为你查到的_person_id",
    "audio_man_id": "替换为你查到的_audio_man_id",
    "figure_type": "half_body",
    "drive_mode": "random",
    "bg_type": "color",
    "bg_color": "#EDEDED"
  }' | jq .




curl -s -X POST "$BASE_URL/v1/dh/tasks/generate" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "大家好，这是我通过 API 生成的数字人测试视频。感谢使用 RJCut 系统。",
    "person_id": "6916e44be5364f7fa39d203686241081",
    "audio_man_id": "C-CASE-8d816d3ee67c487583c8fbce7b75099f",
    "figure_type": "whole_body",
    "drive_mode": "random",
    "bg_type": "color",
    "bg_color": "#EDEDED"
  }' | jq .

# 记下返回的 "task_id"

# ── 4. 轮询查看数字人视频生成进度 ──
curl -s "$BASE_URL/v1/tasks/<填入你的task_id>" \
  -H "Authorization: Bearer $API_KEY" | jq .

# 当 status 变为 "succeeded" 时，执行第5步

# ── 5. 获取最终数字人视频下载地址 ──
curl -s "$BASE_URL/v1/tasks/<填入你的task_id>/files/final_video" \
  -H "Authorization: Bearer $API_KEY" | \
  jq -r '.data.download_url' | \
  xargs curl -L -o final_video.mp4
