import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import './styles.css';

const socket = io();
const makeId = () => {
  try { if (crypto.randomUUID) return crypto.randomUUID(); } catch {}
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
};
const cid = localStorage.cid || (localStorage.cid = makeId());
const COL = { CSK: '#e0a800', MI: '#0a58b5', RCB: '#c8102e', KKR: '#5b2d91', RR: '#ea1a85', DC: '#1f7fd1', SRH: '#f26522', LSG: '#0f8fb3', GT: '#1c4a6e', PBKS: '#c4163c' };
const ROLE = { BAT: 'Batter', WK: 'Wicketkeeper', AR: 'All-rounder', BOWL: 'Bowler' };
const SLAB = [1800, 1400, 1100, 1800, 1400], UNC = 300;
const cr = l => (l >= 100 ? `₹${+(l / 100).toFixed(2)} Cr` : `₹${l} L`);
const inc = b => (b < 100 ? 5 : b < 200 ? 10 : b < 500 ? 20 : 25);
const osCount = (t, P) => t.squad.filter(x => P[x.id].os).length;

function Logo({ code, s = 60 }) {
  const [step, setStep] = useState(0); // 0=png, 1=svg, 2=text
  useEffect(() => setStep(0), [code]);
  const src = step === 0 ? `/logos/${code}.png` : `/logos/${code}.svg`;
  return (
    <div className="logo" style={{ width: s, height: s, fontSize: s / 3.2, background: step > 1 ? (COL[code] || '#445') : '#fff', color: '#fff', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, overflow: 'hidden', flexShrink: 0 }}>
      {step > 1 ? code : <img src={src} alt={code} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => setStep(x => x + 1)} />}
    </div>
  );
}
function Photo({ p, s = 72 }) {
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [p.id, p.photo]);
  const ini = p.name.split(' ').map(w => w[0]).slice(0, 2).join('');
  return (
    <div className="ph" style={{ width: s, height: s, fontSize: s / 3, background: COL[p.team] || '#445' }}>
      {p.photo && !bad ? <img src={p.photo} alt="" onError={() => setBad(true)} /> : ini}
    </div>
  );
}
function Stats({ p }) {
  const f = (v, d) => (v == null ? '—' : d ? Number(v).toFixed(d) : v);
  const it = [['Matches', f(p.m)]];
  if (p.role !== 'BOWL') it.push(['Runs', f(p.runs)], ['Strike rate', f(p.sr, 1)]);
  if (p.role === 'BOWL' || p.role === 'AR') it.push(['Wickets', f(p.wkts)], ['Economy', f(p.econ, 2)]);
  return <div className="stats">{it.map(([k, v]) => <div key={k}><b>{v}</b><span>{k}</span></div>)}</div>;
}

function Home({ join, flash }) {
  const [name, setName] = useState(localStorage.name || '');
  const [code, setCode] = useState(new URLSearchParams(location.search).get('room') || '');
  const [online, setOnline] = useState(socket.connected);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    socket.on('connect', on); socket.on('disconnect', off);
    setOnline(socket.connected);
    return () => { socket.off('connect', on); socket.off('disconnect', off); };
  }, []);
  const ok = name.trim().length > 0;
  return (
    <div className="wrap home-wrap">
      <div className="top">
        <div className="brand">IPL <span>AUCTION</span> ROOM</div>
        <span className="pill" style={{ color: online ? 'var(--ok)' : 'var(--ac2)' }}>{online ? '● Live' : '○ Connecting…'}</span>
      </div>

      <h1>Mock <em>IPL auction</em> with friends</h1>
      <p className="mu home-lead">Create a room, share the code, pick franchises and bid live — retentions, RTM, overseas limit and real purse rules.</p>

      <div className="home-info card">
        <h3 style={{ marginTop: 0 }}>How it works</h3>
        <ol className="home-steps">
          <li><b>Create</b> a room (you become host) or <b>Join</b> with a 5-letter code.</li>
          <li>Each person picks one <b>franchise</b>. Host can start even with 1 team.</li>
          <li><b>Retention</b> (Mega): keep up to 6 core players, then RTM cards for the rest.</li>
          <li><b>Auction</b>: bid live. Max <b>8 overseas</b>, squad <b>18–25</b> players.</li>
          <li>Host can <b>Pause / Continue</b>. After the end, <b>Analyse &amp; rank</b> squads.</li>
        </ol>
        <div className="home-chips">
          <span className="chip p">Mega ₹130 Cr</span>
          <span className="chip p">Mini ₹75 Cr</span>
          <span className="chip">No AI teams</span>
          <span className="chip">Phone friendly</span>
        </div>
      </div>

      <div className="card grid home-actions" style={{ marginTop: 14 }}>
        <label className="mu">Your name</label>
        <input placeholder="Enter your name" value={name} maxLength={20} onChange={e => setName(e.target.value)} />
        <button className="btn big" disabled={!ok} onClick={() => join(null, name.trim(), true)}>Create a room</button>
        <div className="mu" style={{ textAlign: 'center' }}>— or join a friend —</div>
        <label className="mu">Room code</label>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <input placeholder="ABCDE" value={code} maxLength={5} style={{ textTransform: 'uppercase', letterSpacing: 4 }} onChange={e => setCode(e.target.value.toUpperCase())} />
          <button className="btn sec" disabled={!ok || code.trim().length < 5} onClick={() => join(code.trim().toUpperCase(), name.trim(), false)}>Join</button>
        </div>
        <p className="mu" style={{ margin: 0, fontSize: 12 }}>Tip: if you left a room by mistake, enter the same code + same name to rejoin.</p>
      </div>
    </div>
  );
}

function Lobby({ rs, cat, me, act, host }) {
  const link = `${location.origin}/?room=${rs.code}`;
  const taken = Object.fromEntries(rs.members.filter(m => m.team).map(m => [m.team, m]));
  const n = Object.keys(taken).length;
  return (
    <div className="grid">
      <div className="card row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h2>Pick your franchise</h2>
          <div className="mu">Share the code or link. Each friend picks one open team. Only picked teams bid.</div>
        </div>
        <div className="row">
          <button className="btn sec" onClick={() => navigator.clipboard?.writeText(link)}>Copy invite link</button>
          {host && <div className="seg">{['mega', 'mini'].map(m => <button key={m} className={rs.mode === m ? 'on' : ''} onClick={() => act('mode', m)}>{m === 'mega' ? 'Mega' : 'Mini'}</button>)}</div>}
        </div>
      </div>
      <div className="mu">{rs.mode === 'mega' ? 'Mega: ₹130 Cr purse, up to 6 retentions (5 capped + 2 uncapped), RTM cards for the rest.' : 'Mini: ₹75 Cr purse, keep any players free, no RTM.'}</div>
      <div className="teams">
        {Object.entries(cat.teams).map(([c, nme]) => {
          const m = taken[c], mine = m && m.cid === cid;
          return (
            <button key={c} className={`tc ${mine ? 'mine' : ''} ${m && !mine ? 'taken' : ''}`} disabled={m && !mine && !host} onClick={() => { if (m && !mine) return; act(mine ? 'unclaim' : 'claim', c); }}>
              <Logo code={c} s={78} /><b>{c}</b><small>{nme}</small>
              <div className="mu" style={{ marginTop: 8 }}>{m ? (mine ? 'You' : m.name) : 'Open'}</div>
              {host && m && !mine && <div className="mu" style={{ color: 'var(--ac2)', marginTop: 6, textDecoration: 'underline' }} onClick={e => { e.stopPropagation(); act('release', c); }}>Release team</div>}
            </button>
          );
        })}
      </div>
      {host && (
        <div className="card" style={{ display: 'grid', gap: 14 }}>
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div className="mu" style={{ marginBottom: 6 }}>Bid timer</div>
              <div className="seg">{[5, 10, 12, 15].map(s => (
                <button key={s} className={(rs.bidMs || 15000) === s * 1000 ? 'on' : ''} onClick={() => act('timer', s)}>{s}s</button>
              ))}</div>
            </div>
            <div className="mu">Rules: min 18 / max 25 · max 8 overseas</div>
          </div>
          <div>
            <div className="mu" style={{ marginBottom: 6 }}>Host tools during auction (off = pure live feel)</div>
            <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
              {[
                ['sellNow', 'Sell now'],
                ['markUnsold', 'Mark unsold'],
                ['forceUnsold', 'Force unsold'],
                ['sets', 'Set-wise order'],
              ].map(([k, label]) => {
                const on = (rs.opts || {})[k] !== false && (k === 'sets' ? (rs.opts?.sets !== false) : !!(rs.opts || {})[k]);
                const next = { sellNow: !!rs.opts?.sellNow, markUnsold: !!rs.opts?.markUnsold, forceUnsold: !!rs.opts?.forceUnsold, sets: rs.opts?.sets !== false, [k]: !on };
                if (k === 'sets') next.sets = !((rs.opts?.sets) !== false);
                return (
                  <button key={k} className={`btn sec ${on ? '' : ''}`} style={{ opacity: on ? 1 : 0.55, borderColor: on ? 'var(--ac)' : undefined }} onClick={() => act('opts', next)}>
                    {on ? '✓ ' : ''}{label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
      <div className="card row" style={{ justifyContent: 'space-between' }}>
        <div className="mu">In room: {rs.members.map(m => `${m.name}${m.team ? ` (${m.team})` : ''}`).join(', ')}</div>
        {host ? <button className="btn" disabled={n < 1} onClick={() => act('retention')}>{n < 1 ? 'Pick a team first' : n === 1 ? 'Start solo (1 team)' : `Continue with ${n} teams`}</button> : <span className="mu">Waiting for the host to start...</span>}
      </div>
    </div>
  );
}

function Retention({ rs, cat, me, act, host }) {
  const P = cat.players, mega = rs.mode === 'mega';
  const t = me.team && rs.teams[me.team];
  const roster = t ? P.filter(p => p.team === me.team) : [];
  const sel = t ? t.retained : [];
  const ps = sel.map(i => P[i]);
  const nc = ps.filter(p => p.capped).length, nu = ps.length - nc;
  const cost = t ? t.cost : 0;
  const allReady = Object.values(rs.teams).every(x => x.ready);
  const blocked = p => !sel.includes(p.id) && mega && (ps.length >= 6 || (p.capped ? nc >= 5 : nu >= 2));
  const price = p => { const i = sel.indexOf(p.id); if (i < 0 || !mega) return ''; return cr(p.capped ? SLAB[ps.filter(x => x.capped).indexOf(p)] : UNC); };
  const toggle = p => { if (t.ready) return; act('ret', sel.includes(p.id) ? sel.filter(i => i !== p.id) : [...sel, p.id]); };
  return (
    <div className="grid">
      {t ? (
        <>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <div className="chip p">{mega ? 'MEGA AUCTION' : 'MINI AUCTION'}</div>
              <h1>Build your <em>core squad</em></h1>
              <div className="mu">{mega ? 'Retain up to 6 players from your roster. Capped slabs 18, 14, 11, 18, 14 Cr. Uncapped 3 Cr each.' : 'Keep any players for free. Everyone else goes to the pool.'}</div>
            </div>
            <div className="card"><div className="mu">REMAINING PURSE</div><b style={{ fontSize: 32, color: 'var(--ok)' }}>{cr(t.purse - cost)}</b></div>
          </div>
          <div className="stat4">
            <div className="card sc"><div className="mu">TOTAL SLOTS</div><b>{ps.length}</b><span className="mu"> / {mega ? 6 : 25}</span></div>
            <div className="card sc"><div className="mu">CAPPED</div><b>{nc}</b><span className="mu"> / {mega ? 5 : '-'}</span></div>
            <div className="card sc"><div className="mu">UNCAPPED</div><b>{nu}</b><span className="mu"> / {mega ? 2 : '-'}</span></div>
            <div className="card sc o"><div className="mu">RTM CARDS</div><b>{t.rtm}</b><div className="mu">Available in the auction</div></div>
          </div>
          <div className="players">
            {roster.length === 0 && <div className="mu">No players from {me.team} in the data file.</div>}
            {roster.map(p => (
              <button key={p.id} className={`pc ${sel.includes(p.id) ? 'on' : ''}`} disabled={t.ready || blocked(p)} onClick={() => toggle(p)}>
                <Photo p={p} s={84} />
                <span className={`chip ${p.capped ? '' : 'u'}`}>{p.capped ? 'CAPPED' : 'UNCAPPED'}</span>
                <div style={{ fontWeight: 800, marginTop: 6 }}>{p.name}</div>
                <div className={`mu ${p.os ? 'os' : ''}`}>{ROLE[p.role]}</div>
                <div style={{ color: 'var(--ac)', fontWeight: 800, minHeight: 18 }}>{price(p)}</div>
              </button>
            ))}
          </div>
        </>
      ) : <div className="card">You are spectating. Pick a team in the lobby next time to take part.</div>}
      <div className="card row" style={{ justifyContent: 'space-between' }}>
        <div className="mu">{Object.entries(rs.teams).map(([c, x]) => `${c}: ${x.ready ? 'ready' : 'choosing'}`).join('  |  ')}</div>
        {host && rs.opts?.sets !== false && (
          <div className="card" style={{ marginTop: 8 }}>
            <h3 style={{ marginTop: 0 }}>Marquee set (host only)</h3>
            <div className="mu" style={{ marginBottom: 8 }}>Pick up to 10 star players (host only). If you pick any, they open the auction first (shuffled). If you pick none, auction starts by role sets only — no Marquee tab.</div>
            <div className="row" style={{ flexWrap: 'wrap', gap: 6, maxHeight: 140, overflowY: 'auto' }}>
              {P.filter(p => !Object.values(rs.teams).some(tt => (tt.retained || []).includes(p.id)))
                .slice()
                .sort((a, b) => (b.base || 0) - (a.base || 0))
                .slice(0, 40)
                .map(p => {
                  const on = (rs.marquee || []).includes(p.id);
                  return (
                    <button key={p.id} className="btn sec" style={{ opacity: on ? 1 : 0.6, padding: '6px 10px', fontSize: 12 }} onClick={() => {
                      const cur = rs.marquee || [];
                      const next = on ? cur.filter(i => i !== p.id) : (cur.length >= 10 ? cur : [...cur, p.id]);
                      act('marquee', next);
                    }}>{on ? '★ ' : ''}{p.name}</button>
                  );
                })}
            </div>
            <div className="mu" style={{ marginTop: 6 }}>{(rs.marquee || []).length}/10 selected</div>
          </div>
        )}
        <div className="row">
          {t && !t.ready && <button className="btn" onClick={() => act('ready')}>{sel.length ? 'Finalize core' : 'Skip retentions'}</button>}
          {host && <button className="btn" disabled={!allReady} onClick={() => act('auction')}>{allReady ? 'Start auction' : 'Waiting for teams'}</button>}
        </div>
      </div>
    </div>
  );
}


function TeamsBoard({ rs, cat, me }) {
  const P = cat.players;
  const groups = [
    { key: 'BAT', label: 'Batters' },
    { key: 'WK', label: 'Wicketkeepers' },
    { key: 'AR', label: 'All-rounders' },
    { key: 'BOWL', label: 'Bowlers' },
  ];
  return (
    <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
      <div className="mu" style={{ marginBottom: 10 }}>Purse · squad by role · RTM — visible to everyone</div>
      {Object.entries(rs.teams).map(([code, tm]) => {
        const spent = tm.squad.reduce((s, x) => s + x.price, 0);
        const byRole = { BAT: [], WK: [], AR: [], BOWL: [] };
        tm.squad.forEach(x => {
          const pl = P[x.id];
          if (!pl) return;
          const k = byRole[pl.role] ? pl.role : 'BAT';
          byRole[k].push({ ...x, pl });
        });
        return (
          <div key={code} className={`team-block ${me.team === code ? 'me' : ''}`}>
            <div className="row" style={{ width: '100%', marginBottom: 8 }}>
              <Logo code={code} s={40} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>{code}</b> <span className="mu">{rs.members.find(m => m.team === code)?.name || '—'}</span>
                <small>{tm.squad.length}/25 · OS {osCount(tm, P)}/8 · RTM {tm.rtm}</small>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <b style={{ color: 'var(--ok)' }}>{cr(tm.purse)}</b>
                <small>Spent {cr(spent)}</small>
              </div>
            </div>
            {tm.squad.length === 0 && <div className="mu" style={{ paddingLeft: 8 }}>No players yet</div>}
            {groups.map(g => {
              const list = byRole[g.key];
              if (!list.length) return null;
              return (
                <div key={g.key} className="role-group">
                  <div className="role-label">{g.label} ({list.length})</div>
                  {list.map(x => (
                    <div key={x.id} className="row squad-line">
                      <span className="squad-name">{x.pl.name}{x.ret ? ' (R)' : ''}{x.pl.os ? ' · OS' : ''}</span>
                      <span className="mu">{x.price ? cr(x.price) : 'Ret'}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function PlayersBrowser({ cat, onClose, marqueeIds }) {
  const P = cat.players;
  const hasMarquee = Array.isArray(marqueeIds) && marqueeIds.length > 0;
  const [tab, setTab] = useState(hasMarquee ? 'MARQUEE' : 'BAT');
  const tabs = [
    ...(hasMarquee ? [['MARQUEE', 'Marquee']] : []),
    ['BAT', 'Batters'],
    ['WK', 'WK'],
    ['AR', 'All-rounders'],
    ['BOWL', 'Bowlers'],
    ['ALL', 'All'],
  ];
  const list = useMemo(() => {
    let arr = [...P];
    if (tab === 'MARQUEE' && hasMarquee) {
      const set = new Set(marqueeIds);
      arr = arr.filter(p => set.has(p.id));
    } else if (tab === 'BAT' || tab === 'WK' || tab === 'AR' || tab === 'BOWL') {
      arr = arr.filter(p => p.role === tab);
    }
    arr.sort((a, b) => a.name.localeCompare(b.name));
    return arr;
  }, [P, tab, marqueeIds, hasMarquee]);

  return (
    <div className="sheet" onClick={onClose}>
      <div className="sheet-body" onClick={e => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>Players list</h3>
          <button className="btn sec" onClick={onClose}>Close</button>
        </div>
        <div className="seg" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
          {tabs.map(([k, label]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
        <div className="mu" style={{ marginBottom: 8 }}>{list.length} players · A–Z</div>
        <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
          {list.map(p => (
            <div key={p.id} className="trow" style={{ cursor: 'default' }}>
              <Photo p={p} s={36} />
              <div style={{ flex: 1 }}>
                <b style={{ fontSize: 13 }}>{p.name}</b>
                <small>{ROLE[p.role]} · {p.os ? p.country : 'IND'} · {p.capped ? 'Capped' : 'Uncapped'} · base {cr(p.base)}</small>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Auction({ rs, cat, me, act, host, left }) {
  const P = cat.players, c = rs.cur, p = P[c.id], my = me.team && rs.teams[me.team];
  const [showTeams, setShowTeams] = useState(false);
  const [showPlayers, setShowPlayers] = useState(false);
  const price = c.by ? c.bid + inc(c.bid) : p.base;
  let why = '';
  if (!my) why = 'Spectating';
  else if (rs.sub !== 'bid') why = 'Wait for the next lot';
  else if (rs.paused) why = 'Auction paused';
  else if (c.by === me.team) why = 'You are leading';
  else if (my.squad.length >= 25) why = 'Squad full';
  else if (p.os && osCount(my, P) >= 8) why = 'Overseas limit reached';
  else if (my.purse < price) why = 'Not enough purse';
  else if (my.purse - price < Math.max(0, 17 - my.squad.length) * 20) why = 'Keep purse for 18 players';
  const secs = Math.ceil(left / 1000);
  const rtmMine = rs.sub === 'rtm' && rs.rtmTeam === me.team;
  const lead = c.by;
  return (
    <div className="g2">
      {showTeams && (
        <div className="sheet" onClick={() => setShowTeams(false)}>
          <div className="sheet-body" onClick={e => e.stopPropagation()}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>Teams overview</h3>
              <button className="btn sec" onClick={() => setShowTeams(false)}>Close</button>
            </div>
            <TeamsBoard rs={rs} cat={cat} me={me} />
          </div>
        </div>
      )}
      {showPlayers && <PlayersBrowser cat={cat} onClose={() => setShowPlayers(false)} marqueeIds={rs.marquee || []} />}
      <div className="card stage">
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          <div className="mu">Lot {rs.idx + 1}/{rs.total}{rs.acc ? ' · Accel' : ''}{rs.setLabel ? ` · ${rs.setLabel}` : ''}</div>
          <div className="row mob-actions" style={{ gap: 6, flexWrap: 'wrap' }}>
            <button className="btn sec" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => setShowPlayers(true)}>Players list</button>
            <button className="btn sec" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => setShowTeams(true)}>All teams</button>
            {host && (
              <button className="btn" style={{ padding: '6px 12px', fontSize: 12, background: rs.paused ? 'var(--ok)' : undefined }} onClick={() => act('pause')}>
                {rs.paused ? '▶ Continue auction' : '⏸ Pause / rest'}
              </button>
            )}
          </div>
        </div>
        {rs.paused && (
          <div className="rtm" style={{ marginBottom: 10 }}>
            <b>Auction paused</b>
            <div className="mu" style={{ color: '#dfe4ff' }}>Host can press Continue when everyone is ready.</div>
          </div>
        )}
        <div className="mu" style={{ display: 'none' }}>Lot {rs.idx + 1} of {rs.total}{rs.acc ? ' · Accelerated round' : ''}{rs.setLabel ? ` · ${rs.setLabel}` : ''}</div>
        <div className="spot"><Photo p={p} s={210} /></div>
        <h2 className="pname">{p.name}</h2>
        <div className="row" style={{ justifyContent: 'center' }}>
          <span className="chip p">{ROLE[p.role]}</span>
          <span className="chip">{p.os ? `OVERSEAS · ${p.country}` : 'INDIAN'}</span>
          <span className={`chip ${p.capped ? '' : 'u'}`}>{p.capped ? 'CAPPED' : 'UNCAPPED'}</span>
        </div>
        <div className="mu" style={{ marginTop: 8 }}>Base price {cr(p.base)} · Squad {p.team}</div>
        <Stats p={p} />
        <div className="price">
          <div>
            <div className="mu">{lead ? 'CURRENT BID' : 'OPENING PRICE'}</div>
            <div className="v">{cr(lead ? c.bid : p.base)}</div>
            <div style={{ color: lead ? COL[lead] : 'var(--mu)', fontWeight: 800 }}>{lead ? cat.teams[lead] : 'No bids yet'}</div>
          </div>
          <div>
            <div className={`tmr ${secs <= 3 && !rs.paused ? 'r' : ''}`}>{rs.paused ? 'II' : rs.sub === 'break' ? '' : secs}</div>
            <div className="mu" style={{ textAlign: 'center' }}>{rs.paused ? 'Paused' : lead && rs.sub === 'bid' ? (secs <= 3 ? 'Going twice...' : secs <= 6 ? 'Going once...' : '') : ''}</div>
          </div>
        </div>
        <div className="bar"><i style={{ width: `${Math.min(100, (left / 15000) * 100)}%` }} /></div>
        {rs.sub === 'rtm' && (
          <div className="rtm">
            <b>{cat.teams[rs.rtmTeam]} can use RTM at {cr(c.bid)}</b>
            {rtmMine ? (
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn" onClick={() => act('rtm', true)}>Use RTM ({secs}s)</button>
                <button className="btn sec" onClick={() => act('rtm', false)}>Decline</button>
              </div>
            ) : <div className="mu" style={{ color: '#dfe4ff' }}>Waiting for their decision ({secs}s)</div>}
          </div>
        )}
        <div style={{ margin: '12px 0' }}>
          <button className="btn big" disabled={!!why || rs.sub !== 'bid'} onClick={() => {
            act('bid', price);
          }}>{why || `BID ${cr(price)}`}</button>
          <div className="mu" style={{ marginTop: 6 }}>If two people bid at once, only the first accepted price wins — others see “Someone just bid”.</div>
        </div>
        {host && (
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button className="btn sec" disabled={rs.sub !== 'bid' && rs.sub !== 'rtm'} onClick={() => act('pause')}>{rs.paused ? 'Resume' : 'Pause'}</button>
            {rs.opts?.sellNow && <button className="btn sec" disabled={!(rs.sub === 'bid' && lead && !rs.paused)} onClick={() => act('sellnow')}>Sell now</button>}
            {rs.opts?.markUnsold && <button className="btn sec" disabled={!(rs.sub === 'bid' && !lead && !rs.paused)} onClick={() => act('skip')}>Mark unsold</button>}
            {rs.opts?.forceUnsold && <button className="btn sec" disabled={!(rs.sub === 'bid' && !rs.paused)} onClick={() => act('forceUnsold')}>Force unsold</button>}
          </div>
        )}
      </div>
      <div className="card">
        {rs.setLabel && <div className="chip" style={{ marginBottom: 10 }}>{rs.setLabel} SET</div>}
        <h3>Teams</h3>
        {Object.entries(rs.teams).map(([code, t]) => (
          <div key={code} className={`trow ${lead === code ? 'lead' : ''} ${me.team === code ? 'me' : ''}`}>
            <Logo code={code} s={38} />
            <div style={{ flex: 1 }}>
              <b>{code}</b> <span className="mu">{rs.members.find(m => m.team === code)?.name}</span>
              <small>{t.squad.length}/25 players · {osCount(t, P)}/8 OS · RTM {t.rtm}</small>
            </div>
            <b style={{ color: 'var(--ok)' }}>{cr(t.purse)}</b>
          </div>
        ))}
        <div className="mu" style={{ marginTop: 10 }}>Squads must reach 18 players. Unsold players return once in an accelerated round.</div>
        {rs.log.length > 0 && <h3 style={{ marginTop: 16 }}>Recent sales</h3>}
        {rs.log.map((x, i) => (
          <div key={i} className="trow" style={{ cursor: 'default' }}>
            <Logo code={x.team} s={28} />
            <div style={{ flex: 1 }}>{P[x.id].name}<small>{x.team}{x.rtm ? ' · RTM' : ''}</small></div>
            <b style={{ color: 'var(--ac)' }}>{cr(x.price)}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

function End({ rs, cat }) {
  const P = cat.players;
  const [showRank, setShowRank] = useState(false);

  // Score each player from career-ish stats available in catalog
  const scorePlayer = (p) => {
    if (!p) return 0;
    let s = 0;
    const m = p.m || 0;
    if (p.role === 'BOWL') {
      s += (p.wkts || 0) * 8;
      s += m * 1.5;
      if (p.econ != null) s += Math.max(0, 12 - p.econ) * 15;
    } else if (p.role === 'AR') {
      s += (p.runs || 0) * 0.08;
      s += (p.wkts || 0) * 6;
      s += m * 1.2;
      if (p.sr) s += Math.max(0, p.sr - 120) * 0.4;
    } else {
      s += (p.runs || 0) * 0.1;
      s += m * 1.5;
      if (p.sr) s += Math.max(0, p.sr - 120) * 0.5;
    }
    if (p.capped) s *= 1.05;
    return Math.round(s);
  };

  const teamRanks = useMemo(() => {
    return Object.entries(rs.teams).map(([code, t]) => {
      const players = t.squad.map(x => {
        const p = P[x.id];
        return { ...p, price: x.price, ret: x.ret, score: scorePlayer(p) };
      }).sort((a, b) => b.score - a.score);
      const total = players.reduce((s, p) => s + p.score, 0);
      const avg = players.length ? total / players.length : 0;
      return { code, t, players, total, avg, spent: t.squad.reduce((s, x) => s + x.price, 0) };
    }).sort((a, b) => b.total - a.total);
  }, [rs.teams, P]);

  if (showRank) {
    return (
      <div className="grid">
        <div className="card row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h1>Team <em>rankings</em></h1>
            <div className="mu">Based on squad player stats (matches, runs, SR, wickets, economy). Higher score = stronger paper squad.</div>
          </div>
          <button className="btn sec" onClick={() => setShowRank(false)}>Back to squads</button>
        </div>
        {teamRanks.map((tr, i) => (
          <div className="card" key={tr.code}>
            <div className="row" style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 28, fontWeight: 900, width: 48, color: i === 0 ? 'var(--ac)' : '#9aa3c4' }}>#{i + 1}</div>
              <Logo code={tr.code} s={48} />
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0 }}>{cat.teams[tr.code]}</h3>
                <div className="mu">Score {tr.total} · Avg {Math.round(tr.avg)} · {tr.players.length} players · Spent {cr(tr.spent)}</div>
              </div>
            </div>
            <table>
              <thead><tr><th>#</th><th>Player</th><th>Role</th><th>Stats score</th><th>Price</th></tr></thead>
              <tbody>
                {tr.players.map((p, j) => (
                  <tr key={p.id}>
                    <td>{j + 1}</td>
                    <td>{p.name}{p.ret ? ' (R)' : ''}{p.os ? ' · OS' : ''}</td>
                    <td>{ROLE[p.role]}</td>
                    <td><b>{p.score}</b></td>
                    <td>{p.price > 0 ? cr(p.price) : 'Ret'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid">
      <div className="card row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1>Auction <em>complete</em></h1>
          <div className="mu">Min 18 / max 25 players · max 8 overseas. Check squad validity below.</div>
        </div>
        <button className="btn big" onClick={() => setShowRank(true)}>Analyse &amp; rank teams</button>
      </div>
      {Object.entries(rs.teams).map(([code, t]) => {
        const spent = t.squad.reduce((s, x) => s + x.price, 0);
        const valid = t.squad.length >= 18 && t.squad.length <= 25 && osCount(t, P) <= 8;
        return (
          <div className="card" key={code}>
            <div className="row"><Logo code={code} s={44} /><div><h3 style={{ margin: 0 }}>{cat.teams[code]}</h3><div className="mu">{t.squad.length} players · {osCount(t, P)}/8 overseas · Spent {cr(spent)} · Left {cr(t.purse)} · {valid ? 'Valid squad' : t.squad.length < 18 ? `Needs ${18 - t.squad.length} more` : 'Check limits'}</div></div></div>
            <table><tbody>{t.squad.map(x => <tr key={x.id}><td>{P[x.id].name}{x.ret ? ' (R)' : ''}</td><td>{ROLE[P[x.id].role]}{P[x.id].os ? ' · OS' : ''}</td><td>{cr(x.price)}</td></tr>)}</tbody></table>
          </div>
        );
      })}
    </div>
  );
}

function Overlay({ ov, cat }) {
  const bits = useMemo(() => Array.from({ length: 44 }, (_, i) => ({ x: Math.random() * 100, d: Math.random() * 0.8, t: 2 + Math.random() * 2, r: Math.random() * 720, c: ['#ffd23f', '#fff', '#ff5a6a', '#35e08a'][i % 4] })), [ov?.k]);
  if (!ov) return null;
  const p = cat.players[ov.id];
  return (
    <motion.div className="ov" key={ov.k} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {!ov.un && bits.map((b, i) => <motion.i key={i} className="cf" style={{ left: `${b.x}%`, background: b.c }} initial={{ y: -30, rotate: 0 }} animate={{ y: '110vh', rotate: b.r }} transition={{ duration: b.t, delay: b.d, ease: 'linear' }} />)}
      <motion.div initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 14 }} style={{ position: 'relative', zIndex: 2 }}>
        <div className="sold" style={ov.un ? { color: '#9aa3c4', textShadow: 'none', fontSize: 'clamp(40px,9vw,80px)' } : null}>{ov.un ? 'UNSOLD' : 'SOLD!'}</div>
        <div style={{ margin: '14px auto', width: 'fit-content' }}><Photo p={p} s={170} /></div>
        <div style={{ fontSize: 30, fontWeight: 900 }}>{p.name}</div>
        {!ov.un && (
          <>
            <div className="mu" style={{ margin: '8px 0' }}>sold to</div>
            <div className="row" style={{ justifyContent: 'center' }}>
              <Logo code={ov.team} s={64} />
              <div style={{ fontSize: 30, fontWeight: 900, padding: '8px 20px', borderRadius: 14, background: COL[ov.team] }}>{cat.teams[ov.team]}</div>
            </div>
            <div className="sold" style={{ fontSize: 48, letterSpacing: 1, marginTop: 10 }}>{cr(ov.price)}{ov.rtm ? ' · RTM' : ''}</div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

function App() {
  const [cat, setCat] = useState(null), [rs, setRs] = useState(null), [toast, setToast] = useState(''), [ov, setOv] = useState(null);
  const stamp = useRef(Date.now()), [, tick] = useState(0);
  const flash = m => { setToast(m); setTimeout(() => setToast(''), 3000); };
  const leaveRoom = () => {
    sessionStorage.removeItem('code');
    setRs(null);
    history.pushState({ home: 1 }, '', '/');
  };
  const join = (code, name, create) => {
    localStorage.name = name;
    socket.emit('join', { code, name, cid, create }, r => {
      if (!r.ok) flash(r.error);
      else {
        sessionStorage.code = r.code;
        history.pushState({ room: r.code }, '', `/?room=${r.code}`);
      }
    });
  };
  const act = (t, p) => socket.emit('act', t, p, r => r && !r.ok && flash(r.error));
  useEffect(() => {
    const rejoin = () => {
      const c = sessionStorage.code || new URLSearchParams(location.search).get('room');
      const n = localStorage.name;
      if (c && n) socket.emit('join', { code: c, name: n, cid }, r => {
        if (!r.ok) { sessionStorage.removeItem('code'); setRs(null); }
        else sessionStorage.code = r.code;
      });
    };
    const onSold = e => { setOv({ k: Date.now(), ...e }); setTimeout(() => setOv(null), 4300); };
    const onUnsold = e => { setOv({ k: Date.now(), ...e, un: 1 }); setTimeout(() => setOv(null), 2300); };
    const onState = s => { stamp.current = Date.now(); setRs(s); };
    socket.on('connect', rejoin); socket.on('catalog', setCat); socket.on('state', onState); socket.on('sold', onSold); socket.on('unsold', onUnsold);
    if (socket.connected) rejoin();
    const t = setInterval(() => tick(x => x + 1), 200);
    const onPop = () => {
      // Browser back → home (leave room UI; can rejoin with code)
      sessionStorage.removeItem('code');
      setRs(null);
    };
    window.addEventListener('popstate', onPop);
    return () => {
      socket.off('connect', rejoin); socket.off('catalog', setCat); socket.off('state', onState); socket.off('sold', onSold); socket.off('unsold', onUnsold);
      clearInterval(t);
      window.removeEventListener('popstate', onPop);
    };
  }, []);

  const me = rs?.members.find(m => m.cid === cid);
  const host = rs?.host === cid;
  const left = rs ? (rs.paused ? rs.left : Math.max(0, rs.left - (Date.now() - stamp.current))) : 0;
  let body;
  if (!rs || !cat || !me) body = <Home join={join} flash={flash} />;
  else {
    const common = { rs, cat, me, act, host };
    body = (
      <div className="wrap">
        <div className="top">
          <div className="brand">IPL <span>AUCTION</span> ROOM</div>
          <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <span className="pill">Room <b>{rs.code}</b></span>
            <span className="pill">{me.name}{me.team ? ` · ${me.team}` : ''}{host ? ' · Host' : ''}</span>
            <button type="button" className="btn sec" style={{ padding: '6px 12px', fontSize: 12, minHeight: 36 }} onClick={leaveRoom}>Exit room</button>
          </div>
        </div>
        {rs.phase === 'lobby' && <Lobby {...common} />}
        {rs.phase === 'retention' && <Retention {...common} />}
        {rs.phase === 'auction' && rs.cur && <Auction {...common} left={left} />}
        {rs.phase === 'end' && <End rs={rs} cat={cat} />}
      </div>
    );
  }
  return (
    <>
      {body}
      <AnimatePresence>{ov && cat && <Overlay key={ov.k} ov={ov} cat={cat} />}</AnimatePresence>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
