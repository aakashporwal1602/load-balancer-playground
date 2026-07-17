import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  RoundRobin, WeightedRoundRobin, LeastConnections, IPHash, RandomBalancer,
  makeServer, ALGO_META, SAMPLE_IPS
} from './algorithms'
import './App.css'

// ─── helpers ─────────────────────────────────────────────────────────────────
const SERVER_COLORS = ['#6366F1','#0891B2','#059669','#D97706','#7C3AED','#DB2777']
const DEFAULT_SERVERS = [
  makeServer('A', 1, 80),
  makeServer('B', 2, 120),
  makeServer('C', 1, 60),
]

function buildBalancer(algo, servers) {
  const s = servers.map(sv => ({ ...sv, requests: 0, activeConnections: 0 }))
  switch (algo) {
    case 'rr':  return { balancer: new RoundRobin(s), servers: s }
    case 'wrr': return { balancer: new WeightedRoundRobin(s), servers: s }
    case 'lc':  return { balancer: new LeastConnections(s), servers: s }
    case 'ih':  return { balancer: new IPHash(s), servers: s }
    case 'rnd': return { balancer: new RandomBalancer(s), servers: s }
    default:    return { balancer: new RoundRobin(s), servers: s }
  }
}

let ipIdx = 0

// ─── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [algo, setAlgo] = useState('rr')
  const [servers, setServers] = useState(DEFAULT_SERVERS)
  const [running, setRunning] = useState(false)
  const [speed, setSpeed] = useState(700)
  const [tab, setTab] = useState('play')
  const [tick, setTick] = useState(0)
  const [log, setLog] = useState([])
  const [activeServer, setActiveServer] = useState(null)
  const [flyingReqs, setFlyingReqs] = useState([])
  const [serverStats, setServerStats] = useState({})

  const stateRef = useRef(null)

  const resetSim = useCallback((newAlgo = algo, newServers = servers) => {
    setRunning(false)
    setTick(0); setLog([]); setActiveServer(null); setFlyingReqs([])
    ipIdx = 0
    const { servers: sv } = buildBalancer(newAlgo, newServers)
    const stats = {}
    sv.forEach(s => { stats[s.id] = { requests: 0, activeConnections: 0 } })
    setServerStats(stats)
    stateRef.current = buildBalancer(newAlgo, newServers)
  }, [algo, servers])

  useEffect(() => { resetSim(algo, servers) }, [])

  const step = useCallback(() => {
    if (!stateRef.current) return
    const { balancer, servers: sv } = stateRef.current
    const ip = SAMPLE_IPS[ipIdx % SAMPLE_IPS.length]
    ipIdx++
    const target = balancer.nextServer({ ip })
    if (!target) return

    setTick(t => t + 1)
    setActiveServer(target.id)

    const reqId = Date.now() + Math.random()
    setFlyingReqs(prev => [...prev, { id: reqId, serverId: target.id, ip }])

    // Hold the connection open for a time proportional to THIS server's latency,
    // normalized to the dispatch interval. Slower servers keep connections open
    // longer, so multiple connections overlap and active-connection counts
    // actually differ between servers. This is what makes Least Connections
    // behave correctly: faster servers free up sooner and receive more traffic.
    const lats = stateRef.current.servers.map(s => s.latency || 100)
    const avgLat = lats.reduce((a, b) => a + b, 0) / (lats.length || 1)
    const holdMs = Math.max(300, speed * ((target.latency || 100) / avgLat) * 1.8)

    setTimeout(() => {
      setFlyingReqs(prev => prev.filter(r => r.id !== reqId))
      // request completes: free the connection on the real server AND in the UI stats
      if (stateRef.current) {
        const s = stateRef.current.servers.find(x => x.id === target.id)
        if (s) s.activeConnections = Math.max(0, s.activeConnections - 1)
      }
      setServerStats(prev => ({
        ...prev,
        [target.id]: {
          requests: (prev[target.id]?.requests || 0) + 1,
          activeConnections: Math.max(0, (prev[target.id]?.activeConnections || 1) - 1),
        }
      }))
    }, holdMs)

    setServerStats(prev => ({
      ...prev,
      [target.id]: {
        requests: (prev[target.id]?.requests || 0),
        activeConnections: (prev[target.id]?.activeConnections || 0) + 1,
      }
    }))

    setLog(prev => [{
      id: reqId, ip, serverId: target.id, t: Date.now(),
      algo: ALGO_META[algo].short
    }, ...prev.slice(0, 49)])

    setTimeout(() => setActiveServer(null), 300)
  }, [algo, speed])

  useEffect(() => {
    if (!running) return
    const id = setInterval(step, speed)
    return () => clearInterval(id)
  }, [running, speed, step])

  const handleAlgoChange = (a) => {
    setAlgo(a)
    resetSim(a, servers)
  }

  const updateWeight = (id, w) => {
    const updated = servers.map(s => s.id === id ? { ...s, weight: w } : s)
    setServers(updated)
    resetSim(algo, updated)
  }

  const updateLatency = (id, l) => {
    const updated = servers.map(s => s.id === id ? { ...s, latency: l } : s)
    setServers(updated)
  }

  const addServer = () => {
    if (servers.length >= 6) return
    const ids = 'ABCDEFG'
    const newId = ids[servers.length]
    const newServer = makeServer(newId, 1, 100)
    const updated = [...servers, newServer]
    setServers(updated)
    resetSim(algo, updated)
  }

  const removeServer = (id) => {
    if (servers.length <= 2) return
    const updated = servers.filter(s => s.id !== id)
    setServers(updated)
    resetSim(algo, updated)
  }

  const totalRequests = Object.values(serverStats).reduce((s, v) => s + v.requests, 0)

  return (
    <div className="app">
      {/* Header */}
      <header className="hdr">
        <div className="hdr-inner">
          <div className="brand">
            <div className="brand-icon">LB</div>
            <div>
              <div className="brand-name">Load Balancer Playground</div>
              <div className="brand-sub">Round Robin · Weighted · Least Connections · IP Hash · Random</div>
            </div>
          </div>
          <nav className="tabs">
            {[['play','🎮 Playground'],['learn','📖 How it works'],['code','💻 Node.js Code']].map(([id,lbl]) => (
              <button key={id} className={`tab ${tab===id?'tab-on':''}`} onClick={()=>setTab(id)}>{lbl}</button>
            ))}
          </nav>
        </div>
      </header>

      <main className="main">
        {tab === 'play' && (
          <div className="play">
            {/* Algorithm picker */}
            <div className="algo-picker">
              {Object.entries(ALGO_META).map(([key, meta]) => (
                <button
                  key={key}
                  className={`algo-btn ${algo===key?'algo-on':''}`}
                  style={algo===key ? {'--ac':meta.color,'--ab':meta.bg,'--abr':meta.border} : {}}
                  onClick={() => handleAlgoChange(key)}
                >
                  <span className="ab-emoji">{meta.emoji}</span>
                  <span className="ab-label">{meta.label}</span>
                </button>
              ))}
            </div>

            {/* Current algo info banner */}
            <div className="algo-banner" style={{'--ac':ALGO_META[algo].color,'--ab':ALGO_META[algo].bg,'--abr':ALGO_META[algo].border}}>
              <div className="ab-left">
                <span className="ab-big-emoji">{ALGO_META[algo].emoji}</span>
                <div>
                  <div className="ab-title" style={{color:ALGO_META[algo].color}}>{ALGO_META[algo].label}</div>
                  <div className="ab-desc">{ALGO_META[algo].desc}</div>
                </div>
              </div>
              <div className="ab-right">
                <div className="ab-pill">Complexity: {ALGO_META[algo].complexity}</div>
                <div className="ab-usecase">📌 {ALGO_META[algo].useCase}</div>
              </div>
            </div>

            {/* Controls */}
            <div className="ctrl-bar">
              <div className="ctrl-grp">
                <span className="cl">Speed</span>
                <input type="range" min="200" max="1500" step="100" value={speed}
                  onChange={e => setSpeed(Number(e.target.value))} className="sl" />
                <span className="cv">{speed}ms</span>
              </div>
              <div className="ctrl-right">
                <div className="req-counter">
                  <span className="rc-n">{totalRequests}</span>
                  <span className="rc-l">requests</span>
                </div>
                <button className={`btn-run ${running?'btn-stop':''}`} onClick={() => setRunning(r => !r)}>
                  {running ? '⏸ Pause' : '▶ Run'}
                </button>
                <button className="btn-step" onClick={step} disabled={running}>⏭ Step</button>
                <button className="btn-reset" onClick={() => resetSim()}>↺ Reset</button>
              </div>
            </div>

            {/* Main viz */}
            <div className="viz-area">
              {/* Client side */}
              <div className="client-col">
                <div className="section-label">Clients</div>
                <div className="clients">
                  {SAMPLE_IPS.slice(0, 6).map((ip, i) => {
                    const isActive = flyingReqs.some(r => r.ip === ip)
                    return (
                      <div key={ip} className={`client ${isActive?'client-active':''}`}>
                        <div className="client-icon">👤</div>
                        <div className="client-ip">{ip}</div>
                        {isActive && <div className="client-sending">→</div>}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Load balancer */}
              <div className="lb-col">
                <div className="section-label">Load Balancer</div>
                <div className="lb-box" style={{'--ac':ALGO_META[algo].color,'--ab':ALGO_META[algo].bg}}>
                  <div className="lb-emoji">{ALGO_META[algo].emoji}</div>
                  <div className="lb-name">{ALGO_META[algo].short}</div>
                  <div className="lb-status">{running ? <span className="lb-spin">⟳</span> : '●'}</div>
                  {flyingReqs.length > 0 && (
                    <div className="lb-req-count">{flyingReqs.length}</div>
                  )}
                </div>
                {/* flying requests */}
                <div className="fly-area">
                  {flyingReqs.slice(0, 5).map(r => (
                    <div key={r.id} className="fly-req" style={{'--sc': SERVER_COLORS[servers.findIndex(s=>s.id===r.serverId)%SERVER_COLORS.length]}}>
                      → {r.serverId}
                    </div>
                  ))}
                </div>
              </div>

              {/* Servers */}
              <div className="servers-col">
                <div className="section-label-row">
                  <span className="section-label">Servers</span>
                  <button className="add-server-btn" onClick={addServer} disabled={servers.length >= 6}>
                    + Add Server
                  </button>
                </div>
                <div className="servers-list">
                  {servers.map((sv, i) => {
                    const color = SERVER_COLORS[i % SERVER_COLORS.length]
                    const st = serverStats[sv.id] || { requests: 0, activeConnections: 0 }
                    const pct = totalRequests > 0 ? Math.round((st.requests / totalRequests) * 100) : 0
                    const isActive = activeServer === sv.id
                    const isFlying = flyingReqs.some(r => r.serverId === sv.id)
                    return (
                      <div
                        key={sv.id}
                        className={`server-card ${isActive||isFlying?'server-active':''}`}
                        style={{'--sc':color,'--sl':sv.latency}}
                      >
                        <div className="sc-left">
                          <div className="sc-icon" style={{background:color+'18',border:`2px solid ${color}`}}>
                            <span style={{color}}>{sv.id}</span>
                          </div>
                          <div className="sc-info">
                            <div className="sc-name">Server {sv.id}</div>
                            <div className="sc-meta">
                              {algo === 'wrr' && (
                                <span className="sc-tag" style={{color,background:color+'18'}}>weight {sv.weight}</span>
                              )}
                              <span className="sc-latency">~{sv.latency}ms</span>
                              {st.activeConnections > 0 && (
                                <span className="sc-active-conn" style={{color}}>{st.activeConnections} active</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="sc-right">
                          <div className="sc-bar-wrap">
                            <div className="sc-bar" style={{width:`${pct}%`, background:color}} key={st.requests} />
                          </div>
                          <div className="sc-stats">
                            <span className="sc-pct" style={{color}}>{pct}%</span>
                            <span className="sc-reqs">{st.requests} req</span>
                          </div>
                          <button className="sc-remove" onClick={() => removeServer(sv.id)} title="Remove">×</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Server config (weight + latency) */}
            <div className="server-config">
              <div className="sc-config-title">Server Configuration</div>
              <div className="sc-config-grid">
                {servers.map((sv, i) => {
                  const color = SERVER_COLORS[i % SERVER_COLORS.length]
                  return (
                    <div key={sv.id} className="sc-config-card">
                      <div className="scc-header">
                        <div className="scc-dot" style={{background:color}} />
                        <span className="scc-name">Server {sv.id}</span>
                      </div>
                      {algo === 'wrr' && (
                        <div className="scc-ctrl">
                          <label>Weight</label>
                          <div className="scc-row">
                            <input type="range" min="1" max="5" step="1" value={sv.weight}
                              onChange={e => updateWeight(sv.id, Number(e.target.value))}
                              style={{accentColor:color}} />
                            <span style={{color}}>{sv.weight}</span>
                          </div>
                        </div>
                      )}
                      <div className="scc-ctrl">
                        <label>Latency (ms)</label>
                        <div className="scc-row">
                          <input type="range" min="20" max="500" step="10" value={sv.latency}
                            onChange={e => updateLatency(sv.id, Number(e.target.value))}
                            style={{accentColor:color}} />
                          <span style={{color}}>{sv.latency}ms</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* IP Hash mapping (only for ih) */}
            {algo === 'ih' && (
              <div className="ip-map-card">
                <div className="ip-map-title">📌 IP → Server Mapping (sticky sessions)</div>
                <div className="ip-map-grid">
                  {SAMPLE_IPS.map(ip => {
                    const hash = (() => {
                      let h = 2166136261
                      for (let i = 0; i < ip.length; i++) { h ^= ip.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0 }
                      return h
                    })()
                    const sIdx = hash % servers.length
                    const sv = servers[sIdx]
                    const color = SERVER_COLORS[sIdx % SERVER_COLORS.length]
                    const isActive = flyingReqs.some(r => r.ip === ip)
                    return (
                      <div key={ip} className={`ip-row ${isActive?'ip-active':''}`} style={{'--sc':color}}>
                        <span className="ip-addr">{ip}</span>
                        <span className="ip-arrow">→</span>
                        <span className="ip-server" style={{color, background:color+'18'}}>Server {sv?.id}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Request log */}
            {log.length > 0 && (
              <div className="req-log">
                <div className="rl-title">Request Log</div>
                <div className="rl-rows">
                  {log.slice(0, 12).map((l, idx) => {
                    const sIdx = servers.findIndex(s => s.id === l.serverId)
                    const color = SERVER_COLORS[sIdx % SERVER_COLORS.length]
                    return (
                      <div key={l.id} className="rl-row" style={{animationDelay:`${idx*20}ms`}}>
                        <span className="rl-num">#{totalRequests - idx}</span>
                        <span className="rl-ip">{l.ip}</span>
                        <span className="rl-arrow">→</span>
                        <span className="rl-server" style={{color, background:color+'18'}}>Server {l.serverId}</span>
                        <span className="rl-algo">{l.algo}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'learn' && <LearnPage />}
        {tab === 'code' && <CodePage />}
      </main>

      <footer className="footer">
        <span>Built by <a href="https://aakashporwal1602.github.io/aakash-porwal-portfolio" target="_blank" rel="noreferrer">Aakash Porwal</a> — Senior Software Engineer, Distributed Systems</span>
        <span className="fm">load balancing · backend engineering · node.js</span>
      </footer>
    </div>
  )
}

// ─── Learn Page ───────────────────────────────────────────────────────────────
function LearnPage() {
  const algos = [
    {
      key: 'rr', name: 'Round Robin', emoji: '🔄', color: 'var(--rr)', bg: 'var(--rr-bg)',
      what: 'Distributes requests in a circular order — server 1, server 2, server 3, then back to server 1. Every server gets the same number of requests over time.',
      how: 'Maintains a pointer (index) to the next server. On each request, return current server and advance pointer. Wraps around with modulo. O(1) per request, O(N) space.',
      best: 'Stateless APIs with homogeneous servers (same CPU, memory, capacity). Works perfectly when requests have similar processing times.',
      worst: 'When servers have different capacities — a weak server gets the same load as a powerful one. Also bad when requests vary wildly in processing time.',
      real: 'DNS round-robin, simple API gateways, CDN request distribution.',
    },
    {
      key: 'wrr', name: 'Weighted Round Robin', emoji: '⚖️', color: 'var(--wrr)', bg: 'var(--wrr-bg)',
      what: 'Like Round Robin, but each server has a weight. A server with weight 3 gets 3 requests for every 1 request that a weight-1 server receives.',
      how: 'Nginx uses the "smooth" WRR algorithm: each server maintains a current weight that increases by its weight on every iteration, then the highest current-weight server is picked and decremented by total weight. This produces smooth distribution.',
      best: 'Heterogeneous infrastructure — different server specs, cloud instances of different sizes (e.g., 4-core vs 16-core), or gradual traffic shifting during deployments.',
      worst: 'Still doesn\'t account for actual server load — a high-weight server with long-running requests can become overloaded.',
      real: 'Nginx upstream, HAProxy, traffic shifting for canary deployments (weight new version at 10%, old at 90%).',
    },
    {
      key: 'lc', name: 'Least Connections', emoji: '📉', color: 'var(--lc)', bg: 'var(--lc-bg)',
      what: 'Always routes to the server currently handling the fewest active connections. Dynamically adapts to actual server load in real-time.',
      how: 'Each server tracks its activeConnections count. On each request, iterate servers and pick the minimum. O(N) per request. When a request completes, decrement the server\'s count.',
      best: 'Variable-length requests — some requests take 1ms, others take 10 seconds. WebSockets, long-polling, database queries, file uploads. Naturally handles slow servers without configuration.',
      worst: 'Adds overhead of tracking connection counts. With very fast requests (sub-millisecond), the overhead can outweigh the benefit. Not useful for true stateless fire-and-forget requests.',
      real: 'HAProxy (default algorithm), AWS ALB, Nginx (least_conn), database connection pooling.',
    },
    {
      key: 'ih', name: 'IP Hash', emoji: '📌', color: 'var(--ih)', bg: 'var(--ih-bg)',
      what: 'Hashes the client\'s IP address to deterministically route to the same server every time. Same IP = same server = sticky session.',
      how: 'Apply a hash function (FNV-1a in Nginx) to the client IP. Modulo N gives the server index. The mapping is deterministic — same IP always produces the same server as long as N doesn\'t change.',
      best: 'Stateful applications where client state is stored on a specific server — shopping carts, user sessions, WebSocket connections, gaming servers.',
      worst: 'Adding/removing servers changes N and remaps all clients — same problem as regular modulo hashing. Can be fixed with consistent hashing. Also bad if many clients share one NAT IP.',
      real: 'Nginx (hash $remote_addr consistent), Redis Cluster (consistent hash version), gaming session servers.',
    },
    {
      key: 'rnd', name: 'Random', emoji: '🎲', color: 'var(--rnd)', bg: 'var(--rnd-bg)',
      what: 'Pick a server at random for each request. With enough requests, converges to equal distribution by the law of large numbers.',
      how: 'Generate a random integer in [0, N). Use as the server index. Zero state required — just a random number generator. Genuinely O(1) with zero coordination needed.',
      best: 'Very large clusters where statistical distribution is sufficient. Microservices with dozens of instances. Systems where requests are extremely fast and uniform.',
      worst: 'Can cause temporary imbalance with small server counts or low request volumes — probability doesn\'t guarantee fairness for small samples.',
      real: 'Service meshes (Envoy uses it as a baseline), some DNS implementations, distributed caching with many nodes.',
    },
  ]

  return (
    <div className="learn-page">
      <div className="learn-hdr">
        <h2>How Load Balancing Algorithms Work</h2>
        <p>From the simplest Round Robin to dynamic Least Connections — mechanics, tradeoffs, and production usage.</p>
      </div>
      <div className="learn-grid">
        {algos.map(a => (
          <div key={a.key} className="learn-card" style={{'--ac':a.color,'--ab':a.bg}}>
            <div className="lc-top">
              <span className="lc-emoji">{a.emoji}</span>
              <div>
                <div className="lc-name" style={{color:a.color}}>{a.name}</div>
                <div className="lc-key">{ALGO_META[a.key].complexity} · {ALGO_META[a.key].useCase}</div>
              </div>
            </div>
            <div className="lc-sec"><div className="lc-lbl">What it does</div><p>{a.what}</p></div>
            <div className="lc-sec"><div className="lc-lbl">How it works internally</div><p>{a.how}</p></div>
            <div className="lc-sec best"><div className="lc-lbl">✅ Best for</div><p>{a.best}</p></div>
            <div className="lc-sec worst"><div className="lc-lbl">⚠️ Watch out for</div><p>{a.worst}</p></div>
            <div className="lc-sec"><div className="lc-lbl">🏭 Real usage</div><p className="mono-text">{a.real}</p></div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Code Page ────────────────────────────────────────────────────────────────
function CodePage() {
  const [copied, setCopied] = useState(null)
  const copy = (id, text) => {
    navigator.clipboard.writeText(text).then(() => { setCopied(id); setTimeout(() => setCopied(null), 2000) })
  }

  const snippets = [
    {
      id: 'rr', color: 'var(--rr)', title: 'Round Robin — Node.js',
      code: `class RoundRobin {
  constructor(servers) {
    this.servers = servers
    this.index = 0
  }

  nextServer() {
    const server = this.servers[this.index]
    this.index = (this.index + 1) % this.servers.length
    return server
  }
}

// Express middleware
const lb = new RoundRobin(['http://s1:3001','http://s2:3002','http://s3:3003'])

app.use((req, res, next) => {
  req.targetServer = lb.nextServer()
  next()
})`
    },
    {
      id: 'lc', color: 'var(--lc)', title: 'Least Connections — Node.js',
      code: `class LeastConnections {
  constructor(servers) {
    this.servers = servers.map(url => ({ url, active: 0 }))
  }

  nextServer() {
    return this.servers.reduce((min, s) =>
      s.active < min.active ? s : min
    )
  }

  async proxyRequest(req, res) {
    const server = this.nextServer()
    server.active++
    try {
      await proxy(req, res, server.url)
    } finally {
      server.active-- // always decrement, even on error
    }
  }
}`
    },
    {
      id: 'ih', color: 'var(--ih)', title: 'IP Hash — Node.js (Sticky Sessions)',
      code: `class IPHash {
  constructor(servers) { this.servers = servers }

  hash(ip) {
    let h = 2166136261  // FNV-1a (same as Nginx)
    for (let i = 0; i < ip.length; i++) {
      h ^= ip.charCodeAt(i)
      h = Math.imul(h, 16777619) >>> 0
    }
    return h
  }

  nextServer(clientIp) {
    return this.servers[this.hash(clientIp) % this.servers.length]
  }
}

// Express: route same client to same server
const lb = new IPHash(['s1','s2','s3'])
app.use((req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress
  req.targetServer = lb.nextServer(ip)
  next()
})`
    },
    {
      id: 'nginx', color: 'var(--wrr)', title: 'Nginx Configuration',
      code: `# nginx.conf — all 5 algorithms

# Round Robin (default)
upstream backend_rr {
    server s1:3001;
    server s2:3002;
    server s3:3003;
}

# Weighted Round Robin
upstream backend_wrr {
    server s1:3001 weight=3;
    server s2:3002 weight=2;
    server s3:3003 weight=1;
}

# Least Connections
upstream backend_lc {
    least_conn;
    server s1:3001;
    server s2:3002;
    server s3:3003;
}

# IP Hash (sticky sessions)
upstream backend_ih {
    ip_hash;
    server s1:3001;
    server s2:3002;
    server s3:3003;
}

# Random (Nginx 1.15.1+)
upstream backend_rnd {
    random;
    server s1:3001;
    server s2:3002;
    server s3:3003;
}

server {
    listen 80;
    location / {
        proxy_pass http://backend_lc;
        proxy_set_header X-Forwarded-For $remote_addr;
    }
}`
    },
  ]

  return (
    <div className="code-page">
      <div className="learn-hdr">
        <h2>Node.js Implementation + Nginx Config</h2>
        <p>Production-ready code for all 5 algorithms. Copy and use directly.</p>
      </div>
      {snippets.map(s => (
        <div key={s.id} className="code-block">
          <div className="cb-hdr">
            <span style={{color:s.color, fontWeight:600, fontSize:14}}>{s.title}</span>
            <button className="copy-btn" onClick={() => copy(s.id, s.code)}>
              {copied===s.id ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <pre className="cb-code"><code>{s.code}</code></pre>
        </div>
      ))}
    </div>
  )
}
