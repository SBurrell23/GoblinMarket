<template>
  <div class="flex flex-col h-full">
    <header class="p-3 bg-goblin-800 shadow-goblin flex items-center justify-between gap-4 border-b border-goblin-700">
      <h1 class="text-xl font-bold tracking-wide">Goblin Market</h1>
      <div class="flex gap-6 text-sm">
        <div class="flex flex-col items-end">
          <span class="font-semibold tracking-wide text-[11px] uppercase">Coins</span>
          <span class="tabular-nums" :class="glow(coinsDelta)">{{ formatNumber(coins) }}</span>
        </div>
      </div>
    </header>

    <!-- Info Modal -->
    <transition name="fade">
      <div v-if="showInfo" class="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/60 overflow-y-auto" @keydown.esc="showInfo=false">
        <div class="bg-goblin-900 border border-goblin-600 rounded-lg shadow-goblin max-w-3xl w-full p-4 space-y-4 relative">
          <button @click="showInfo=false" class="absolute top-2 right-2 text-goblin-300 hover:text-white">✕</button>
          <h2 class="text-lg font-bold">Game Guide</h2>
          <section class="space-y-2 text-sm leading-snug">
            <h3 class="font-semibold text-goblin-300">Core Concepts</h3>
            <ul class="list-disc ml-5 space-y-1">
              <li><strong>Inventory</strong>: Items you hold. They sell automatically to customers.</li>
              <li><strong>Generation (/s)</strong>: Live average of how many of that item you're creating each second.</li>
              <li><strong>Demand %</strong>: High demand (near 100%) gives full price. Overselling drops it; resting recovers it.</li>
              <li><strong>Supply Bar</strong>: How healthy your stock is. Empty = customers eating through supply. Full = comfortable buffer / production keeping up.</li>
              <li><strong>Heat</strong>: Rises from selling & advanced crafting. High heat triggers raid checks. Mitigate with Bribe, Ward, Lay Low.</li>
            </ul>
          </section>
          <section class="space-y-2 text-sm leading-snug">
            <h3 class="font-semibold text-goblin-300">Resources</h3>
            <div class="grid md:grid-cols-2 gap-x-6 gap-y-2">
              <div><strong>Junk</strong>: Base scrap. Gathered by Scavengers. Refined into Curios.</div>
              <div><strong>Curio</strong>: Crafted from Junk. Upgrades into Relics or Arcana (with Charms).</div>
              <div><strong>Relic</strong>: Higher value item from Curios. Used with Seals for Contraband.</div>
              <div><strong>Arcana</strong>: Enchanted goods (Curio + Charm). Adds heat when crafted.</div>
              <div><strong>Contraband</strong>: Illicit goods (Relic + Seal). Higher heat & value.</div>
              <div><strong>Royal / Eldritch</strong>: Future late-game tiers (not yet produced here).</div>
              <div><strong>Charms</strong>: Timed reagent (1/min) for Arcana.</div>
              <div><strong>Seals</strong>: Timed reagent (needs Tunnel) for Contraband.</div>
            </div>
          </section>
          <section class="space-y-2 text-sm leading-snug">
            <h3 class="font-semibold text-goblin-300">Workers</h3>
            <div class="grid md:grid-cols-2 gap-x-6 gap-y-2">
              <div><strong>Scavenger</strong>: Produces Junk continuously.</div>
              <div><strong>Collector</strong>: Finds (creates) Curios directly. Costs Junk to hire.</div>
              <div><strong>Barker</strong>: Attracts more customers (footfall).</div>
              <div><strong>Crafty / Hexer</strong>: Accelerate crafting of mid / arcana recipes (placeholder speed bonus).</div>
              <div><strong>Sneaky</strong>: Future: risky opportunistic gains & heat spikes.</div>
              <div><strong>Broker</strong>: Improves prices (market read).</div>
              <div><strong>Smuggler</strong>: Future: improves heat decay.</div>
              <div><strong>Enforcer</strong>: Future: reduces raid chance.</div>
              <div><strong>Banker</strong>: Future: adds coin interest over time.</div>
            </div>
          </section>
          <section class="space-y-2 text-sm leading-snug">
            <h3 class="font-semibold text-goblin-300">Tips</h3>
            <ul class="list-disc ml-5 space-y-1">
              <li>Keep supply bars healthy for higher tiers before unlocking new ones to avoid price dips.</li>
              <li>Use Lay Low if heat is near threshold and you still need stock built up.</li>
              <li>Bribes are best when heat is high but not yet raiding constantly (they cut a chunk).</li>
              <li>Upgrade crafting capacity (Workshop) before flooding demand with new sales.</li>
            </ul>
          </section>
          <div class="text-[10px] opacity-60">Prototype Help • v0.2 — Some workers / tiers stubbed for later systems.</div>
        </div>
      </div>
    </transition>

  <!-- No heat bar in minimal version -->

  <main class="flex-1 overflow-y-auto p-3 space-y-4" v-if="ready">
      <!-- Toasts -->
      <div class="fixed top-2 left-1/2 -translate-x-1/2 z-50 space-y-2 w-[90%] max-w-sm">
        <div v-for="t in toasts" :key="t.id" class="px-3 py-2 rounded shadow-goblin text-sm flex items-center gap-2"
          :class="toastClass(t)">
          <span class="font-semibold">{{ t.msg }}</span>
        </div>
      </div>

      <!-- Customers Summary (Option B simplified) -->
      <section class="bg-goblin-800/70 rounded-lg p-3 text-xs space-y-2">
        <div class="flex items-center justify-between mb-1">
          <div class="font-semibold text-[11px] uppercase tracking-wide text-goblin-300">Customers</div>
          <div class="text-[10px] text-goblin-400">Total: <span class="tabular-nums text-goblin-200">{{ totalCustomersPerSec.toFixed(2) }}/s</span></div>
        </div>
        <div class="grid md:grid-cols-3 gap-2">
          <div v-for="ct in customerTypes" :key="ct.id" class="p-2 rounded border border-goblin-700 bg-goblin-900/40 flex flex-col gap-0.5">
            <div class="flex items-center justify-between">
              <span class="font-semibold flex items-center gap-1">
                <span class="w-2 h-2 rounded-full" :style="{background: ct.color}"></span>
                {{ ct.label }}
              </span>
              <span class="tabular-nums font-mono">{{ ct.perSec.toFixed(2) }}/s</span>
            </div>
            <div class="flex items-center justify-between text-[10px] opacity-80">
              <div>Buys: <span v-for="(r,i) in ct.buys" :key="r" class="capitalize" :style="{color: resColor(r)}">{{ r }}<span v-if="i<ct.buys.length-1">, </span></span></div>
              <div v-if="ct.coinsPerSec>0" class="tabular-nums font-mono text-white"><span class="font-semibold">{{ ct.coinsPerSec }}</span> <span class="text-yellow-300 font-semibold">coins</span>/s</div>
            </div>
          </div>
        </div>
        <div class="mt-1 text-[10px] text-goblin-500">(Future) History graphs</div>
      </section>


      <!-- Resource Cards (bars restored) -->
      <section class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        <div v-for="t in tiers" :key="t.id" class="bg-goblin-800/60 rounded-lg p-3 flex flex-col gap-1 border border-goblin-700">
          <div class="flex justify-between items-center text-sm">
            <span class="font-semibold capitalize flex items-center gap-1" :style="{color: resColor(t.id)}">
              {{ t.id }}
              <span class="text-[10px] font-normal text-goblin-300/70" :style="{color: resColor(t.id)}">{{ priceFor(t.id) }}</span>
            </span>
            <span class="font-mono text-xs md:text-sm leading-none font-semibold tracking-tight">{{ formatNumber(inventory[t.id]||0) }}</span>
          </div>
          <div class="h-2 bg-goblin-900 rounded overflow-hidden" :title="purchaseBarTitle(t.id)">
            <div class="h-full transition-all duration-500 ease-linear" :style="purchaseBarStyle(t.id)"></div>
          </div>
          <div v-if="t.id==='curio' && collectorCount>0" class="text-[9px] text-goblin-400 flex justify-between">
            <span>Collectors</span><span>+{{ collectorCurioPerSec.toFixed(2) }}/s</span>
          </div>
          <div v-if="t.id==='junk' && scavengerCount>0" class="text-[9px] text-goblin-400 flex justify-between">
            <span>Scavengers</span><span>+{{ scavengerJunkPerSec.toFixed(2) }}/s</span>
          </div>
        </div>
      </section>

      <section class="bg-goblin-800/70 rounded-lg p-3 space-y-2">
        <h2 class="font-semibold text-lg">Workers</h2>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          <button v-for="w in workers" :key="w.id" @click="buyWorker(w.id)" :disabled="!canAffordWorker(w)" class="group bg-goblin-700 hover:bg-goblin-600 disabled:opacity-35 disabled:cursor-not-allowed active:scale-95 transition rounded p-2 text-left relative">
            <div class="flex items-center justify-between gap-2">
              <span class="font-semibold capitalize truncate">{{ w.id }}</span>
              <div class="flex items-center gap-2 text-[10px]">
                <div class="flex flex-wrap gap-1 items-center">
                  <template v-if="w.costs">
                    <span v-for="(c,i) in w.costs" :key="i" class="inline-flex items-center gap-0.5">
                      <span class="font-mono">{{ formatNumber(Math.round(c.base * Math.pow(c.mult||1, (ownedWorkers[w.id]||0)))) }}</span>
                      <span :style="{color: resColor(c.res)}" class="font-semibold">{{ c.res }}</span>
                      <span v-if="i < w.costs.length-1" class="opacity-40">•</span>
                    </span>
                  </template>
                  <template v-else>
                    <span class="inline-flex items-center gap-0.5">
                      <span class="font-mono">{{ formatNumber(workerCost(w.id)) }}</span>
                      <span :style="{color: resColor(w.costResource || 'coins')}" class="font-semibold">{{ w.costResource || 'coins' }}</span>
                    </span>
                  </template>
                </div>
                <span class="text-[10px] px-1 rounded bg-goblin-900/40 border border-goblin-600">x{{ ownedWorkers[w.id]||0 }}</span>
              </div>
            </div>
            <div class="text-[10px] mt-1 leading-snug opacity-80 min-h-[2.2em]" v-if="w.desc">{{ w.desc }}</div>
            <div class="text-[10px] opacity-70" v-if="w.id==='scavenger'">Total: {{ ((15 * (ownedWorkers[w.id]||0))/60).toFixed(2) }} <span :style="{color: resColor('junk')}" class="font-semibold">junk</span>/s</div>
            <div class="text-[10px] opacity-70" v-if="w.id==='collector'">Total: {{ (((w.baseRate||0) * (ownedWorkers[w.id]||0))/60).toFixed(2) }} <span :style="{color: resColor('curio')}" class="font-semibold">curio</span>/s</div>
            <div class="text-[10px] opacity-70" v-if="w.id==='barker'">Total: +{{ (((w.footfall||12) * (ownedWorkers[w.id]||0))/60).toFixed(2) }} peasant goblins/s</div>
          </button>
        </div>
      </section>

      <section class="bg-goblin-800/70 rounded-lg p-3 space-y-2">
        <h2 class="font-semibold text-lg flex items-center gap-2">Buildings</h2>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          <button v-for="b in buildings" :key="b.id" @click="build(b.id)" :disabled="!canAffordBuilding(b)" class="group bg-goblin-700 hover:bg-goblin-600 disabled:opacity-35 disabled:cursor-not-allowed active:scale-95 transition rounded p-2 text-left relative">
            <div class="flex items-center justify-between gap-2">
              <span class="font-semibold capitalize truncate">{{ b.id.replace('_',' ') }}</span>
              <div class="flex items-center gap-2 text-[10px]">
                <div class="flex flex-wrap gap-1 items-center">
                  <template v-if="b.costs">
                    <span v-for="(c,i) in b.costs" :key="i" class="inline-flex items-center gap-0.5">
                      <span class="font-mono">{{ formatNumber(Math.round(c.base * Math.pow(c.mult||1, (ownedBuildings[b.id]||0)))) }}</span>
                      <span :style="{color: resColor(c.res)}" class="font-semibold">{{ c.res }}</span>
                      <span v-if="i < b.costs.length-1" class="opacity-40">•</span>
                    </span>
                  </template>
                  <template v-else>
                    <span class="inline-flex items-center gap-0.5">
                      <span class="font-mono">{{ formatNumber(buildingCost(b.id)) }}</span>
                      <span :style="{color: resColor('coins')}" class="font-semibold">coins</span>
                    </span>
                  </template>
                </div>
                <span class="text-[10px] px-1 rounded bg-goblin-900/40 border border-goblin-600" v-if="ownedBuildings[b.id]">Lv {{ ownedBuildings[b.id] }}</span>
              </div>
            </div>
            <div class="text-[10px] mt-1 leading-snug opacity-80 min-h-[2.0em]" v-if="b.desc">{{ b.desc }}</div>
            <div class="text-[10px] opacity-70" v-if="b.effects?.baseCustomers">Total: +{{ ((b.effects.baseCustomers * (ownedBuildings[b.id]||0))/60).toFixed(2) }} {{ buildingCustomerTypeLabel(b) }}/s</div>
            <div class="text-[10px] opacity-70" v-if="b.sells && b.sells.length">Sells
              <span v-for="(s,i) in b.sells" :key="s" :style="{color: resColor(s)}" class="font-semibold">{{ s }}<span v-if="i<b.sells.length-1">, </span></span>
            </div>
          </button>
        </div>
      </section>
      <section class="bg-goblin-800/70 rounded-lg p-3 space-y-2">
        <h2 class="font-semibold text-lg">Activity Log</h2>
        <div class="text-xs space-y-1 max-h-48 overflow-y-auto font-mono leading-tight">
          <div v-for="(l,i) in recentLog" :key="i">{{ l }}</div>
        </div>
      </section>
  </main>
  <div v-else class="flex-1 flex items-center justify-center text-goblin-300 animate-pulse">Loading goblins...</div>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, onMounted } from 'vue';
import gameData from '../data/gameData.json';
import { useGameStore } from '@/stores/game';

const store = useGameStore();
const showInfo = ref(false);

onMounted(()=>{ store.init(gameData); store.start(); });

const ready = computed(()=> store.ready);
const tiers = computed(()=> ready.value ? gameData.tiers : []);
const workers = computed(()=> gameData.workers);
const buildings = computed(()=> gameData.buildings.filter(b=> ['stall','craft','utility','unlock'].includes(b.type)));

const coins = computed(()=> store.coins);
const coinsDelta = computed(()=> store.lastCoinsDelta);
// minimal state (heat/phase removed)
const inventory = computed(()=> store.inventory);
const ownedWorkers = computed(()=> store.workers);
const ownedBuildings = computed(()=> store.buildings);
const recentLog = computed(()=> store.log.slice(-50).reverse());
const toasts = computed(()=> []); // no toasts now
const customersBD = computed(()=> store.customersBreakdown());
const customerTypes = computed(()=> store.customerTypes());
const totalCustomersPerSec = computed(()=> customerTypes.value.reduce((s:any,c:any)=> s + c.perSec, 0));
const maxCustomerPerSec = computed(()=> Math.max(0.0001, ...customerTypes.value.map((c:any)=> c.perSec))); // for gauge scaling

// Production metrics simplified

function formatNumber(n:number){
  if(n>=1e9) return (n/1e9).toFixed(2)+'B';
  if(n>=1e6) return (n/1e6).toFixed(2)+'M';
  if(n>=1e3) return (n/1e3).toFixed(1)+'K';
  return n.toFixed(0);
}
function glow(delta:number){
  if(delta>0) return 'text-goblin-300';
  return '';
}
function workerCost(id:string){ return store.workerCost(id); }
function buildingCost(id:string){ return store.buildingCost(id); }
function buyWorker(id:string){ store.buyWorker(id); }
function build(id:string){ store.build(id); }
function canAffordWorker(w:any){
  if(w.costs){
    const owned = ownedWorkers.value[w.id]||0;
    return w.costs.every((c:any)=>{
      const amt = Math.round(c.base * Math.pow(c.mult||1, owned));
      if(c.res==='coins') return coins.value >= amt; else return (inventory.value[c.res]||0) >= amt;
    });
  }
  // fallback old fields
  const cost = workerCost(w.id);
  if(w.costResource){ return (inventory.value[w.costResource]||0) >= cost; }
  return coins.value >= cost;
}
function canAffordBuilding(b:any){
  if(b.costs){
    const lvl = ownedBuildings.value[b.id]||0;
    return b.costs.every((c:any)=>{
      const amt = Math.round(c.base * Math.pow(c.mult||1, lvl));
      if(c.res==='coins') return coins.value >= amt; else return (inventory.value[c.res]||0) >= amt;
    });
  }
  const cost = buildingCost(b.id); return coins.value >= cost;
}
function toastClass(t:any){
  switch(t.type){
    case 'milestone': return 'bg-goblin-700 border border-goblin-400';
    case 'phase': return 'bg-goblin-700 border border-yellow-400';
    case 'raid': return 'bg-red-700/70 border border-red-400';
    case 'raid-ok': return 'bg-goblin-800/80 border border-goblin-500';
    case 'bribe': return 'bg-yellow-700/70 border border-yellow-400';
    case 'ward': return 'bg-goblin-600/80 border border-goblin-400';
    case 'laylow': return 'bg-goblin-800/80 border border-goblin-400';
    case 'err': return 'bg-red-800/80 border border-red-500';
    default: return 'bg-goblin-800/80 border border-goblin-600';
  }
}
// Supply bar helpers
// Removed legacy supply bar helpers (capacity-based) replaced by purchase progress bar
// Collector metrics
const collectorCount = computed(()=> ownedWorkers.value['collector']||0);
const scavengerCount = computed(()=> ownedWorkers.value['scavenger']||0);
const collectorCurioPerSec = computed(()=> {
  if(!collectorCount.value) return 0;
  const def = workers.value.find((w:any)=> w.id==='collector');
  if(!def) return 0;
  return ((def?.baseRate||0) * collectorCount.value)/60;
});
const scavengerJunkPerSec = computed(()=> {
  if(!scavengerCount.value) return 0;
  const def = workers.value.find((w:any)=> w.id==='scavenger');
  if(!def) return 0;
  return ((def?.baseRate||0) * scavengerCount.value)/60;
});
function resColor(res:string){ return store.resourceColor(res); }
function priceFor(res:string){ return store.resourceSellPrice(res); }
function buildingCustomerTypeLabel(b:any){
  // Infer customer type from sells list (first matching)
  if(Array.isArray(b.sells)){
    if(b.sells.includes('curio')) return 'curio seekers';
    if(b.sells.includes('junk')) return 'peasant goblins';
  }
  return 'customers';
}
// Purchase progress bar (resource toward cheapest spend)
function purchaseProgress(res:string){
  const need = store.nextCostForResource(res);
  if(!need || need<=0) return 0; // no purchases use this resource
  const have = inventory.value[res]||0;
  return Math.max(0, Math.min(1, have/need));
}
function purchaseBarStyle(res:string){
  const pct = (purchaseProgress(res)*100).toFixed(1)+'%';
  // gradient from amber (#fbc02d) to green (#66bb6a)
  return { width: pct, background: 'linear-gradient(90deg,#fbc02d,#66bb6a)' };
}
function purchaseBarTitle(res:string){
  const need = store.nextCostForResource(res);
  if(!need) return 'No purchases require this resource.';
  const have = inventory.value[res]||0;
  const pct = (purchaseProgress(res)*100).toFixed(1);
  return `${have.toFixed(1)} / ${need} needed (${pct}%) for cheapest purchase using ${res}`;
}
// pricing & demand removed in minimal version
</script>

<style scoped>
.tabular-nums { font-variant-numeric: tabular-nums; }
.fade-enter-active,.fade-leave-active { transition: opacity .2s ease; }
.fade-enter-from,.fade-leave-to { opacity:0; }
/* Replaced @apply with explicit CSS to avoid build issues in scoped block */
.tooltip { display:none; position:absolute; z-index:40; top:100%; margin-top:0.5rem; padding:0.5rem; border-radius:0.25rem; background:#0f2019; border:1px solid #28594a; font-size:10px; line-height:1.1; box-shadow:0 2px 4px rgba(0,0,0,0.5); width:16rem; }
.group:hover > .tooltip, .group:focus-within > .tooltip { display:block; }
</style>
