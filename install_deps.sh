#!/bin/bash
set -e

# echo "==> 配置国内源"
# pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple

echo "==> 更新系统"
apt-get update

echo "==> 安装系统依赖"
apt-get install -y build-essential libpq-dev ffmpeg curl git

echo "==> 安装 Python 包"
pip install --upgrade pip

# 核心依赖
pip install fastapi uvicorn[standard] pydantic pydantic-settings

# 数据库
pip install sqlalchemy psycopg2-binary alembic

# 其他
pip install redis rq minio requests httpx
pip install passlib[bcrypt] python-jose[cryptography]
pip install python-multipart tenacity backslash

echo "==> 完成！"