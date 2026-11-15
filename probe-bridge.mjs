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
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('timeout ' + method)) } }, 20000)
  })
}

async function main() {
  const init = await call('initialize', {
    authToken: ep.token,
    protocolVersion: '1.0',
    runtime: 'dsh',
    sessionNamespace: 'probe-' + Date.now(),
  })
  if (init.error) throw new Error('init failed: ' + JSON.stringify(init.error))
  console.log('features:', JSON.stringify(init.result.features, null, 2))
  const all = []
  let cursor = null
  for (let page = 0; page < 20; page++) {
    const res = await call('session.list', cursor ? { limit: 1000, cursor } : { limit: 1000 })
    if (res.error) throw new Error('list failed: ' + JSON.stringify(res.error))
    all.push(...res.result.sessions)
    cursor = res.result.nextCursor
    if (!cursor) break
  }
  console.log('visible sessions:', all.length)
  const rows = all
    .sort((a, b) => (a.orderingTime < b.orderingTime ? 1 : -1))
    .map((s) => [s.orderingTime, s.metadata.live ? 'live' : 'cold', (s.title ?? '(no title)').slice(0, 40), (s.cwd ?? '').slice(-40)].join(' | '))
  console.log(rows.join('\n'))
  sock.end()
}

main().catch((e) => { console.error('ERR', e.message); process.exitCode = 1; sock.destroy() })
