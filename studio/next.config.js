/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 告诉 Next.js 导出静态 HTML 到 /out 文件夹
  output: 'export',
  // 确保图片不使用 Node.js 的图像优化服务
  images: {
    unoptimized: true,
  },
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
}

module.exports = nextConfig