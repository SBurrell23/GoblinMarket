import { defineStore } from 'pinia';

// ---- Data Interfaces ----
interface Tier { id: string; basePrice: number; [k: string]: any }
interface CostDef { res: string; base: number; mult: number }
interface Worker { id: string; baseRate?: number; tier?: string|null; costs?: CostDef[]; footfall?: number; desc?: string; [k: string]: any }
interface Building { id: string; type: string; costs?: CostDef[]; effects?: any; sells?: string[]; desc?: string; [k: string]: any }
interface Recipe { id: string; time: number; in: Record<string, number>; out: Record<string, number>; building: string; [k: string]: any }
interface GameData { tiers: Tier[]; workers: Worker[]; buildings: Building[]; recipes: Recipe[]; resourceColors?: Record<string,string>; [k: string]: any }

// ---- Constants ----
const ECON_SCALE = 15; // price = tier.basePrice * ECON_SCALE
const SAVE_KEY = 'goblin_market_save_v1';

// ---- Store ----
export const useGameStore = defineStore('game', {
  state: () => ({
    data: null as unknown as GameData,
    ready: false,
    inventory: {} as Record<string, number>,
    workers: {} as Record<string, number>,
    buildings: {} as Record<string, number>,
    coins: 0,
    lastCoins: 0,
    lastCoinsDelta: 0,
    log: [] as string[],
    tick: 0,
    timeSec: 0,
    running: false,
  _customerFrac: 0, // legacy (single stream) kept for backward compatibility
  _customerFracTypes: {} as Record<string, number>, // per customer type fractional accumulators
  coinsEarnedThisMinuteByType: {} as Record<string, number>,
  coinsEarnedPrevByType: {} as Record<string, number>,
  coinsEarnedHistoryByType: {} as Record<string, number[]>,
    // per-minute tracking
    soldThisMinute: {} as Record<string, number>,
    producedThisMinute: {} as Record<string, number>,
    inventoryLastSec: {} as Record<string, number>,
    inventoryDeltaSec: {} as Record<string, number>,
    maxDeltaPos: 0,
    // persistence helpers
    _sinceSave: 0,
    _listenersBound: false,
  }),
  actions: {
    // ---- Init / Persistence ----
    init(data: GameData){
      this.data = data;
      // seed tier tracking structures
      for(const t of this.data.tiers){
        if(this.inventory[t.id] == null) this.inventory[t.id] = 0;
        this.soldThisMinute[t.id] = 0;
        this.producedThisMinute[t.id] = 0;
        this.inventoryLastSec[t.id] = 0;
        this.inventoryDeltaSec[t.id] = 0;
      }
      const loaded = this.loadGame();
      if(!loaded){
        // starting assets (only if truly new)
        this.workers['scavenger'] = 1;
        const firstStall = this.data.buildings.find(b=> b.type==='stall');
        if(firstStall) this.buildings[firstStall.id] = 1;
        this.coins = 0;
        this.log.push('New game started');
      } else {
        this.log.push('Save loaded');
      }
      // seed earnings tracker per customer type
      for(const c of this.customerTypeConfig()){
        if(this.coinsEarnedThisMinuteByType[c.id] == null) this.coinsEarnedThisMinuteByType[c.id] = 0;
  if(this.coinsEarnedPrevByType[c.id] == null) this.coinsEarnedPrevByType[c.id] = 0;
  if(!Array.isArray(this.coinsEarnedHistoryByType[c.id])) this.coinsEarnedHistoryByType[c.id] = [];
      }
      this.timeSec = 0;
      this.ready = true;
      // listeners (once)
      if(typeof window !== 'undefined' && !this._listenersBound){
        window.addEventListener('beforeunload', () => { try { this.saveGame(); } catch {} });
        document.addEventListener('visibilitychange', () => { if(document.hidden){ try { this.saveGame(); } catch {} } });
        this._listenersBound = true;
      }
    },
    loadGame(): boolean {
      try {
        if(typeof localStorage === 'undefined') return false;
        const raw = localStorage.getItem(SAVE_KEY);
        if(!raw) return false;
        const save = JSON.parse(raw);
        if(!save || typeof save !== 'object') return false;
        if(typeof save.coins === 'number') this.coins = save.coins;
        if(save.inventory && typeof save.inventory === 'object'){
          for(const t of this.data.tiers){
            if(typeof save.inventory[t.id] === 'number') this.inventory[t.id] = save.inventory[t.id];
          }
        }
        if(save.workers && typeof save.workers === 'object'){
          for(const w of this.data.workers){
            if(typeof save.workers[w.id] === 'number') this.workers[w.id] = save.workers[w.id];
          }
        }
        if(save.buildings && typeof save.buildings === 'object'){
          for(const b of this.data.buildings){
            if(typeof save.buildings[b.id] === 'number') this.buildings[b.id] = save.buildings[b.id];
          }
        }
        return true;
      } catch(e){ console.warn('Load failed', e); return false; }
    },
    saveGame(){
      try {
        if(typeof localStorage === 'undefined') return;
        const payload = {
          version: 1,
          coins: this.coins,
            inventory: this.inventory,
            workers: this.workers,
            buildings: this.buildings,
            ts: Date.now()
        };
        localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
      } catch(e){ console.warn('Save failed', e); }
    },

    // ---- Helpers ----
    tier(id: string){ return this.data.tiers.find(t=> t.id===id)!; },
    addCoins(v: number){ this.coins += v; },
    workerCount(id: string){ return this.workers[id] || 0; },
    buildingLevel(id: string){ return this.buildings[id] || 0; },
    workerCost(id: string){
      const def = this.data.workers.find(w=> w.id===id);
      if(!def || !def.costs?.length) return 0;
      const owned = this.workerCount(id);
      // display primary cost's current amount (first entry)
      const c = def.costs[0];
      return Math.round(c.base * Math.pow(c.mult || 1, owned));
    },
    buildingCost(id: string){
      const def = this.data.buildings.find(b=> b.id===id);
      if(!def || !def.costs?.length) return 0;
      const lvl = this.buildingLevel(id);
      const c = def.costs[0];
      return Math.round(c.base * Math.pow(c.mult || 1, lvl));
    },
    canAfford(costs: CostDef[], scaleIndex: number){
      for(const c of costs){
        const amt = Math.round(c.base * Math.pow(c.mult || 1, scaleIndex));
        if(c.res === 'coins'){
          if(this.coins < amt) return false;
        } else if((this.inventory[c.res] || 0) < amt) return false;
      }
      return true;
    },
    payCosts(costs: CostDef[], scaleIndex: number){
      for(const c of costs){
        const amt = Math.round(c.base * Math.pow(c.mult || 1, scaleIndex));
        if(c.res === 'coins') this.coins -= amt; else this.inventory[c.res] -= amt;
      }
    },
    buyWorker(id: string){
      const def = this.data.workers.find(w=> w.id===id); if(!def) return false;
      const owned = this.workerCount(id);
      const costs = def.costs || [];
      if(!this.canAfford(costs, owned)) return false;
      this.payCosts(costs, owned);
      this.workers[id] = owned + 1;
      this.saveGame();
      return true;
    },
    build(id: string){
      const def = this.data.buildings.find(b=> b.id===id); if(!def) return false;
      const lvl = this.buildingLevel(id);
      const costs = def.costs || [];
      if(!this.canAfford(costs, lvl)) return false;
      this.payCosts(costs, lvl);
      this.buildings[id] = lvl + 1;
      this.saveGame();
      return true;
    },

    // ---- Customers ----
    rawCustomersPerMin(){
      // aggregate of all types (for legacy callers)
      const types = this.customersPerMinuteByType();
      let sum = 0; for(const k in types) sum += types[k];
      return sum;
    },
    customersPerMin(){ return this.rawCustomersPerMin(); },
    customersPerSec(){ return this.customersPerMin() / 60; },
    customersBreakdown(){
      const types = this.customersPerMinuteByType();
      const total = Object.values(types).reduce((a,b)=>a+b,0);
      return { ...types, total } as any;
    },
    // New: customer type definitions (extensible)
    customerTypeConfig(){
      return [
        { id: 'peasant', label: 'Peasant', buys: ['junk'], color: '#8d8d8d' },
        // Curio seekers now prefer curio but will buy junk as fallback (second in list used only if first unavailable)
        { id: 'curio', label: 'Curio Seeker', buys: ['curio','junk'], color: '#b388ff' },
      ];
    },
    customersPerMinuteByType(){
      const cfg = this.customerTypeConfig();
      const out: Record<string, number> = {};
      for(const c of cfg) out[c.id]=0;
      // buildings contribute based on what they sell
      for(const bId in this.buildings){
        const lvl = this.buildings[bId]; if(!lvl) continue;
        const def = this.data.buildings.find(b=> b.id===bId); if(!def) continue;
        if(def.type==='stall'){
          const base = (def.effects?.baseCustomers || 0) * lvl;
          // attribute entirely to the first matching customer type via sells list
          if(Array.isArray(def.sells)){
            for(const r of def.sells){
              const cType = cfg.find(c=> c.buys.includes(r));
              if(cType){ out[cType.id] += base; break; }
            }
          }
        }
      }
      // workers (barkers attract peasants)
      const barkerCount = this.workers['barker'] || 0;
      if(barkerCount>0){ out['peasant'] = (out['peasant']||0) + 12 * barkerCount; }
      return out;
    },
    customerTypes(){
      const cfg = this.customerTypeConfig();
      const perMin = this.customersPerMinuteByType();
      return cfg.map(c=> ({
        ...c,
        perMin: perMin[c.id]||0,
        perSec: (perMin[c.id]||0)/60,
        buys: c.buys,
        soldThisMinute: c.buys.reduce((s,res)=> s + (this.soldThisMinute[res]||0),0),
        coinsPerSec: this._smoothedCoinsPerSec(c.id)
      }));
    },
    _smoothedCoinsPerSec(typeId: string){
      const arr = this.coinsEarnedHistoryByType[typeId] || [];
      if(!arr.length) return 0;
      const avg = arr.reduce((a,b)=> a+b,0) / arr.length;
      return Math.floor(avg); // integer after smoothing
    },

    // ---- Loop ----
    start(){ if(!this.running){ this.running = true; requestAnimationFrame(this._loop); } },
    _loop: function(this: any){ if(!this.running) return; this.simTick(); requestAnimationFrame(this._loop); },
    simTick(){
      // run every 6th RAF (~10 Hz) for stable 0.1s steps
      this.tick++;
      if(this.tick % 6 !== 0) return;
      this.timeSec += 0.1;

      // production (per 0.1s slice)
      const scav = this.workers['scavenger'] || 0;
      if(scav > 0){
        const add = ((15 * scav) / 60) * 0.1; // baseRate 15 / min
        this.inventory['junk'] = (this.inventory['junk'] || 0) + add;
        if(this.producedThisMinute['junk'] !== undefined) this.producedThisMinute['junk'] += add;
      }
      const collectors = this.workers['collector'] || 0;
      if(collectors > 0){
        const def = this.data.workers.find(w=> w.id==='collector');
        const baseRate = def?.baseRate || 0; // per minute
        const addC = ((baseRate * collectors) / 60) * 0.1;
        this.inventory['curio'] = (this.inventory['curio'] || 0) + addC;
        if(this.producedThisMinute['curio'] !== undefined) this.producedThisMinute['curio'] += addC;
      }

      // second boundary logic
      const secondBoundary = Math.floor(this.timeSec) !== Math.floor(this.timeSec - 0.1);
      if(secondBoundary){
        // inventory deltas (per second)
        let maxPos = 0;
        for(const t of this.data.tiers){
          const id = t.id;
            const last = this.inventoryLastSec[id] || 0;
            const now = this.inventory[id] || 0;
            const d = now - last;
            this.inventoryDeltaSec[id] = d;
            this.inventoryLastSec[id] = now;
            if(d > maxPos) maxPos = d;
        }
        this.maxDeltaPos = maxPos;
        // minute rollover
        if(Math.floor(this.timeSec) % 60 === 0) this.minuteTick();

        // customers & selling (per-type streams)
        const perMinByType = this.customersPerMinuteByType();
        for(const typeId in perMinByType){
          const perSec = (perMinByType[typeId]||0)/60;
          this._customerFracTypes[typeId] = (this._customerFracTypes[typeId]||0) + perSec;
          const wholeType = Math.floor(this._customerFracTypes[typeId]);
          if(wholeType>0){
            const cfg = this.customerTypeConfig().find(c=> c.id===typeId);
            if(cfg){
              // Each customer instance purchases ONE of EACH listed resource (if available)
              for(let i=0;i<wholeType;i++){
                let anySold = false;
                for(const res of cfg.buys){
                  if((this.inventory[res]||0) >= 1){
                    this.inventory[res]-=1;
                    const price = this.resourceSellPrice(res);
                    this.addCoins(price);
                    this.coinsEarnedThisMinuteByType[typeId] = (this.coinsEarnedThisMinuteByType[typeId]||0) + price;
                    this.soldThisMinute[res] = (this.soldThisMinute[res]||0)+1;
                    anySold = true;
                  }
                }
                if(!anySold) break; // nothing to sell for this type anymore
              }
            }
            this._customerFracTypes[typeId] -= wholeType;
          }
        }
        this.saveGame(); // save after batch sales across all types

        // per-second coins delta
        this.lastCoinsDelta = this.coins - this.lastCoins;
        this.lastCoins = this.coins;

        // record per-type delta this second for smoothing (keep last 5 seconds)
        for(const c of this.customerTypeConfig()){
          const id = c.id;
          const cur = this.coinsEarnedThisMinuteByType[id] || 0;
          const prev = this.coinsEarnedPrevByType[id] || 0;
          const delta = cur - prev;
          this.coinsEarnedPrevByType[id] = cur;
          if(!this.coinsEarnedHistoryByType[id]) this.coinsEarnedHistoryByType[id] = [];
          this.coinsEarnedHistoryByType[id].push(delta);
          if(this.coinsEarnedHistoryByType[id].length > 5) this.coinsEarnedHistoryByType[id].shift();
        }

        // autosave every ~5 seconds
        this._sinceSave += 1;
        if(this._sinceSave >= 5){ this.saveGame(); this._sinceSave = 0; }
      }
    },
    minuteTick(){
      for(const t of this.data.tiers){
        this.producedThisMinute[t.id] = 0;
        this.soldThisMinute[t.id] = 0;
      }
      for(const c of this.customerTypeConfig()){
        this.coinsEarnedThisMinuteByType[c.id] = 0;
  this.coinsEarnedPrevByType[c.id] = 0;
  this.coinsEarnedHistoryByType[c.id] = [];
      }
    },

    // ---- Metrics ----
    currentProductionRate(tierId: string){ // per second (running average within current minute)
      const secs = (this.timeSec % 60) || 0.0001;
      return (this.producedThisMinute[tierId] || 0) / secs;
    },
    currentSalesRate(tierId: string){
      const secs = (this.timeSec % 60) || 0.0001;
      return (this.soldThisMinute[tierId] || 0) / secs;
    },
    supplyBarFill(tierId: string){
      const inv = this.inventory[tierId] || 0;
      const rate = this.currentProductionRate(tierId); // per second
      if(rate <= 0) return inv > 0 ? 1 : 0;
      return Math.max(0, Math.min(1, inv / (rate * 60))); // 1 minute capacity
    },
    supplyBarCapacity(tierId: string){
      const rate = this.currentProductionRate(tierId); // per second
      return rate * 60; // one minute buffer
    },
    resourceSellPrice(res: string){
      // price player receives per unit sold right now (no modifiers yet)
      const t = this.data.tiers.find(t=> t.id===res);
      if(!t) return 0;
      return t.basePrice * ECON_SCALE;
    },
    resourceColor(res: string){
      return (this.data.resourceColors && this.data.resourceColors[res]) || '#ddd';
    },
    // Smallest next purchase cost (worker or building) that consumes this resource
    nextCostForResource(res: string){
      let best: number|undefined;
      // workers
      for(const w of this.data.workers){
        if(!w.costs) continue;
        const owned = this.workers[w.id]||0;
        for(const c of w.costs){
          if(c.res===res){
            const amt = Math.round(c.base * Math.pow(c.mult||1, owned));
            if(amt>0 && (best===undefined || amt<best)) best = amt;
          }
        }
      }
      // buildings
      for(const b of this.data.buildings){
        if(!b.costs) continue;
        const lvl = this.buildings[b.id]||0;
        for(const c of b.costs){
          if(c.res===res){
            const amt = Math.round(c.base * Math.pow(c.mult||1, lvl));
            if(amt>0 && (best===undefined || amt<best)) best = amt;
          }
        }
      }
      return best || 0; // 0 indicates no purchase uses this resource
    }
  }
});

