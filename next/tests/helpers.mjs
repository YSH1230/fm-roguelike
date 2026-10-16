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
import { askingSalary, marketValue } from '../engine/contract.mjs';
import { isDraftOver } from '../engine/draft.mjs';
import {
  createGame, finishSeason, playNextChunk, startDraftAdvance, startDraftFinish, startDraftPick,
} from '../engine/game.mjs';
import {
  beginDraft, beginOffseason, closeDraft, closeMarket, draftBest, draftTurnIsMine, offerFreeAgent, offerResign, openMarket,
  placeRookie, releaseStar, renewCoachContract, startSeason,
} from '../engine/offseason.mjs';
import { overall } from '../engine/player.mjs';

export function startedGame(seed = 1) {
  const g = createGame({ seed });
  startDraftAdvance(g);
  while (!isDraftOver(g.startDraft)) {
    const best = [...g.startDraft.pool].sort((a, b) => marketValue(b) - marketValue(a) || (a.id < b.id ? -1 : 1))[0];
    startDraftPick(g, best.id);
  }
  startDraftFinish(g);
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
  for (const c of [...g.off.coachExpiring]) { try { renewCoachContract(g, c.kind); } catch { /* 코인 부족: 신임 코치 */ } }
  openMarket(g);
  for (const e of [...g.market].sort((a, b) => b.asking - a.asking)) {
    if (g.myTeam.stars.length >= 6) break;
    offerFreeAgent(g, e.player.id, e.asking);
  }
  closeMarket(g);
  beginDraft(g);
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
