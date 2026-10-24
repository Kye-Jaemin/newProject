/**
 * content/questions/*.json → Firestore questions 컬렉션 + questionPools/{category} 갱신.
 *
 * 사용:
 *   에뮬레이터: FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run import:questions -- --approve-all
 *   실서버:     GOOGLE_CLOUD_PROJECT=<프로젝트ID> npm run import:questions   (gcloud 로그인 필요)
 *
 * - qid는 문제 문장으로 만든 해시라서 같은 문제를 다시 가져와도 중복 생성되지 않는다.
 * - 각 문항의 status는 JSON의 "status" 값(없으면 draft). --approve-all 은 개발용으로 전부 승인 처리.
 * - 검증 오류가 하나라도 있으면 아무것도 쓰지 않는다.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { CATEGORIES } from "../src/config";
import { QuestionDraft, questionKey, validateQuestion } from "../src/content/question";

const args = process.argv.slice(2);
const approveAll = args.includes("--approve-all");
const dir = args.find((a) => !a.startsWith("--")) ?? "../content/questions";

type Item = QuestionDraft & { status?: "draft" | "approved" | "retired" };

const items: Item[] = [];
let errors = 0;
for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  const list = JSON.parse(readFileSync(join(dir, file), "utf8")) as unknown[];
  list.forEach((q, i) => {
    const r = validateQuestion(q);
    r.errors.forEach((e) => console.error(`✗ ${file}#${i}: ${e}`));
    errors += r.errors.length;
    items.push(q as Item);
  });
}
if (errors > 0) {
  console.error(`오류 ${errors}개 — 가져오기 중단`);
  process.exit(1);
}

export function qidOf(text: string): string {
  return createHash("sha1").update(questionKey(text)).digest("hex").slice(0, 16);
}

async function main() {
  initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT ?? "demo-quizduel" });
  const db = getFirestore();

  const writer = db.bulkWriter();
  for (const q of items) {
    const status = approveAll ? "approved" : (q.status ?? "draft");
    writer.set(
      db.collection("questions").doc(qidOf(q.text)),
      {
        category: q.category,
        difficulty: q.difficulty,
        text: q.text.trim(),
        choices: q.choices.map((c) => c.trim()),
        answerIndex: q.answerIndex,
        explanation: q.explanation,
        source: q.source,
        status,
      },
      { merge: true }, // stats(served, correct)는 유지
    );
  }
  await writer.close();

  // 승인 문항으로 출제 풀 재구성
  const approved = await db.collection("questions").where("status", "==", "approved").select("category").get();
  const pools = new Map<string, string[]>(CATEGORIES.map((c) => [c, []]));
  approved.forEach((d) => pools.get(d.get("category"))?.push(d.id));
  const batch = db.batch();
  for (const [category, qids] of pools) batch.set(db.collection("questionPools").doc(category), { qids });
  await batch.commit();

  console.log(`문항 ${items.length}개 반영`);
  for (const [category, qids] of pools) console.log(`  ${category}: 승인 ${qids.length}개`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
