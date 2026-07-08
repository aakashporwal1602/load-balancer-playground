// ─── Load Balancer Algorithms — Pure Node.js ──────────────────────────────
// All algorithms implemented from scratch. No dependencies required.
// Each class is self-contained and production-ready.

// ─── Round Robin ──────────────────────────────────────────────────────────────
// Distributes requests sequentially across servers. Each server gets an equal
// turn regardless of load or response time. Simple and fair for homogeneous servers.
export class RoundRobin {
  constructor(servers) {
    this.servers = [...servers]
    this.index = 0
    this.requestCount = 0
  }

  nextServer(request) {
    if (this.servers.length === 0) return null
    const server = this.servers[this.index]
    this.index = (this.index + 1) % this.servers.length
    this.requestCount++
    server.requests++
    server.activeConnections++
    return server
  }

  addServer(server) { this.servers.push(server) }
  removeServer(id) {
    this.servers = this.servers.filter(s => s.id !== id)
    this.index = this.index % Math.max(this.servers.length, 1)
  }
}

// ─── Weighted Round Robin ────────────────────────────────────────────────────
// Like Round Robin but each server gets requests proportional to its weight.
// Server with weight=3 gets 3 requests for every 1 request of a weight=1 server.
// Use when servers have different capacities (CPU, memory, bandwidth).
export class WeightedRoundRobin {
  constructor(servers) {
    this.servers = [...servers]
    this.currentIndex = -1
    this.currentWeight = 0
    this.requestCount = 0
  }

  _gcd(a, b) { return b === 0 ? a : this._gcd(b, a % b) }

  _maxWeight() { return Math.max(...this.servers.map(s => s.weight || 1)) }

  _gcdWeight() {
    return this.servers.reduce((g, s) => this._gcd(g, s.weight || 1), this.servers[0]?.weight || 1)
  }

  nextServer(request) {
    if (this.servers.length === 0) return null
    // Nginx-style weighted round robin
    while (true) {
      this.currentIndex = (this.currentIndex + 1) % this.servers.length
      if (this.currentIndex === 0) {
        this.currentWeight -= this._gcdWeight()
        if (this.currentWeight <= 0) {
          this.currentWeight = this._maxWeight()
          if (this.currentWeight === 0) return null
        }
      }
      const server = this.servers[this.currentIndex]
      if ((server.weight || 1) >= this.currentWeight) {
        this.requestCount++
        server.requests++
        server.activeConnections++
        return server
      }
    }
  }

  addServer(server) { this.servers.push(server); this.currentIndex = -1; this.currentWeight = 0 }
  removeServer(id) { this.servers = this.servers.filter(s => s.id !== id); this.currentIndex = -1; this.currentWeight = 0 }
}

// ─── Least Connections ───────────────────────────────────────────────────────
// Routes each new request to the server with the fewest active connections.
// Best for requests with variable processing time (some fast, some slow).
// Used by HAProxy, Nginx, AWS ALB.
export class LeastConnections {
  constructor(servers) {
    this.servers = [...servers]
    this.requestCount = 0
  }

  nextServer(request) {
    if (this.servers.length === 0) return null
    // Find server with minimum active connections
    const server = this.servers.reduce((min, s) =>
      s.activeConnections < min.activeConnections ? s : min
    )
    this.requestCount++
    server.requests++
    server.activeConnections++
    return server
  }

  addServer(server) { this.servers.push(server) }
  removeServer(id) { this.servers = this.servers.filter(s => s.id !== id) }
}

// ─── IP Hash ─────────────────────────────────────────────────────────────────
// Hashes the client's IP address to consistently route to the same server.
// Ensures session affinity (sticky sessions) — same client always hits same server.
// Used for stateful applications, shopping carts, user sessions.
export class IPHash {
  constructor(servers) {
    this.servers = [...servers]
    this.requestCount = 0
  }

  _hash(ip) {
    // FNV-1a hash — same as used in Nginx
    let h = 2166136261
    for (let i = 0; i < ip.length; i++) {
      h ^= ip.charCodeAt(i)
      h = (h * 16777619) >>> 0
    }
    return h
  }

  nextServer(request) {
    if (this.servers.length === 0) return null
    const ip = request?.ip || '127.0.0.1'
    const hash = this._hash(ip)
    const server = this.servers[hash % this.servers.length]
    this.requestCount++
    server.requests++
    server.activeConnections++
    return server
  }

  addServer(server) { this.servers.push(server) }
  removeServer(id) { this.servers = this.servers.filter(s => s.id !== id) }
}

// ─── Random ──────────────────────────────────────────────────────────────────
// Picks a server at random for each request. Statistically approaches
// Round Robin with enough requests. Simple, no state required.
// Good for large clusters where statistical distribution is sufficient.
export class RandomBalancer {
  constructor(servers) {
    this.servers = [...servers]
    this.requestCount = 0
  }

  nextServer(request) {
    if (this.servers.length === 0) return null
    const idx = Math.floor(Math.random() * this.servers.length)
    const server = this.servers[idx]
    this.requestCount++
    server.requests++
    server.activeConnections++
    return server
  }

  addServer(server) { this.servers.push(server) }
  removeServer(id) { this.servers = this.servers.filter(s => s.id !== id) }
}

// ─── Server Factory ──────────────────────────────────────────────────────────
export function makeServer(id, weight = 1, latency = 100) {
  return {
    id,
    name: `Server ${id}`,
    weight,
    latency,      // simulated response time in ms
    requests: 0,
    activeConnections: 0,
    healthy: true,
  }
}

export const ALGO_META = {
  rr:  { label: 'Round Robin',          short: 'RR',  color: 'var(--rr)',  bg: 'var(--rr-bg)',  border: 'var(--rr-border)',  emoji: '🔄', desc: 'Takes turns — each server gets one request at a time', complexity: 'O(1)', useCase: 'Identical servers, stateless APIs' },
  wrr: { label: 'Weighted Round Robin', short: 'WRR', color: 'var(--wrr)', bg: 'var(--wrr-bg)', border: 'var(--wrr-border)', emoji: '⚖️', desc: 'Like Round Robin but powerful servers get more requests', complexity: 'O(1)', useCase: 'Heterogeneous servers with different capacities' },
  lc:  { label: 'Least Connections',    short: 'LC',  color: 'var(--lc)',  bg: 'var(--lc-bg)',  border: 'var(--lc-border)',  emoji: '📉', desc: 'Always pick the server with the least active work', complexity: 'O(N)', useCase: 'Variable-length requests, long-polling, WebSockets' },
  ih:  { label: 'IP Hash',              short: 'IH',  color: 'var(--ih)',  bg: 'var(--ih-bg)',  border: 'var(--ih-border)',  emoji: '📌', desc: 'Same client IP always goes to the same server', complexity: 'O(1)', useCase: 'Session affinity, stateful apps, shopping carts' },
  rnd: { label: 'Random',               short: 'RND', color: 'var(--rnd)', bg: 'var(--rnd-bg)', border: 'var(--rnd-border)', emoji: '🎲', desc: 'Pick a server at random — simple and surprisingly effective', complexity: 'O(1)', useCase: 'Large clusters, stateless microservices' },
}

// Sample client IPs for IP Hash demo
export const SAMPLE_IPS = [
  '192.168.1.1', '10.0.0.42', '172.16.0.5', '192.168.2.100',
  '10.0.0.7',    '172.31.0.1','192.168.0.88','10.0.0.200',
]
