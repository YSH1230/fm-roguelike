import { createRng } from './rng.mjs';
import { setCustomNames } from './names.mjs';
import { createLeague } from './league.mjs';

export const SAVE_VERSION = 2;
export const SAVE_KEY = 'fm-lite-save';

// 팀은 선수 객체를 여러 곳(스타, 라인업, 이름 있는 선수)에서 공유한다. 저장할 때는 라인업에 한 번만 담고
// 스타·이름 있는 선수는 id로 적어서, 불러올 때 같은 객체로 다시 이어 붙인다.
const packTeam = (t) => ({ ...t, stars: t.stars.map((p) => p.id), named: t.named?.map((p) => p.id) });

function unpackTeam(o) {
  const byId = new Map([...o.lineup, ...Object.values(o.subs ?? {})].map((p) => [p.id, p]));
  const team = { ...o, stars: o.stars.map((id) => byId.get(id)) };
  if (o.named) team.named = o.named.map((id) => byId.get(id)).filter(Boolean);
  return team;
}

const packLeague = (key, l) => ({
  key, teamIds: [...l.teams.keys()], fixtures: l.fixtures, nextRound: l.nextRound, chunkIndex: l.chunkIndex, table: [...l.table],
});

function packWorld(world) {
  const teams = new Map();
  const leagues = [];
  for (const [key, league] of world.leagues) {
    for (const [id, team] of league.teams) teams.set(id, team);
    leagues.push(packLeague(key, league));
  }
  return { year: world.year, myTeamId: world.myTeamId, teams: [...teams.values()].map(packTeam), leagues };
}

function unpackWorld(w) {
  const teams = new Map(w.teams.map((o) => [o.id, unpackTeam(o)]));
  const leagues = new Map();
  for (const l of w.leagues) {
    const league = createLeague(l.teamIds.map((id) => teams.get(id)));
    Object.assign(league, { fixtures: l.fixtures, nextRound: l.nextRound, chunkIndex: l.chunkIndex, table: new Map(l.table) });
    leagues.set(l.key, league);
  }
  return { year: w.year, myTeamId: w.myTeamId, leagues };
}

// 게임을 JSON 문자열로 만든다. 난수는 새 씨앗으로 이어 쓰므로, 저장 직후 이어서 하는 게임과
// 불러온 게임은 정확히 같은 결과를 낸다.
export function saveGame(game) {
  const seed = Math.floor(game.rng() * 4294967296);
  game.rng = createRng(seed);
  const { rng, world, myTeam, history, ...rest } = game;
  const data = {
    ...rest,
    rngSeed: seed,
    world: packWorld(world),
    history: { ...history, players: [...history.players] },
    season: game.season && {
      ...game.season,
      outcome: { ...game.season.outcome, finalRank: [...game.season.outcome.finalRank], tierBefore: [...game.season.outcome.tierBefore] },
    },
    off: game.off && {
      ...game.off,
      resignQueue: game.off.resignQueue.map((p) => p.id),
      coachExpiring: game.off.coachExpiring.map((c) => c.kind),
    },
  };
  return JSON.stringify({ version: SAVE_VERSION, data });
}

export function loadGame(json) {
  const { version, data } = JSON.parse(json);
  if (version !== SAVE_VERSION) throw new Error('저장 파일 버전이 맞지 않아 이어할 수 없습니다');
  const world = unpackWorld(data.world);
  const myTeam = [...world.leagues.values()].map((l) => l.teams.get(world.myTeamId)).find(Boolean);
  const game = {
    ...data, world, myTeam, rng: createRng(data.rngSeed),
    history: { ...data.history, players: new Map(data.history.players) },
  };
  delete game.rngSeed;
  setCustomNames(game.names);
  if (data.season) {
    game.season = {
      ...data.season,
      outcome: { ...data.season.outcome, finalRank: new Map(data.season.outcome.finalRank), tierBefore: new Map(data.season.outcome.tierBefore) },
    };
  }
  if (data.off) {
    game.off = {
      ...data.off,
      resignQueue: data.off.resignQueue.map((id) => myTeam.stars.find((p) => p.id === id)),
      coachExpiring: data.off.coachExpiring.map((kind) => myTeam.coaches[kind]),
    };
  }
  return game;
}

// 브라우저 저장소(localStorage 같은 getItem/setItem 객체)에 넣고 꺼낸다. 없으면 null.
export function writeSave(game, storage) {
  storage.setItem(SAVE_KEY, saveGame(game));
}

export function readSave(storage) {
  const json = storage.getItem(SAVE_KEY);
  return json ? loadGame(json) : null;
}
