import { DEFAULT_RULES, GameRules } from "./config";

/**
 * 채점·승패 판정 순수 함수. 클라이언트에 두지 않는다 (지도서 13장).
 * 시간은 모두 서버 기준 밀리초 (answeredAt - servedAt).
 */

export interface AnswerScore {
  correct: boolean;
  points: number;
  /** 시간 초과(제한시간 + 여유 초과)로 0점 처리됐는지 */
  timedOut: boolean;
}

/**
 * 문항 하나를 채점한다.
 * - 정답: basePoints + 남은 시간(초, 내림) × pointsPerRemainingSecond
 * - 오답, 무응답(choice = null), 시간 초과: 0점
 * - 제한시간~여유 사이에 도착한 정답은 남은 시간 0초로 basePoints만 받는다.
 */
export function scoreAnswer(
  choice: number | null,
  answerIndex: number,
  elapsedMs: number,
  rules: GameRules = DEFAULT_RULES,
): AnswerScore {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new RangeError(`elapsedMs must be a non-negative number: ${elapsedMs}`);
  }
  const timedOut = elapsedMs > rules.timeLimitMs + rules.networkGraceMs;
  const correct = !timedOut && choice !== null && choice === answerIndex;
  if (!correct) {
    return { correct, points: 0, timedOut };
  }
  const remainingSec = Math.max(0, Math.floor((rules.timeLimitMs - elapsedMs) / 1000));
  return {
    correct,
    points: rules.basePoints + remainingSec * rules.pointsPerRemainingSecond,
    timedOut,
  };
}

/** 한 판의 최고점 (전 문항 0ms 정답) */
export function maxMatchScore(rules: GameRules = DEFAULT_RULES): number {
  const perQuestion =
    rules.basePoints + Math.floor(rules.timeLimitMs / 1000) * rules.pointsPerRemainingSecond;
  return perQuestion * rules.questionsPerMatch;
}

export interface PlayerResult {
  uid: string;
  score: number;
  timeMs: number;
}

/**
 * 승자 uid를 돌려준다. 총점이 높은 쪽, 동점이면 총 소요시간이 짧은 쪽.
 * 점수와 시간까지 같으면 무승부(null).
 */
export function decideWinner(a: PlayerResult, b: PlayerResult): string | null {
  if (a.score !== b.score) return a.score > b.score ? a.uid : b.uid;
  if (a.timeMs !== b.timeMs) return a.timeMs < b.timeMs ? a.uid : b.uid;
  return null;
}
