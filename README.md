# Load Balancer Playground

Interactive playground to learn, test, and compare all major load balancing algorithms — built entirely in Node.js.

**Live Demo:** https://aakashporwal1602.github.io/load-balancer-playground

---

## Algorithms

| Algorithm | Complexity | Best For |
|---|---|---|
| Round Robin | O(1) | Identical servers, stateless APIs |
| Weighted Round Robin | O(1) | Different server capacities |
| Least Connections | O(N) | Variable-length requests, WebSockets |
| IP Hash | O(1) | Session affinity, stateful apps |
| Random | O(1) | Large clusters, microservices |

---

## Features

- **Live visualization** — watch requests fly to servers in real-time
- **5 algorithms** — switch instantly, see behavior change
- **Server config** — adjust weight and latency per server
- **Add/remove servers** — see how each algorithm adapts
- **IP Hash mapping** — shows exactly which IP maps to which server
- **Request log** — request-by-request breakdown
- **Learn tab** — mechanics, tradeoffs, best/worst cases, real usage
- **Code tab** — Node.js implementations + Nginx config

---

## Getting Started

```bash
git clone https://github.com/aakashporwal1602/load-balancer-playground.git
cd load-balancer-playground
npm install
npm start
npm run deploy   # → GitHub Pages
```

---

Built by [Aakash Porwal](https://aakashporwal1602.github.io/aakash-porwal-portfolio) — Senior Software Engineer, Distributed Systems.
