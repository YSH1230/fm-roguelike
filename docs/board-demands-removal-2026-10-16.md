# 이사진 요구(요구 카드) 삭제 영향과 구현 체크리스트 (2026-10-16)

사용자 확정: 시즌 시작 **이사진 요구 선택 화면(board-demands) 전체 삭제.** 이사진의 **시즌 목표(잔류/승격/우승 승점)** 자체는 요구 카드가 아니므로 유지한다(결산·명성·해임 판정).

## 1. 현재 구조(삭제 대상)
| 영역 | 내용 | 위치 |
|---|---|---|
| 카드 데이터 | 요구 카드 풀·추첨(`drawDemandOffer`)·평가(`evaluateDemand`)·난이도 라벨 | `data/board-demands.mjs`, `tests/board-demands.test.mjs` |
| 선택 화면 | 시즌 시작 "이사진 요구" 카드 3장(쉬움/보통/어려움)·[요구 없이 시작] | `ui/app.mjs`: `renderDemandChoice`, `demandCardHtml`, `start-season-btn` 연결 |
| 시즌 중 선택 | 시즌 브리핑 팝업의 요구 카드 선택(`demandOffer`, `data-pick-demand`, `boardDemand` 저장) | `ui/app.mjs`: 시즌 브리핑 렌더, `startNewSeason`의 `seasonBriefing.demandOffer` |
| 상태 | `currentState.boardDemand`, `pendingBoardReview.demand` | `ui/app.mjs`, `ui/tutorial-script.mjs`(`boardDemand: null`) |
| 달성 보상(자금) | 달성 시 다음 시즌 지급 +5%/+10%/+20% × `seasonBaseGrant()` | `BOARD_DEMAND_REWARD`, `ui/app.mjs`(결산 `demandFunds`, `startNewSeason`의 `review.demand.funds`) |
| 달성 보상(명성) | 달성 +5/+10/+15 | `PRESTIGE_DEMAND`, `engine/run.mjs`(`demandPrestige`), 명성 행 라벨 `demand: '이사진 요구 달성'` |
| 시장 헤더 표시 | 선택한 요구 카드 요약 한 줄 | `ui/app.mjs`(`boardDemandCard`) |
| 결산 팝업 | "요구 …: 달성/미달" 줄(`demandReviewHtml`) | `ui/app.mjs` |
| 구단 데이터 | 구단 색채별 `demandBias`(요구 카드 편향), 구단 등급 `KLASS.demand` 문구 | `data/clubs.mjs`(`demandBias`, `KLASS.demand`는 화면에서 안 쓰임) |
| 텔레메트리 | 시즌 기록의 `dem` | `ui/app.mjs` |
| CSS | `.demandcards`, `.demandcard*` | `ui/style.css` |
| 튜토리얼 | 이전 종료 안내에 "이사진 요구" 언급(이미 제외), 튜토리얼 상태 `boardDemand` | `ui/tutorial-script.mjs` |

## 2. 삭제 체크리스트(프로그래밍)
- [ ] `data/board-demands.mjs` 삭제, `tests/board-demands.test.mjs` 삭제, `tests/run.test.mjs`의 "이사진 요구" 명성 항목 수정.
- [ ] `ui/app.mjs`: import(`drawDemandOffer`·`getDemand`·`evaluateDemand`·`DIFFICULTY_LABELS`·`BOARD_DEMAND_REWARD`), `renderDemandChoice`, `demandCardHtml`, 시즌 브리핑의 요구 카드 영역·`data-pick-demand` 핸들러, `boardDemand`·`pendingBoardReview.demand` 사용처, 결산의 `demandAchieved`·`demandFunds`, 시장 헤더 `boardDemandCard`, `demandReviewHtml`, 명성 라벨 `demand`.
- [ ] `start-season-btn` 흐름: 요구 선택 없이 곧바로 시장 화면(`renderMarket`)으로.
- [ ] 시즌 브리핑 팝업: 목표 안내·결산(자금·선수단 변화) 탭은 유지, 요구 카드 영역만 삭제.
- [ ] `engine/constants.mjs`: `BOARD_DEMAND_REWARD`, `PRESTIGE_DEMAND` 삭제. `engine/run.mjs`: `demandPrestige` 삭제(명성 행 `demand` 제거).
- [ ] `data/clubs.mjs`: `demandBias` 필드와 편향 주석 삭제(색채 강점/약점·시작 자금·이벤트 편향은 유지), `KLASS.demand` 문구 삭제(화면 미사용).
- [ ] `ui/style.css`: `.demandcards`, `.demandcard*` 삭제.
- [ ] 텔레메트리 `dem` 제거.
- [ ] `ui/tutorial-script.mjs`의 `boardDemand: null` 제거.
- [ ] `tools/sim-v3.mjs`·`tools/sim-human.mjs`: 요구 보상(`BOARD_DEMAND_REWARD.easy * 0.5`) 가산 삭제(`boardReward`는 유지).
- [ ] 이전 세이브: `boardDemand`·`pendingBoardReview.demand` 필드는 읽지 않고 무시(저장 호환 유지, `RULES_VERSION` 올림은 선택).

## 3. 밸런스 영향(분석, 시뮬 불필요)
| 항목 | 값 |
|---|---|
| 자금 보너스(달성 시) | 시작 자금 330/480/800/1300/2000(5부→1부) 기준 5/10/20% → 5부 16/33/66G, 1부 100/200/400G를 **다음 시즌 지급에 가산** |
| 봇 가정(`sim-v3`) | easy 달성 50% 가정 = 시즌당 +2.5% × 기본 지급(5부 약 8G) |
| 대비 | 시즌당 영입 지출 약 730~760G(봇) → 보너스는 지출의 약 1~2%, 사람이 어려움을 골라 달성해도 5부 66G(약 9%) |
| 명성 | 달성 +5/+10/+15 vs 리그 기본 10~80, 안전 승점 초과·연속 보너스 등 → 시즌당 약 5~15점 감소(선택 시) |
- 결론: 평균 봇 기준 영향은 오차 수준, 사람이 어려움 요구를 노리면 자금·명성 일부가 사라진다. 보정은 필요 없다(요구 카드가 선택 사항이었음). 자금 여유를 원하면 `SAME_LEAGUE_FUNDS_RATIO`(0.6) 같은 지급 상수로 한 번에 조정하는 것이 단순하다(선택).
- 이사진 **목표**(잔류/승격/우승 승점)의 보상(`boardReward`, 목표 초과 자금)과 명성 `surplus`는 그대로.

## 4. 문서 폐기 표기 목록
| 문서 | 처리 |
|---|---|
| `docs/redesign-v2.md` | 34·45·83행의 "이사진 요구 선택/2시즌 해금" 폐기 표기 |
| `docs/tutorial-redesign-2026-10-15.md` | 종료 안내·§6.1에서 이사진 요구 제외(완료) |
| `docs/story-demand-2026-10-16.md` | 요구 카드 연결 한 줄 제외(완료) |
| `docs/playfeedback-2026-10-14.md` §3 | 목록 12행 "이사진 브리핑·요구 선택·결산" → 요구 선택 삭제 표기 |
| `docs/redesign-v3.md`·`docs/redesign-v3-stars.md` | 이사진 요구 언급이 있으면 폐기 표기(현재 거의 없음) |

## 5. 튜토리얼 영향
- 튜토리얼은 이미 요구 선택 없이 진행(첫 시즌은 요구 생략)이라 단계 변경 없음. 튜토리얼 상태의 `boardDemand` 필드만 삭제.

## 6. 테스트 기준
- 새 판 시작 → 시장까지 요구 카드 화면이 한 번도 안 뜬다.
- 시즌 브리핑에서 목표와 결산만 보이고 요구 카드가 없다.
- 결산 팝업·시장 헤더·명성 목록에 "요구" 표기가 없다.
- 이전 세이브(boardDemand 있음)가 오류 없이 열린다.
- `grep -rn "demand" ui engine data tools tests`에서 이적 요구(`transferDemand`)·출전 요구(`playDemand`) 외에 이사진 요구 관련이 남지 않는다.
