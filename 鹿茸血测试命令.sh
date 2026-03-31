



python lip_sync.py \
    --timeline output/鹿茸血广告_timeline.json \
    -o final.mp4  \
    --device cuda \
    --font-size 80 \
    --max-chars 14  \
    --position top \
    --corrections corrections.json 


python lip_sync.py \
  --timeline output/鹿茸血广告_timeline.json \
  -o final.mp4 \
  --device cuda \
  --effect ad \
  --color ad-yellow \
  --font-size 92 \
  --max-chars 12 \
  --position top \
  --margin-v 90 \
  --corrections corrections.json

  

python cut_transition.py 鹿茸血广告.mp4 \
   --script script.json  \ 
   -o ./output \
   --device cuda



