import { CL_PRIZE, MY_REGION, SALARY_CAP, SEASON, START_ASSIGNED, START_DRAFT_TEAMS, START_PROSPECTS, START_ROUNDS } from './constants.mjs';
import { askingSalary, newContract } from './contract.mjs';
import { createCoach } from './coach.mjs';
import {
  autoPickUntil, createDraft, draftPick, draftedBy, generateProspects, grantPicks, isDraftOver, snakeOrder,
} from './draft.mjs';
import { createClub, chunkIncome, earn, fansAfterChunk, salaryCap, seasonPrize } from './economy.mjs';
import { applyChoice, interviewFor, pickPress, pressSituation } from './events.mjs';
import { chunkStep, lineupView, snapshotStats } from './condition.mjs';
import { createRng, shuffle } from './rng.mjs';
import { setStars } from './roster.mjs';
import { createTeam } from './team.mjs';
import { allTeams, createWorld, leagueKey, myLeague, playWorldChunk } from './world.mjs';
import { standings } from './league.mjs';
import { aiAccepts, executeTrade, proposeAi } from './trade.mjs';
import { collectStats, createHistory, diffStats, recordSeason } from './records.mjs';
import { buildRows, computeAwards, giveAwards } from './awards.mjs';
import { playChampions } from './champions.mjs';
import { managerFate, resolveLadder } from './ladder.mjs';
import { careerSummary, recordChampions, recordMyTeam } from './honors.mjs';

export const regionTeams = (world) => allTeams(world).filter((t) => t.region === MY_REGION);

// 새 게임: 3부 팀, 배정된 스타 3명, 코치 2명, 시작 드래프트(3명 선택) 대기.
export function createGame({ seed = 1, name = '감독', clubName = '내 구단', clubKit = '#ff4a1c' } = {}) {
  const rng = createRng(seed);
  const myTeam = createTeam({ rng, id: 'ME', attackStars: 2.5, defenseStars: 2.5, starLevel: 50, starPositions: START_ASSIGNED });
  myTeam.coaches.attack = createCoach({ rng, id: 'ME-ca', kind: 'attack', stars: 2.5 });
  myTeam.coaches.defense = createCoach({ rng, id: 'ME-cd', kind: 'defense', stars: 2.5 });
  for (const p of myTeam.stars) p.contract = newContract(Math.max(1, Math.round(askingSalary(p) * 0.6)));
  const world = createWorld({ rng, myTeam });
  grantPicks(regionTeams(world), 1);
  // 내 리그의 AI 구단 7곳과 함께 8개 구단이 3라운드 스네이크 드래프트를 한다(내 순번은 추첨).
  const rivals = shuffle(rng, [...myLeague(world).teams.keys()].filter((id) => id !== 'ME')).slice(0, START_DRAFT_TEAMS - 1);
  const order = snakeOrder(shuffle(rng, ['ME', ...rivals]), START_ROUNDS);
  return {
    seed, rng, name, clubName, clubKit, world, myTeam, club: createClub(), history: createHistory(),
    phase: 'startDraft', chunk: 0, pending: { press: null, interviews: [] }, season: null, off: null, end: null,
    startDraft: { ...createDraft({ prospects: generateProspects(rng, { count: START_PROSPECTS, prefix: 'S1' }), order }), started: false },
  };
}

const need = (game, phase) => {
  if (game.phase !== phase) throw new Error(`지금은 할 수 없습니다 (단계: ${game.phase}, 필요: ${phase})`);
};

// 시작 드래프트: 드래프트 시작을 누르면 내 순번까지 AI 구단들이 차례로 지명한다.
// 내 순번마다 한 명을 고르면 다음 내 순번(또는 끝)까지 이어서 진행한다. 끝나면 startDraftFinish로 시즌을 시작한다.
export function startDraftAdvance(game) {
  need(game, 'startDraft');
  game.startDraft.started = true;
  autoPickUntil(game.startDraft, 'ME', game.rng);
}

export function startDraftPick(game, playerId) {
  need(game, 'startDraft');
  if (!game.startDraft.started) throw new Error('드래프트를 먼저 시작해야 합니다');
  const player = draftPick(game.startDraft, 'ME', playerId);
  startDraftAdvance(game);
  return player;
}

// 드래프트가 모두 끝났으면 내가 지명한 신인들이 스타가 되고 첫 시즌 관리 단계로 넘어간다.
export function startDraftFinish(game) {
  need(game, 'startDraft');
  if (!isDraftOver(game.startDraft)) throw new Error('드래프트가 아직 끝나지 않았습니다');
  setStars(game.myTeam, game.rng, [...game.myTeam.stars, ...draftedBy(game.startDraft, 'ME')]);
  game.phase = 'manage';
}

export const myMatches = (results, id) => results.filter((r) => r.homeId === id || r.awayId === id);

// 다음 구간(14/14/10라운드)을 모든 리그와 함께 돌린다.
export function playNextChunk(game) {
  need(game, 'manage');
  const { world, myTeam: team, club, rng } = game;
  const rounds = SEASON.chunks[game.chunk];
  const before = snapshotStats(team);
  const out = playWorldChunk(world, rng, { views: new Map([[team.id, lineupView(team, rng)]]) });
  const results = out.get(leagueKey(MY_REGION, team.tier));
  const steps = chunkStep({ team, before, rng, club, rounds });
  const income = chunkIncome(results, team.id, club, team.tier);
  earn(club, income.total);
  club.fans = fansAfterChunk(club.fans, results, team.id);
  const mine = myMatches(results, team.id);
  const tally = { won: 0, drawn: 0, lost: 0 };
  for (const r of mine) {
    const diff = (r.homeId === team.id ? 1 : -1) * (r.homeGoals - r.awayGoals);
    tally[diff > 0 ? 'won' : (diff < 0 ? 'lost' : 'drawn')] += 1;
  }
  game.chunk += 1;
  const press = pickPress(rng, pressSituation(tally));
  const interviews = team.stars.map((p) => ({ playerId: p.id, interview: interviewFor(rng, p) })).filter((x) => x.interview).slice(0, 2);
  game.pending = { press, interviews };
  game.phase = game.chunk >= SEASON.chunks.length ? 'seasonEnd' : 'manage';
  return { chunk: game.chunk, matches: mine, ...tally, income, steps, press, interviews };
}

export function answerPress(game, optionIndex) {
  const press = game.pending.press;
  if (!press) throw new Error('답할 기자회견이 없습니다');
  applyChoice({ club: game.club, team: game.myTeam, option: press.options[optionIndex] });
  game.pending.press = null;
}

export function answerInterview(game, playerId, optionIndex) {
  const at = game.pending.interviews.findIndex((x) => x.playerId === playerId);
  if (at < 0) throw new Error('이 선수의 면담이 없습니다');
  const player = game.myTeam.stars.find((p) => p.id === playerId);
  applyChoice({ club: game.club, team: game.myTeam, option: game.pending.interviews[at].interview.options[optionIndex], player });
  game.pending.interviews.splice(at, 1);
}

// ---- 트레이드: 상대는 내 리그의 AI 팀 ----
export const leagueAiTeams = (game) => [...myLeague(game.world).teams.values()].filter((t) => t.id !== game.myTeam.id);

// 원래 팀 id -> 예상 드래프트 슬롯(현재 순위가 낮을수록 앞 순번)
export function pickSlots(game) {
  const table = standings(myLeague(game.world));
  return new Map(table.map((r, i) => [r.id, table.length - i]));
}

const capsFor = (game, ai) => ({ myCap: salaryCap(game.club, game.myTeam.tier), aiCap: SALARY_CAP[ai.tier] });

// AI가 먼저 보내는 제안(없으면 null)
export function incomingTrade(game) {
  return proposeAi(game.rng, game.myTeam, leagueAiTeams(game), game.world.year);
}

export function acceptTrade(game, offer) {
  const ai = leagueAiTeams(game).find((t) => t.id === offer.aiTeamId);
  if (!ai) throw new Error('상대 팀을 찾을 수 없습니다');
  executeTrade({ offer, me: game.myTeam, ai, ...capsFor(game, ai), rng: game.rng });
}

// 내가 먼저 제안한다. 상대가 받아들이면 바로 실행하고 결과를 돌려준다.
export function proposeTrade(game, offer) {
  const ai = leagueAiTeams(game).find((t) => t.id === offer.aiTeamId);
  if (!ai) throw new Error('상대 팀을 찾을 수 없습니다');
  const result = aiAccepts({ offer, me: game.myTeam, ai, ...capsFor(game, ai), slots: pickSlots(game) });
  if (result.accepted) executeTrade({ offer, me: game.myTeam, ai, ...capsFor(game, ai), rng: game.rng });
  return result;
}

// ---- 시즌 종료: 마지막 구간 뒤 한 번 ----
// 챔피언스리그 -> 시상 -> 기록 -> 승강 확정 -> 감독 운명. 경질이면 런이 끝난다.
export function finishSeason(game) {
  need(game, 'seasonEnd');
  const { world, myTeam: team, club, history, rng } = game;
  const year = world.year;
  const tier = team.tier;
  const leagueStats = collectStats(world);
  const cl = playChampions(world, rng);
  const afterStats = collectStats(world);
  const rows = buildRows(world, leagueStats, afterStats);
  const awards = computeAwards(rows, { myLeagueKey: leagueKey(MY_REGION, tier), cl });
  giveAwards(history, awards, year, world);
  recordSeason(history, { year, leagueStats, clStats: diffStats(afterStats, leagueStats), myTeamId: team.id });
  recordChampions(history, { year, world, cl });
  const table = standings(myLeague(world));
  const outcome = resolveLadder(world, rng);
  const fate = managerFate(outcome, team.id);
  const rank = outcome.finalRank.get(team.id);
  const clChampion = cl.champion === team.id;
  const prize = seasonPrize(tier, rank === 1) + (clChampion ? CL_PRIZE : 0);
  earn(club, prize);
  recordMyTeam(history, { year, tier, rank, fate, clChampion, awards, myTeamId: team.id });
  const row = table.find((r) => r.id === team.id);
  game.season = {
    year, tier, rank, fate, awards, cl: { champion: cl.champion, runnerUp: cl.runnerUp }, outcome, prize,
    wins: row.won, record: { won: row.won, drawn: row.drawn, lost: row.lost, points: row.points }, draftStandings: table.map((r) => ({ id: r.id })),
  };
  if (fate === 'fired') {
    game.phase = 'ended';
    game.end = { reason: 'fired', summary: careerSummary(history) };
  } else {
    game.phase = 'offseason';
  }
  return game.season;
}

// 시즌 종료 시점에 감독 은퇴를 선택해 런을 끝낸다(오프시즌을 시작하기 전에만).
export function retireManager(game) {
  need(game, 'offseason');
  if (game.off) throw new Error('오프시즌이 이미 시작되었습니다');
  game.phase = 'ended';
  game.end = { reason: 'retired', summary: careerSummary(game.history) };
}
