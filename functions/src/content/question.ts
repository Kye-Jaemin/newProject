import { CATEGORIES, DEFAULT_RULES, isCategory } from "../config";

/** 지도서 7-3 문항 JSON 형식 (작성·검수 단계의 입력) */
export interface QuestionDraft {
  category: string;
  difficulty: number;
  text: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
  source: string;
}

export interface ValidationResult {
  /** 출제 불가 사유. 하나라도 있으면 approved로 올릴 수 없다. */
  errors: string[];
  /** 사람이 다시 봐야 하는 항목 (7-4 출제 금지 기준 의심 등) */
  warnings: string[];
}

/** 7-4: 시간이 지나면 정답이 바뀔 수 있는 표현 */
const TIME_SENSITIVE_WORDS = ["현재", "최근", "올해", "작년", "최초", "최대", "최고", "최신", "지금"];

const MAX_TEXT_LENGTH = 120;
const MAX_CHOICE_LENGTH = 40;

export function validateQuestion(q: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (typeof q !== "object" || q === null) {
    return { errors: ["문항이 객체가 아님"], warnings };
  }
  const d = q as Partial<QuestionDraft>;

  if (!isCategory(d.category)) {
    errors.push(`category는 ${CATEGORIES.join("|")} 중 하나여야 함: ${String(d.category)}`);
  }
  if (d.difficulty !== 1 && d.difficulty !== 2 && d.difficulty !== 3) {
    errors.push(`difficulty는 1|2|3 이어야 함: ${String(d.difficulty)}`);
  }

  const text = typeof d.text === "string" ? d.text.trim() : "";
  if (!text) errors.push("text 비어 있음");
  else if (text.length > MAX_TEXT_LENGTH) errors.push(`text가 ${MAX_TEXT_LENGTH}자 초과`);

  const n = DEFAULT_RULES.choicesPerQuestion;
  if (!Array.isArray(d.choices) || d.choices.length !== n) {
    errors.push(`choices는 ${n}개여야 함`);
  } else {
    const trimmed = d.choices.map((c) => (typeof c === "string" ? c.trim() : ""));
    if (trimmed.some((c) => !c)) errors.push("빈 보기가 있음");
    if (trimmed.some((c) => c.length > MAX_CHOICE_LENGTH)) {
      errors.push(`보기가 ${MAX_CHOICE_LENGTH}자 초과`);
    }
    if (new Set(trimmed).size !== trimmed.length) errors.push("중복된 보기가 있음");
  }

  if (!Number.isInteger(d.answerIndex) || (d.answerIndex as number) < 0 || (d.answerIndex as number) >= n) {
    errors.push(`answerIndex는 0..${n - 1} 정수여야 함: ${String(d.answerIndex)}`);
  }

  if (typeof d.explanation !== "string" || !d.explanation.trim()) errors.push("explanation 비어 있음");
  if (typeof d.source !== "string" || !d.source.trim()) errors.push("source(근거 출처) 비어 있음");

  const fullText = [text, ...(Array.isArray(d.choices) ? d.choices : [])].join(" ");
  const hits = TIME_SENSITIVE_WORDS.filter((w) => fullText.includes(w));
  if (hits.length > 0) {
    warnings.push(`시의성 표현 포함(${hits.join(", ")}) — 정답이 바뀔 수 있는지 검수 필요`);
  }

  return { errors, warnings };
}

/** 같은 문제 중복 등록 방지용 키 (공백·문장부호 무시) */
export function questionKey(text: string): string {
  return text.replace(/[\s\p{P}]/gu, "").toLowerCase();
}
