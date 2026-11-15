import net from 'node:net'
import fs from 'node:fs'

const ep = JSON.parse(fs.readFileSync(process.env.USERPROFILE + '\\.agents-anywhere\\dsh-bridge\\endpoint.json', 'utf8'))
const sock = net.connect(ep.port, ep.host)
let buf = ''
const pending = new Map()
let nextId = 1

sock.on('data', (chunk) => {
  buf += chunk.toString('utf8')
  let i
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i)
    buf = buf.slice(i + 1)
    if (!line.trim()) continue
    const msg = JSON.parse(line)
    if (msg.id != null && pending.has(msg.id)) {
      const { resolve } = pending.get(msg.id)
      pending.delete(msg.id)
      resolve(msg)
    }
  }
})

function call(method, params) {
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    sock.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('timeout ' + method)) } }, 30000)
  })
}

async function main() {
  const init = await call('initialize', { authToken: ep.token, protocolVersion: '1.0', runtime: 'dsh', sessionNamespace: 'probe-' + Date.now() })
  if (init.error) throw new Error('init failed: ' + JSON.stringify(init.error))
  const list = await call('session.list', { limit: 1000 })
  if (list.error) throw new Error(JSON.stringify(list.error))
  const sessions = list.result.sessions
  console.log('total listed:', sessions.length)
  const picks = [
    sessions.find((s) => s.title && s.title.includes('pytorch')),
    sessions.find((s) => s.title && s.title.includes('流式输')),
    sessions[0],
  ].filter(Boolean)
  for (const s of picks) {
    let items = []
    let cursor = null
    let complete = false
    for (let p = 0; p < 100; p++) {
      const res = await call('session.getSnapshot', cursor ? { sessionId: s.sessionId, cursor } : { sessionId: s.sessionId })
      if (res.error) { console.log('snapshot error', s.title, JSON.stringify(res.error)); break }
      items.push(...res.result.items)
      cursor = res.result.nextCursor
      complete = res.result.complete
      if (!cursor) break
    }
    const first = items[0]
    const userMsgs = items.filter((i) => i.kind === 'message' && i.role === 'user')
    console.log(`\n[${s.orderingTime}] ${s.title} -> items=${items.length} complete=${complete} userMsgs=${userMsgs.length}`)
    if (first) console.log('  first item:', JSON.stringify(first).slice(0, 160))
    const lastUser = userMsgs.at(-1)
    if (lastUser) console.log('  last user text:', JSON.stringify(lastUser.content ?? lastUser.text ?? lastUser).slice(0, 200))
  }
  sock.end()
}

main().catch((e) => { console.error('ERR', e.message); process.exitCode = 1; sock.destroy() })
