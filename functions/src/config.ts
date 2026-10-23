/**
 * 게임 규칙 기본값 (지도서 1-3, 4장, 8장).
 *
 * 앱은 같은 값을 Remote Config 기본값(android/app/src/main/res/xml/remote_config_defaults.xml)으로 갖는다.
 * 채점에 쓰이는 값은 서버의 이 값이 기준이며, 바꿀 때는 두 곳을 함께 바꾼다.
 */
export interface GameRules {
  questionsPerMatch: number;
  choicesPerQuestion: number;
  timeLimitMs: number;
  /** 네트워크 지연 여유. timeLimitMs + 이 값을 넘기면 0점 */
  networkGraceMs: number;
  basePoints: number;
  pointsPerRemainingSecond: number;
  matchExpiryHours: number;
  freePlaysPerDay: number;
  playsPerRewardAd: number;
  maxRewardAdsPerDay: number;
  maxHintsPerMatch: number;
}

export const DEFAULT_RULES: Readonly<GameRules> = Object.freeze({
  questionsPerMatch: 10,
  choicesPerQuestion: 4,
  timeLimitMs: 10_000,
  networkGraceMs: 2_000,
  basePoints: 100,
  pointsPerRemainingSecond: 10,
  matchExpiryHours: 72,
  freePlaysPerDay: 10,
  playsPerRewardAd: 3,
  maxRewardAdsPerDay: 3,
  maxHintsPerMatch: 2,
});

export const CATEGORIES = ["history", "science", "geo", "culture", "sports", "general"] as const;
export type Category = (typeof CATEGORIES)[number];

export function isCategory(value: unknown): value is Category {
  return typeof value === "string" && (CATEGORIES as readonly string[]).includes(value);
}
