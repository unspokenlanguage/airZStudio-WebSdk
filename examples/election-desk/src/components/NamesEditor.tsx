// Editor for the bilingual party & alliance labels — the config source of truth
// used by both the web UI and the names pushed on air. Persisted by the caller.

import type { Labels } from "../labels.js";

interface Entry { id: string; tr: string }

interface Props {
  open: boolean;
  onClose: () => void;
  labels: Labels;
  parties: Entry[];
  alliances: Entry[];
  onChange: (labels: Labels) => void;
}

export function NamesEditor({ open, onClose, labels, parties, alliances, onChange }: Props) {
  if (!open) return null;

  const set = (type: "parties" | "alliances", id: string, lang: "en" | "tr", value: string) => {
    const cur = labels[type][id] ?? { en: "", tr: "" };
    onChange({
      ...labels,
      [type]: { ...labels[type], [id]: { ...cur, [lang]: value } },
    });
  };

  const section = (title: string, type: "parties" | "alliances", rows: Entry[]) => (
    <div style={S.section}>
      <div style={S.sectionHead}>{title}</div>
      <div style={S.grid}>
        <div style={S.colHead}>ID</div>
        <div style={S.colHead}>English</div>
        <div style={S.colHead}>Türkçe</div>
        {rows.map((r) => {
          const l = labels[type][r.id] ?? { en: "", tr: r.tr };
          return (
            <Row key={r.id} id={r.id} en={l.en} tr={l.tr}
              onEn={(v) => set(type, r.id, "en", v)}
              onTr={(v) => set(type, r.id, "tr", v)} />
          );
        })}
      </div>
    </div>
  );

  return (
    <div style={S.backdrop} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={S.head}>
          <strong>Party &amp; Alliance Names</strong>
          <button style={S.x} onClick={onClose}>✕</button>
        </div>
        <div style={S.body}>
          <p style={S.hint}>
            These names are the source of truth for the UI and the on-air graphics.
            Editing "English" or "Türkçe" here changes what shows and what is pushed
            when you toggle EN/TR. Acronyms can be left identical.
          </p>
          {section("Parties", "parties", parties)}
          {section("Alliances", "alliances", alliances)}
        </div>
      </div>
    </div>
  );
}

function Row(props: { id: string; en: string; tr: string; onEn: (v: string) => void; onTr: (v: string) => void }) {
  return (
    <>
      <div style={S.idCell}>{props.id}</div>
      <input style={S.input} value={props.en} onChange={(e) => props.onEn(e.target.value)} />
      <input style={S.input} value={props.tr} onChange={(e) => props.onTr(e.target.value)} />
    </>
  );
}

const S: Record<string, React.CSSProperties> = {
  backdrop: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  modal: { width: "min(680px, 92vw)", maxHeight: "88vh", background: "#141419", border: "1px solid #27272a", borderRadius: 12, display: "flex", flexDirection: "column", color: "#e4e4e7", overflow: "hidden" },
  head: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid #27272a" },
  x: { background: "#27272a", border: "none", color: "#e4e4e7", borderRadius: 6, width: 28, height: 28, cursor: "pointer" },
  body: { padding: 18, overflowY: "auto" },
  hint: { fontSize: 12, color: "#a1a1aa", marginTop: 0 },
  section: { marginTop: 16 },
  sectionHead: { fontSize: 12, textTransform: "uppercase", letterSpacing: 1, color: "#a78bfa", fontWeight: 700, marginBottom: 8 },
  grid: { display: "grid", gridTemplateColumns: "110px 1fr 1fr", gap: 8, alignItems: "center" },
  colHead: { fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, color: "#71717a" },
  idCell: { fontSize: 12, color: "#71717a", fontFamily: "monospace" },
  input: { background: "#0e0e13", border: "1px solid #27272a", color: "#e4e4e7", borderRadius: 6, padding: "7px 9px", fontSize: 13, width: "100%", boxSizing: "border-box" },
};
