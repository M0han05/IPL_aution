# IPL Auction Room

Mega and Mini IPL mock auctions for friends. Create a room, share the 5-letter code or invite link, everyone picks a team and bids live.
Only real people bid (no AI teams). Rules: 8 overseas max, 18 to 25 players, retentions, RTM, auto-reserve of purse for the 18-player minimum.

## First-time setup (needs Node.js 18 or newer)
1. `npm install`
2. `npm run data`     <- builds data/players.json: photos, stats, capped/uncapped. Takes a few minutes. Needs internet.
3. Open `data/CHECK.txt` and fix anything listed (see "Fixing data" below). Run step 2 again after editing.

## Play on your own computer
- `npm run dev`  then open http://localhost:5173
- Friends on the same Wi-Fi open http://YOUR-PC-IP:5173 (the invite link button uses whatever address you opened).

## Play with friends over the internet
Option A (quick test): `npm run build`, `npm start`, then in another terminal run `npx localtunnel --port 3001` and share the https link it prints.
Option B (permanent, free): push this folder to GitHub, create a Web Service on render.com.
  Build command: `npm install && npm run build`      Start command: `npm start`
  Commit data/players.json and client/public/players/ so the server has them.

## Fixing data (data/squads.txt)
- `Name|AU`           overseas player (country code). No code = Indian.
- `Name|U` / `Name|C` force uncapped / capped.      `Name|b=150` base price in lakh.
- `Name|cs=RG Sharma` exact Cricsheet name when stats matching is wrong or ambiguous.
- Spell names like the iplt20.com player link (e.g. /players/<id>/varun-chakravarthy).

## Logos
Drop CSK.png, MI.png, RCB.png, KKR.png, RR.png, DC.png, SRH.png, LSG.png, GT.png, PBKS.png into client/public/logos/
