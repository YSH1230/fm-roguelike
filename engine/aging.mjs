// 나이에 따른 시즌별 OVR 변화와 은퇴. 새 시즌이 시작될 때 선수단 전원에게 한 번 적용한다.
// 어린 선수는 크고, 서른 줄부터 서서히 꺾이고, 30대 중반은 급격히 떨어진다. 그래서 같은
// 선수를 계속 끌고 갈 수 없고(노쇠화 + 은퇴), 선수단은 주기적으로 갈린다.
// 포지션마다 늙는 속도가 다르다: 골키퍼는 3년, 센터백/수비형 미드필더는 1년 늦게, 윙/윙백/공격수는 1년 빨리 늙는다.
// 매 시즌 시작에 10%는 도약(변화 +2 추가), 10%는 정체(변화 0 이하)한다.

export const FORCED_RETIRE_AGE = 37;
export const LEAP_CHANCE = 0.1;
export const STALL_CHANCE = 0.1;
export const LEAP_BONUS = 2;

const AGE_DELAY = { GK: 3, CB: 1, DMF: 1, W: -1, WB: -1, ST: -1 };
// 나이 곡선에 대입하는 "몸 나이". 은퇴 확률에도 쓴다.
export const bodyAge = (age, position) => age - (AGE_DELAY[position] ?? 0);

// 나이(올해 시즌을 마친 시점의 나이) -> 다음 시즌 OVR 변화 범위(정수, 양끝 포함)
export function ovrChangeRange(age, position = null) {
  age = bodyAge(age, position);
  if (age <= 20) return [2, 4];
  if (age <= 22) return [1, 3];
  if (age <= 25) return [0, 2];
  if (age <= 28) return [-1, 1];
  if (age <= 30) return [-1, 0];
  if (age <= 32) return [-2, -1];
  if (age <= 34) return [-3, -1];
  return [-4, -2];
}

// 새 나이 기준 은퇴 확률: 35세 35%, 36세 60%, 37세 이상 확정
export function retireChance(newAge) {
  if (newAge >= FORCED_RETIRE_AGE) return 1;
  if (newAge === 36) return 0.6;
  if (newAge === 35) return 0.35;
  return 0;
}

// 카드에 붙는 추세 화살표(올해 기대 변화의 평균 기준): ↗ 오른다 / → 비슷 / ↘ 떨어진다
export function ageTrend(age, position = null) {
  const [lo, hi] = ovrChangeRange(age, position);
  const mean = (lo + hi) / 2;
  return mean > 0.5 ? '↗' : mean < -0.5 ? '↘' : '→';
}

// 나이에 따른 몸값 보정: 21세 이하 +15%, 33세 이상 -15%
export function agePriceMult(age) {
  return age <= 21 ? 1.15 : age >= 33 ? 0.85 : 1;
}

export function ageSquad(squad, rng = Math.random) {
  const kept = [];
  const changes = [];
  const retired = [];
  for (const p of squad) {
    const newAge = p.age + 1;
    if (p.retiresAfterSeason || rng() < retireChance(bodyAge(newAge, p.position))) { retired.push({ id: p.id, name: p.name, age: newAge, baseOVR: p.baseOVR }); continue; }
    const [lo, hi] = ovrChangeRange(p.age, p.position);
    let delta = lo + Math.floor(rng() * (hi - lo + 1));
    const roll = rng();
    const kind = roll < LEAP_CHANCE ? 'leap' : roll < LEAP_CHANCE + STALL_CHANCE ? 'stall' : null;
    if (kind === 'leap') delta += LEAP_BONUS;
    else if (kind === 'stall') delta = Math.min(delta, 0);
    const next = Math.min(99, Math.max(1, p.baseOVR + delta));
    kept.push({ ...p, age: newAge, baseOVR: next });
    if (next !== p.baseOVR) changes.push({ id: p.id, name: p.name, age: newAge, from: p.baseOVR, to: next, delta: next - p.baseOVR, kind });
  }
  return { squad: kept, changes, retired };
}
