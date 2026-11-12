"use client";

import { useState } from "react";
import { Icon, type IconName } from "@/components/Icon";
import { ADDONS, TEMPLATES, defaultOptions, templateInfo, type SummaryOptions, type TemplateId } from "@/lib/templates";
import { Modal } from "./ui";

/** Template picker shown when the professor summarizes a lecture. */
export function SummarizeModal({
  title, initialTemplate, onClose, onConfirm,
}: { title: string; initialTemplate?: string | null; onClose: () => void; onConfirm: (o: SummaryOptions) => void }) {
  const [opts, setOpts] = useState<SummaryOptions>(() =>
    defaultOptions(TEMPLATES.some((t) => t.id === initialTemplate) ? (initialTemplate as TemplateId) : undefined),
  );

  return (
    <Modal
      title={`Summarize “${title}”`}
      icon="pen"
      onClose={onClose}
      wide
      footer={
        <>
          <span className="muted foot-hint">Claude only uses what was said in the recording.</span>
          <div className="row">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="button" className="btn-primary" onClick={() => onConfirm(opts)}>
              <Icon name="pen" size={16} /> Summarize as {templateInfo(opts.template).label}
            </button>
          </div>
        </>
      }
    >
      <p className="muted" style={{ marginTop: 0 }}>How should absent students get this class?</p>
      <div className="tpl-grid" role="radiogroup" aria-label="Summary template">
        {TEMPLATES.map((t) => (
          <label key={t.id} className={`tpl${opts.template === t.id ? " on" : ""}`}>
            <input type="radio" name="template" checked={opts.template === t.id} onChange={() => setOpts({ ...defaultOptions(t.id), note: opts.note })} />
            <span className="tpl-emoji" aria-hidden="true"><Icon name={t.icon as IconName} size={18} /></span>
            <span className="tpl-title">{t.label}</span>
            <span className="tpl-when">{t.when}</span>
            <span className="tpl-gives">{t.gives}</span>
          </label>
        ))}
      </div>

      <h3>Add-ons</h3>
      <div className="addons">
        {ADDONS.map((a) => {
          const on = opts.addons.includes(a.id);
          return (
            <label key={a.id} className={`addon${on ? " on" : ""}`}>
              <input
                type="checkbox"
                checked={on}
                onChange={(e) => setOpts({ ...opts, addons: e.target.checked ? [...opts.addons, a.id] : opts.addons.filter((x) => x !== a.id) })}
              />
              <span className="addon-box"><Icon name="check" size={12} /></span>
              {a.label}
            </label>
          );
        })}
      </div>

      <h3>Note for Claude <span className="muted" style={{ fontWeight: 400 }}>(optional)</span></h3>
      <textarea
        className="note"
        value={opts.note}
        maxLength={1000}
        onChange={(e) => setOpts({ ...opts, note: e.target.value })}
        placeholder="e.g. Focus on mechanics vs. dynamics and skip the syllabus intro."
      />
    </Modal>
  );
}
