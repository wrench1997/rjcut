import os, paramiko
cli = paramiko.SSHClient(); cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
cli.connect("192.168.166.151", 22, "root", os.environ["RJ_PW"], timeout=15, allow_agent=False, look_for_keys=False)
def run(cmd, t=30):
    _, o, e = cli.exec_command(cmd, timeout=t)
    return o.read().decode("utf-8","replace"), e.read().decode("utf-8","replace")

print("=== direct chanjing root ==="); print(run("curl -s -m8 -w '|HTTP %{http_code}\\n' http://192.168.166.151:8080/")[0])
print("=== via proxy /dh/ ==="); print(run("curl -s -m8 -w '|HTTP %{http_code}\\n' http://127.0.0.1:8001/dh/")[0])
print("=== direct chanjing /v1/digital-human/generate GET ==="); print(run("curl -s -m8 -w '|HTTP %{http_code}\\n' http://192.168.166.151:8080/v1/digital-human/generate")[0])
print("=== via proxy /dh/v1/digital-human/generate GET ==="); print(run("curl -s -m8 -w '|HTTP %{http_code}\\n' http://127.0.0.1:8001/dh/v1/digital-human/generate")[0])
cli.close()
