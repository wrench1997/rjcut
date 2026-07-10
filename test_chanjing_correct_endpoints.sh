#!/bin/bash
# 测试蝉镜 API 端点（使用正确的端点路径）
# 在服务器 192.168.166.151 上执行

BASE_URL="http://127.0.0.1:8080"

echo "=========================================="
echo "测试蝉镜 API 正确端点"
echo "=========================================="

# 获取 token
echo ""
echo "--- 获取 access_token ---"
TOKEN_RESP=$(curl -s -X POST "$BASE_URL/access_token" \
  -H "Content-Type: application/json" \
  -d '{"app_id":"itop","secret_key":"rj-itop+0591"}')
echo "$TOKEN_RESP"
TOKEN=$(echo "$TOKEN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('access_token',''))")
echo "Token: $TOKEN"

echo ""
echo "=========================================="
echo "测试正确的端点路径"
echo "=========================================="

echo ""
echo "--- 测试 1: GET /list_common_dp (公共数字人) ---"
curl -s -X GET "$BASE_URL/list_common_dp" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d, ensure_ascii=False, indent=2)[:1000])"

echo ""
echo "--- 测试 2: GET /list_common_audio (公共声音) ---"
curl -s -X GET "$BASE_URL/list_common_audio" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d, ensure_ascii=False, indent=2)[:1000])"

echo ""
echo "--- 测试 3: GET /list_customised_person (自定义数字人) ---"
curl -s -X GET "$BASE_URL/list_customised_person" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d, ensure_ascii=False, indent=2)[:1000])"

echo ""
echo "=========================================="
echo "测试不带 Token 的情况"
echo "=========================================="

echo ""
echo "--- 测试 4: GET /list_common_dp (无 Token) ---"
curl -s -X GET "$BASE_URL/list_common_dp" \
  -H "Content-Type: application/json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d, ensure_ascii=False, indent=2)[:500])"

echo ""
echo "=========================================="
echo "测试完成"
echo "=========================================="