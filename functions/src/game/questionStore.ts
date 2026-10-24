import { Firestore } from "firebase-admin/firestore";
import { Category } from "../config";

/**
 * 문항·문항풀 읽기 + 인스턴스 메모리 캐시.
 * 승인된 문항은 내용이 바뀌지 않는다는 전제(수정이 필요하면 retired 후 새 qid로 등록).
 * 캐시 덕분에 한 판 동안 문항 읽기는 처음 한 번만 Firestore 비용이 든다.
 */

export interface StoredQuestion {
  category: Category;
  difficulty: number;
  text: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
  status: "draft" | "approved" | "retired";
}

/** questionPools/{category}: 승인 문항 qid 목록. 문항 가져오기 스크립트가 갱신한다. */
export interface QuestionPool {
  qids: string[];
}

const TTL_MS = 10 * 60 * 1000;

interface Entry<T> {
  value: T;
  expiresAt: number;
}

const questionCache = new Map<string, Entry<StoredQuestion>>();
const poolCache = new Map<string, Entry<string[]>>();

function cached<T>(map: Map<string, Entry<T>>, key: string): T | undefined {
  const hit = map.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  map.delete(key);
  return undefined;
}

export async function loadQuestion(db: Firestore, qid: string): Promise<StoredQuestion> {
  const hit = cached(questionCache, qid);
  if (hit) return hit;
  const snap = await db.collection("questions").doc(qid).get();
  if (!snap.exists) throw new Error(`question not found: ${qid}`);
  const value = snap.data() as StoredQuestion;
  questionCache.set(qid, { value, expiresAt: Date.now() + TTL_MS });
  return value;
}

export async function loadPool(db: Firestore, category: Category): Promise<string[]> {
  const hit = cached(poolCache, category);
  if (hit) return hit;
  const snap = await db.collection("questionPools").doc(category).get();
  const qids = snap.exists ? ((snap.data() as QuestionPool).qids ?? []) : [];
  poolCache.set(category, { value: qids, expiresAt: Date.now() + TTL_MS });
  return qids;
}

/** 테스트용 */
export function clearQuestionCache(): void {
  questionCache.clear();
  poolCache.clear();
}
