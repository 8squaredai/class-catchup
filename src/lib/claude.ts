import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env";
import { loadSkill } from "./skill";

let client: Anthropic | null = null;
function anthropic() {
  if (!client) client = new Anthropic({ apiKey: env.anthropicKey() });
  return client;
}

function textOf(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

export type SummaryResult = {
  markdown: string;
  whatsapp_text: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
};

export async function summarizeTranscript(opts: {
  courseCode: string;
  courseName: string;
  title: string;
  date: string;
  transcript: string;
}): Promise<SummaryResult> {
  const model = env.claudeModel();
  const msg = await anthropic().messages.create({
    model,
    max_tokens: 4000,
    system: loadSkill("lecture-summary"),
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            markdown: { type: "string" },
            whatsapp_text: { type: "string" },
          },
          required: ["markdown", "whatsapp_text"],
          additionalProperties: false,
        },
      },
    },
    messages: [
      {
        role: "user",
        content:
          `Course: ${opts.courseCode} – ${opts.courseName}\nLecture: ${opts.title}\nDate: ${opts.date}\n\n` +
          `<transcript>\n${opts.transcript}\n</transcript>\n\nWrite the catch-up summary.`,
      },
    ],
  });
  const parsed = JSON.parse(textOf(msg)) as { markdown: string; whatsapp_text: string };
  return {
    ...parsed,
    model,
    input_tokens: msg.usage.input_tokens,
    output_tokens: msg.usage.output_tokens,
  };
}

const QA_RULES = `You answer questions from a student who missed a class, using ONLY the lecture transcript provided.

Rules:
- Answer only from the transcript. Never use outside knowledge to fill gaps, even if you know the topic.
- Cite the timestamp of every supporting line in square brackets, e.g. [12:34]. Only cite timestamps that appear in the transcript.
- If the transcript does not cover the question, set "covered" to false and say briefly that it was not covered in this session and that they should ask the professor. Do not guess.
- If it is partly covered, answer the covered part, cite it, and say what was not covered.
- Students in the transcript are anonymous; never guess who they are.
- Keep answers short enough for a chat message (Telegram/WhatsApp): at most ~8 lines / 900 characters. Plain text; *single asterisks* for bold.
- Greetings or thanks: reply briefly and set "covered" to true.`;

export type Turn = { role: "user" | "assistant"; content: string };

export type AnswerResult = { covered: boolean; answer: string; input_tokens: number; output_tokens: number; cache_read: number };

export async function answerQuestion(opts: {
  lectureLabel: string;
  transcript: string;
  question: string;
  history?: Turn[];
}): Promise<AnswerResult> {
  const msg = await anthropic().messages.create({
    model: env.claudeModel(),
    max_tokens: 1200,
    system: [
      { type: "text", text: QA_RULES },
      {
        // The transcript is identical for every question about this lecture, so cache it.
        type: "text",
        text: `Lecture: ${opts.lectureLabel}\n\n<transcript>\n${opts.transcript}\n</transcript>`,
        cache_control: { type: "ephemeral" },
      },
    ],
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            covered: { type: "boolean" },
            answer: { type: "string" },
          },
          required: ["covered", "answer"],
          additionalProperties: false,
        },
      },
    },
    messages: [...(opts.history ?? []), { role: "user", content: opts.question }],
  });
  const parsed = JSON.parse(textOf(msg)) as { covered: boolean; answer: string };
  return {
    ...parsed,
    input_tokens: msg.usage.input_tokens,
    output_tokens: msg.usage.output_tokens,
    cache_read: msg.usage.cache_read_input_tokens ?? 0,
  };
}
