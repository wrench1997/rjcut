import os, sys, paramiko

host = "192.168.166.151"
user = "root"
pw = os.environ["RJ_PW"]

cmd = r"""set -e
echo '### HOST ###'; hostname; whoami
echo '### DOCKER PS ###'; docker ps --format '{{.Names}} | {{.Image}} | {{.Status}} | {{.Ports}}'
echo '### API MOUNT ###'; docker inspect rjcut_api --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}' 2>/dev/null || echo 'no rjcut_api container'
echo '### PORT 80 ###'; ss -tlnp 2>/dev/null | grep -E ':80\b' || echo 'ss n/a'
echo '### CANDIDATE DIRS ###'
for d in /root/workspaces/rjcut /root/rjcut /opt/rjcut /root/workspaces/rjcut/studio /root/rjcut/studio; do
  [ -e "$d" ] && echo "EXISTS: $d"
done
echo '### GIT ROOTS ###'
for d in /root/workspaces/rjcut /root/rjcut; do
  if [ -d "$d/.git" ]; then
    echo "GITROOT: $d"
    (cd "$d" && echo "remote:" && git remote -v | head -1 && echo "HEAD:" && git log --oneline -1)
  fi
done
echo '### STUDIO PKG ###'
for d in /root/workspaces/rjcut/studio /root/rjcut/studio; do
  if [ -f "$d/package.json" ]; then
    echo "STUDIO: $d"
    (cd "$d" && echo "node: $(node -v 2>/dev/null || echo n/a)" && grep -m1 '"build"' package.json)
  fi
done
echo '### DONE ###'
"""

cli = paramiko.SSHClient()
cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
cli.connect(hostname=host, port=22, username=user, password=pw, timeout=15, allow_agent=False, look_for_keys=False)
stdin, stdout, stderr = cli.exec_command(cmd, timeout=60)
out = stdout.read().decode("utf-8", "replace")
err = stderr.read().decode("utf-8", "replace")
print("=== STDOUT ===")
print(out)
if err.strip():
    print("=== STDERR ===")
    print(err)
cli.close()
