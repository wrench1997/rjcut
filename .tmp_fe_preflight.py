import os, paramiko
cli = paramiko.SSHClient(); cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
cli.connect("192.168.166.151", 22, "root", os.environ["RJ_PW"], timeout=15, allow_agent=False, look_for_keys=False)
def run(cmd, t=30):
    _, o, e = cli.exec_command(cmd, timeout=t)
    return o.read().decode("utf-8","replace") + ("||ERR||" + e.read().decode("utf-8","replace") if False else "")

print("=== studio-prod project label & image ===")
print(run("docker inspect rjcut-studio-prod --format 'project={{index .Config.Labels \"com.docker.compose.project\"}} service={{index .Config.Labels \"com.docker.compose.service\"}} workdir={{index .Config.Labels \"com.docker.compose.project.working_dir\"}} image={{.Image}}'"))
print("=== .dockerignore? ===")
print(run("ls -la /root/workspaces/rjcut/studio/.dockerignore 2>/dev/null; echo '---'; cat /root/workspaces/rjcut/studio/.dockerignore 2>/dev/null || echo 'NO .dockerignore'"))
print("=== studio .env (build-time) ===")
print(run("grep NEXT_PUBLIC_API_BASE_URL /root/workspaces/rjcut/studio/.env 2>/dev/null || echo 'no .env'"))
print("=== current served html head ===")
print(run("curl -s -m6 http://127.0.0.1/ | head -c 300"))
cli.close()
