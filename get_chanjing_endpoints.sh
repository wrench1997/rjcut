#!/bin/bash
# 获取蝉镜 API 所有可用端点
# 在服务器 192.168.166.151 上执行

BASE_URL="http://127.0.0.1:8080"

echo "=========================================="
echo "获取蝉镜 API 所有可用端点"
echo "=========================================="

echo ""
echo "--- 获取 Swagger JSON 并提取端点 ---"
curl -s "$BASE_URL/openapi.json" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    paths = data.get('paths', {})
    print(f'找到 {len(paths)} 个端点:')
    print()
    for path, methods in sorted(paths.items()):
        for method in methods.keys():
            print(f'  {method.upper()} {path}')
except Exception as e:
    print(f'解析失败：{e}')
    print('原始数据:')
    print(sys.stdin.read()[:1000])
"

echo ""
echo "=========================================="
echo "完整测试数字人相关端点"
echo "=========================================="

# 获取 token
TOKEN_RESP=$(curl -s -X POST "$BASE_URL/access_token" \
  -H "Content-Type: application/json" \
  -d '{"app_id":"itop","secret_key":"rj-itop+0591"}')
TOKEN=$(echo "$TOKEN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('access_token',''))")

echo "Token: $TOKEN"
echo ""

# 测试 MuseTalk 风格的端点
echo "--- 测试 MuseTalk 风格端点 ---"
for endpoint in "/v1/digital-human/persons" "/v1/persons" "/v1/common-persons"; do
    echo "GET $endpoint"
    curl -s -X GET "$BASE_URL$endpoint" \
      -H "Authorization: Bearer $TOKEN" | head -c 150
    echo ""
done

echo ""
echo "=========================================="