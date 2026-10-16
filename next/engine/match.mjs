import {
  ASSIST_CHANCE, ASSIST_POS_WEIGHT, BASE_GOALS, GOAL_SCALE, HOME_BOOST, SCORER_POS_WEIGHT,
} from './constants.mjs';
import { poisson, weightedPick } from './rng.mjs';
import { teamRatings } from './ratings.mjs';

// 내 공격력 vs 상대 수비력으로 기대 득점을 구한다.
export function expectedGoals(attack, opponentDefense, boost = 1) {
  return BASE_GOALS * boost * Math.exp((attack - opponentDefense) / GOAL_SCALE);
}

function scoreValue(p) {
  if (p.position === 'FW') return p.attrs.shooting;
  if (p.position === 'MF') return (p.attrs.passing + p.attrs.vision) / 2;
  if (p.position === 'DF') return p.attrs.heading;
  return 10;
}

function assistValue(p) {
  if (p.position === 'FW') return p.attrs.dribbling;
  if (p.position === 'MF') return p.attrs.vision;
  return 30;
}

const scoringWeight = (p) => SCORER_POS_WEIGHT[p.position] * (scoreValue(p) / 50) ** 2;
const assistWeight = (p) => ASSIST_POS_WEIGHT[p.position] * (assistValue(p) / 50) ** 2;

function goalEvents(team, goals, rng) {
  const events = [];
  for (let i = 0; i < goals; i += 1) {
    const scorer = weightedPick(rng, team.lineup, scoringWeight);
    const assist = rng() < ASSIST_CHANCE
      ? weightedPick(rng, team.lineup.filter((p) => p !== scorer), assistWeight)
      : null;
    events.push({ teamId: team.id, scorerId: scorer.id, assistId: assist ? assist.id : null });
  }
  return events;
}

// 한 경기를 시뮬한다. 선수 기록은 건드리지 않고 결과만 돌려준다.
export function simulateMatch(home, away, rng) {
  const h = teamRatings(home);
  const a = teamRatings(away);
  const homeGoals = poisson(rng, expectedGoals(h.attack, a.defense, HOME_BOOST));
  const awayGoals = poisson(rng, expectedGoals(a.attack, h.defense));
  return {
    homeGoals,
    awayGoals,
    events: [...goalEvents(home, homeGoals, rng), ...goalEvents(away, awayGoals, rng)],
  };
}

// 경기 결과를 선수 기록(출전·득점·도움)에 반영한다.
export function applyMatchStats(home, away, result) {
  const byId = new Map();
  for (const p of [...home.lineup, ...away.lineup]) {
    byId.set(p.id, p);
    p.stats.apps += 1;
  }
  for (const e of result.events) {
    byId.get(e.scorerId).stats.goals += 1;
    if (e.assistId) byId.get(e.assistId).stats.assists += 1;
  }
}
