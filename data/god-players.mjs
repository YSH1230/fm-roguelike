// 스펙 5.1/7절: GOD 등급은 전 세계 2명뿐 — 절차적 생성 대상 아님, 수작업 고정 카드
export const GOD_PLAYERS = [
  {
    // 호날두 모티브: 고정 ST. 태그 3개 전부 ST가 실제로 보너스를 받는 조합으로
    // 골랐다(falseNine은 포지션이 W/AMF라 ST로는 절대 안 붙는 죽은 태그였다).
    id: 'god-01',
    name: 'Kael Ronaldsson',
    baseOVR: 97,
    age: 29,
    peakOVR: 97,
    peakBodyAge: 27,
    price: 4000,
    position: 'ST',
    playstyleTags: ['gegenpressing', 'counterAttack', 'longBallKickAndRush'],
    continentTag: 'europe',
    specialTrait: null,
    isDraftedYouth: false,
  },
  {
    // 메시 모티브: 남미. 태그는 AMF가 실제로 보너스를 받는 3개뿐이라 그대로 뒀다.
    id: 'god-02',
    name: 'Yuto Messiara',
    baseOVR: 99,
    age: 29,
    peakOVR: 99,
    peakBodyAge: 27,
    price: 4500,
    position: 'AMF',
    playstyleTags: ['tikiTaka', 'falseNine', 'longBallKickAndRush'],
    continentTag: 'southAmerica',
    specialTrait: null,
    isDraftedYouth: false,
  },
];
