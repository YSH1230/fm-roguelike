import { CHEMISTRY_BANDS } from './constants.mjs';

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function chemistryMultiplier(chemistry) {
  const [low, mid, high] = CHEMISTRY_BANDS;
  if (chemistry < low.max) return low.multiplier;
  if (chemistry > mid.max) return high.multiplier;
  // 40~95 선형 보간
  const span = mid.max - low.max; // 95 - 40 = 55
  const progress = (chemistry - low.max) / span;
  return mid.multiplierLow + progress * (mid.multiplierHigh - mid.multiplierLow);
}

export function applyTransactionDecay(chemistry, transactionCount, decayPerTransaction) {
  return clamp(chemistry - transactionCount * decayPerTransaction, 0, 100);
}

export function applyStableWeekRecovery(chemistry) {
  return clamp(chemistry + 1, 0, 100);
}
