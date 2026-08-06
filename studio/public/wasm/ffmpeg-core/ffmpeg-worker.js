/* Classic worker: avoids Electron/Next rewriting dynamic import as Node require. */
let core = null
const reply = (id, type, data) => self.postMessage({ id, type, data })
self.onmessage = async ({ data: message }) => {
  const { id, type, data = {} } = message
  try {
    if (type === 'load') {
      importScripts(data.coreURL)
      core = await self.createFFmpegCore({
        mainScriptUrlOrBlob: `${data.coreURL}#${btoa(JSON.stringify({ wasmURL: data.wasmURL }))}`,
      })
      core.setLogger((data) => reply(id, 'log', data))
      core.setProgress((data) => reply(id, 'progress', data))
      reply(id, 'load', true)
    } else if (!core) throw new Error('FFmpeg core 未初始化')
    else if (type === 'write') { core.FS.writeFile(data.path, data.file); reply(id, 'write', true) }
    else if (type === 'read') { const file = core.FS.readFile(data.path); reply(id, 'read', file) }
    else if (type === 'delete') { try { core.FS.unlink(data.path) } catch (_) {} reply(id, 'delete', true) }
    else if (type === 'exec') { core.setTimeout(-1); core.exec(...data.args); const code = core.ret; core.reset(); reply(id, 'exec', code) }
    else throw new Error(`未知 FFmpeg 指令：${type}`)
  } catch (error) { reply(id, 'error', { message: error?.message || String(error) }) }
}
