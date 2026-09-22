import { writeFileSync } from 'node:fs';
import { generateSquadPool, TIER5_SQUAD_WEIGHTS } from '../data/generate-player.mjs';
import { GOD_PLAYERS } from '../data/god-players.mjs';

const players = [...generateSquadPool(TIER5_SQUAD_WEIGHTS), ...GOD_PLAYERS];
writeFileSync('data/players.generated.json', JSON.stringify(players, null, 2));
console.log(`${players.length}장 생성 → data/players.generated.json`);
