/**
 * Summary templates the professor can pick when clicking "Summarize".
 * Each id has a matching file in skills/lecture-summary/templates/<id>.md that is sent to Claude.
 * Safe to import from client components (no server-only code here).
 */

export const TEMPLATES = [
  { id: "quick", icon: "zap", emoji: "⚡", label: "Quick recap", when: "Light session, nothing critical", gives: "3 bullets + any deadlines. Readable in 20 seconds.", addons: [] },
  { id: "standard", icon: "book", emoji: "📘", label: "Standard catch-up", when: "A normal lecture", gives: "Announcements, topics, class Q&A and to-dos.", addons: ["class_questions", "ask_professor"] },
  { id: "study", icon: "cap", emoji: "🎓", label: "Study guide", when: "Exam-relevant material", gives: "Key concepts in the professor's words, examples, exam flags, self-test.", addons: ["class_questions", "quiz", "glossary"] },
  { id: "watch", icon: "compass", emoji: "🧭", label: "Watch guide", when: "Long lecture worth rewatching", gives: "Chapter map of the recording: must-watch vs. skippable parts.", addons: ["ask_professor"] },
  { id: "lab", icon: "flask", emoji: "🧪", label: "Lab / workshop", when: "Hands-on or discussion session", gives: "The activity, what groups found, and exactly what to do to catch up.", addons: ["class_questions"] },
  { id: "admin", icon: "clipboard", emoji: "📋", label: "Admin only", when: "Mostly logistics", gives: "Only deadlines, readings, grading and room/time changes.", addons: [] },
] as const;

export const ADDONS = [
  { id: "class_questions", label: "Questions students asked in class" },
  { id: "quiz", label: "Mini quiz (3 questions)" },
  { id: "ask_professor", label: "“Ask the professor” list" },
  { id: "glossary", label: "Glossary of terms used" },
] as const;

export type TemplateId = (typeof TEMPLATES)[number]["id"];
export type AddonId = (typeof ADDONS)[number]["id"];
export type SummaryOptions = { template: TemplateId; addons: AddonId[]; note: string };

export const DEFAULT_TEMPLATE: TemplateId = "standard";

export function templateInfo(id: string | null | undefined) {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES.find((t) => t.id === DEFAULT_TEMPLATE)!;
}

export function defaultOptions(template: TemplateId = DEFAULT_TEMPLATE): SummaryOptions {
  return { template, addons: [...templateInfo(template).addons], note: "" };
}

/** Validate untrusted input (request body) into SummaryOptions; unknown values fall back to defaults. */
export function parseOptions(input: unknown): SummaryOptions {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const template = TEMPLATES.some((t) => t.id === o.template) ? (o.template as TemplateId) : DEFAULT_TEMPLATE;
  const addons = Array.isArray(o.addons)
    ? ADDONS.map((a) => a.id).filter((id) => (o.addons as unknown[]).includes(id))
    : [...templateInfo(template).addons];
  const note = typeof o.note === "string" ? o.note.trim().slice(0, 1000) : "";
  return { template, addons, note };
}
