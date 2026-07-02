# Gateway Dockerfile - AI 通讯网关
FROM python:3.10-slim

WORKDIR /app

# 安装依赖
RUN pip install --no-cache-dir -i https://pypi.tuna.tsinghua.edu.cn/simple \
    fastapi \
    uvicorn \
    httpx \
    python-multipart

# 复制代码
COPY app.py /app/

# 暴露端口
EXPOSE 8888

# 启动命令
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8888"]