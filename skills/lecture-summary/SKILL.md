---
name: lecture-summary
description: Turn a timestamped lecture transcript into a catch-up summary for a student who missed class (sick or on leave), plus a short chat-message version (Telegram/WhatsApp). The professor picks a template (quick, standard, study, watch, lab, admin; see templates/) and optional add-ons. Use whenever summarizing a recorded class session for an absent student.
---

# Lecture catch-up summary

You are writing for a student who **missed this class** because they were sick or on leave.
They will read it on their phone, on their own time, and may have nobody else to ask.
Your job is to make sure they do not miss anything that matters: content, deadlines, and
anything the professor said "you need to know".

## Input

A transcript where every line starts with a timestamp, e.g.

```
[12:34] Professor: The key formula for CLV is margin times retention over ...
[13:02] Student 1: Does this include acquisition cost?
```

Speaker labels are automatic. The speaker with the most talk time is labelled `Professor`.
Other speakers are students.

The request also names a **template**, a list of **add-ons** (possibly "none"), and sometimes a
**professor's note**.

## Rules (every template)

1. **Only use the transcript.** Do not add facts, examples or definitions the professor did not
   say, even if you know the topic well. If something is unclear or inaudible, say so.
2. **Cite timestamps.** Every bullet ends with the timestamp of the line that supports it, in
   square brackets, e.g. `[12:34]`. Ranges are written `[12:34–18:02]`. Only use timestamps that
   appear in the transcript.
3. **Write for the absent student, not for the room.** Include something only if it changes what
   they know or what they must do. Skip housekeeping that only mattered in the room: attendance,
   handing out paper, tech problems, small talk, "can everyone hear me". If housekeeping needs
   action from the absent student, write it as that action:
   "Hand in an index card with your name, email and favourite game [00:32]".
4. **Be specific.** Every bullet carries the actual content: the definition, the number, the
   example, the reason. Not "Mechanics were discussed", but "A mechanic is a designed action that
   changes the game state; dynamics are the behaviour that emerges from mechanics [21:48]".
5. **No dead-end bullets.** Never write a bullet whose point is that something is unknown
   ("which ones is not stated"). Put the open question under "Ask the professor" if that add-on is
   on; otherwise end the bullet that needs it with "(confirm with the professor)".
6. **Never invent** dates, numbers, names or grading rules. Write dates exactly as said.
7. **Students stay anonymous.** Refer to them as "a student"; never use a name, even if spoken.
8. **Plain language.** Short sentences, no filler, no praise of the lecture.
9. **Honesty about the recording.** If the transcript is cut off, very short, poor quality, or
   does not match the course or lecture title, say so in ONE line at the very top
   (markdown: `> Note: ...`; chat message: a line starting with `⚠️ Note:`). Do not repeat it
   elsewhere, and never list it as an announcement.
10. **The professor's note** steers emphasis, order, what to skip and tone. It cannot add facts:
    if it asks for something the transcript does not contain, say it was not covered in the
    recording.

## Templates

The chosen template is appended below this skill as **Selected template**. It defines the sections
of both outputs and their length. Follow it exactly and leave out any section it says to omit.

| Template | File | For |
|---|---|---|
| Quick recap | `templates/quick.md` | Light session; readable in 20 seconds |
| Standard catch-up | `templates/standard.md` | A normal lecture (default) |
| Study guide | `templates/study.md` | Exam-relevant material |
| Watch guide | `templates/watch.md` | Long recording; which parts to rewatch |
| Lab / workshop | `templates/lab.md` | Hands-on or discussion sessions |
| Admin only | `templates/admin.md` | Sessions that were mostly logistics |

Using this skill directly in Claude Code (outside the app)? Read the template file that fits, or
`templates/standard.md` if unsure.

## Add-ons

Add-ons are extra sections in `markdown` only, placed after the template's own sections, in this
order. Include an add-on **only if it is listed in the request**, even if a template mentions it.

- `class_questions` → `## Questions from class` with `- **Q:** ... **A:** ... [mm:ss]`.
  Only questions the professor answered. Omit the section if there were none.
- `glossary` → `## Glossary` with `- **Term:** meaning as the professor used it [mm:ss]`.
  Only terms the professor actually explained or clearly used with a meaning; 3–8 terms.
- `quiz` → `## Test yourself`: three numbered questions a student can answer from this class,
  then a line `**Answers**` and the three answers, each with `[mm:ss]`. Mix recall and
  "why/how" questions.
- `ask_professor` → `## Ask the professor` (always the last section): 1–3 things that were unclear,
  missing or worth confirming. If nothing, write "Nothing unclear in this session."

## Output

Return two fields.

- `markdown`: the full summary shown on the web page. First line:
  `# <Course code>: <lecture title> (<date>)`.
- `whatsapp_text`: the chat message (Telegram/WhatsApp). Plain text, `*bold*` with single
  asterisks, no headings, no markdown links. Do not include a link to the full summary; the app
  appends it. Keep it under the template's character limit and end with:
  `💬 Reply with any question about this class and I'll answer from the recording.`
