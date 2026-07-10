#!/bin/bash
# 蝉镜 API 端点深度测试脚本
# 在服务器 192.168.166.151 上执行

BASE_URL="http://127.0.0.1:8080"

echo "=========================================="
echo "蝉镜 API 端点深度测试"
echo "BASE_URL: $BASE_URL"
echo "=========================================="

# 先获取 token
echo ""
echo "--- 获取 access_token ---"
TOKEN_RESP=$(curl -s -X POST "$BASE_URL/access_token" \
  -H "Content-Type: application/json" \
  -d '{"app_id":"itop","secret_key":"rj-itop+0591"}')
echo "$TOKEN_RESP"
TOKEN=$(echo "$TOKEN_RESP" | grep -oP '"access_token":"\K[^"]+')
echo "Token: $TOKEN"

echo ""
echo "=========================================="
echo "测试各种可能的端点路径"
echo "=========================================="

# 测试可能的端点
ENDPOINTS=(
    "/list_common_dp"
    "/api/list_common_dp"
    "/digital-human/list"
    "/api/digital-human/list"
    "/open/digital-human/list"
    "/api/open/digital-human/list"
    "/v1/digital-human/common"
    "/api/v1/digital-human/common"
    "/dp/list"
    "/api/dp/list"
    "/persons"
    "/api/persons"
    "/digital-persons"
    "/api/digital-persons"
)

for endpoint in "${ENDPOINTS[@]}"; do
    echo ""
    echo "--- 测试：$endpoint ---"
    curl -s -X GET "$BASE_URL$endpoint" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $TOKEN" | head -c 200
done

echo ""
echo "=========================================="
echo "从 Swagger 文档提取端点"
echo "=========================================="
echo ""
echo "--- 获取 Swagger JSON ---"
curl -s "$BASE_URL/openapi.json" | head -c 2000

echo ""
echo ""
echo "=========================================="
echo "测试完成"
echo "=========================================="