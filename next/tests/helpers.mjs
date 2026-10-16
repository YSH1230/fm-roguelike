import { createRng } from '../engine/rng.mjs';
import { createTeam } from '../engine/team.mjs';
import { createWorld, isWorldSeasonOver, playWorldChunk } from '../engine/world.mjs';

// 테스트 공용: 내 팀(3부 시작)이 들어간 세계. 계획 5 테스트들이 같이 쓴다.
export function makeWorld(seed = 1) {
  const rng = createRng(seed);
  const me = createTeam({ rng, id: 'ME', starLevel: 46 });
  return { rng, me, world: createWorld({ rng, myTeam: me }) };
}

export function playFullSeason(world, rng) {
  while (!isWorldSeasonOver(world)) playWorldChunk(world, rng);
}

// ---- 계획 7 테스트 공용: 자동으로 한 시즌과 오프시즌을 진행하는 간단한 감독 ----
import { askingSalary } from '../engine/contract.mjs';
import {
  createGame, finishSeason, playNextChunk, startDraftPick,
} from '../engine/game.mjs';
import {
  beginOffseason, closeDraft, closeMarket, draftBest, draftTurnIsMine, offerFreeAgent, offerResign, openMarket,
  placeRookie, releaseStar, startSeason,
} from '../engine/offseason.mjs';
import { overall } from '../engine/player.mjs';

export function startedGame(seed = 1) {
  const g = createGame({ seed });
  for (const p of g.startDraft.pool.slice(0, 3)) startDraftPick(g, p.id);
  return g;
}

export function autoSeason(g) {
  while (g.phase === 'manage') {
    playNextChunk(g);
    if (g.pending.press) g.pending.press = null;
  }
  return finishSeason(g);
}

export function autoOffseason(g) {
  beginOffseason(g);
  for (const p of [...g.off.resignQueue]) {
    offerResign(g, p.id, Math.max(askingSalary(p), 1)) ;
  }
  openMarket(g);
  for (const e of [...g.off.market].sort((a, b) => b.asking - a.asking)) {
    if (g.myTeam.stars.length >= 6) break;
    offerFreeAgent(g, e.player.id, e.asking);
  }
  closeMarket(g);
  while (draftTurnIsMine(g)) draftBest(g);
  closeDraft(g);
  for (const r of [...g.off.rookies]) {
    const weakest = [...g.myTeam.stars].sort((a, b) => overall(a) - overall(b))[0];
    if (g.myTeam.stars.length >= 6 && overall(weakest) >= overall(r)) continue;
    placeRookie(g, r.id, g.myTeam.stars.length >= 6 ? weakest.id : null);
  }
  return startSeason(g);
}

export { releaseStar };
