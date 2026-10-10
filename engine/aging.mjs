// 나이에 따른 시즌별 OVR 변화와 은퇴. 새 시즌이 시작될 때 선수단 전원에게 한 번 적용한다.
// 어린 선수는 크고, 서른 줄부터 서서히 꺾이고, 30대 중반은 급격히 떨어진다. 그래서 같은
// 선수를 계속 끌고 갈 수 없고(노쇠화 + 은퇴), 선수단은 주기적으로 갈린다.
// 포지션마다 늙는 속도가 다르다: 골키퍼는 3년, 센터백/수비형 미드필더는 1년 늦게, 윙/윙백/공격수는 1년 빨리 늙는다.
// 선수마다 "전성기"(peakOVR, 몸 나이 peakBodyAge)가 정해져 있다. 어린 선수는 그 길을 따라 올라가고(±1 흔들림),
// 전성기를 지나면 아래 곡선대로 꺾인다. 전성기는 보이지 않는 값이고, 스카우터·코치가 추정 범위로만 알려 준다(engine/scouting.mjs).
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

// 몸 나이별 평균 성장(전성기까지 남은 해를 합해 잠재력을 만든다)
const GROWTH_PER_YEAR = (b) => (b <= 20 ? 3 : b <= 22 ? 2 : b <= 25 ? 1 : b <= 27 ? 0.5 : 0);

// 현재 OVR·나이·포지션에서 전성기를 만든다. 잠재력 계수 0.4~1.6배로 유망주마다 크게 갈린다(평균은 예전 성장 곡선과 같다).
export function generatePotential(ovr, age, position, rng = Math.random) {
  const peakBodyAge = 25 + Math.floor(rng() * 4); // 몸 나이 25~28세에 전성기
  const ba = bodyAge(age, position);
  let gain = 0;
  if (ba < peakBodyAge) {
    const factor = 0.4 + rng() * 1.2;
    for (let b = ba; b < peakBodyAge; b++) gain += GROWTH_PER_YEAR(b);
    gain = Math.round(gain * factor);
  }
  return { peakOVR: Math.min(99, ovr + gain), peakBodyAge };
}
// 전성기 정보가 없는 선수(옛 데이터·이벤트 선수)에게 채워 넣는다. 나이를 모르면(GOD 등) 이미 전성기로 본다.
export function ensurePotential(p, rng = Math.random) {
  if (p.peakOVR != null) return p;
  if (!Number.isFinite(p.age)) return { ...p, peakOVR: p.baseOVR, peakBodyAge: 27 };
  return { ...p, ...generatePotential(p.baseOVR, p.age, p.position, rng) };
}
export const hasPeaked = (p) => bodyAge(p.age, p.position) >= (p.peakBodyAge ?? 27);

// 새 나이 기준 은퇴 확률: 35세 35%, 36세 60%, 37세 이상 확정
export function retireChance(newAge) {
  if (newAge >= FORCED_RETIRE_AGE) return 1;
  if (newAge === 36) return 0.6;
  if (newAge === 35) return 0.35;
  return 0;
}

// 카드에 붙는 추세 화살표: ↗ 전성기를 향해 오른다 / → 비슷 / ↘ 내려간다
export function playerTrend(p) {
  const ba = bodyAge(p.age, p.position);
  if (ba >= 29) return '↘';
  if (p.peakOVR != null && ba < (p.peakBodyAge ?? 27) && p.peakOVR - p.baseOVR >= 2) return '↗';
  return '→';
}

// 나이에 따른 몸값 보정: 33세 이상 -15%. (어린 선수의 프리미엄은 전성기=잠재력이 가격에 들어가므로 따로 없다)
export function agePriceMult(age) {
  return age >= 33 ? 0.85 : 1;
}

export function ageSquad(squad, rng = Math.random) {
  const kept = [];
  const changes = [];
  const retired = [];
  const peaked = [];
  for (const raw of squad) {
    const p = ensurePotential(raw, rng);
    const newAge = p.age + 1;
    if (p.retiresAfterSeason || rng() < retireChance(bodyAge(newAge, p.position))) { retired.push({ id: p.id, name: p.name, age: newAge, baseOVR: p.baseOVR }); continue; }
    const ba = bodyAge(p.age, p.position);
    let delta;
    if (ba < p.peakBodyAge) {
      // 전성기를 향해: 남은 해로 나눈 만큼 오르고 ±1 흔들린다
      delta = Math.round((p.peakOVR - p.baseOVR) / (p.peakBodyAge - ba)) + (Math.floor(rng() * 3) - 1);
      delta = Math.max(-1, delta);
    } else if (ba < 29) {
      delta = -Math.floor(rng() * 2); // 전성기 직후: 0 또는 -1
    } else {
      const [lo, hi] = ovrChangeRange(p.age, p.position);
      delta = lo + Math.floor(rng() * (hi - lo + 1));
    }
    const roll = rng();
    const kind = roll < LEAP_CHANCE ? 'leap' : roll < LEAP_CHANCE + STALL_CHANCE ? 'stall' : null;
    if (kind === 'leap') delta += LEAP_BONUS;
    else if (kind === 'stall') delta = Math.min(delta, 0);
    const next = Math.min(99, Math.max(1, p.baseOVR + delta));
    kept.push({ ...p, age: newAge, baseOVR: next });
    if (ba < p.peakBodyAge && bodyAge(newAge, p.position) >= p.peakBodyAge) peaked.push({ id: p.id, name: p.name, age: newAge, ovr: next });
    if (next !== p.baseOVR) changes.push({ id: p.id, name: p.name, age: newAge, from: p.baseOVR, to: next, delta: next - p.baseOVR, kind });
  }
  return { squad: kept, changes, retired, peaked };
}
