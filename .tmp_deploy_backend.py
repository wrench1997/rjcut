import os, sys, time, paramiko

HOST = "192.168.166.151"; USER = "root"; PW = os.environ["RJ_PW"]
REMOTE_REPO = "/root/workspaces/rjcut"

LOCAL_API = r"D:\workspace\rjcut\api_service.py"
REMOTE_API = f"{REMOTE_REPO}/api_service.py"

cli = paramiko.SSHClient()
cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
cli.connect(HOST, port=22, username=USER, password=PW, timeout=15, allow_agent=False, look_for_keys=False)

def run(cmd, timeout=120):
    stdin, stdout, stderr = cli.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    rc = stdout.channel.recv_exit_status()
    return rc, out, err

# 1) 备份远程旧文件
rc, out, err = run(f"cp -a {REMOTE_API} {REMOTE_API}.bak_dhproxy_$(date +%s) 2>/dev/null; ls -la {REMOTE_API}*")
print("=== backup api_service.py ==="); print(out); print(err)

# 2) SFTP 上传 api_service.py
sftp = cli.open_sftp()
sftp.put(LOCAL_API, REMOTE_API)
st = sftp.stat(REMOTE_API)
print(f"=== uploaded api_service.py size={st.st_size} ===")
sftp.close()

# 3) 重启 api 容器
rc, out, err = run("docker restart rjcut_api", timeout=60)
print("=== docker restart rjcut_api ==="); print(out); print(err)

# 4) 等待 uvicorn 起来（command 先跑 init_db 再 uvicorn）
time.sleep(10)

# 5) 日志检查
rc, out, err = run("docker logs rjcut_api --tail 25 2>&1", timeout=30)
print("=== rjcut_api logs (tail) ==="); print(out)

# 6) 路由注册检查 + proxy 连通性
rc, out, err = run(
    "docker exec rjcut_api python -c \"import api_service as a; rs=[getattr(r,'path','') for r in a.app.routes]; print('DH_ROUTES:', [p for p in rs if p.startswith('/dh')])\"",
    timeout=30)
print("=== route check ==="); print(out); print(err)

rc, out, err = run("curl -s -m 12 -o /tmp/dhbody -w 'HTTP %{http_code} size=%{size_download}\\n' http://127.0.0.1:8001/dh/ ; echo '--- body head ---'; head -c 200 /tmp/dhbody", timeout=30)
print("=== curl /dh/ ==="); print(out); print(err)

cli.close()
print("=== backend deploy done ===")
