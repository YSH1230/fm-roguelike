import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveFfpAudit,
  resolvePromotionTransferDemand,
} from '../engine/events.mjs';
import { EVENTS } from '../data/events.mjs';

test('FFP 긴급 감사 비용은 시즌 지급액의 12%(최소 20G)다', () => {
  assert.equal(resolveFfpAudit(330).payCost, 40);
  assert.equal(resolveFfpAudit(2000).payCost, 240);
  assert.equal(resolveFfpAudit(50).payCost, 20);
});

test('승격 전용 이적 요구: 수락 시 40% 회수, 거부 시 OVR 페널티', () => {
  const result = resolvePromotionTransferDemand(1000);
  assert.equal(result.acceptProceeds, 400);
  assert.equal(result.rejectOvrPenalty, 5);
});

test('이벤트 카탈로그에 슬라이스 범위 6종이 모두 있다', () => {
  assert.equal(EVENTS.length, 6);
  assert.equal(EVENTS.filter((e) => e.scope === 'promotionOnly').length, 1);
  assert.equal(EVENTS.filter((e) => e.type === 'crisis' && e.scope === 'general').length, 2);
  assert.equal(EVENTS.filter((e) => e.type === 'opportunity').length, 3);
});
