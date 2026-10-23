import { describe, expect, it } from "vitest";
import { decideWinner, maxMatchScore, scoreAnswer } from "../../src/scoring";

describe("scoreAnswer", () => {
  it("정답이면 100 + 남은 초 × 10", () => {
    expect(scoreAnswer(2, 2, 0)).toEqual({ correct: true, points: 200, timedOut: false });
    expect(scoreAnswer(2, 2, 3_000)).toMatchObject({ points: 170 });
  });

  it("남은 시간은 초 단위 내림", () => {
    expect(scoreAnswer(0, 0, 3_001).points).toBe(160); // 남은 6.999초 → 6초
    expect(scoreAnswer(0, 0, 9_999).points).toBe(100);
  });

  it("오답·무응답은 0점", () => {
    expect(scoreAnswer(1, 2, 1_000)).toEqual({ correct: false, points: 0, timedOut: false });
    expect(scoreAnswer(null, 2, 1_000)).toEqual({ correct: false, points: 0, timedOut: false });
  });

  it("제한시간 10초 + 여유 2초까지의 정답은 기본점수만", () => {
    expect(scoreAnswer(2, 2, 10_000).points).toBe(100);
    expect(scoreAnswer(2, 2, 12_000).points).toBe(100);
  });

  it("12초를 넘기면 정답이어도 0점(시간 초과)", () => {
    expect(scoreAnswer(2, 2, 12_001)).toEqual({ correct: false, points: 0, timedOut: true });
  });

  it("음수·비정상 경과시간은 거부", () => {
    expect(() => scoreAnswer(0, 0, -1)).toThrow(RangeError);
    expect(() => scoreAnswer(0, 0, Number.NaN)).toThrow(RangeError);
  });

  it("한 판 최고점은 2,000점", () => {
    expect(maxMatchScore()).toBe(2_000);
  });
});

describe("decideWinner", () => {
  it("총점이 높은 쪽이 이긴다", () => {
    expect(decideWinner({ uid: "a", score: 1500, timeMs: 90_000 }, { uid: "b", score: 1400, timeMs: 10_000 })).toBe("a");
  });

  it("동점이면 총 소요시간이 짧은 쪽", () => {
    expect(decideWinner({ uid: "a", score: 1500, timeMs: 40_000 }, { uid: "b", score: 1500, timeMs: 39_999 })).toBe("b");
  });

  it("점수·시간 모두 같으면 무승부", () => {
    expect(decideWinner({ uid: "a", score: 1500, timeMs: 40_000 }, { uid: "b", score: 1500, timeMs: 40_000 })).toBeNull();
  });
});
