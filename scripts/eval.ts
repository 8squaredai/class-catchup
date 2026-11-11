/**
 * Accuracy check for the Q&A loop (the "rigor" part of the project).
 *
 *   npm run eval -- --sample               # loads samples/sample-lecture.txt as a BA101 lecture, then evaluates
 *   npm run eval -- --lecture <lecture-id> # evaluate an existing lecture
 *   npm run eval -- --lecture <id> --questions eval/my-questions.json
 *
 * Checks automatically:
 *   - covered vs not-covered matches what we expected (does it refuse when it should, and only then?)
 *   - every [mm:ss] citation points to a real moment in the transcript
 *   - the expected reference timestamp is among the citations (±30s)
 * Writes eval/results-<time>.csv with a blank "human_correct" column for you to grade answers by hand.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { db, must } from "../src/lib/supabase";
import { answerQuestion } from "../src/lib/claude";
import { parsePastedTranscript, transcriptForPrompt, extractCitations, citationIsValid, parseTime } from "../src/lib/transcript";
import { saveSegments, getLecture, getSegments, lectureLabel, summarizeLecture } from "../src/lib/pipeline";

type Q = { question: string; expected_covered: boolean; reference: string };

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function loadSample(): Promise<string> {
  const course = must(await db().from("courses").select("id").eq("code", "BA101").single(), "course BA101") as { id: string };
  const lecture = must(
    await db().from("lectures").insert({ course_id: course.id, title: "Customer Lifetime Value (sample)", lecture_date: new Date().toISOString().slice(0, 10) }).select("id").single(),
    "create lecture",
  ) as { id: string };
  await saveSegments(lecture.id, parsePastedTranscript(readFileSync("samples/sample-lecture.txt", "utf8")));
  console.log(`Created sample lecture ${lecture.id}; summarizing…`);
  await summarizeLecture(lecture.id);
  return lecture.id;
}

const csv = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

async function main() {
  const lectureId = process.argv.includes("--sample") ? await loadSample() : arg("lecture");
  if (!lectureId) throw new Error("Pass --sample or --lecture <id>");
  const questions = JSON.parse(readFileSync(arg("questions") ?? "eval/questions.json", "utf8")) as Q[];

  const lecture = await getLecture(lectureId);
  const segments = await getSegments(lectureId);
  const transcript = transcriptForPrompt(segments);

  const rows: string[] = [["question", "expected_covered", "covered", "coverage_ok", "citations", "all_citations_valid", "reference", "reference_cited", "answer", "human_correct"].join(",")];
  let coverageOk = 0, citationsValid = 0, refHit = 0, refTotal = 0, cacheRead = 0;

  for (const q of questions) {
    const r = await answerQuestion({ lectureLabel: lectureLabel(lecture), transcript, question: q.question });
    const cites = extractCitations(r.answer);
    const valid = cites.every((t) => citationIsValid(t, segments));
    const ref = q.reference ? parseTime(q.reference) : null;
    const refCited = ref === null ? "" : cites.some((t) => Math.abs(t - ref) <= 30);
    if (r.covered === q.expected_covered) coverageOk++;
    if (valid) citationsValid++;
    if (q.expected_covered && ref !== null) { refTotal++; if (refCited) refHit++; }
    cacheRead += r.cache_read;
    console.log(`${r.covered === q.expected_covered ? "✓" : "✗"} ${q.question}\n   → ${r.answer.replace(/\n/g, " ").slice(0, 160)}`);
    rows.push([q.question, q.expected_covered, r.covered, r.covered === q.expected_covered, cites.length, valid, q.reference, refCited, r.answer, ""].map(csv).join(","));
  }

  const n = questions.length;
  const out = `eval/results-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
  writeFileSync(out, rows.join("\n"));
  console.log(`\nLecture: ${lectureLabel(lecture)}`);
  console.log(`Covered / not-covered correct: ${coverageOk}/${n} (${Math.round((coverageOk / n) * 100)}%)`);
  console.log(`Answers whose citations all point to real transcript moments: ${citationsValid}/${n}`);
  console.log(`Expected source timestamp cited (covered questions): ${refHit}/${refTotal}`);
  console.log(`Prompt-cache tokens read across run: ${cacheRead}`);
  console.log(`Wrote ${out}; fill in "human_correct" to grade answer quality.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
