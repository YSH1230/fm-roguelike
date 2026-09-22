import { writeFileSync } from 'node:fs';
import { generateSquadPool } from '../data/generate-player.mjs';
import { GOD_PLAYERS } from '../data/god-players.mjs';

// 스펙 11절 슬라이스 범위: 선수 60~80장. 5부 체급에 맞춘 등급 분포(합 75).
const TIER_WEIGHTS = {
  local: 30,
  bigLeaguer: 25,
  topClass: 12,
  worldClass: 6,
  legendary: 2,
};

const players = [...generateSquadPool(TIER_WEIGHTS), ...GOD_PLAYERS];
writeFileSync('data/players.generated.json', JSON.stringify(players, null, 2));
console.log(`${players.length}장 생성 → data/players.generated.json`);
