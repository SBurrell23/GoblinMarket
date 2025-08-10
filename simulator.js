#!/usr/bin/env node
/**
 * Goblin Market 30-minute rough balancer simulation
 * Focus: early loop (junk -> curio sales, unlocking workshop, tunnel, kiosk)
 * This is a deterministic/stochastic hybrid with seeded RNG for repeatability.
 */

const fs = require('fs');
const path = require('path');

// Simple seeded RNG
function rng(seed){
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const dataPath = path.join(__dirname, 'data', 'gameData.json');
const gameData = JSON.parse(fs.readFileSync(dataPath,'utf-8'));

// Config (CLI: node simulator.js [minutes=30] [seed=1337])
const argMinutes = parseInt(process.argv[2]||'30',10);
const argSeed = parseInt(process.argv[3]||'1337',10);
const SIM_MINUTES = isNaN(argMinutes)?30:argMinutes; // target length
const TICK_SEC = 1; // 1-second tick
const SEED = isNaN(argSeed)?1337:argSeed;
const rand = rng(SEED);
// Economy scaling (visual inflation). Set to >1 to make numbers feel juicier.
const ECON_SCALE = 15; // multiplies prices, costs, phase thresholds

// State
const state = {
  timeSec: 0,
  coins: 0,
  heat: 0,
  heatCap: 100,
  inventory: { junk: 0, curio: 0, relic: 0, contraband: 0, arcana: 0 },
  workers: { scavenger: 1 },
  buildings: { stall_shady: 1 },
  demand: { junk: 1.0, curio: 1.0, relic: 1.0, contraband: 1.0, arcana: 1.0 },
  sold: { junk: 0, curio: 0, relic: 0, contraband: 0, arcana: 0 },
  unlocks: new Set(['scavenger','stall_shady']),
  phase: 0,
  prestige1: false,
  charms: 0, // soft timer drops for arcana
  seals: 0   // smuggler/tunnel drops for contraband
};

// Helper lookups
const tierMap = Object.fromEntries(gameData.tiers.map(t=>[t.id,t]));
const workerMap = Object.fromEntries(gameData.workers.map(w=>[w.id,w]));
const buildingMap = Object.fromEntries(gameData.buildings.map(b=>[b.id,b]));

function workerRate(id){
  const w = workerMap[id];
  if(!w) return 0;
  let base = w.baseRate || 0;
  // simple variance roll per minute bucket
  const variance = w.variance || 0;
  const roll = 1 + (rand()*2 -1)*variance; // uniform
  return base * roll; // items per minute for gather/craft workers
}

function costForWorker(id){
  const w = workerMap[id];
  const owned = state.workers[id] || 0;
  return Math.round(w.baseCost * ECON_SCALE * Math.pow(w.costMult, owned));
}

function tryAutoPurchases(){
  const coinsPerMin = totalCoinsPerMinRecent();
  // Phase thresholds to stretch to ~8h: we escalate costs artificially
  const phaseDefs = [
  {phase:0, targetCoins:   500 * ECON_SCALE, action: ()=> { /* early gather */}},
  {phase:1, targetCoins:  2500 * ECON_SCALE, action: buildWorkshop},
  {phase:2, targetCoins: 10000 * ECON_SCALE, action: hireCrafty},
  {phase:3, targetCoins: 30000 * ECON_SCALE, action: buildTunnel},
  {phase:4, targetCoins: 80000 * ECON_SCALE, action: buildKiosk},
  {phase:5, targetCoins:150000 * ECON_SCALE, action: enableContraband},
  {phase:6, targetCoins:300000 * ECON_SCALE, action: ()=> state.prestige1=true }
  ];
  const currentPhaseDef = phaseDefs[state.phase];
  if(currentPhaseDef && state.coins >= currentPhaseDef.targetCoins){
    currentPhaseDef.action();
    logEvent(`Phase advanced to ${state.phase+1}`);
    state.phase++;
  }
  // Scavengers scaling early
  if(state.phase < 2 && (state.workers.scavenger||0) < 5){
    buyWorker('scavenger');
  }
  // Additional scavengers if coin rate supports
  if(state.phase >=2 && (state.workers.scavenger||0) < 8 && coinsPerMin > 300){
    buyWorker('scavenger');
  }
  if(state.workers.crafty && (state.workers.crafty||0) < 3 && coinsPerMin > 800){
    buyWorker('crafty');
  }
  // Hire hexer after kiosk present and arcana pipeline desired
  if(state.buildings.kiosk && !state.workers.hexer && state.coins > 5000){ buyWorker('hexer'); }
  // Hire shady after permit for contraband mystery boxes (simplified income boost) - optional
  if(state.buildings.black_permit && !state.workers.shady && state.coins > 12000){ buyWorker('shady'); }
  // Upgrade workshop to lvl3 for relic recipe
  if(state.buildings.workshop && (state.buildings.workshopLvl||1) < 3 && state.coins > 4000){
    upgradeBuilding('workshop');
  }
  // Upgrade tunnel to lvl2 for contraband recipe
  if(state.buildings.tunnel && (state.buildings.tunnelLvl||1) < 2 && state.coins > 6000){
    upgradeBuilding('tunnel');
  }
  // Build curio booth early if coins allow & not built
  if(!state.buildings.booth_curio && state.coins > 1200){ buildCurioBooth(); }
  // Build auction block mid progression
  if(!state.buildings.auction_block && state.coins > 18000){ buildAuctionBlock(); }
}

function buyWorker(id){
  const w = workerMap[id]; if(!w) return;
  const c = costForWorker(id);
  if(state.coins >= c){
    state.coins -= c;
    state.workers[id] = (state.workers[id]||0)+1;
    logEvent(`Bought ${id} (${state.workers[id]}) cost=${c}`);
  }
}

function buildWorkshop(){
  const cost = 800 * ECON_SCALE;
  if(!state.buildings.workshop && state.coins >= cost){
    state.coins -= cost; state.buildings.workshop=1; logEvent(`Built workshop (cost ${cost})`);
  }
}
function hireCrafty(){
  if(state.buildings.workshop){ buyWorker('crafty'); }
}
function buildTunnel(){
  const cost = 4000 * ECON_SCALE;
  if(!state.buildings.tunnel && state.coins >= cost){
    state.coins -= cost; state.buildings.tunnel=1; state.heatCap=120; logEvent(`Built tunnel (cost ${cost}); heat cap 120`);
  }
}
function buildKiosk(){
  const cost = 7500 * ECON_SCALE;
  if(!state.buildings.kiosk && state.coins >= cost){
    state.coins -=cost; state.buildings.kiosk=1; logEvent(`Built kiosk (cost ${cost})`);
  }
}
function enableContraband(){
  const cost = 10000 * ECON_SCALE;
  if(!state.buildings.black_permit && state.coins >= cost){
    state.coins -=cost; state.buildings.black_permit=1; logEvent(`Permit acquired (cost ${cost})`);
  }
}
function buildCurioBooth(){
  const cost = 500 * ECON_SCALE;
  if(!state.buildings.booth_curio && state.coins >= cost){
    state.coins -=cost; state.buildings.booth_curio=1; logEvent(`Built curio booth (cost ${cost})`);
  }
}
function buildAuctionBlock(){
  const cost = 2500 * ECON_SCALE;
  if(!state.buildings.auction_block && state.coins >= cost){
    state.coins -=cost; state.buildings.auction_block=1; logEvent(`Built auction block (cost ${cost})`);
  }
}
function upgradeBuilding(id){
  // Simple cost: baseCost * (level+1)
  const b = buildingMap[id]; if(!b) return;
  const lvlKey = id+"Lvl";
  const lvl = state.buildings[lvlKey] || 1;
  const cost = Math.round(b.baseCost * ECON_SCALE * (lvl+0.5));
  if(state.coins >= cost){
    state.coins -= cost;
    state.buildings[lvlKey] = lvl+1;
    logEvent(`Upgraded ${id} to L${lvl+1} cost=${cost}`);
  }
}

const salesHistory = []; // coins per minute
function totalCoinsPerMinRecent(){
  if(salesHistory.length === 0) return 0;
  const last5 = salesHistory.slice(-5);
  return last5.reduce((a,b)=>a+b,0)/last5.length;
}

function demandDecay(tier, soldItems){
  // oversell: -1% per 15 items per design (simplified per minute)
  const decaySteps = Math.floor(soldItems / 15);
  state.demand[tier] = Math.max(0.6, state.demand[tier] - 0.01*decaySteps);
}

function recoverDemand(){
  for(const k of Object.keys(state.demand)){
    state.demand[k] = Math.min(1.0, state.demand[k] + 0.05/60); // per second
  }
}

function basePrice(tier){
  return tierMap[tier].basePrice;
}

function stallPriceBonus(tier){
  let bonus = 0;
  if(tier==='junk'){
    const lvl = state.buildings.stall_shady||0; bonus += 0.05*(lvl-1);
  }
  if(tier==='curio' && state.buildings.booth_curio){
    bonus += 0.1; // base booth bonus
  }
  if(state.buildings.auction_block){
    bonus += 0.05; // mild global price spike effect placeholder
  }
  return bonus;
}

function finalPrice(tier){
  const dynamicPhaseMult = 1 + state.phase * 0.04; // escalate pricing over phases (~24% by phase 6)
  // Introduce mild random rarity/market roll 0.97-1.08 per minute per tier
  if(state.timeSec % 60 === 1){
    if(!state._priceRoll) state._priceRoll = {};
    state._priceRoll[tier] = 0.97 + rand()*0.11;
  }
  const roll = (state._priceRoll && state._priceRoll[tier]) || 1;
  return basePrice(tier) * ECON_SCALE * (1 + stallPriceBonus(tier)) * state.demand[tier] * dynamicPhaseMult * roll;
}

function simulateTick(){
  state.timeSec++;
  // Gathering each second (convert per minute rate to per second)
  for(const [id,count] of Object.entries(state.workers)){
    const w = workerMap[id];
    if(!w) continue;
    if(w.role==='gather' && w.tier==='junk'){
      // rate pre-sampled once per minute bucket for simplicity
      if(state.timeSec % 60 === 1){
        w._cachedRate = workerRate(id); // items per minute
      }
      const ratePerSec = (w._cachedRate||0)/60 * count;
      state.inventory.junk += ratePerSec;
    }
  }
  // Crafting: Crafty converts junk->curio (3:1) every 7s baseline simplified continuous
  // Minute variance roll for crafting groups
  if(state.timeSec % 60 === 1){
    state._craftRoll = 1 + (rand()*0.2 - 0.1);
  }
  // Crafting pipelines (continuous approximation)
  // junk -> curio (Crafty)
  if(state.workers.crafty){
    const craftsPerSec = (1/7) * state.workers.crafty * (state._craftRoll||1);
    const needJunk = 3*craftsPerSec;
    if(state.inventory.junk >= needJunk){
      state.inventory.junk -= needJunk;
      state.inventory.curio += craftsPerSec;
      state.heat += craftsPerSec * 1; // curio heat baseline from design (relic had 1 but curio 0; here from crafting cost) simplified
    }
  }
  // curio -> relic (workshop L3)
  if((state.buildings.workshopLvl||1) >=3){
    const craftsPerSec = (1/15) * (state._craftRoll||1); // 1 slot
    const needCurio = 4*craftsPerSec;
    if(state.inventory.curio >= needCurio){
      state.inventory.curio -= needCurio;
      state.inventory.relic += craftsPerSec;
      state.heat += craftsPerSec * 1; // relic heat per sale baseline
    }
  }
  // charm generation (1/min)
  if(state.timeSec % 60 === 0){ state.charms += 1; }
  // curio+charm -> arcana (kiosk + hexer)
  if(state.buildings.kiosk && state.workers.hexer){
    const craftsPerSec = (1/18) * state.workers.hexer * (state._craftRoll||1);
    const needCurio = 2*craftsPerSec;
    const needCharm = 1*craftsPerSec;
    if(state.inventory.curio >= needCurio && state.charms >= needCharm){
      state.inventory.curio -= needCurio;
      state.charms -= needCharm;
      state.inventory.arcana += craftsPerSec;
      state.heat += craftsPerSec * 2; // arcana heat
    }
  }
  // seal generation (0.5/min) after tunnel built
  if(state.buildings.tunnel && state.timeSec % 120 === 0){ state.seals += 1; }
  // relic + seal -> contraband (tunnel L2 + permit)
  if(state.buildings.black_permit && (state.buildings.tunnelLvl||1) >=2){
    const craftsPerSec = (1/12) * (state._craftRoll||1);
    const needRelic = 1*craftsPerSec;
    const needSeal = 1*craftsPerSec;
    if(state.inventory.relic >= needRelic && state.seals >= needSeal){
      state.inventory.relic -= needRelic;
      state.seals -= needSeal;
      state.inventory.contraband += craftsPerSec;
      state.heat += craftsPerSec * 2; // contraband heat
    }
  }
  // Sales: footfall scales with phase + buildings (booth adds customers)
  let baseCustomersPerMin = 8 + state.phase*4;
  if(state.buildings.booth_curio) baseCustomersPerMin += 5;
  if(state.buildings.auction_block) baseCustomersPerMin += 6;
  const customersThisSec = baseCustomersPerMin/60;
  // allocate probability to tiers based on availability
  let coinsEarned = 0;
  function trySell(tier, maxPerCustomer=1){
    const wholeItems = Math.floor(state.inventory[tier]);
    if(wholeItems <=0) return 0;
    const sellCount = Math.min(wholeItems, maxPerCustomer);
    state.inventory[tier] -= sellCount;
    const price = finalPrice(tier) * sellCount;
    coinsEarned += price;
    state.sold[tier] += sellCount;
    state.heat += tierMap[tier].heatPerSale * sellCount;
  }
  // Prioritized selling: arcana > contraband > relic > curio > junk
  const expectedCustomers = customersThisSec;
  let fractional = fractionalCustomers.acc + expectedCustomers;
  let processed = 0;
  while(fractional >= 1){
    if(Math.floor(state.inventory.arcana)>=1){ trySell('arcana',1); }
    else if(Math.floor(state.inventory.contraband)>=1){ trySell('contraband',1); }
    else if(Math.floor(state.inventory.relic)>=1){ trySell('relic',1); }
    else if(Math.floor(state.inventory.curio)>=1){ trySell('curio',2); }
    else if(Math.floor(state.inventory.junk)>=1){ trySell('junk',3); }
    fractional -=1; processed++;
  }
  fractionalCustomers.acc = fractional;

  // Demand adjustments each minute
  if(state.timeSec % 60 === 0){
    demandDecay('junk', state.sold.junk);
    demandDecay('curio', state.sold.curio);
    salesHistory.push(coinsEarnedMinute.acc + coinsEarned);
    if(salesHistory.length>60) salesHistory.shift();
    state.sold.junk = 0; state.sold.curio = 0;
    coinsEarnedMinute.acc = 0;
  }
  recoverDemand();

  state.coins += coinsEarned;
  coinsEarnedMinute.acc += coinsEarned;

  // Heat passive decay & clamp
  state.heat = Math.max(0, state.heat - (0.5/60));
  if(state.heat > state.heatCap) state.heat = state.heatCap;

  // Auto purchases heuristics every 5s
  if(state.timeSec % 5 === 0) tryAutoPurchases();
}

const fractionalCustomers = { acc: 0 };
const coinsEarnedMinute = { acc: 0 };
const eventsLog = [];
function logEvent(msg){
  eventsLog.push(`[${fmtTime(state.timeSec)}] ${msg}`);
}

function fmtTime(sec){
  const m = Math.floor(sec/60); const s = sec % 60;
  return `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
}

for(let i=0;i<SIM_MINUTES*60;i++){
  simulateTick();
  if(state.prestige1){
    logEvent('Prestige 1 triggered - ending sim early');
    break;
  }
}

// Summary
console.log('Goblin Market 30m Simulation Summary');
console.log('Time:', fmtTime(state.timeSec));
console.log('Config: minutes=%d seed=%d', SIM_MINUTES, SEED);
console.log('Coins:', state.coins.toFixed(1));
console.log('Inventory:', Object.fromEntries(Object.entries(state.inventory).map(([k,v])=>[k, Number(v.toFixed(1))])));
console.log('Heat:', state.heat.toFixed(2));
console.log('Phase:', state.phase, 'Prestige1:', state.prestige1);
console.log('Workers:', state.workers);
console.log('Buildings:', state.buildings);
console.log('Demand:', state.demand);
console.log('\nKey Events:');
for(const e of eventsLog.slice(-15)) console.log(' -', e);

// Simple KPIs
const avgCPM = salesHistory.reduce((a,b)=>a+b,0)/ (salesHistory.length||1);
console.log('\nAvg coins/min (recent buckets):', avgCPM.toFixed(2));

// Flag potential issues
if(state.heat > 50) console.log('WARNING: Heat high for early phase');
if(state.coins < 1000) console.log('NOTE: Low coin total; maybe increase footfall or price');
