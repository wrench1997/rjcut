# FRP 客户端 Docker 镜像
FROM alpine:latest

# 安装必要的工具
RUN apk add --no-cache curl ca-certificates

# 设置 FRP 版本
ENV FRP_VERSION=0.52.3

# 下载并安装 FRP 客户端
RUN curl -L https://github.com/fatedier/frp/releases/download/v${FRP_VERSION}/frp_${FRP_VERSION}_linux_amd64.tar.gz -o /tmp/frp.tar.gz && \
    tar -xzvf /tmp/frp.tar.gz -C /tmp && \
    mv /tmp/frp_${FRP_VERSION}_linux_amd64/frpc /usr/bin/frpc && \
    chmod +x /usr/bin/frpc && \
    rm -rf /tmp/frp.tar.gz /tmp/frp_${FRP_VERSION}_linux_amd64

# 创建日志目录
RUN mkdir -p /frp/log

# 复制配置文件
COPY frpc.ini /frp/frpc.ini

# 暴露管理端口
EXPOSE 7400

# 启动 FRP 客户端
CMD ["frpc", "-c", "/frp/frpc.ini"]