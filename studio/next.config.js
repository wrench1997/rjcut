/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 允许加载 wasm 文件
  serverExternalPackages: [],
  // 配置 webpack 支持 wasm
  webpack: (config, { isServer }) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    }
    return config
  },
  // Turbopack 配置（Next.js 16 默认使用 Turbopack）
  turbopack: {
    // 如果需要配置 Turbopack，可以在这里添加
  },
  // 输出静态文件或 Node.js 服务器
  output: 'standalone',
}

module.exports = nextConfig