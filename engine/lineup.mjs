import { computeAverageOVR } from './team-power.mjs';

// 케미(태그/대륙/특수 성향)까지 반영한 최종 OVR 평균이 가장 높은 선발을
// 찾는다. 선발 슬롯에는 그 슬롯 포지션의 선수만 넣고, 그 포지션 선수가 없으면
// 공석(null)으로 둔다(대타 없음).
// 시작은 포지션별 최고 OVR 탐욕 배치, 그 뒤 "슬롯 1개 교체 → 2개 동시 교체"를
// 더 좋아지는 동안 반복한다. 태그 시너지는 3명 문턱이라 1개 교체만으로는
// 못 넘는 경우가 있어 2개 동시 교체까지 본다.
// ponytail: 3개 이상 동시 교체는 안 본다 - 5명 문턱 시너지를 통째로 못 찾을 수 있다.
export function optimizeLineup(squad, slots, benchSize, boostedTagId = null) {
  const byOvr = (a, b) => b.baseOVR - a.baseOVR;
  const xi = new Array(slots.length).fill(null);
  const used = new Set();
  slots.forEach((pos, i) => {
    const pick = squad.filter((p) => !used.has(p.id) && p.position === pos).sort(byOvr)[0];
    if (pick) { xi[i] = pick; used.add(pick.id); }
  });

  const benchOf = (lineup) => {
    const ids = new Set(lineup.filter(Boolean).map((p) => p.id));
    return squad.filter((p) => !ids.has(p.id)).sort(byOvr).slice(0, benchSize);
  };
  const score = (lineup) => {
    const players = lineup.filter(Boolean);
    return players.length ? computeAverageOVR(players, benchOf(lineup), boostedTagId) : 0;
  };
  // 슬롯 i에 넣을 수 있는 후보: 그 자리 포지션의 선발 밖 선수
  const candidates = (lineup, i) => {
    const inXI = new Set(lineup.filter(Boolean).map((p) => p.id));
    return squad.filter((p) => !inXI.has(p.id) && p.position === slots[i]);
  };

  let best = score(xi);
  for (let improved = true; improved;) {
    improved = false;
    let move = null;
    for (let i = 0; i < slots.length; i++) {
      for (const c of candidates(xi, i)) {
        const a = xi.slice(); a[i] = c;
        const s = score(a);
        if (s > best + 1e-9) { best = s; move = a; }
        for (let j = i + 1; j < slots.length; j++) {
          for (const d of candidates(a, j)) {
            const b = a.slice(); b[j] = d;
            const s2 = score(b);
            if (s2 > best + 1e-9) { best = s2; move = b; }
          }
        }
      }
    }
    if (move) { xi.splice(0, xi.length, ...move); improved = true; }
  }
  return { xi, bench: benchOf(xi) };
}

// 슬롯 목록 중 스쿼드로 채울 수 없는 자리의 포지션(부족 인원만큼 반복해서 나온다).
// 예: CB 슬롯 2개에 CB 1명이면 ['CB'] 하나.
export function missingSlots(squad, slots) {
  const have = {};
  for (const p of squad) have[p.position] = (have[p.position] ?? 0) + 1;
  return slots.filter((pos) => {
    const n = have[pos] ?? 0;
    have[pos] = n - 1;
    return n <= 0;
  });
}
