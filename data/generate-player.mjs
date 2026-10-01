import { PLAYER_TIERS, POSITIONS, CONTINENT_TAGS, PLAYSTYLE_TAGS, BASIC_TAGS, ADVANCED_TAGS, SPECIAL_TRAITS, TRAIT_PRICE_MULT } from '../engine/constants.mjs';
import { calculatePlayerPrice } from '../engine/economy.mjs';
import { pick, randomName } from './name-pools.mjs';

// 5부 시작 스쿼드 등급 분포 (스펙 11절: 60~80장, 스펙 2절 "5부=로컬 급"에 맞춤).
// 순수 로컬 등급만 60장 — 실측(node tune-check)으로 확인한 결과, 등급을
// 조금만 섞어도(빅리거 등) 75장 중 베스트11만 골라 쓰는 구조상 평균이 리그
// 평균(50~58)을 계속 웃돌아 강등이 수학적으로 불가능해짐. 상점 매물(더 좋은
// 카드를 뽑을 기회)은 별도 SHOP_TIER_WEIGHTS(draft-shop.mjs)를 쓴다.
export const TIER5_SQUAD_WEIGHTS = { local: 60, bigLeaguer: 0, topClass: 0, worldClass: 0, legendary: 0 };

// 이적(거취 선택)으로 갈아끼우는 스쿼드의 등급 분포. 목적지 리그 체급에 맞춘다.
// 전에는 어느 리그로 가도 TIER5_SQUAD_WEIGHTS를 썼다 - 3부 이상에서 강등률이
// 57~95%였고, 강등은 즉시 해임이라 "이적"이 사실상 런 종료 버튼이었다.
// 기준: 승격으로 올라온 플레이어의 베스트11 평균 전력(tools/tune-ladder.mjs
// 실측 5부 69.8 / 4부 76.9 / 3부 83.9 / 2부 89.1 / 1부 92.3)보다 조금 낮게
// 잡아, 이적이 손해가 아니라 도박이 되게 한다. 장수는 5부와 같은 60장.
// 이적 직후 시즌 800판 실측 강등률: 5부 2.4% / 4부 14.1% / 3부 19.5% /
// 2부 29.6% / 1부 37.3%. 같은 스쿼드를 물려받고 승격했을 때가 2.6 / 9.9 /
// 19.3 / 28.8 / 33.6%이므로, 이적은 이제 조금 불리한 도박 수준이다.
export const MOVE_SQUAD_WEIGHTS_BY_TIER = {
  tier5: TIER5_SQUAD_WEIGHTS,
  tier4: { local: 40, bigLeaguer: 20, topClass: 0, worldClass: 0, legendary: 0 },
  tier3: { local: 20, bigLeaguer: 30, topClass: 10, worldClass: 0, legendary: 0 },
  tier2: { local: 8, bigLeaguer: 24, topClass: 21, worldClass: 7, legendary: 0 },
  tier1: { local: 4, bigLeaguer: 15, topClass: 26, worldClass: 13, legendary: 2 },
};

function pickN(array, n, rng) {
  const pool = [...array];
  const result = [];
  for (let i = 0; i < n && pool.length > 0; i++) {
    const idx = Math.floor(rng() * pool.length);
    result.push(pool.splice(idx, 1)[0]);
  }
  return result;
}

function randomInt(min, max, rng) {
  return min + Math.floor(rng() * (max - min + 1));
}

let nextId = 1;

// 첫 전술 태그 칸을 목표 태그로 바꾼다(전술 칸이 없으면 덧붙인다).
function withForcedTag(tags, forceTag) {
  if (!forceTag || tags.includes(forceTag)) return tags;
  return tags.length > 1 ? [tags[0], forceTag, ...tags.slice(2)] : [...tags, forceTag];
}

const ADVANCED_MAYBE_CHANCE = 0.45;

// 기본기 1개(그 포지션이 보너스 대상인 것 중) + 등급이 허락하는 전술 태그.
function pickPlaystyleTags(tier, position, rng) {
  const tags = [pick(BASIC_TAGS.filter((t) => PLAYSTYLE_TAGS[t].positions.includes(position)), rng)];
  // 그 포지션이 보너스를 받는 태그를 우선 뽑는다(받을 수 없는 태그는 인원만 채우는 함정). 없으면 등급 → 전체 순으로 완화.
  const usable = (t) => !tags.includes(t) && PLAYSTYLE_TAGS[t].positions.includes(position);
  for (const rawSlot of tier.advancedSlots) {
    if (rawSlot.endsWith('?') && rng() >= ADVANCED_MAYBE_CHANCE) continue;
    const slot = rawSlot.replace('?', '');
    const gradeOk = (t) => slot === 'any' || PLAYSTYLE_TAGS[t].grade === slot;
    const pool = [ADVANCED_TAGS.filter((t) => usable(t) && gradeOk(t)), ADVANCED_TAGS.filter(usable), ADVANCED_TAGS.filter((t) => !tags.includes(t))]
      .find((p) => p.length);
    tags.push(pick(pool, rng));
  }
  return tags;
}

// 로컬~레전더리 절차적 생성 (GOD은 data/god-players.mjs 참고, 여기서 생성 안 함)
// position을 넘기면 그 포지션으로 고정한다 - 시작 스쿼드가 포지션별 최소치를
// 보장해야 해서(generateStartingSquad) 무작위 배정만으로는 부족하다.
export function generateProceduralPlayer(tierId, rng = Math.random, position = null, forceTag = null) {
  const tier = PLAYER_TIERS[tierId];
  if (!tier) throw new Error(`Unknown player tier: ${tierId}`);

  const continentTag = pick(Object.keys(CONTINENT_TAGS), rng);
  const name = randomName(continentTag, rng);
  const baseOVR = randomInt(tier.minOVR, tier.maxOVR, rng);
  const age = randomInt(18, 35, rng);

  // 30% 확률로 특수 성향 하나 부여 (스펙: 등급 무관 0~1개).
  // 베테랑 리더는 33세 이상에서만 발동하므로(engine/ovr.mjs), 어린 선수에게는
  // 뽑히지 않게 후보에서 뺀다 — 안 그러면 평생 효과 없는 카드가 생긴다.
  // forceTag(스카우터 목표 태그)를 주면 그 태그를 보너스로 받는 포지션으로 뽑고 태그를 반드시 단다.
  const pos = position ?? pick(forceTag ? PLAYSTYLE_TAGS[forceTag].positions : POSITIONS, rng);
  const eligibleTraits = age >= 33 ? SPECIAL_TRAITS : SPECIAL_TRAITS.filter((t) => t !== 'veteranLeader');
  const specialTrait = rng() < 0.2 ? pick(eligibleTraits, rng) : null;

  return {
    id: `p${String(nextId++).padStart(4, '0')}`,
    name,
    baseOVR,
    price: Math.round(calculatePlayerPrice(tierId, baseOVR) * (TRAIT_PRICE_MULT[specialTrait] ?? 1)),
    age,
    position: pos,
    playstyleTags: withForcedTag(pickPlaystyleTags(tier, pos, rng), forceTag),
    continentTag,
    specialTrait,
    isDraftedYouth: specialTrait === 'seongGolYouth',
  };
}

// 포메이션에 필요한 포지션인데 스쿼드에 그 포지션 선수가 한 명도 없을 때
// 긴급으로 콜업하는 유스. 무료(0G, 사고파는 카드가 아니라 아카데미 소집이라
// 가격 개념이 없음)에, 나이 어린 로컬 등급으로 고정하고 성골 유스로 표시한다.
export function generateEmergencyYouth(position, rng = Math.random) {
  const continentTag = pick(Object.keys(CONTINENT_TAGS), rng);
  const name = randomName(continentTag, rng);
  const tier = PLAYER_TIERS.local;
  return {
    id: `youth${String(nextId++).padStart(4, '0')}`,
    name,
    baseOVR: tier.minOVR, // 긴급 콜업은 등급 최저 능력치
    price: 0,
    age: randomInt(17, 20, rng),
    position,
    playstyleTags: [], // 긴급 콜업은 태그·특수 성향이 아무것도 없는 무명 유스
    continentTag: null,
    specialTrait: null,
    isDraftedYouth: true,
  };
}

// 시작 스쿼드 20명의 포지션 최소치. 4개 포메이션(ui/formations.mjs) 중
// 어느 걸 골라도 그 포메이션이 요구하는 최대치를 항상 채우게 잡은 바닥값
// (GK1·CB3·WB2·CMF3·AMF1·W2·ST2, 합 14) - 이 이하로는 강제 오프포지션이
// 생긴다. 나머지 6자리는 포지션 무관 무작위라 게임마다 스쿼드 색깔이 달라진다.
const STARTING_SQUAD_SIZE = 20;
const POSITION_FLOOR = { GK: 1, CB: 3, WB: 2, CMF: 3, AMF: 1, W: 2, ST: 2 };

function buildStartingPositionPlan(rng) {
  const positions = Object.entries(POSITION_FLOOR).flatMap(([pos, n]) => Array(n).fill(pos));
  const extra = STARTING_SQUAD_SIZE - positions.length;
  for (let i = 0; i < extra; i++) positions.push(pick(POSITIONS, rng));
  return positions;
}

// local 등급 상한(62)을 시작 스쿼드에 그대로 쓰면, 포지션마다 여러 명 중
// 최고 OVR을 고르는 베스트11 구조상(순서통계) 평균이 리그 평균(tier5 50~58)
// 위로 쉽게 올라간다 - 실측해보니 시장을 한 번도 안 써도(12주 내내 "다음
// 주로"만) 5부 잔류율이 77%였다(11-A 밸런스 패치). 시작 스쿼드만 상한을
// 낮춰서(56) 이 여유를 줄인다 - 상점 매물의 local 등급(50~62)은 안 건드린다.
const STARTING_SQUAD_MAX_OVR = 56;

// 5부 시작 스쿼드: 전원 local 등급(TIER5_SQUAD_WEIGHTS와 같은 이유), 20명,
// 포지션은 위 바닥값을 보장한 뒤 나머지를 무작위로 채운다.
export function generateStartingSquad(rng = Math.random) {
  const positions = buildStartingPositionPlan(rng);
  const usedNames = new Set();
  return positions.map((position) => {
    let player;
    let tries = 0;
    do {
      player = generateProceduralPlayer('local', rng, position);
      tries += 1;
    } while (usedNames.has(player.name) && tries < 50);
    usedNames.add(player.name);
    if (player.baseOVR > STARTING_SQUAD_MAX_OVR) {
      player = { ...player, baseOVR: STARTING_SQUAD_MAX_OVR, price: calculatePlayerPrice('local', STARTING_SQUAD_MAX_OVR) };
    }
    return player;
  });
}

// tierWeights: { local: 30, bigLeaguer: 25, ... } 처럼 등급별 인원수
export function generateSquadPool(tierWeights, rng = Math.random) {
  const players = [];
  const usedNames = new Set();
  for (const [tierId, count] of Object.entries(tierWeights)) {
    for (let i = 0; i < count; i++) {
      // 같은 스쿼드 안 동명이인은 플레이 중 누가 누군지 헷갈리게 만든다.
      // 풀이 넓어도 생일 역설 때문에 60명이면 겹치므로 명시적으로 거른다.
      let player;
      let tries = 0;
      do {
        player = generateProceduralPlayer(tierId, rng);
        tries += 1;
      } while (usedNames.has(player.name) && tries < 50);
      usedNames.add(player.name);
      players.push(player);
    }
  }
  return players;
}
