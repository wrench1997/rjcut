



python lip_sync.py \
    --timeline output/鹿茸血广告_timeline.json \
    -o final.mp4  \
    --device cuda \
    --font-size 80 \
    --max-chars 14  \
    --position top \
    --corrections corrections.json 


python cut_transition.py 鹿茸血广告.mp4 \
   --script script.json  \ 
   -o ./output \
   --device cuda



