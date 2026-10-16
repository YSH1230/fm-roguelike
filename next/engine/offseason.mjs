import { FA_RELEASED, ROSTER_STARS } from './constants.mjs';
import { endOfSeason } from './aging.mjs';
import { offseasonAi, releaseAiPlayers, integrateNamed } from './aiWorld.mjs';
import { coachSeasonGrowth, createCoach, renewCoach, syncFillers, tickCoachContract } from './coach.mjs';
import { teamMorale } from './condition.mjs';
import { tickContracts } from './contract.mjs';
import {
  DRAFT_ROUNDS, autoPickUntil, buyoutCoins, createDraft, draftOrder, draftPick, draftedBy, generateProspects, grantPicks, isDraftOver, spendPicks,
} from './draft.mjs';
import { earn, negotiationClub, spend } from './economy.mjs';
import {
  aiSign, evaluateOffer, evaluateResign, generateFreeAgents, releaseToPool, resign, signFreeAgent, toEntry,
} from './freeAgency.mjs';
import { regionTeams } from './game.mjs';
import { startNextSeason } from './ladder.mjs';
import { retirePlayer } from './honors.mjs';
import { setStars } from './roster.mjs';
import { faPrice, marketValue } from './contract.mjs';

const need = (game, step) => {
  if (game.phase !== 'offseason' || !game.off) throw new Error('오프시즌이 아닙니다');
  if (game.off.step !== step) throw new Error(`지금은 할 수 없습니다 (오프시즌 단계: ${game.off.step}, 필요: ${step})`);
};

const clubView = (game) => negotiationClub(game.club, {
  rank: game.season?.rank ?? game.startDraft?.lastYear?.ME ?? 18, morale: teamMorale(game.myTeam), team: game.myTeam, tier: game.myTeam.tier,
});

// 1) 오프시즌 시작: 승강 반영 새 시즌 준비, 나이·은퇴, 계약 만료, AI 팀 변화, 코치 성장과 계약.
export function beginOffseason(game) {
  if (game.phase !== 'offseason' || game.off) throw new Error('오프시즌을 시작할 수 없습니다');
  const { world, myTeam: team, history, rng } = game;
  const year = game.season.year;
  startNextSeason(world, game.season.outcome);
  const retired = endOfSeason(team, rng).map((p) => retirePlayer(history, p, year));
  const expiring = tickContracts(team);
  const coachExpiring = [];
  for (const kind of ['attack', 'defense']) {
    const coach = team.coaches[kind];
    coachSeasonGrowth(coach, rng, { wins: game.season.wins });
    if (tickCoachContract(coach)) coachExpiring.push(coach);
  }
  syncFillers(team);
  offseasonAi(world, rng);
  const aiReleased = releaseAiPlayers(rng, regionTeams(world).filter((t) => t.id !== team.id), FA_RELEASED);
  game.off = {
    step: 'resign', retired, resignQueue: expiring, coachExpiring, released: [], aiReleased,
    draft: null, rookies: [], aiSigned: [],
  };
  return game.off;
}

// 2) 재계약 협상. 거절이면 { accepted: false, reason }을 돌려주고 선수는 대기열에 남는다(금액을 올려 다시 제안할 수 있다).
export function offerResign(game, playerId, salary) {
  need(game, 'resign');
  const player = game.off.resignQueue.find((p) => p.id === playerId);
  if (!player) throw new Error('재계약 대상이 아닙니다');
  const result = evaluateResign(player, salary, clubView(game));
  if (result.accepted) {
    resign(player, salary, clubView(game));
    game.off.resignQueue = game.off.resignQueue.filter((p) => p !== player);
  }
  return result;
}

export function declineResign(game, playerId) {
  need(game, 'resign');
  const player = game.off.resignQueue.find((p) => p.id === playerId);
  if (!player) throw new Error('재계약 대상이 아닙니다');
  game.off.released.push(releaseToPool(game.myTeam, game.rng, player));
  game.off.resignQueue = game.off.resignQueue.filter((p) => p !== player);
}

// 코치 재계약(코인 지출, 사기가 낮으면 거절 오류)
export function renewCoachContract(game, kind) {
  need(game, 'resign');
  const coach = game.off.coachExpiring.find((c) => c.kind === kind);
  if (!coach) throw new Error('재계약 대상 코치가 아닙니다');
  renewCoach(game.club, coach, game.myTeam.tier ?? 3);
  game.off.coachExpiring = game.off.coachExpiring.filter((c) => c !== coach);
}

// 3) 재계약 마감 -> FA 시장 열기. 대기열의 선수는 FA로 풀리고, 재계약 못 한 코치는 1별 신임 코치로 바뀐다.
export function openMarket(game) {
  need(game, 'resign');
  const { off, myTeam: team, rng } = game;
  for (const player of [...off.resignQueue]) declineResign(game, player.id);
  for (const old of off.coachExpiring) {
    team.coaches[old.kind] = createCoach({ rng, id: `${old.id}-n${game.season.year}`, kind: old.kind, stars: 1 });
  }
  off.coachExpiring = [];
  syncFillers(team);
  // 지난 시즌 시장에 남은 FA는 AI 팀이 데려가고, 이번 시즌의 새 시장이 열린다(시즌마다 초기화).
  const aiTeams = regionTeams(game.world).filter((t) => t.id !== game.myTeam.id);
  off.aiSigned = game.market.length ? aiSign(rng, game.market, aiTeams) : [];
  for (const t of new Set(off.aiSigned.map((s) => s.teamId))) integrateNamed(aiTeams.find((x) => x.id === t), rng);
  game.market = generateFreeAgents(rng, {
    released: [...off.released.map((e) => e.player), ...off.aiReleased], prefix: `FA${game.season.year}`,
  });
  off.step = 'market';
  return game.market;
}

// 4) FA 영입. 시장은 시즌 내내 열려 있다(관리 화면과 오프시즌 어디서든). 가격은 코인으로 내고,
// 연봉은 샐러리캡 안에서 요구 이상을 제시한다. 스타가 6명이면 먼저 releaseStar로 자리를 비워야 한다.
const marketOpen = (game) => {
  if (game.phase !== 'manage' && game.phase !== 'offseason') throw new Error('지금은 FA 시장을 쓸 수 없습니다');
};

export function offerFreeAgent(game, playerId, salary) {
  marketOpen(game);
  const entry = game.market.find((e) => e.player.id === playerId);
  if (!entry) throw new Error('시장에 없는 선수입니다');
  const club = clubView(game);
  const result = evaluateOffer(entry, salary, club);
  if (!result.accepted) return result;
  if (game.myTeam.stars.length >= ROSTER_STARS) return { accepted: false, reason: 'roster' };
  const price = faPrice(entry.asking);
  if (price > game.club.coins) return { accepted: false, reason: 'coins' };
  spend(game.club, price);
  signFreeAgent(game.myTeam, game.rng, entry, salary, club);
  entry.player.origin = { how: 'fa', year: game.world.year };
  game.market = game.market.filter((e) => e !== entry);
  return { ...result, price };
}

// 내 스타를 방출한다(자리 만들기). 방출된 선수는 이번 시즌 FA 시장에 나온다.
export function releaseStar(game, playerId) {
  marketOpen(game);
  const player = game.myTeam.stars.find((p) => p.id === playerId);
  if (!player) throw new Error('이 팀의 스타가 아닙니다');
  setStars(game.myTeam, game.rng, game.myTeam.stars.filter((p) => p !== player));
  game.market.push(toEntry(game.rng, player));
}

// 5) 드래프트로. 시장은 닫히지 않고 시즌 내내 열려 있다(남은 FA는 다음 시즌 시장이 열릴 때 AI 팀이 데려간다).
export function closeMarket(game) {
  need(game, 'market');
  const { off, world, rng } = game;
  const year = game.season.year;
  const teams = new Map(regionTeams(world).map((t) => [t.id, t]));
  const order = draftOrder(game.season.draftStandings, [...teams.values()], year);
  off.draft = { ...createDraft({ prospects: generateProspects(rng, { count: order.length, prefix: `D${year}` }), order }), started: false };
  off.step = 'draft';
  return off.draft;
}

// 6) 드래프트 시작: 내 순번까지 AI 구단들이 차례로 지명한다.
export function beginDraft(game) {
  need(game, 'draft');
  game.off.draft.started = true;
  autoPickUntil(game.off.draft, game.myTeam.id, game.rng);
}

// 드래프트: 내 순번마다 한 명 지명. 내 순번이 없거나 끝나면 isDraftOver.
export function draftChoose(game, playerId) {
  need(game, 'draft');
  if (!game.off.draft.started) throw new Error('드래프트를 먼저 시작해야 합니다');
  const player = draftPick(game.off.draft, game.myTeam.id, playerId);
  autoPickUntil(game.off.draft, game.myTeam.id, game.rng);
  return player;
}

export function draftBest(game) {
  need(game, 'draft');
  const best = [...game.off.draft.pool].sort((a, b) => marketValue(b) - marketValue(a) || (a.id < b.id ? -1 : 1))[0];
  return draftChoose(game, best.id);
}

export const draftTurnIsMine = (game) => Boolean(game.off.draft?.started) && !isDraftOver(game.off.draft)
  && game.off.draft.order[game.off.draft.next].owner === game.myTeam.id;

// 7) 드래프트 마감 -> 신인 계약을 붙여 대기석에 둔다. 스타 자리에 넣을지는 placeRookie로 정한다.
export function closeDraft(game) {
  need(game, 'draft');
  const { off, world } = game;
  if (!isDraftOver(off.draft)) throw new Error('드래프트가 아직 끝나지 않았습니다');
  off.rookies = draftedBy(off.draft, game.myTeam.id, game.season.year);
  // 2라운드 이후 신인은 계약하거나 돈(코인)으로 받을 수 있다.
  for (const k of off.draft.picks) if (k.owner === game.myTeam.id && k.round > 1) k.player.buyout = buyoutCoins(k.slot, off.draft.order.length / DRAFT_ROUNDS);
  const teams = regionTeams(world);
  spendPicks(teams, game.season.year);
  grantPicks(teams, game.season.year + 1);
  off.step = 'rookies';
  return off.rookies;
}

// 신인을 스타로 올린다. 스타가 6명이면 내보낼 스타(releaseId)가 있어야 한다.
export function placeRookie(game, playerId, releaseId = null) {
  need(game, 'rookies');
  const rookie = game.off.rookies.find((p) => p.id === playerId);
  if (!rookie) throw new Error('대기 중인 신인이 아닙니다');
  let stars = [...game.myTeam.stars];
  if (stars.length >= ROSTER_STARS) {
    const out = stars.find((p) => p.id === releaseId);
    if (!out) throw new Error('스타 자리가 없습니다. 내보낼 스타를 정해야 합니다');
    stars = stars.filter((p) => p !== out);
  }
  setStars(game.myTeam, game.rng, [...stars, rookie]);
  game.off.rookies = game.off.rookies.filter((p) => p !== rookie);
}

// 2라운드 신인을 계약하지 않고 돈(코인)으로 받는다. 선수는 만들어지지 않고 떠난다.
export function takeBuyout(game, playerId) {
  need(game, 'rookies');
  const rookie = game.off.rookies.find((p) => p.id === playerId);
  if (!rookie) throw new Error('대기 중인 신인이 아닙니다');
  if (!rookie.buyout) throw new Error('돈으로 받을 수 없는 신인입니다');
  earn(game.club, rookie.buyout);
  game.off.rookies = game.off.rookies.filter((p) => p !== rookie);
  return rookie.buyout;
}

// 8) 새 시즌 시작: 남은 신인은 떠나고 관리 단계로.
export function startSeason(game) {
  need(game, 'rookies');
  game.off = null;
  game.pending = { press: null, interviews: [], trade: null };
  game.chunk = 0;
  game.phase = 'manage';
  return game.world.year;
}

