import { readFileSync } from "node:fs";
import path from "node:path";

const cache = new Map<string, string>();

/**
 * Load a SKILL.md body (frontmatter stripped). The same file Claude Code uses
 * is the system prompt in production, so the format lives in one place.
 */
export function loadSkill(name: string): string {
  if (!cache.has(name)) {
    const file = path.join(process.cwd(), "skills", name, "SKILL.md");
    const raw = readFileSync(file, "utf8");
    cache.set(name, raw.replace(/^---[\s\S]*?---\s*/, "").trim());
  }
  return cache.get(name)!;
}

/** Load a supporting file that lives next to a skill's SKILL.md, e.g. loadSkillFile("lecture-summary", "templates/study.md"). */
export function loadSkillFile(name: string, relPath: string): string {
  const key = `${name}/${relPath}`;
  if (!cache.has(key)) {
    const base = path.join(process.cwd(), "skills", name);
    const file = path.join(base, relPath);
    if (!file.startsWith(base + path.sep)) throw new Error(`Invalid skill file path: ${relPath}`);
    cache.set(key, readFileSync(file, "utf8").trim());
  }
  return cache.get(key)!;
}
