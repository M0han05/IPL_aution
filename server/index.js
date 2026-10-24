import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseSquads } from '../scripts/squads.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const TEAMS = { CSK: 'Chennai Super Kings', MI: 'Mumbai Indians', RCB: 'Royal Challengers Bengaluru', KKR: 'Kolkata Knight Riders', RR: 'Rajasthan Royals', DC: 'Delhi Capitals', SRH: 'Sunrisers Hyderabad', LSG: 'Lucknow Super Giants', GT: 'Gujarat Titans', PBKS: 'Punjab Kings' };

/* ---------- rules (amounts in lakh) ---------- */
const MEGA = { purse: 13000, slab: [2000, 1800, 1800, 1800, 1800], unc: 400, max: 5, maxCap: 5, maxUnc: 2, rtmMax: 4 };
const MAX_PLAYER_PRICE = 2500; // ₹25 Cr ceiling on any single buy
const MINI = { purse: 7500 };
const MAXSQ = 25, MINSQ = 18, MAXOS = 8;
const BID_DEFAULT = 15000, RESET_MS = 10000, RTM_MS = 12000, BREAK_MS = 4500, UNSOLD_MS = 2500;
const TIMER_OPTS = { 5: 5000, 10: 10000, 12: 12000, 15: 15000 };
const inc = b => (b < 100 ? 5 : b < 200 ? 10 : b < 500 ? 20 : 25);

/* ---------- data ---------- */
function loadPlayers() {
  const j = path.join(DATA, 'players.json');
  if (fs.existsSync(j)) return JSON.parse(fs.readFileSync(j, 'utf8'));
  console.log('data/players.json not found: using data/squads.txt without stats or photos. Run "npm run data" for the full dataset.');
  return parseSquads(fs.readFileSync(path.join(DATA, 'squads.txt'), 'utf8')).map((p, i) => ({
    id: i, name: p.name, team: p.team, role: p.role, country: p.country, os: p.country !== 'IN', capped: p.flag !== 'U',
    base: p.base || 100, photo: '', slug: '', m: null, runs: null, sr: null, wkts: null, econ: null,
  }));
}
const PL = loadPlayers();
console.log(`Loaded ${PL.length} players`);

/* ---------- rooms ---------- */
const rooms = new Map();
const mkCode = () => { let c; do c = Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[(Math.random() * 32) | 0]).join(''); while (rooms.has(c)); return c; };
const claimed = r => [...new Set(Object.values(r.members).map(m => m.team).filter(Boolean))];

function view(r) {
  const live = r.phase === 'auction' && (r.paused || r.endsAt);
  const left = !live ? 0 : r.paused ? r.left : Math.max(0, r.endsAt - Date.now());
  return {
    code: r.code, mode: r.mode, phase: r.phase, sub: r.sub, host: r.host, paused: !!r.paused, left, bidMs: r.bidMs || BID_DEFAULT,
    opts: r.opts || { sellNow: false, markUnsold: false, forceUnsold: false, sets: true },
    setLabel: r.setLabel || null, marquee: r.marquee || [],
    members: Object.entries(r.members).map(([cid, m]) => ({ cid, name: m.name, team: m.team, online: !!m.sid })),
    teams: r.teams, cur: r.cur, idx: r.i, total: r.list ? r.list.length : 0, acc: !!r.acc, rtmTeam: r.rtmTeam || null, log: r.log || [],
    chat: (r.chat || []).slice(-40), setOrder: r.setOrder || null,
  };
}
let io;
const push = r => io.to(r.code).emit('state', view(r));
function arm(r, ms, fn) { clearTimeout(r.tmr); r.fn = fn; r.endsAt = Date.now() + ms; r.tmr = setTimeout(fn, ms); }

/* ---------- retention ---------- */
const retCost = (ps, p) => (!p.capped ? MEGA.unc : MEGA.slab[ps.filter(x => x.capped).indexOf(p)]);
function checkRet(r, team, ids) {
  if (!Array.isArray(ids) || new Set(ids).size !== ids.length) return 'Invalid selection';
  const ps = ids.map(i => PL[i]);
  if (ps.some(p => !p || p.team !== team)) return 'You can only retain players from your own squad';
  if (ps.filter(p => p.os).length > MAXOS) return 'Maximum 8 overseas players';
  if (r.mode === 'mini') return ps.length > MAXSQ ? 'Squad limit is 25' : { cost: 0 };
  const cap = ps.filter(p => p.capped).length, unc = ps.length - cap;
  if (ps.length > MEGA.max || cap > MEGA.maxCap || unc > MEGA.maxUnc) return 'Retention limit exceeded (5 total, 5 capped, 2 uncapped)';
  return { cost: ps.reduce((s, p) => s + retCost(ps, p), 0) };
}

/* ---------- auction ---------- */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}
function startAuction(r) {
  const kept = new Set();
  for (const t of Object.values(r.teams)) {
    const ps = t.retained.map(i => PL[i]);
    t.squad = ps.map(p => ({ id: p.id, price: r.mode === 'mega' ? retCost(ps, p) : 0, ret: 1 }));
    t.purse -= t.cost;
    t.rtm = r.mode === 'mega' ? MEGA.rtmMax : 0;
    t.retained.forEach(i => kept.add(i));
  }
  const pool = PL.filter(p => !kept.has(p.id));
  const marqueeIds = new Set((r.marquee || []).filter(id => !kept.has(id)));
  // No auto marquee — only host-selected names open the auction first

  const roleOf = p => {
    if (marqueeIds.has(p.id)) return 'MARQUEE';
    if (p.role === 'WK' || p.role === 'BAT') return 'BAT_WK';
    if (p.role === 'AR') return 'AR';
    return 'BOWL';
  };
  const order = ['MARQUEE', 'BAT_WK', 'AR', 'BOWL'];
  const buckets = { MARQUEE: [], BAT_WK: [], AR: [], BOWL: [] };
  for (const p of pool) buckets[roleOf(p)].push(p.id);
  if (r.opts?.sets === false) {
    r.list = shuffle(pool.map(p => p.id));
  } else {
    r.list = [];
    for (const k of order) r.list.push(...shuffle(buckets[k]));
  }
  r.setBuckets = buckets;
  r.i = 0; r.unsold = []; r.acc = false; r.phase = 'auction';
  nextLot(r);
}
function endAuction(r) { clearTimeout(r.tmr); r.phase = 'end'; r.sub = null; r.cur = null; r.endsAt = 0; push(r); }
function nextLot(r) {
  r.paused = false; r.rtmTeam = null;
  if (Object.values(r.teams).every(t => t.squad.length >= MAXSQ)) return endAuction(r);
  if (r.i >= r.list.length) {
    if (!r.acc && r.unsold.length) { r.list = r.unsold; r.unsold = []; r.i = 0; r.acc = true; }
    else return endAuction(r);
  }
  r.cur = { id: r.list[r.i], bid: 0, by: null, seq: (r.cur?.seq || 0) + 1 };
  r.sub = 'bid';
  const curP = PL[r.cur.id];
  const mid = new Set(r.marquee || []);
  r.setLabel = mid.has(r.cur.id) ? 'MARQUEE' : (curP?.role === 'WK' || curP?.role === 'BAT') ? 'BATTERS / WK' : curP?.role === 'AR' ? 'ALL-ROUNDERS' : 'BOWLERS';
  const pl = PL[r.cur.id];
  r.noBid = !Object.keys(r.teams).some(c => !why(r, c, pl.base, pl)); // nobody is able to bid: skip quickly
  arm(r, r.noBid ? 400 : (r.bidMs || BID_DEFAULT), () => resolve(r));
  push(r);
}
const adv = r => { if (r.sub !== 'break') return; r.i++; nextLot(r); };
function why(r, code, price, p) {
  const t = r.teams[code];
  if (!t) return 'No team';
  if (r.cur.by === code) return 'You are the highest bidder';
  if (t.squad.length >= MAXSQ) return 'Squad is full (25)';
  if (p.os && t.squad.filter(x => PL[x.id].os).length >= MAXOS) return 'Overseas limit (8) reached';
  if (price > MAX_PLAYER_PRICE) return 'Max price is ₹25 Cr for one player';
  if (t.purse < price) return 'Not enough purse';
  if (t.purse - price < Math.max(0, MINSQ - t.squad.length - 1) * 20) return 'Must keep purse to reach 18 players';
  return '';
}
function resolve(r) {
  if (r.sub !== 'bid') return;
  const c = r.cur;
  if (!c.by) {
    r.unsold.push(c.id); r.sub = 'break';
    if (r.noBid) arm(r, 150, () => adv(r));
    else { io.to(r.code).emit('unsold', { id: c.id }); arm(r, UNSOLD_MS, () => adv(r)); }
    return push(r);
  }
  const p = PL[c.id], o = r.mode === 'mega' && r.teams[p.team];
  if (o && p.team !== c.by && o.rtm > 0 && !why(r, p.team, c.bid, p)) {
    r.sub = 'rtm'; r.rtmTeam = p.team;
    arm(r, RTM_MS, () => rtm(r, false));
    return push(r);
  }
  sell(r, c.by, false);
}
function rtm(r, use) {
  if (r.sub !== 'rtm') return;
  if (use) { r.teams[r.rtmTeam].rtm--; sell(r, r.rtmTeam, true); }
  else sell(r, r.cur.by, false);
}
function sell(r, code, viaRtm) {
  const c = r.cur, t = r.teams[code];
  t.squad.push({ id: c.id, price: c.bid }); t.purse -= c.bid;
  r.sub = 'break'; r.rtmTeam = null;
  r.log = [{ id: c.id, team: code, price: c.bid, rtm: viaRtm }, ...(r.log || [])].slice(0, 8);
  io.to(r.code).emit('sold', { id: c.id, team: code, price: c.bid, rtm: viaRtm });
  arm(r, BREAK_MS, () => adv(r));
  push(r);
}

/* ---------- actions ---------- */
function act(r, cid, type, p) {
  const m = r.members[cid], host = r.host === cid, t = m.team && r.teams[m.team];
  switch (type) {
    case 'claim':
      if (r.phase !== 'lobby') return 'Teams are locked';
      if (!TEAMS[p]) return 'Unknown team';
      if (Object.values(r.members).some(x => x !== m && x.team === p)) return 'Team already taken';
      m.team = p; break;
    case 'unclaim':
      if (r.phase !== 'lobby') return 'Teams are locked';
      m.team = null; break;
    case 'release':
      if (!host || r.phase !== 'lobby') return 'Only the host can do this';
      Object.values(r.members).forEach(x => { if (x.team === p) x.team = null; });
      break;
    case 'mode':
      if (!host || r.phase !== 'lobby') return 'Only the host can change the mode';
      if (p !== 'mega' && p !== 'mini') return 'Unknown mode';
      r.mode = p; break;
    case 'retention': {
      if (!host || r.phase !== 'lobby') return 'Only the host can start';
      const cl = claimed(r);
      if (cl.length < 1) return 'At least 1 team is needed';
      r.phase = 'retention'; r.teams = {}; r.bidMs = r.bidMs || BID_DEFAULT;
      cl.forEach(c => (r.teams[c] = { purse: r.mode === 'mega' ? MEGA.purse : MINI.purse, squad: [], rtm: r.mode === 'mega' ? MEGA.rtmMax : 0, ready: false, retained: [], cost: 0, xi: [] }));
      break;
    }
    case 'ret': {
      if (r.phase !== 'retention' || !t || t.ready) return 'Not allowed now';
      const e = checkRet(r, m.team, p);
      if (typeof e === 'string') return e;
      t.retained = p; t.cost = e.cost; t.rtm = r.mode === 'mega' ? MEGA.max - p.length : 0;
      break;
    }
    case 'ready':
      if (r.phase !== 'retention' || !t) return 'Not allowed now';
      t.ready = true; break;
    case 'auction':
      if (!host || r.phase !== 'retention') return 'Only the host can start';
      if (!Object.values(r.teams).every(x => x.ready)) return 'Waiting for all teams to finalize';
      startAuction(r); break;
    case 'bid': {
      if (r.phase !== 'auction' || r.sub !== 'bid' || r.paused) return 'Bidding is closed';
      const pl = PL[r.cur.id], price = r.cur.by ? r.cur.bid + inc(r.cur.bid) : pl.base;
      if (!m.team) return 'Spectators cannot bid';
      if (p !== price) return 'Someone just bid. Try again';
      const e = why(r, m.team, price, pl);
      if (e) return e;
      r.cur.bid = price; r.cur.by = m.team; r.cur.seq = (r.cur.seq || 0) + 1;
      arm(r, Math.max(r.endsAt - Date.now(), Math.min(RESET_MS, r.bidMs || BID_DEFAULT)), () => resolve(r));
      break;
    }
    case 'rtm':
      if (r.sub !== 'rtm' || r.paused || m.team !== r.rtmTeam) return 'Not allowed now';
      clearTimeout(r.tmr); rtm(r, !!p); break;
    case 'pause':
      if (!host || r.phase !== 'auction' || (r.sub !== 'bid' && r.sub !== 'rtm')) return 'Cannot pause now';
      if (!r.paused) { r.left = Math.max(0, r.endsAt - Date.now()); clearTimeout(r.tmr); r.paused = true; }
      else { r.paused = false; arm(r, r.left, r.fn); }
      break;
    case 'sellnow':
      if (!host || !(r.opts?.sellNow) || r.sub !== 'bid' || r.paused || !r.cur.by) return 'Not allowed now';
      clearTimeout(r.tmr); resolve(r); break;
    case 'skip':
      if (!host || !(r.opts?.markUnsold) || r.sub !== 'bid' || r.paused || r.cur.by) return 'Not allowed now';
      clearTimeout(r.tmr); resolve(r); break;
    case 'forceUnsold':
      if (!host || !(r.opts?.forceUnsold) || r.sub !== 'bid' || r.paused) return 'Not allowed now';
      clearTimeout(r.tmr);
      r.cur.by = null; r.cur.bid = 0;
      resolve(r); break;
    case 'timer': {
      if (!host || r.phase !== 'lobby') return 'Only the host can set timer in lobby';
      const ms = TIMER_OPTS[p];
      if (!ms) return 'Timer must be 5, 10, 12 or 15 seconds';
      r.bidMs = ms;
      break;
    }
    case 'opts': {
      if (!host || (r.phase !== 'lobby' && r.phase !== 'retention')) return 'Only host can change options before auction';
      r.opts = {
        sellNow: !!p.sellNow,
        markUnsold: !!p.markUnsold,
        forceUnsold: !!p.forceUnsold,
        sets: p.sets !== false,
      };
      break;
    }
    case 'marquee': {
      if (!host || r.phase !== 'retention') return 'Pick marquee in retention phase';
      if (!Array.isArray(p)) return 'Invalid marquee list';
      r.marquee = p.slice(0, 15).map(Number).filter(i => PL[i]);
      break;
    }
    case 'endAuction': {
      if (!host || r.phase !== 'auction') return 'Only host can end auction';
      const all18 = Object.values(r.teams).every(t => t.squad.length >= MINSQ);
      if (!all18) return 'Every team must have at least 18 players before you can end';
      clearTimeout(r.tmr);
      endAuction(r);
      break;
    }
    case 'jumpSet': {
      if (!host || r.phase !== 'auction') return 'Only host can change set';
      const set = String(p || '');
      const order = ['MARQUEE', 'BAT_WK', 'AR', 'BOWL'];
      if (!order.includes(set)) return 'Unknown set';
      // Rebuild remaining list: put chosen set first among remaining players
      const done = new Set();
      for (const t of Object.values(r.teams)) t.squad.forEach(x => done.add(x.id));
      (r.list || []).slice(0, r.i + 1).forEach(id => done.add(id));
      const marqueeIds = new Set(r.marquee || []);
      const roleOf = id => {
        const pl = PL[id];
        if (!pl) return 'BOWL';
        if (marqueeIds.has(id)) return 'MARQUEE';
        if (pl.role === 'WK' || pl.role === 'BAT') return 'BAT_WK';
        if (pl.role === 'AR') return 'AR';
        return 'BOWL';
      };
      const remaining = (r.list || []).slice(r.i + (r.sub === 'break' ? 1 : 0)).filter(id => !done.has(id));
      // if mid-lot, keep current then jump
      const rest = remaining.filter(id => id !== r.cur?.id);
      const buckets = { MARQUEE: [], BAT_WK: [], AR: [], BOWL: [] };
      for (const id of rest) buckets[roleOf(id)].push(id);
      const newList = [];
      // chosen set first
      newList.push(...shuffle(buckets[set] || []));
      for (const k of order) if (k !== set) newList.push(...shuffle(buckets[k] || []));
      if (r.cur && r.sub === 'bid') {
        r.list = [r.cur.id, ...newList];
        r.i = 0;
      } else {
        r.list = newList;
        r.i = 0;
        nextLot(r);
      }
      r.setOrder = [set, ...order.filter(x => x !== set)];
      break;
    }
    case 'xi': {
      if (r.phase !== 'end' || !t) return 'Pick playing XI after auction ends';
      if (!Array.isArray(p) || p.length > 11) return 'Select up to 11 players';
      const ids = p.map(Number);
      if (ids.some(i => !t.squad.some(x => x.id === i))) return 'Only squad players allowed';
      t.xi = ids.slice(0, 11);
      break;
    }
    default: return 'Unknown action';
  }
  return null;
}

/* ---------- server ---------- */
const app = express();
const srv = http.createServer(app);
io = new Server(srv, { cors: { origin: true } });
const dist = path.join(ROOT, 'client', 'dist');
app.use(express.static(dist));
app.use((q, s) => s.sendFile(path.join(dist, 'index.html'), e => e && s.status(404).send('Run "npm run build" first, or use "npm run dev".')));

io.on('connection', s => {
  let r = null, cid = null;
  s.on('join', (d, ack) => {
    try {
      const name = String(d?.name || '').trim().slice(0, 20);
      const id = String(d?.cid || '');
      if (!name || id.length < 8) return ack?.({ ok: false, error: 'Enter your name' });
      let room;
      if (d.create) { const code = mkCode(); room = { code, host: id, mode: 'mega', phase: 'lobby', members: {}, teams: {}, bidMs: BID_DEFAULT, opts: { sellNow: false, markUnsold: false, forceUnsold: false, sets: true }, marquee: [], chat: [], setOrder: ['MARQUEE', 'BAT_WK', 'AR', 'BOWL'] }; rooms.set(code, room); }
      else { room = rooms.get(String(d.code || '').toUpperCase().trim()); if (!room) return ack?.({ ok: false, error: 'Room not found' }); }
      if (!room.members[id] && Object.keys(room.members).length >= 30) return ack?.({ ok: false, error: 'Room is full' });
      r = room; cid = id;
      const m = (r.members[cid] = r.members[cid] || { name, team: null });
      m.name = name; m.sid = s.id; clearTimeout(r.gc);
      s.join(r.code);
      s.emit('catalog', { players: PL, teams: TEAMS });
      if (r.chat?.length) s.emit('chat', r.chat);
      ack?.({ ok: true, code: r.code });
      push(r);
    } catch (e) { console.error(e); ack?.({ ok: false, error: 'Server error' }); }
  });
  s.on('act', (type, p, ack) => {
    if (!r || !r.members[cid]) return ack?.({ ok: false, error: 'Join a room first' });
    let e;
    try { e = act(r, cid, type, p); } catch (x) { console.error(x); e = 'Server error'; }
    ack?.(e ? { ok: false, error: e } : { ok: true });
    push(r);
  });
  s.on('chat', (msg, ack) => {
    if (!r || !r.members[cid]) return ack?.({ ok: false });
    const text = String(msg?.text || '').trim().slice(0, 300);
    const gif = String(msg?.gif || '').trim().slice(0, 400);
    if (!text && !gif) return ack?.({ ok: false });
    // allow http(s) gif urls only
    if (gif && !/^https:\/\//i.test(gif)) return ack?.({ ok: false, error: 'Invalid gif url' });
    const m = r.members[cid];
    r.chat = [...(r.chat || []), { id: Date.now() + Math.random(), name: m.name, team: m.team, text, gif, at: Date.now() }].slice(-50);
    io.to(r.code).emit('chat', r.chat);
    ack?.({ ok: true });
  });
  s.on('disconnect', () => {
    if (!r) return;
    const m = r.members[cid];
    if (m && m.sid === s.id) { m.sid = null; push(r); }
    if (Object.values(r.members).every(x => !x.sid)) {
      const rr = r;
      rr.gc = setTimeout(() => { if (Object.values(rr.members).every(x => !x.sid)) { clearTimeout(rr.tmr); rooms.delete(rr.code); } }, 36e5);
    }
  });
});
const PORT = process.env.PORT || 3001;
srv.listen(PORT, '0.0.0.0', () => console.log(`Auction server on http://0.0.0.0:${PORT} (open from phone: http://YOUR-PC-IP:${PORT})`));
