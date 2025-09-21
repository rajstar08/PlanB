
// CONFIG
const COOLDOWN_SEC=600, MAX_HISTORY=10, FIXED_POINTS=100, NUM_CARDS=10;

const BTC_CARDS = [
  {sym:'BTCUSDT', id:'btc1', label:'BTC1', img:'luffy.png', name:'LUFFY'},
  {sym:'BTCUSDT', id:'btc2', label:'BTC2', img:'zoro.png', name:'ZORO'},
  {sym:'BTCUSDT', id:'btc3', label:'BTC3', img:'nami.png', name:'NAMI'},
  {sym:'BTCUSDT', id:'btc4', label:'BTC4', img:'tanjiro.png', name:'TANJIRO'},
  {sym:'BTCUSDT', id:'btc5', label:'BTC5', img:'nezuko.png', name:'NEZUKO'},
  {sym:'BTCUSDT', id:'btc6', label:'BTC6', img:'zenitsu.png', name:'ZENITSU'},
  {sym:'BTCUSDT', id:'btc7', label:'BTC7', img:'akaza.png', name:'AKAZA'},
  {sym:'BTCUSDT', id:'btc8', label:'BTC8', img:'giyu.png', name:'GIYU'},
  {sym:'BTCUSDT', id:'btc9', label:'BTC9', img:'shinobu.png', name:'SHINOBU'},
  {sym:'BTCUSDT', id:'btc10', label:'BTC10', img:'saitama.png', name:'SAITAMA'}
];

// Tabs
document.getElementById('agreeBtn').addEventListener('click',()=>{
  document.getElementById('disclaimer').style.display='none';
  initUI();
  startAll();
});

document.querySelectorAll('.tab').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    const target=btn.dataset.target;
    document.querySelectorAll('.grid').forEach(g=>g.classList.remove('active-grid'));
    document.getElementById(target).classList.add('active-grid');
  });
});

// INIT UI
function initUI(){
  const container=document.getElementById('btc');
  BTC_CARDS.forEach(c=>container.appendChild(createCard(c)));
}

// CREATE CARD
function createCard(card){
  const sec=document.createElement('section'); sec.className='card'; sec.id=card.id;
  sec.innerHTML=`
  <div class="card-head">
    <div style="display:flex;align-items:center">
      <div class="card-circle"><img src="${card.img}"></div>
      <div class="card-name">${card.name}</div>
    </div>
    <div class="status" id="${card.id}-status">Connecting…</div>
  </div>
  <div class="price" id="${card.id}-price">—</div>
  <div class="signal" id="${card.id}-signal">Waiting for first signal…</div>
  <div class="levels" id="${card.id}-levels">—</div>
  <div class="timer" id="${card.id}-timer">Next: —</div>
  <h3 class="hist-title">Last 10 trades</h3>
  <div class="history" id="${card.id}-history"></div>
  `;
  return sec;
}

// START
let BTC_PRICE=null, cycleActive=false;

function startAll(){
  const ws=new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@trade');
  ws.onopen=()=> console.log('WS Connected');
  ws.onmessage=ev=>{
    const msg=JSON.parse(ev.data);
    BTC_PRICE=parseFloat(msg.p);
    BTC_CARDS.forEach(c=>byId(`${c.id}-price`).textContent=`$${BTC_PRICE.toLocaleString()}`);
    if(!cycleActive && BTC_PRICE!==null) nextCycle();
  };

  BTC_CARDS.forEach(c=>c.state={active:null,cooldown:0,history:[],wins:0});
}

// SIGNAL CYCLE
function nextCycle(){
  if(cycleActive) return;
  cycleActive=true;

  BTC_CARDS.forEach(c=>{
    if(BTC_PRICE===null) return;
    const entry=BTC_PRICE;
    const dir=Math.random()>0.5?'BUY':'SELL';
    const sl=dir==='BUY'?entry-FIXED_POINTS:entry+FIXED_POINTS;
    const tp=dir==='BUY'?entry+FIXED_POINTS:entry-FIXED_POINTS;

    c.state.active={dir,entry,sl,tp,openedAt:Date.now()};

    const els={
      signal:byId(`${c.id}-signal`),
      levels:byId(`${c.id}-levels`),
      timer:byId(`${c.id}-timer`),
      hist:byId(`${c.id}-history`)
    };
    els.signal.innerHTML=`<span class="badge ${dir.toLowerCase()}">${dir}</span> Entry: $${entry.toFixed(2)} | SL: $${sl.toFixed(2)} | TP: $${tp.toFixed(2)}`;
    els.levels.textContent=`SL/TP fixed 100 points`; els.timer.textContent=`Active`;
    pushHistory(els.hist,{dir,sl,tp,result:'PENDING',time:new Date().toLocaleTimeString()},true);
    c.state.els=els;
  });

  const monitor=setInterval(()=>{
    let allDone=true;
    BTC_CARDS.forEach(c=>{
      if(c.state.active){
        const px=BTC_PRICE, a=c.state.active;
        if(a.dir==='BUY' && px>=a.tp) finalizeCard(c,'WIN');
        else if(a.dir==='BUY' && px<=a.sl) finalizeCard(c,'LOSS');
        else if(a.dir==='SELL' && px<=a.tp) finalizeCard(c,'WIN');
        else if(a.dir==='SELL' && px>=a.sl) finalizeCard(c,'LOSS');
        else allDone=false;
      }
    });
    if(allDone){
      clearInterval(monitor);
      setTimeout(()=>{ cycleActive=false; nextCycle(); },2000);
    }
  },500);
}

// FINALIZE CARD
function finalizeCard(card,outcome){
  const a=card.state.active; if(!a) return;
  const els=card.state.els;
  replaceLastHistory(els.hist,{dir:a.dir,sl:a.sl,tp:a.tp,result:outcome,time:new Date().toLocaleTimeString()});
  els.signal.innerHTML=`Last: <span class="badge ${outcome==='WIN'?'win':'lose'}">${outcome}</span> • Waiting for next cycle…`;
  card.state.active=null;
  if(outcome==='WIN') card.state.wins++;
}

// HISTORY HELPERS
function pushHistory(container,item,prepend=false){
  const row=document.createElement('div'); row.className='hrow';
  row.innerHTML=`<div class="hleft">
    <div><span class="badge ${item.dir.toLowerCase()}">${item.dir}</span></div>
    <div style="color:var(--muted);font-size:12px">SL: $${item.sl.toFixed(2)} • TP: $${item.tp.toFixed(2)}</div>
  </div>
  <div class="hright">
    <div><span class="badge ${badgeClass(item.result)}">${item.result}</span></div>
    <div style="margin-top:6px;color:var(--muted)">${item.time}</div>
  </div>`;
  if(prepend) container.prepend(row); else container.appendChild(row);
  while(container.children.length>MAX_HISTORY) container.removeChild(container.lastChild);
}
function replaceLastHistory(container,item){
  const first=container.querySelector('.hrow'); if(!first){ pushHistory(container,item,true); return; }
  first.innerHTML=`<div class="hleft">
    <div><span class="badge ${item.dir.toLowerCase()}">${item.dir}</span></div>
    <div style="color:var(--muted);font-size:12px">SL: $${item.sl.toFixed(2)} • TP: $${item.tp.toFixed(2)}</div>
  </div>
  <div class="hright">
    <div><span class="badge ${badgeClass(item.result)}">${item.result}</span></div>
    <div style="margin-top:6px;color:var(--muted)">${item.time}</div>
  </div>`;
}

function badgeClass(label){
  const t=String(label).toUpperCase();
  if(t==='WIN') return 'win';
  if(t==='LOSS') return 'lose';
  return 'pending';
}
function byId(id){return document.getElementById(id);}