// ===== Firebase Config =====
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ===== Account Mode (Demo / Real) =====
let accountMode = "Demo";
function toggleAccountMode(){
  accountMode = accountMode === "Demo" ? "Real" : "Demo";
  alert("Switched to " + accountMode + " account.");
}

// ===== User Login / Signup =====
let currentUser = null;
async function signup(){
  const email = document.getElementById("signupEmail").value;
  const password = document.getElementById("signupPassword").value;
  const regex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/;
  if(!regex.test(password)){ alert("Password must be 8+ chars with letters, numbers & symbols"); return; }
  try {
    const userCredential = await auth.createUserWithEmailAndPassword(email,password);
    await userCredential.user.sendEmailVerification();
    alert("Verification email sent!");
    await db.collection("users").doc(userCredential.user.uid).set({balance:1000000,trades:[]});
  } catch(err){ alert(err.message); }
}

async function login(){
  const email = document.getElementById("loginEmail").value;
  const password = document.getElementById("loginPassword").value;
  try{
    const userCredential = await auth.signInWithEmailAndPassword(email,password);
    if(!userCredential.user.emailVerified){ alert("Verify your email first."); return; }
    const userData = await db.collection("users").doc(userCredential.user.uid).get();
    currentUser = {uid:userCredential.user.uid,...userData.data()};
    document.getElementById("signupScreen").style.display="none";
    document.getElementById("loginScreen").style.display="none";
    document.getElementById("app").style.display="block";
    initApp();
  }catch(err){alert(err.message);}
}

// ===== Symbols Setup =====
const symbols = {
  "Major Forex": ["EUR/USD","GBP/USD","USD/JPY","AUD/USD","USD/CAD","NZD/USD","USD/CHF"],
  "Minor Forex": ["EUR/GBP","EUR/JPY","GBP/JPY","AUD/JPY","EUR/AUD","AUD/NZD","CAD/JPY"],
  "Crypto": ["BTC/USD","ETH/USD","BNB/USD","XRP/USD","ADA/USD","SOL/USD","DOGE/USD","LTC/USD"],
  "Commodities": ["XAU/USD"]
};

let prices={}; let currentSymbol="EUR/USD"; let candles=[], lastCandleTime=Math.floor(Date.now()/1000);

// ===== Render Symbols Tabs =====
function renderSymbols(){
  const container = document.getElementById("symbolSelector");
  container.innerHTML="";
  for(let category in symbols){
    const catDiv = document.createElement("div");
    catDiv.innerHTML=`<span class="category-title">${category}</span> `;
    symbols[category].forEach(sym=>{
      const btn=document.createElement("button");
      btn.innerText=sym; btn.onclick=()=>changeSymbol(sym);
      if(sym===currentSymbol) btn.classList.add("active");
      catDiv.appendChild(btn);
    });
    container.appendChild(catDiv);
  }
}
function changeSymbol(sym){
  currentSymbol=sym; candles=[]; updatePairSelect();
  document.querySelectorAll(".symbol-tabs button").forEach(btn=>btn.classList.remove("active"));
  [...document.querySelectorAll(".symbol-tabs button")].find(b=>b.innerText===sym)?.classList.add("active");
}

// ===== Pair select in trade panel =====
function updatePairSelect(){
  const sel=document.getElementById("pair"); sel.innerHTML="";
  for(let cat in symbols) symbols[cat].forEach(s=>sel.appendChild(new Option(s,s)));
}

// ===== Chart Setup =====
const chart = LightweightCharts.createChart(document.getElementById("chart"),{
  layout:{background:{color:"#0e1117"},textColor:"#d1d4dc"},
  grid:{vertLines:{color:"#161b22"},horzLines:{color:"#161b22"}},
  timeScale:{timeVisible:true,secondsVisible:false}
});
const candleSeries = chart.addCandlestickSeries({upColor:"#2ea043",downColor:"#f85149",borderUpColor:"#2ea043",borderDownColor:"#f85149",wickUpColor:"#2ea043",wickDownColor:"#f85149"});

// ===== Price Fetching =====
async function fetchPrice(pair){
  // Forex / XAU
  if([].concat(symbols["Major Forex"],symbols["Minor Forex"],symbols["Commodities"]).includes(pair)){
    const res = await fetch(`https://api.exchangerate.host/latest?base=${pair.split('/')[0]}&symbols=${pair.split('/')[1]}`);
    const data = await res.json(); prices[pair]=parseFloat(data.rates[pair.split('/')[1]]);
  }
  // Crypto
  if(symbols["Crypto"].includes(pair)){
    const s=pair.split('/')[0].toLowerCase(),c=pair.split('/')[1].toLowerCase();
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${s}&vs_currencies=${c}`);
    const data = await res.json(); prices[pair]=data[s][c];
  }
}

// ===== Candle Generator =====
async function generateCandle(sym){
  await fetchPrice(sym);
  const open=prices[sym],high=open+Math.random()*0.02,low=open-Math.random()*0.02,close=low+Math.random()*(high-low);
  prices[sym]=close;
  if(sym===currentSymbol){ candles.push({time:lastCandleTime, open, high, low, close}); candleSeries.setData(candles); }
  lastCandleTime+=60;
}

// ===== Trading Functions =====
function openTrade(){
  const pair=document.getElementById("pair").value;
  const lot=parseFloat(document.getElementById("lot").value);
  const type=document.getElementById("type").value;
  const sl=parseFloat(document.getElementById("sl").value);
  const tp=parseFloat(document.getElementById("tp").value);
  const trade={id:Date.now(),pair,lot,remainingLot:lot,entryPrice:prices[pair],type,stopLoss:sl||null,takeProfit:tp||null,profit:0};
  currentUser.trades.push(trade); renderTrades(); saveUserData();
}

function calculateProfit(trade){
  const diff=trade.type==="buy"?prices[trade.pair]-trade.entryPrice:trade.entryPrice-prices[trade.pair];
  return diff*trade.remainingLot*100000;
}

function takePartial(id,percent){
  const trade=currentUser.trades.find(t=>t.id===id); if(!trade)return;
  const cutLot=trade.remainingLot*percent, profitPart=trade.profit*percent;
  currentUser.balance+=profitPart; trade.remainingLot-=cutLot;
  if(trade.remainingLot<=0.001) currentUser.trades=currentUser.trades.filter(t=>t.id!==id);
  document.getElementById("balance").innerText=currentUser.balance.toFixed(2);
  renderTrades();
  saveUserData();
}

function renderTrades(){
  const list=document.getElementById("tradeList"); list.innerHTML="";
  currentUser.trades.forEach(trade=>{
    trade.profit=calculateProfit(trade);
    const div=document.createElement("div"); div.className="trade";
    const cls = trade.profit>=0 ? "profit":"loss";
    div.innerHTML=`<div class="trade-info"><strong>${trade.pair} (${trade.type.toUpperCase()})</strong><span>Lot:${trade.remainingLot.toFixed(2)}</span></div>
    <div class="trade-info"><span>Entry:${trade.entryPrice.toFixed(4)}</span><span class="${cls}">${trade.profit.toFixed(2)}</span></div>
    <div class="trade-info"><small>SL:${trade.stopLoss??"-"}</small><small>TP:${trade.takeProfit??"-"}</small></div>
    <div class="partials">
      <button onclick="takePartial(${trade.id},0.25)">25%</button>
      <button onclick="takePartial(${trade.id},0.5)">50%</button>
      <button onclick="takePartial(${trade.id},0.75)">75%</button>
      <button onclick="takePartial(${trade.id},1)">100%</button>
    </div>`;
    list.appendChild(div);
  });
}

// ===== Save User Data =====
async function saveUserData(){ await db.collection("users").doc(currentUser.uid).set(currentUser); }

// ===== Market Simulation =====
async function simulateMarket(){
  await generateCandle(currentSymbol);
  for(let sym in prices){ prices[sym]+=(Math.random()-0.5)*0.002; }
  currentUser.trades.forEach(trade=>trade.profit=calculateProfit(trade));
  document.getElementById("balance").innerText=currentUser.balance.toFixed(2);
  renderTrades();
}
setInterval(simulateMarket,1000);

// ===== Initialize App =====
function initApp(){ renderSymbols(); updatePairSelect(); }
