// Parses data/squads.txt
//   "# CSK"        -> team code          "## BAT"  -> role (BAT, BOWL, AR, WK)
//   "Name"         -> Indian player      "Name|AU" -> overseas player (country code)
// Optional extras after "|":  U = force uncapped, C = force capped, b=150 = base price (lakh), cs=RG Sharma = exact Cricsheet name
export function parseSquads(text) {
  const out = [];
  let team = null, role = null;
  for (const raw of text.split(/\r?\n/)) {
    const t = raw.trim();
    if (!t || t.startsWith('//')) continue;
    if (t.startsWith('## ')) { role = t.slice(3).trim(); continue; }
    if (t.startsWith('# ')) { team = t.slice(2).trim(); continue; }
    const [name, ...ex] = t.split('|').map(s => s.trim());
    const p = { name, team, role, country: 'IN', flag: null, base: null, cs: null };
    for (const x of ex) {
      if (x === 'U' || x === 'C') p.flag = x;
      else if (/^[A-Z]{2}$/.test(x)) p.country = x;
      else if (/^b=\d+$/.test(x)) p.base = +x.slice(2);
      else if (x.startsWith('cs=')) p.cs = x.slice(3);
    }
    out.push(p);
  }
  return out;
}
