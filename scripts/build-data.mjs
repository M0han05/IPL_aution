// Builds data/players.json  ->  npm run data
//  * photos: downloaded from each player's iplt20.com page into client/public/players/
//  * stats (matches, runs, strike rate, wickets, economy): computed from Cricsheet ball-by-ball IPL data
//  * capped / uncapped: a player is capped if he appears in any Cricsheet men's Test, ODI or T20I match
// A readable list of anything that needs a manual check is written to data/CHECK.txt
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { fileURLToPath } from 'url';
import { parseSquads } from './squads.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const D = path.join(ROOT, 'data');
const PUB = path.join(ROOT, 'client', 'public');
fs.mkdirSync(path.join(PUB, 'players'), { recursive: true });
fs.mkdirSync(path.join(PUB, 'logos'), { recursive: true });

const UA = { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ipl-auction-data-builder)' } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const report = [];
const warn = m => { report.push(m); console.log('  ! ' + m); };
async function pmap(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; try { await fn(items[k], k); } catch (e) { warn('ERROR ' + (items[k].name || '') + ': ' + e.message); } } }));
}
async function get(url, tries = 3) {
  for (let t = 0; t < tries; t++) { try { const r = await fetch(url, UA); if (r.ok) return r; } catch {} await sleep(400 * (t + 1)); }
  return null;
}
const strip = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const slugify = s => strip(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* ---------- 1. Cricsheet ---------- */
async function zipFor(key) {
  const names = [`${key}_male_json.zip`, `${key}_json.zip`];
  for (const n of names) { const f = path.join(D, n); if (fs.existsSync(f)) return new AdmZip(f); }
  for (const n of names) {
    const r = await get('https://cricsheet.org/downloads/' + n, 1);
    if (r) { const b = Buffer.from(await r.arrayBuffer()); if (b.length > 10000) { fs.writeFileSync(path.join(D, n), b); return new AdmZip(b); } }
  }
  return null;
}
const st = new Map(), first = new Map(), names = new Map(), caps = new Set();
const S = id => st.get(id) || st.set(id, { m: 0, runs: 0, balls: 0, bb: 0, bruns: 0, w: 0 }).get(id);
const NOT_BOWLER = new Set(['run out', 'retired hurt', 'retired out', 'obstructing the field']);

console.log('1/3 Cricsheet IPL data...');
const ipl = await zipFor('ipl');
if (!ipl) {
  console.log('\nCould not download the IPL data. Open https://cricsheet.org/downloads/ , download the IPL "JSON" zip,\nsave it inside the data folder as ipl_json.zip and run this command again.\n');
  process.exit(1);
}
for (const e of ipl.getEntries()) {
  if (!e.entryName.endsWith('.json')) continue;
  const g = JSON.parse(e.getData().toString('utf8'));
  const reg = g.info?.registry?.people || {};
  const year = +String(g.info?.dates?.[0] || '0').slice(0, 4);
  for (const list of Object.values(g.info?.players || {})) for (const n of list) {
    const id = reg[n]; if (!id) continue;
    S(id).m++; names.set(id, n);
    if (!first.has(id) || year < first.get(id)) first.set(id, year);
  }
  for (const inn of g.innings || []) for (const ov of inn.overs || []) for (const d of ov.deliveries || []) {
    const x = d.extras || {}, wide = x.wides !== undefined, nb = x.noballs !== undefined;
    const b = S(reg[d.batter]); b.runs += d.runs.batter; if (!wide) b.balls++;
    const w = S(reg[d.bowler]); w.bruns += d.runs.total - (x.byes || 0) - (x.legbyes || 0); if (!wide && !nb) w.bb++;
    for (const k of d.wickets || []) if (!NOT_BOWLER.has(k.kind)) w.w++;
  }
}
console.log('2/3 Cricsheet international data (for capped / uncapped)...');
for (const key of ['tests', 'odis', 't20s']) {
  const z = await zipFor(key);
  if (!z) { warn(`International file "${key}" not found; capped status may be less accurate. Download it from cricsheet.org/downloads into data/ (e.g. ${key}_json.zip).`); continue; }
  for (const e of z.getEntries()) {
    if (!e.entryName.endsWith('.json')) continue;
    const g = JSON.parse(e.getData().toString('utf8'));
    const reg = g.info?.registry?.people || {};
    for (const list of Object.values(g.info?.players || {})) for (const n of list) { const id = reg[n]; if (id) { caps.add(id); if (!names.has(id)) names.set(id, n); } }
  }
}

/* name matching: roster "Rohit Sharma" <-> Cricsheet "RG Sharma" */
const PART = /^(de|du|van|der|von|le|la|di|bin|al|dos|da)$/i;
const parts = full => {
  const w = strip(full).trim().split(/\s+/); let i = w.length - 1;
  while (i > 0 && PART.test(w[i - 1])) i--;
  const g = w.slice(0, i);
  return { last: w.slice(i).join(' ').toLowerCase(), first: (g[0] || '').toLowerCase(), init: g.map(t => (g.length === 1 && /^[A-Z]{2,3}$/.test(t) ? t : t[0].toUpperCase())).join('') };
};
const entries = [...names].map(([id, n]) => ({ id, n, ...parts(n) }));
const compat = (a, b) => a.last === b.last && (a.init === b.init || a.init.startsWith(b.init) || b.init.startsWith(a.init));
const best = arr => arr.sort((x, y) => (st.get(y.id)?.m || 0) - (st.get(x.id)?.m || 0))[0].id;

function iplId(p) {
  if (p.cs) { const e = entries.find(x => x.n === p.cs); if (!e) warn(`cs name not found for ${p.name}: ${p.cs}`); return e ? e.id : null; }
  if (p.hasDebutLabel && !p.debut) return null; // iplt20 says this player has no IPL career yet
  const a = parts(p.name);
  let c = entries.filter(x => first.has(x.id) && compat(a, x));
  const ex = c.filter(x => x.first === a.first); if (ex.length) c = ex;
  if (p.debut) { const d = c.filter(x => first.get(x.id) === p.debut); return d.length ? best(d) : null; }
  if (c.length === 1) return c[0].id;
  if (c.length > 1) {
    c.sort((x, y) => st.get(y.id).m - st.get(x.id).m);
    if (st.get(c[0].id).m >= 5 * st.get(c[1].id).m) return c[0].id;
    warn(`AMBIGUOUS stats for ${p.name} (${c.slice(0, 3).map(x => x.n).join(' / ')}). Add |cs=<exact name> in squads.txt`);
  }
  return null;
}
function intlId(p) { // players with no IPL record: strict match only
  const a = parts(p.name);
  const c = entries.filter(x => compat(a, x) && (x.first === a.first || (a.init.length >= 2 && x.init === a.init)));
  return c.length === 1 ? c[0].id : null;
}

/* ---------- 2. iplt20.com: photos + nationality ---------- */
console.log('3/3 iplt20.com player pages (photos)... this takes a few minutes');
const roster = parseSquads(fs.readFileSync(path.join(D, 'squads.txt'), 'utf8'));
const TEAMS = {
  CSK: ['chennai-super-kings', '1f8498f3-a468-43f6-b7aa-33a8a5700440/dewald-brevis'], DC: ['delhi-capitals', '199a8631-89c0-4b51-b293-324ab9bc7fdd/david-miller'],
  GT: ['gujarat-titans', '687b3266-5916-46b1-87f1-47547efe2399/shubman-gill'], KKR: ['kolkata-knight-riders', '802555af-5e93-448e-b2e8-1d56b712b874/rinku-singh'],
  LSG: ['lucknow-super-giants', '7ab8f25f-7187-45ca-b6cc-f3e966d7bf54/rishabh-pant'], MI: ['mumbai-indians', 'b78c195f-b149-4136-9803-24209696c4c3/rohit-sharma'],
  PBKS: ['punjab-kings', 'cef1971a-977f-4ede-aa47-ea51659d659b/shreyas-iyer'], RR: ['rajasthan-royals', '786de32e-4a28-48d0-af87-775b1e4ce987/yashasvi-jaiswal'],
  RCB: ['royal-challengers-bengaluru', '3c2267a5-45fa-4fac-8a29-9b78947f5f6c/virat-kohli'], SRH: ['sunrisers-hyderabad', '95d5a511-fa7c-4889-a595-25dbb61c98a9/travis-head'],
};
const links = new Map();
const LRE = /\/players\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([a-z0-9-]+)/g;
for (const [code, [tslug, seed]] of Object.entries(TEAMS)) {
  const mine = roster.filter(p => p.team === code);
  for (const u of [`https://www.iplt20.com/players/${seed}`, `https://www.iplt20.com/teams/${tslug}/squad`, `https://www.iplt20.com/teams/${tslug}`]) {
    const r = await get(u, 2); if (!r) continue;
    const h = await r.text();
    for (const m of h.matchAll(LRE)) links.set(m[2], m[1]);
    if (mine.filter(p => links.has(slugify(p.name))).length >= Math.min(15, mine.length)) break;
  }
}
console.log(`  found ${links.size} player page links`);

async function savePhoto(url, slug) {
  for (const ext of ['png', 'jpg', 'webp']) if (fs.existsSync(path.join(PUB, 'players', `${slug}.${ext}`))) return `/players/${slug}.${ext}`;
  const r = await get(url, 2); if (!r) return '';
  const ct = r.headers.get('content-type') || '';
  if (!ct.startsWith('image/')) return '';
  const ext = ct.includes('jpeg') ? 'jpg' : ct.includes('webp') ? 'webp' : 'png';
  fs.writeFileSync(path.join(PUB, 'players', `${slug}.${ext}`), Buffer.from(await r.arrayBuffer()));
  return `/players/${slug}.${ext}`;
}
let done = 0;
await pmap(roster, 6, async p => {
  p.slug = slugify(p.name); p.photo = '';
  const uuid = links.get(p.slug);
  if (!uuid) { warn(`NO IPL PAGE FOUND for ${p.name} (${p.team}). Spell it like the iplt20.com link, e.g. /players/<id>/${p.slug}`); return; }
  const r = await get(`https://www.iplt20.com/players/${uuid}/${p.slug}`);
  if (!r) { warn(`PAGE FAILED for ${p.name}`); return; }
  const h = await r.text();
  const txt = h.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
  const nat = txt.match(/Nationality ([A-Za-z .'-]+?) Role /);
  if (nat && (nat[1].trim() === 'India') !== (p.country === 'IN')) warn(`NATIONALITY MISMATCH: ${p.name} is "${nat[1].trim()}" on iplt20.com but "${p.country}" in squads.txt`);
  p.hasDebutLabel = /IPL Debut/.test(txt);
  const dm = txt.match(/IPL Debut (\d{4})/); p.debut = dm ? +dm[1] : null;
  const tag = (h.match(/<meta[^>]*property="og:image"[^>]*>/i) || [])[0];
  const c = tag && tag.match(/content="([^"]+)"/);
  if (c && !/fallback/i.test(c[1])) p.photo = await savePhoto(c[1].replace(/&amp;/g, '&'), p.slug);
  if (!p.photo) warn(`NO PHOTO for ${p.name}`);
  if (++done % 25 === 0) console.log(`  ${done}/${roster.length} pages`);
});

/* ---------- 3. combine ---------- */
const ids = roster.map(iplId);
const seen = new Map();
ids.forEach((id, i) => { if (id) seen.set(id, [...(seen.get(id) || []), i]); });
for (const [id, list] of seen) if (list.length > 1) { warn(`DUPLICATE stats match: ${list.map(i => roster[i].name).join(' and ')} both matched "${names.get(id)}". Stats left blank. Add |cs=<exact name> to the right one.`); list.forEach(i => (ids[i] = null)); }
const out = roster.map((p, i) => {
  const id = ids[i], s = id && st.get(id);
  let capped;
  if (p.flag === 'U') capped = false;
  else if (p.flag === 'C') capped = true;
  else if (!caps.size) capped = true;
  else {
    const cid = id || intlId(p);
    if (cid) capped = caps.has(cid);
    else { capped = p.country !== 'IN'; report.push(`CAPPED GUESS: ${p.name} -> ${capped ? 'capped' : 'uncapped'} (no match in Cricsheet). Add |U or |C in squads.txt if wrong.`); }
  }
  const m = s ? s.m : null;
  return {
    id: i, name: p.name, team: p.team, role: p.role, country: p.country, os: p.country !== 'IN', capped,
    base: p.base || (capped ? (m >= 60 ? 200 : m >= 25 ? 150 : 100) : 30),
    photo: p.photo || '', slug: p.slug,
    m,
    runs: s && s.balls ? s.runs : null,
    sr: s && s.balls ? +((s.runs / s.balls) * 100).toFixed(1) : null,
    wkts: s && s.bb >= 30 ? s.w : null,
    econ: s && s.bb >= 30 ? +(s.bruns / (s.bb / 6)).toFixed(2) : null,
  };
});
fs.writeFileSync(path.join(D, 'players.json'), JSON.stringify(out, null, 1));
fs.writeFileSync(path.join(D, 'CHECK.txt'), report.join('\n') + '\n');
const n = f => out.filter(f).length;
console.log(`\nDone. ${out.length} players | ${n(p => p.photo)} photos | ${n(p => p.m)} with IPL stats | ${n(p => !p.capped)} uncapped | ${n(p => p.os)} overseas`);
console.log(`${report.length} notes written to data/CHECK.txt (open it, and send me anything you want fixed)`);
