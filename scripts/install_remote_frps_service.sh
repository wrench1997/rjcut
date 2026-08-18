#!/bin/sh
set -eu

sudo install -m 0644 /tmp/rjcut-frps.service /etc/systemd/system/rjcut-frps.service
sudo systemctl daemon-reload

old_pids=$(pgrep -u jirongtech -f '^\./frps -c \./frps.ini$' || true)
if [ -n "$old_pids" ]; then
  kill $old_pids
fi

sudo systemctl enable --now rjcut-frps.service
sleep 3
sudo systemctl is-enabled rjcut-frps.service
sudo systemctl is-active rjcut-frps.service
sudo systemctl status rjcut-frps.service --no-pager -l
