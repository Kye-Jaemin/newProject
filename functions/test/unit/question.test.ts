import { describe, expect, it } from "vitest";
import { questionKey, validateQuestion } from "../../src/content/question";

const valid = {
  category: "geo",
  difficulty: 2,
  text: "다음 중 아프리카 대륙에 속하지 않는 나라는?",
  choices: ["케냐", "모로코", "페루", "가나"],
  answerIndex: 2,
  explanation: "페루는 남아메리카에 있는 나라입니다.",
  source: "https://example.com",
};

describe("validateQuestion", () => {
  it("지도서 예시 문항은 통과", () => {
    expect(validateQuestion(valid)).toEqual({ errors: [], warnings: [] });
  });

  it("필수 항목 오류를 모두 잡는다", () => {
    const r = validateQuestion({
      ...valid,
      category: "music",
      difficulty: 4,
      choices: ["A", "A", "B"],
      answerIndex: 4,
      source: " ",
    });
    expect(r.errors).toHaveLength(5);
  });

  it("중복 보기", () => {
    const r = validateQuestion({ ...valid, choices: ["케냐", "케냐 ", "페루", "가나"] });
    expect(r.errors).toContain("중복된 보기가 있음");
  });

  it("시의성 표현은 경고", () => {
    const r = validateQuestion({ ...valid, text: "현재 세계에서 인구가 가장 많은 나라는?" });
    expect(r.errors).toEqual([]);
    expect(r.warnings[0]).toContain("현재");
  });
});

describe("questionKey", () => {
  it("공백·문장부호를 무시", () => {
    expect(questionKey("대한민국의 수도는?")).toBe(questionKey("대한민국의  수도는"));
  });
});
