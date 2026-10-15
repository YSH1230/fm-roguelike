// 유망(★)·정리(✂) 북마크: 선수 id -> 'prospect' | 'cut'. 사용자가 끄기 전에는 선수가 팀에 있는 동안 유지된다.
// 팀을 떠난 선수의 북마크만 정리한다(id가 다시 쓰여도 엉뚱한 선수에게 붙지 않게).
export function pruneMarks(marks, squad) {
  if (!marks) return marks;
  const ids = new Set(squad.map((p) => p.id));
  return Object.fromEntries(Object.entries(marks).filter(([id]) => ids.has(id)));
}
