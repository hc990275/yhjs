#!/usr/bin/env node
/**
 * 🚀 S5公益代理 - 负载分机专用版 (Slave Node)
 * 仅包含极致 SOCKS5 代理和账户同步接收接口，彻底剥离 TG 机器人。
 *
 * ⬇️ 【日常运维命令】(使用 pm2 守护进程):
 * 1. 启动并应用新代码:    pm2 restart all
 * 2. 设置开机自启(两步):  pm2 startup  (执行后请复制它提示的命令运行)
 *                        pm2 save
 * 3. 查看运行日志:        pm2 logs
 * 
 * ⬇️ 【Alpine 首次一键安装环境命令】 (没装过环境才需要跑):
 * apk update && apk add --no-cache nodejs npm && npm install -g pm2
 */

// ==================== 分机配置区 ====================
const SLAVE_PASSWORD = '9902999'; // 分机统一验证密码
const CUSTOM_PORT = 20273; // 你可以随意修改这里的自定义端口
const PORT = parseInt(process.env.SERVER_PORT || process.env.PORT || CUSTOM_PORT); // 翼龙面板自动分配端口优先级最高
// ====================================================

const fs = require('fs');
const os = require('os');
const http = require('http');

// ====== 探测底层母机 BBR 状态 ======
try {
    const tcpAlgo = fs.readFileSync('/proc/sys/net/ipv4/tcp_congestion_control', 'utf8').trim();
    console.log(`[系统探测] 当前底层母机使用的拥塞控制算法是: 【${tcpAlgo}】`);
} catch (e) {
    console.log(`[系统探测] 权限不足或被隔离，无法读取母机拥塞控制配置。`);
}
// ===================================

const net = require('net');
const dns = require('dns');
const path = require('path');

// 极致极速：绕过 Node.js libuv 底层默认仅有 4 个线程的 getaddrinfo 阻塞池！
const dnsPromises = dns.promises;
const dnsCache = new Map();
const dnsPending = new Map();

const extremeResolveDns = async (hostname) => {
  const cached = dnsCache.get(hostname);
  if (cached && Date.now() < cached.expiry) return cached.ip;
  if (dnsPending.has(hostname)) return dnsPending.get(hostname);

  const p = (async () => {
    try {
      const ips = await dnsPromises.resolve4(hostname);
      if (ips && ips.length > 0) return ips[0];
    } catch (e) {
      try {
        const ipv6s = await dnsPromises.resolve6(hostname);
        if (ipv6s && ipv6s.length > 0) return ipv6s[0];
      } catch (e2) {
        return new Promise((res, rej) => dns.lookup(hostname, (err, ip) => err ? rej(err) : res(ip)));
      }
    }
    throw new Error('DNS Fail');
  })();

  dnsPending.set(hostname, p);
  try {
    const ip = await p;
    dnsCache.set(hostname, { ip, expiry: Date.now() + 60000 });
    return ip;
  } finally {
    dnsPending.delete(hostname);
  }
};

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of dnsCache) { if (now >= v.expiry) dnsCache.delete(k); }
}, 60000).unref();

// ========== 数据存储 ==========
const dataFile = path.join(__dirname, 'proxy_users.json');

let globalAccounts = [];
const accountByAuth = new Map();
const userConnCount = new Map();
const MAX_CONN_PER_USER = 5000;

let masterUrl = null; // 由主机推送时下发
let masterToken = null; // 由主机推送时下发
const trafficDelta = new Map(); // 记录增量消耗的流量 { username: bytes }

// 心跳：每30秒上报消耗的流量
setInterval(() => {
  if (!masterUrl || trafficDelta.size === 0) return;
  const payloadStr = JSON.stringify(Object.fromEntries(trafficDelta));
  trafficDelta.clear(); // 清空，重新累计
  
  const urlObj = new URL(`${masterUrl}/api/s5-report-traffic`);
  const reqModule = urlObj.protocol === 'https:' ? require('https') : require('http');
  
  const req = reqModule.request(urlObj, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payloadStr),
      'Authorization': masterToken || ''
    },
    timeout: 5000
  });

  req.on('error', e => console.error('[流量上报] 失败:', e.message));
  req.on('timeout', () => req.destroy());
  req.write(payloadStr);
  req.end();
}, 30000).unref();

const rebuildIndex = () => {
  accountByAuth.clear();
  globalAccounts.forEach(a => {
    accountByAuth.set(`${a.username}:${a.password}`, a);
  });
  console.log(`[数据加载] 成功加载 ${globalAccounts.length} 个账户数据。`);
};

const DataManager = {
  load() {
    if (!fs.existsSync(dataFile)) {
      return [];
    }
    try {
      return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    } catch (e) { 
      console.error('读取 proxy_users.json 失败:', e.message);
      return []; 
    }
  },
  save(accounts) {
    const json = JSON.stringify(accounts, null, 2);
    fs.writeFile(dataFile, json, 'utf8', (err) => {
      if (err) console.error('[DataManager] save error:', err.message);
    });
  }
};

globalAccounts = DataManager.load();
rebuildIndex();

// ========== 极速 SOCKS5 代理核心 ==========
function handleSocks5(socket, initialBuffer) {
  let stage = 0;
  let authUser = null;

  socket.setNoDelay(true);
  socket.setKeepAlive(true, 30000);
  if (socket.readableHighWaterMark < 65536) {
    try { socket._readableState.highWaterMark = 65536; } catch (e) { }
  }
  socket.setTimeout(120000);
  socket.once('timeout', () => socket.destroy());

  const onData = (data) => {
    try {
      if (stage === 0) {
        if (data[0] !== 0x05) return socket.destroy();
        let supportsAuth = false;
        for (let i = 2; i < 2 + data[1]; i++) { if (data[i] === 0x02) supportsAuth = true; }
        if (!supportsAuth) { socket.write(Buffer.from([0x05, 0xFF])); return socket.destroy(); }
        socket.write(Buffer.from([0x05, 0x02]));
        stage = 1;
      }
      else if (stage === 1) {
        if (data[0] !== 0x01) return socket.destroy();
        const uLen = data[1];
        const user = data.slice(2, 2 + uLen).toString('utf8');
        const pLen = data[2 + uLen];
        const pass = data.slice(3 + uLen, 3 + uLen + pLen).toString('utf8');

        const account = accountByAuth.get(`${user}:${pass}`);
        if (!account || account.trafficUsed >= account.trafficLimit || account.status !== 'active') {
          socket.write(Buffer.from([0x01, 0x01]));
          return socket.destroy();
        }
        
        const connCount = userConnCount.get(user) || 0;
        if (connCount >= MAX_CONN_PER_USER) {
          socket.write(Buffer.from([0x01, 0x01]));
          return socket.destroy();
        }
        userConnCount.set(user, connCount + 1);
        socket.once('close', () => {
          const c = userConnCount.get(user) || 1;
          if (c <= 1) userConnCount.delete(user);
          else userConnCount.set(user, c - 1);
        });

        authUser = account;
        socket.write(Buffer.from([0x01, 0x00]));
        stage = 2;
      }
      else if (stage === 2) {
        if (data[0] !== 0x05 || data[1] !== 0x01) {
          socket.write(Buffer.from([0x05, 0x07, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
          return socket.destroy();
        }

        let atyp = data[3], dstAddr, dstPort, offset = 4;

        if (atyp === 0x01) {
          dstAddr = `${data[4]}.${data[5]}.${data[6]}.${data[7]}`; offset += 4;
        } else if (atyp === 0x03) {
          const dLen = data[4]; dstAddr = data.slice(5, 5 + dLen).toString('utf8'); offset += 1 + dLen;
        } else if (atyp === 0x04) {
          const parts = [];
          for (let i = 0; i < 16; i += 2) parts.push(data.readUInt16BE(4 + i).toString(16));
          dstAddr = parts.join(':'); offset += 16;
        } else {
          socket.write(Buffer.from([0x05, 0x08, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
          return socket.destroy();
        }

    