Game Data Packs
================

This folder contains the base JSON dataset for Goblin Market idle game prototype.

Files:
- gameData.json: Master data definitions for tiers, workers, buildings, recipes, policies, globals, milestones, and prestige layers.

Importing into a Vue store example (pseudo):

```ts
import gameData from '@/data/gameData.json';

export function createGameState(){
  return {
    inventory: {},
    coins: 0,
    heat: 0,
    workers: {},
    buildings: {},
    policies: {},
    data: gameData
  };
}
```

Balancing Simulation
--------------------
A separate Node script (to be added) will rough-sim a 30 minute session to sanity-check coin & heat curves.
