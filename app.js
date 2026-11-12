
const $ = id => document.getElementById(id);
const KEY = "scb-v3";
const INITIAL_BALANCE = 200;
const RISK_PER_TRADE = 0.01;
const DAILY_LOSS_LIMIT = 0.03;

const defaults = {
  balance: 200,
  history: [],
  position: null,
  running: false,
  lastCandle: null,
  dayKey: "",
  dayStartBalance: 200,
  dailyRealizedPnl: 0
};

let st = (() => {
  try {
    return Object.assign({}, defaults, JSON.parse(localStorage.getItem(KEY) || "{}"));
  } catch {
    return { ...defaults };
  }
})();

let candles = [];
let ticker = null;

const fmt = n => Number(n).toLocaleString("en-US", { maximumFractionDigits: 6 });
const log = s => $("status").textContent = s;

function ensureDailyState() {
  const d = new Date();
  const today = `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
  if (st.dayKey !== today) {
    st.dayKey = today;
    st.dayStartBalance = st.balance;
    st.dailyRealizedPnl = 0;
  }
}

function save() {
  ensureDailyState();
  localStorage.setItem(KEY, JSON.stringify(st));
  render();
}

function render() {
  $("balance").textContent = fmt(st.balance) + " USDT";
  const pnl = st.history.reduce((a,t) => a + Number(t.pnl || 0), 0);
  $("pnl").textContent = (pnl >= 0 ? "+" : "") + fmt(pnl) + " USDT";
  $("trades").textContent = st.history.length;

  const p = st.position;
  $("position").textContent = p
    ? p.side + " • " + $("pair").selectedOptions[0].text + " • Score " + p.score
    : "No open position";

  $("entry").textContent = p ? fmt(p.entry) : "—";
  $("sl").textContent = p ? fmt(p.sl) : "—";
  $("tp1").textContent = p ? fmt(p.tp1) + (p.tp1Hit ? " • HIT 50%" : "") : "—";
  $("tp2").textContent = p ? fmt(p.tp2) : "—";
  $("qty").textContent = p ? fmt(p.qty) : "—";

  $("history").innerHTML = st.history.slice(0,12)
    .map(t => `<div class="trade">${t.side} • ${fmt(t.pnl)} USDT • ${t.reason}</div>`)
    .join("") || "No trades yet.";
}

function ema(a,p) {
  const k = 2/(p+1);
  let v = a[0], out = [v];
  for(let i=1;i<a.length;i++) {
    v = a[i]*k + v*(1-k);
    out.push(v);
  }
  return out;
}

function rsi(a,p=14) {
  let g=0,l=0;
  for(let i=a.length-p;i<a.length;i++) {
    const d=a[i]-a[i-1];
    if(d>0) g+=d; else l-=d;
  }
  return l===0 ? 100 : 100-100/(1+g/l);
}

function atr(c,p=14) {
  const a=[];
  for(let i=1;i<c.length;i++) {
    a.push(Math.max(
      c[i].high-c[i].low,
      Math.abs(c[i].high-c[i-1].close),
      Math.abs(c[i].low-c[i-1].close)
    ));
  }
  return a.slice(-p).reduce((s,x)=>s+x,0)/Math.min(p,a.length);
}

function signal(c) {
  const a=c.slice(0,-1).map(x=>x.close);
  const e20=ema(a,20), e50=ema(a,50), v=rsi(a);
  const m=ema(a,12), n=ema(a,26);
  const mac=m.at(-1)-n.at(-1), prev=m.at(-2)-n.at(-2);
  let b=0,s=0;

  if(e20.at(-1)>e50.at(-1)) b+=25; else s+=25;
  if(v>=52&&v<=68) b+=15;
  else if(v>=32&&v<=48) s+=15;
  if(mac>0&&mac>prev) b+=20;
  else if(mac<0&&mac<prev) s+=20;
  if(a.at(-1)>e20.at(-1)) b+=20; else s+=20;

  const strength=Math.abs(e20.at(-1)-e50.at(-1))/a.at(-1)*10000;
  if(strength>8) {
    if(e20.at(-1)>e50.at(-1)) b+=10; else s+=10;
  }

  return {
    side:b>=70&&b>s?"BUY":s>=70&&s>b?"SELL":"WAIT",
    score:Math.max(b,s)
  };
}


async function getData() {
  const to = Math.floor(Date.now() / 1000);
  const from = to - 60 * 60 * 24 * 29;

  const q = new URLSearchParams({
    pair: $("pair").value,
    from,
    to,
    resolution: "15",
    pcode: "f"
  });

  const r = await fetch(
    "/.netlify/functions/candles?" + q.toString(),
    { cache: "no-store" }
  );

  if (!r.ok) throw Error("Proxy HTTP " + r.status);

  const j = await r.json();
  const a = Array.isArray(j) ? j : (j.data || []);

  return a.map(x => ({
    open: +x.open,
    high: +x.high,
    low: +x.low,
    close: +x.close,
    volume: +x.volume,
    time: +x.time
  }))
  .filter(x => x.close > 0)
  .sort((a, b) => a.time - b.time);
}


function dailyLimitAmount() {
  return Math.max(0,Number(st.dayStartBalance)||200)*DAILY_LOSS_LIMIT;
}

function unrealized(price) {
  const p=st.position;
  if(!p) return 0;
  return (p.side==="BUY"?price-p.entry:p.entry-price)*p.qty;
}

function pauseForDailyLimit() {
  st.running=false;
  if(ticker) clearInterval(ticker);
  ticker=null;
}

function close(price,reason) {
  const p=st.position;
  if(!p) return;

  const pnl=(p.side==="BUY"?price-p.entry:p.entry-price)*p.qty;
  st.balance+=pnl;
  st.dailyRealizedPnl+=pnl;

  st.history.unshift({
    side:p.side,
    pnl:Number(p.realizedPnl||0)+pnl,
    reason,
    time:Date.now()
  });

  st.position=null;

  if(st.dailyRealizedPnl<=-dailyLimitAmount()) pauseForDailyLimit();
  save();
}

function managePosition(candle) {
  const p=st.position;
  if(!p) return;

  const stopHit=p.side==="BUY"
    ? candle.low<=p.sl
    : candle.high>=p.sl;

  if(stopHit) {
    close(p.sl,"STOP LOSS");
    return;
  }

  if(!p.tp1Hit) {
    const hit=p.side==="BUY"
      ? candle.high>=p.tp1
      : candle.low<=p.tp1;

    if(hit) {
      const half=p.initialQty*0.5;
      const profit=(p.side==="BUY"?p.tp1-p.entry:p.entry-p.tp1)*half;

      p.qty=Math.max(0,p.qty-half);
      p.realizedPnl=(p.realizedPnl||0)+profit;
      p.tp1Hit=true;
      st.balance+=profit;
      st.dailyRealizedPnl+=profit;
      p.sl=p.entry;

      save();
      return;
    }
  } else {
    const hit=p.side==="BUY"
      ? candle.high>=p.tp2
      : candle.low<=p.tp2;

    if(hit) close(p.tp2,"TARGET 2 - REMAINING 50%");
  }
}

async function refresh() {
  ensureDailyState();
  log("Loading CoinDCX 15M data...");

  try {
    candles=await getData();
    if(candles.length<200) Error("Insufficient candle data");

    const closed=candles.slice(0,-1);
    const last=closed.at(-1);
    const s=signal(candles);

    $("signal").textContent=s.side;
    $("signal").className=s.side==="BUY"?"green":s.side==="SELL"?"red":"";
    $("score").textContent="Signal score: "+s.score+"/100 • Heuristic only";
    $("price").textContent=fmt(last.close);
    $("candleTime").textContent=new Date(last.time).toLocaleString();
    $("count").textContent=candles.length;

    if(st.position) managePosition(last);

    if(st.running &&
      st.dailyRealizedPnl+unrealized(last.close)<=-dailyLimitAmount()) {
      if(st.position) close(last.close,"DAILY LOSS LIMIT");
      pauseForDailyLimit();
      save();
      log("Daily loss limit reached • Bot paused");
      return;
    }

    const id=String(last.time);

    if(st.running&&!st.position&&st.lastCandle!==id&&s.score>=70&&s.side!=="WAIT") {
      const distance=Math.max(atr(closed)*1.5,last.close*0.002);
      const risk=Math.min(st.balance*RISK_PER_TRADE,st.balance);
      const qty=distance>0?risk/distance:0;

      if(qty>0&&risk>0) {
        const isLong=s.side==="BUY";

        st.position={
          side:s.side,
          entry:last.close,
          sl:isLong?last.close-distance:last.close+distance,
          tp1:isLong?last.close+distance:last.close-distance,
          tp2:isLong?last.close+2*distance:last.close-2*distance,
          qty,
          initialQty:qty,
          realizedPnl:0,
          tp1Hit:false,
          score:s.score
        };
      }
    }

    st.lastCandle=id;
    save();

    log(st.running
      ?"Data updated • Paper bot active while page is visible"
      :"Data updated • Bot paused");

  } catch(e) {
    log("Market data unavailable: "+e.message);
  }
}

function start() {
  ensureDailyState();

  if(st.dailyRealizedPnl<=-dailyLimitAmount()) {
    log("Daily loss limit reached • Bot remains paused");
    return;
  }

  st.running=true;
  save();
  refresh();

  if(ticker) clearInterval(ticker);
  ticker=setInterval(()=>{
    if(document.visibilityState==="visible") refresh();
  },15*60*1000);
}

$("refresh").onclick=refresh;
$("start").onclick=start;

$("pause").onclick=()=>{
  st.running=false;
  if(ticker) clearInterval(ticker);
  ticker=null;
  save();
  log("Bot paused");
};

$("exit").onclick=()=>{
  if(st.position) close(candles.at(-2)?.close||st.position.entry,"MANUAL EXIT");
};

$("reset").onclick=()=>{
  if(confirm("Reset virtual balance to 200 USDT and erase history?")) {
    st={...defaults,history:[],position:null,running:false};
    ensureDailyState();
    save();
    log("Paper account reset");
  }
};

$("pair").onchange=()=>{
  if(st.position) {
    log("Close open position before changing market");
    return;
  }
  refresh();
};

document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="visible"&&st.running) refresh();
});

if("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(()=>{});
}

ensureDailyState();
render();
