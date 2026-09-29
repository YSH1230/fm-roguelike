# 상점 결정 깊이 개선 설계

## 배경

이적시장(드래프트 상점)의 매주 결정이 밋밋하다는 문제를 다뤘다. 원인 두 가지:

1. 카드 등급 분포(`data/draft-shop.mjs`의 `SHOP_TIER_WEIGHTS`)가 리그 등급과 무관하게
   고정이라, 5부에서도 8% 확률로 legendary(OVR 88~94) 카드가 뜬다. 자금은 이미
   리그가 낮을수록 적게 설계돼 있는데(`calculateStartingFunds`), 카드 등급만 안 갈려서
   "하부리그에 안 맞는 카드가 나온다"는 위화감이 있다.
2. 상점 카드에 표시되는 "팀 +X.X" 델타(`ui/app.mjs` offerHtml의 `gain`)가 baseOVR만
   반영하고 케미(태그 시너지) 보너스를 무시한다. 그리고 델타 자체가 "이 카드를 사면
   이득인지"를 미리 계산해서 보여주기 때문에, 유저는 그냥 가장 큰 숫자를 사면 끝이라
   결정에 고민이 없다. 계산을 고쳐도(케미 반영) 구조상 "정답을 알려준다"는 문제는
   그대로 남는다.

## 결정된 방향

### A. 상점 카드에서 델타를 없애고 "재료"만 보여준다

- `offerHtml`에서 `gain` 계산과 `팀 +X.X` / `전력 변화 없음` 표시를 제거한다.
- 카드에 남는 정보: 초상화, 이름, 포지션, 나이, OVR, 등급, 가격, 플레이스타일
  태그, 특수 성향(기존 그대로).
- 카드의 각 플레이스타일 태그 옆에, 지금 라인업(베스트11)이 그 태그를 몇 명
  채웠는지 작은 카운트를 붙인다(예: "게겐프레싱 2/3"). 전술 탭 `renderChemistryPanel`이
  이미 계산하는 카운트/문턱 로직을 재사용한다(플레이스타일은 고정 3/5명, 대륙은
  `countEffectiveContinentRequirement`로 폴리글롯 감면 반영).
- 유저가 "이 카드 사면 태그가 몇 명째가 되는지"는 스스로 계산해야 한다 — 정답은
  안 주고 재료만 준다.

### B. 상점 카드 등급 분포를 리그별로 나눈다

- `data/draft-shop.mjs`에 `SHOP_TIER_WEIGHTS_BY_TIER`(리그 id → 등급 분포)를
  추가한다. 패턴은 `data/generate-player.mjs`의 `MOVE_SQUAD_WEIGHTS_BY_TIER`와 동일.
- 초기값(재튜닝으로 조정될 출발점):
  ```
  tier5: { local: 70, bigLeaguer: 25, topClass: 5,  worldClass: 0,  legendary: 0  }
  tier4: { local: 45, bigLeaguer: 35, topClass: 15, worldClass: 5,  legendary: 0  }
  tier3: { local: 20, bigLeaguer: 30, topClass: 30, worldClass: 15, legendary: 5  }
  tier2: { local: 10, bigLeaguer: 20, topClass: 30, worldClass: 30, legendary: 10 }
  tier1: { local: 5,  bigLeaguer: 10, topClass: 20, worldClass: 40, legendary: 25 }
  ```
- `generateShopOffer(size, availableGods, rng, tierId)`로 시그니처를 넓힌다.
  `tierId` 미지정 시 기존 테스트(`tests/draft-shop.test.mjs`, tierId 없이 호출)가
  깨지지 않도록 기본값을 둔다(`tier1` — 가장 관대한 분포라 "유효한 카드인지"만
  보는 기존 테스트 의도와 충돌 없음).
- 호출부 갱신: `ui/app.mjs`(`generateShopOffer` 호출 두 곳: `currentState.leagueTierId`
  전달), `tools/tune-ladder.mjs`(시뮬레이션 루프의 `tierId` 전달).

### C. 재튜닝

- `tools/tune-ladder.mjs`가 아직 예전 60명 스쿼드(`generateSquadPool(TIER5_SQUAD_WEIGHTS)`)를
  가정하고 있다 — 이번에 `generateStartingSquad()`(20명, 포지션 최소치 보장)로
  바꿔서 지금 실제 게임 상태를 반영하게 한다. 이 변경만으로도 기준선이 달라지므로
  상점 분포와 별개로 먼저 실측해 새 기준을 확인한다.
- 이후 상점 분포(B)를 적용한 뒤 `node tools/tune-ladder.mjs 2000`을 반복 실행하며
  `SHOP_TIER_WEIGHTS_BY_TIER` 숫자를 조정한다. 목표는 `engine/league.mjs` 주석에
  적힌 리그별 목표 우승/승격/안전/강등 비율에서 크게 벗어나지 않는 것(완전히
  똑같이 맞추는 게 목표가 아니라, 방향이 크게 틀어지지 않는 것).
- 조정 후 실측치를 `engine/league.mjs`와 `data/draft-shop.mjs` 주석에 기존 스타일대로
  남긴다(이 프로젝트의 기존 컨벤션).
- 실측 결과 `LEAGUE_TIERS`의 `safePoints`/`targetPoints`/`championPoints`를 함께
  조정해야 한다면 그렇게 한다(허용 범위 — 스쿼드 크기 자체가 60→20으로 바뀌었으므로
  이 기준선도 어차피 재검증이 필요한 상태였다).

## 건드리는 파일

- `data/draft-shop.mjs` — 리그별 분포 테이블, `generateShopOffer` 시그니처
- `ui/app.mjs` — offerHtml 렌더링(델타 제거, 태그 카운트 추가), `generateShopOffer` 호출부
- `ui/style.css` — 태그 카운트 배지 스타일(기존 `.tag`/`.chembadge` 계열 재사용, 필요시 소폭 추가)
- `tools/tune-ladder.mjs` — 20명 스쿼드 반영, 리그별 상점 분포 반영
- `engine/league.mjs` — 재튜닝 결과에 따라 점수 기준선 조정(필요시)
- `tests/draft-shop.test.mjs` — 리그별로 분포가 실제로 달라지는지 확인하는 테스트 추가

## 테스트

- 기존 `tests/draft-shop.test.mjs` 2건 통과 유지(시그니처 하위호환 확인)
- 신규: 같은 rng 시드로 `generateShopOffer(N, [], rng, 'tier5')`와
  `generateShopOffer(N, [], rng, 'tier1')`를 큰 표본으로 돌려, tier5 쪽 평균 OVR이
  tier1 쪽보다 유의미하게 낮은지 확인(통계적 검증, 정확한 카운트 검증 아님)
- 전체 `node --test` 96 + 신규 테스트 통과 확인
- 재튜닝은 자동 테스트가 아니라 `tools/tune-ladder.mjs` 수동 실행 결과로 확인
