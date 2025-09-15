// ====== CONFIG ======
const WINDOW_MINUTES = 45;   // lookback for swing high/low
const COOLDOWN_SEC   = 600;  // 10 minutes
const MAX_HISTORY    = 10;   // per pair show last 10 trades
const FIXED_POINTS   = 100;  // ✅ FIXED SL/TP points

// PAIR LISTS
const CRYPTO_LIST = [
  { sym: 'BTCUSDT', id: 'btc', label: 'BTC' },
];

const FOREX_LIST = [
];

// ====== UI INIT ======
document.getElementById('agreeBtn').addEventListener('click', () => {
  document.getElementById('disclaimer').style.display = 'none';
  initUI();
  startAll();
});

document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b=> b.classList.remove('active'));
    btn.classList.add('active');
    const target = btn.dataset.target;
    document.querySelectorAll('.grid').forEach(g => g.classList.remove('active-grid'));
    document.getElementById(target).classList.add('active-grid');
  });
});

function initUI(){
  const cryptoGrid = document.getElementById('crypto');
  const forexGrid  = document.getElementById('forex');
  CRYPTO_LIST.forEach(p => cryptoGrid.appendChild(createCard(p)));
  FOREX_LIST.forEach(p => forexGrid.appendChild(createCard(p)));
}

function createCard(pair){
  const sec = document.createElement('section');
  sec.className = 'card';
  sec.id = `${pair.id}-card`;

  sec.innerHTML = `
    <div class="card-head">
      <h2>${pair.label}</h2>
      <div class="status" id="${pair.id}-status">Connecting…</div>
    </div>
    <div class="price" id="${pair.id}-price">—</div>
    <div class="signal" id="${pair.id}-signal">Waiting for first signal…</div>
    <div class="levels" id="${pair.id}-levels">—</div>
    <div class="timer" id="${pair.id}-timer">Next: —</div>

    <h3 class="hist-title">Last 10 trades</h3>
    <div class="history" id="${pair.id}-history"></div>
  `;
  return sec;
}

// ====== START ALL ======
function startAll(){
  [...CRYPTO_LIST, ...FOREX_LIST].forEach(p => setupPair(p));
}

// ====== Per-pair logic ======
function setupPair(pair){
  const id = pair.id;
  const els = {
    status: byId(`${id}-status`),
    price:  byId(`${id}-price`),
    signal: byId(`${id}-signal`),
    levels: byId(`${id}-levels`),
    timer:  byId(`${id}-timer`),
    hist:   byId(`${id}-history`)
  };

  const state = {
    sym: pair.sym,
    lastPrice: null,
    buf: [],
    active: null,
    cooldown: 0,
    ws: null
  };

  let stream = `wss://stream.binance.com:9443/ws/${pair.sym.toLowerCase()}@trade`;
  let ws;
  try {
    ws = new WebSocket(stream);
  } catch (e) {
    els.status.textContent = 'WS Error';
    return;
  }
  state.ws = ws;
  els.status.textContent = 'Connecting…';

  ws.onopen = () => els.status.textContent = 'Live';
  ws.onerror = () => els.status.textContent = 'Error';
  ws.onclose = () => els.status.textContent = 'Closed';

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    const px = parseFloat(msg.p);
    const t  = msg.T || Date.now();
    state.lastPrice = px;
    els.price.textContent = `$${fmt(px)}`;
    pushBuf(state, t, px);
    tick(state, els);
  };

  setInterval(() => tick(state, els, true), 1000);
}

// MAIN TICK
function tick(state, els, fromTimer=false){
  if(state.cooldown > 0){
    state.cooldown--;
    const mm = String(Math.floor(state.cooldown/60)).padStart(2,'0');
    const ss = String(state.cooldown%60).padStart(2,'0');
    els.timer.textContent = `Next signal in ${mm}:${ss}`;
    return;
  } else if(fromTimer){
    els.timer.textContent = `Next: ready`;
  }

  if(state.active && state.lastPrice){
    const a = state.active;
    const px = state.lastPrice;
    if(a.dir === 'BUY'){
      if(px >= a.tp) return finalize(state, els, 'WIN');
      if(px <= a.sl) return finalize(state, els, 'LOSS');
    } else {
      if(px <= a.tp) return finalize(state, els, 'WIN');
      if(px >= a.sl) return finalize(state, els, 'LOSS');
    }
  }

  if(!state.active && state.lastPrice && state.buf.length > 100){
    const entry = state.lastPrice;
    const dir = Math.random() > 0.5 ? 'BUY' : 'SELL'; // signal direction

    const sl = dir === 'BUY' ? entry - FIXED_POINTS : entry + FIXED_POINTS;
    const tp = dir === 'BUY' ? entry + FIXED_POINTS : entry - FIXED_POINTS;

    state.active = { dir, entry, sl, tp, openedAt: Date.now() };

    els.signal.innerHTML = `<span class="badge ${dir.toLowerCase()}">${dir}</span> Entry: $${fmt(entry)} | SL: $${fmt(sl)} | TP: $${fmt(tp)} (Fixed 100pts)`;
    els.levels.textContent = `SL/TP distance fixed at 100 points`;

    pushHistory(els.hist, {
      dir, sl, tp, result: 'PENDING', time: tsStr(state.active.openedAt)
    }, true);
  }
}

function finalize(state, els, outcome){
  const a = state.active;
  if(!a) return;
  replaceLastHistory(els.hist, {
    dir: a.dir,
    sl: a.sl,
    tp: a.tp,
    result: outcome,
    time: tsStr(Date.now())
  });
  els.signal.innerHTML = `Last: <span class="badge ${outcome==='WIN'?'win':'lose'}">${outcome}</span> • Waiting for next cycle…`;
  state.active = null;
  state.cooldown = COOLDOWN_SEC;
}

// HISTORY
function pushBuf(state, t, p){
  state.buf.push({t,p});
  const cutoff = Date.now() - WINDOW_MINUTES*60*1000;
  while(state.buf.length && state.buf[0].t < cutoff) state.buf.shift();
}
function pushHistory(container, item){
  const row = document.createElement('div');
  row.className = 'hrow';
  row.innerHTML = `
    <div class="hleft">
      <div><span class="badge ${item.dir.toLowerCase()}">${item.dir}</span></div>
      <div style="color:var(--muted);font-size:12px">SL: $${fmt(item.sl)} • TP: $${fmt(item.tp)}</div>
    </div>
    <div class="hright">
      <div><span class="badge ${badgeClass(item.result)}">${item.result}</span></div>
      <div style="margin-top:6px;color:var(--muted)">${item.time}</div>
    </div>
  `;
  container.prepend(row);
  while(container.children.length > MAX_HISTORY) container.removeChild(container.lastChild);
}
function replaceLastHistory(container, item){
  const first = container.querySelector('.hrow');
  if(!first){ pushHistory(container, item); return; }
  first.innerHTML = `
    <div class="hleft">
      <div><span class="badge ${item.dir.toLowerCase()}">${item.dir}</span></div>
      <div style="color:var(--muted);font-size:12px">SL: $${fmt(item.sl)} • TP: $${fmt(item.tp)}</div>
    </div>
    <div class="hright">
      <div><span class="badge ${badgeClass(item.result)}">${item.result}</span></div>
      <div style="margin-top:6px;color:var(--muted)">${item.time}</div>
    </div>
  `;
}

// UTIL
function byId(id){ return document.getElementById(id); }
function fmt(n){ return Number(n).toLocaleString(undefined,{maximumFractionDigits:2}); }
function tsStr(t){ return new Date(t).toLocaleTimeString(); }
function badgeClass(label){
  const t = String(label).toUpperCase();
  if(t === 'WIN') return 'win';
  if(t === 'LOSS') return 'lose';
  return 'pending';
}

