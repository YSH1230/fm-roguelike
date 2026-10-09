// 나이에 따른 시즌별 OVR 변화와 은퇴. 새 시즌이 시작될 때 선수단 전원에게 한 번 적용한다.
// 어린 선수는 크고, 서른 줄부터 서서히 꺾이고, 30대 중반은 급격히 떨어진다. 그래서 같은
// 선수를 계속 끌고 갈 수 없고(노쇠화 + 은퇴), 선수단은 주기적으로 갈린다.
// 재계약 횟수 제한은 두지 않는다 - 늙으면 OVR이 알아서 떨어져서 못 쓴다.

export const FORCED_RETIRE_AGE = 37;

// 나이(올해 시즌을 마친 시점의 나이) -> 다음 시즌 OVR 변화 범위(정수, 양끝 포함)
export function ovrChangeRange(age) {
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

export function ageSquad(squad, rng = Math.random) {
  const kept = [];
  const changes = [];
  const retired = [];
  for (const p of squad) {
    const newAge = p.age + 1;
    if (p.retiresAfterSeason || rng() < retireChance(newAge)) { retired.push({ id: p.id, name: p.name, age: newAge, baseOVR: p.baseOVR }); continue; }
    const [lo, hi] = ovrChangeRange(p.age);
    const delta = lo + Math.floor(rng() * (hi - lo + 1));
    const next = Math.min(99, Math.max(1, p.baseOVR + delta));
    kept.push({ ...p, age: newAge, baseOVR: next });
    if (next !== p.baseOVR) changes.push({ id: p.id, name: p.name, age: newAge, from: p.baseOVR, to: next, delta: next - p.baseOVR });
  }
  return { squad: kept, changes, retired };
}
