#!/bin/bash
# 蝉镜 API 端点测试脚本
# 在服务器 192.168.166.151 上执行

BASE_URL="http://127.0.0.1:8080"
TOKEN="tok_9a1e577ca9bd481e8614d4dbd8081a88"

echo "=========================================="
echo "蝉镜 API 端点测试"
echo "BASE_URL: $BASE_URL"
echo "=========================================="

echo ""
echo "--- 测试 1: /access_token ---"
curl -s -X POST "$BASE_URL/access_token" \
  -H "Content-Type: application/json" \
  -d '{"app_id":"itop","secret_key":"rj-itop+0591"}' | head -c 200
echo ""

echo ""
echo "--- 测试 2: v2 公共数字人列表 ---"
curl -s -X GET "$BASE_URL/api/open/v2/digital-human/common-persons?page=1&size=10" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" | head -c 300
echo ""

echo ""
echo "--- 测试 3: v1 公共数字人列表 ---"
curl -s -X GET "$BASE_URL/api/open/v1/digital-human/common-persons?page=1&size=10" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" | head -c 300
echo ""

echo ""
echo "--- 测试 4: 无版本号公共数字人列表 ---"
curl -s -X GET "$BASE_URL/api/open/digital-human/common-persons?page=1&size=10" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" | head -c 300
echo ""

echo ""
echo "--- 测试 5: 列出所有可用端点 (Swagger) ---"
curl -s "$BASE_URL/docs" | head -c 500
echo ""

echo ""
echo "--- 测试 6: 检查 API 根路径 ---"
curl -s "$BASE_URL/" | head -c 200
echo ""

echo ""
echo "=========================================="
echo "测试完成"
echo "=========================================="