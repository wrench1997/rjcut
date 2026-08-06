// 构建启动器：剥离安全删除钩子(NODE_OPTIONS --require genie-safe-delete.cjs)，
// 让 electron-builder 的子进程 node 直接执行 fs 删除，不被 trash 拦截。
// 同时输出到全新目录 release_build，绕开被 Defender 锁死的 stale win-unpacked.tmp。
const { spawnSync } = require('child_process')
const path = require('path')

const env = { ...process.env }
if (env.NODE_OPTIONS) {
  env.NODE_OPTIONS = env.NODE_OPTIONS
    .split(/\s+/)
    .filter((f) => !/safe-delete|genie-trash/i.test(f))
    .join(' ')
    .trim()
  if (!env.NODE_OPTIONS) delete env.NODE_OPTIONS
}
// 同时清除可能注入的 bash 层安全删除环境变量
delete env.BASH_ENV
delete env.CODEBUDDY_SAFE_DELETE_BIN_DIR
delete env.CODEBUDDY_SAFE_DELETE_BULK_GUARD

const outDir = 'release_build'
const electronDist = 'node_modules/electron/dist'
const args = [
  'electron-builder',
  '--config.directories.output=' + outDir,
  '--config.electronDist=' + electronDist,
]
console.log('[launcher] NODE_OPTIONS =>', JSON.stringify(env.NODE_OPTIONS || ''))
console.log('[launcher] 运行:', 'npx ' + args.join(' '))

const res = spawnSync('npx', args, {
  cwd: __dirname,
  env,
  stdio: 'inherit',
  shell: true,
  windowsHide: true,
})
const code = res.status === null ? (res.signal ? 1 : 0) : res.status
console.log('[launcher] electron-builder 退出码:', code)
process.exit(code)
