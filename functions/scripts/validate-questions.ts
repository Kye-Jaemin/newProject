/**
 * 문항 JSON 파일 검증. 사용: npm run validate:questions [-- <폴더>]
 * 각 파일은 지도서 7-3 형식 문항의 배열이다. 오류가 있으면 종료 코드 1.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { questionKey, validateQuestion } from "../src/content/question";

const dir = process.argv[2] ?? "../content/questions";
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
const seen = new Map<string, string>();
let errorCount = 0;
let warningCount = 0;
let total = 0;

for (const file of files) {
  const items: unknown = JSON.parse(readFileSync(join(dir, file), "utf8"));
  if (!Array.isArray(items)) {
    console.error(`✗ ${file}: 최상위가 배열이 아님`);
    errorCount++;
    continue;
  }
  items.forEach((q, i) => {
    total++;
    const where = `${file}#${i}`;
    const { errors, warnings } = validateQuestion(q);
    errors.forEach((e) => console.error(`✗ ${where}: ${e}`));
    warnings.forEach((w) => console.warn(`! ${where}: ${w}`));
    errorCount += errors.length;
    warningCount += warnings.length;

    const text = (q as { text?: unknown }).text;
    if (typeof text === "string") {
      const key = questionKey(text);
      const prev = seen.get(key);
      if (prev) {
        console.error(`✗ ${where}: ${prev} 와 같은 문제`);
        errorCount++;
      } else {
        seen.set(key, where);
      }
    }
  });
}

console.log(`문항 ${total}개 / 오류 ${errorCount} / 경고 ${warningCount}`);
process.exit(errorCount > 0 ? 1 : 0);
