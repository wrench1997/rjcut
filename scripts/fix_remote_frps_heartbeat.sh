#!/bin/sh
set -eu

frp_dir=/home/jirongtech/rjcut-frp
cd "$frp_dir"

stamp=$(date +%Y%m%d-%H%M%S)
backup="frps.ini.bak-$stamp"
cp -p frps.ini "$backup"
sed -i 's/^heartbeat_timeout[[:space:]]*=.*/heartbeat_timeout = -1/' frps.ini

./frps verify -c ./frps.ini

old_pid=$(pgrep -u jirongtech -f '^\./frps -c \./frps.ini$' | head -n 1 || true)
if [ -n "$old_pid" ]; then
  kill "$old_pid"
  attempt=0
  while kill -0 "$old_pid" 2>/dev/null && [ "$attempt" -lt 10 ]; do
    attempt=$((attempt + 1))
    sleep 1
  done
fi

nohup ./frps -c ./frps.ini >> log/frps.out 2>&1 </dev/null &
new_pid=$!
sleep 2
kill -0 "$new_pid"

echo "BACKUP=$backup"
echo "NEW_PID=$new_pid"
grep '^heartbeat_timeout' frps.ini
ss -lnt | grep -E ':(7000|8801)[[:space:]]' || true
