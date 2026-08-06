import os, paramiko
cli = paramiko.SSHClient(); cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
cli.connect("192.168.166.151", 22, "root", os.environ["RJ_PW"], timeout=15, allow_agent=False, look_for_keys=False)
def run(cmd, t=40):
    _, o, e = cli.exec_command(cmd, timeout=t)
    return o.read().decode("utf-8","replace") + ("[ERR] " + e.read().decode("utf-8","replace") if False else "")
print("=== host node_modules ==="); print(run("ls /root/workspaces/rjcut/studio/node_modules >/dev/null 2>&1 && echo NM_EXISTS || echo NO_NM; ls /root/workspaces/rjcut/studio/node_modules 2>/dev/null | wc -l"))
print("=== host out/dist dirs ==="); print(run("ls -d /root/workspaces/rjcut/studio/out /root/workspaces/rjcut/studio/dist 2>/dev/null; echo '---out head---'; ls /root/workspaces/rjcut/studio/out 2>/dev/null | head"))
print("=== container nginx html ==="); print(run("docker exec rjcut-studio-prod sh -c 'ls -la /usr/share/nginx/html | head -20'"))
print("=== container nginx conf ==="); print(run("docker exec rjcut-studio-prod sh -c 'cat /etc/nginx/conf.d/default.conf'"))
print("=== which next ==="); print(run("cd /root/workspaces/rjcut/studio && (npx --no-install next -v 2>/dev/null || echo 'no local next') && node -v"))
cli.close()
