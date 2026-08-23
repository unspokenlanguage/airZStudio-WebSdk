// İttifak configurator — a drag-and-drop board. Each alliance is a container;
// drag a party chip from one container into another to change its membership.
// Alliance vote totals/percentages are derived live from party votes via this
// map, so a move re-tallies the İTTİFAKLAR panel (and anything bound to alliance
// data) in real time from the same simulator numbers.

import { useState } from "react";
import type { AllianceMap } from "../alliances.js";

interface PartyRow { id: string; name: string; color?: string }
interface AllianceOpt { id: string; label: string; color?: string }

interface Props {
  open: boolean;
  onClose: () => void;
  map: AllianceMap;
  parties: PartyRow[];
  alliances: AllianceOpt[];
  onChange: (map: AllianceMap) => void;
}

export function AllianceEditor({ open, onClose, map, parties, alliances, onChange }: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  if (!open) return null;

  const containers: AllianceOpt[] = [...alliances, { id: "other", label: "Other / Diğer", color: "#9aa3ad" }];
  const partyById = new Map(parties.map((p) => [p.id, p]));

  const move = (partyId: string, allianceId: string) => {
    if ((map[partyId] ?? "other") !== allianceId) onChange({ ...map, [partyId]: allianceId });
  };

  const drop = (allianceId: string) => {
    if (dragId) move(dragId, allianceId);
    setDragId(null);
    setOverId(null);
  };

  return (
    <div style={S.backdrop} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={S.head}>
          <strong>İttifak Membership</strong>
          <button style={S.x} onClick={onClose}>✕</button>
        </div>
        <div style={S.body}>
          <p style={S.hint}>
            Drag a party into another alliance — the İTTİFAKLAR totals and
            percentages re-tally live from the same votes. Perfect for last-minute
            alliance changes.
          </p>

          <div style={S.board}>
            {containers.map((c) => {
              const members = parties.filter((p) => (map[p.id] ?? "other") === c.id);
              const isOver = overId === c.id;
              return (
                <div
                  key={c.id}
                  style={{
                    ...S.container,
                    borderColor: isOver ? (c.color ?? "#6366f1") : "#27272a",
                    background: isOver ? "rgba(99,102,241,0.08)" : "#0e0e13",
                  }}
                  onDragOver={(e) => { e.preventDefault(); setOverId(c.id); }}
                  onDragLeave={() => setOverId((v) => (v === c.id ? null : v))}
                  onDrop={() => drop(c.id)}
                >
                  <div style={{ ...S.containerHead, borderColor: c.color ?? "#6366f1" }}>
                    <span style={{ ...S.dot, background: c.color ?? "#6366f1" }} />
                    <span style={S.containerName}>{c.label}</span>
                    <span style={S.count}>{members.length}</span>
                  </div>
                  <div style={S.dropZone}>
                    {members.length === 0 && <div style={S.empty}>drop here</div>}
                    {members.map((p) => (
                      <div
                        key={p.id}
                        draggable
                        onDragStart={() => setDragId(p.id)}
                        onDragEnd={() => { setDragId(null); setOverId(null); }}
                        style={{
                          ...S.chip,
                          borderLeftColor: partyById.get(p.id)?.color ?? "#52525b",
                          opacity: dragId === p.id ? 0.4 : 1,
                        }}
                        title="Drag to another alliance"
                      >
                        {p.name}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  backdrop: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  modal: { width: "min(920px, 94vw)", maxHeight: "88vh", background: "#141419", border: "1px solid #27272a", borderRadius: 12, display: "flex", flexDirection: "column", color: "#e4e4e7", overflow: "hidden" },
  head: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid #27272a" },
  x: { background: "#27272a", border: "none", color: "#e4e4e7", borderRadius: 6, width: 28, height: 28, cursor: "pointer" },
  body: { padding: 18, overflowY: "auto" },
  hint: { fontSize: 12, color: "#a1a1aa", marginTop: 0, marginBottom: 16 },
  board: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, alignItems: "start" },
  container: { border: "1px solid #27272a", borderRadius: 10, padding: 8, transition: "border-color 0.15s, background 0.15s", minHeight: 120 },
  containerHead: { display: "flex", alignItems: "center", gap: 8, padding: "4px 6px 8px", borderBottom: "2px solid #6366f1", marginBottom: 8 },
  dot: { width: 10, height: 10, borderRadius: "50%", flexShrink: 0 },
  containerName: { fontSize: 12, fontWeight: 700, color: "#fff", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  count: { fontSize: 11, color: "#a1a1aa", background: "#1c1c22", borderRadius: 10, padding: "1px 7px" },
  dropZone: { display: "flex", flexDirection: "column", gap: 6, minHeight: 60 },
  empty: { fontSize: 11, color: "#52525b", textAlign: "center", padding: "18px 0", border: "1px dashed #27272a", borderRadius: 6 },
  chip: { background: "#1b1f29", borderLeft: "3px solid #52525b", borderRadius: 6, padding: "8px 10px", fontSize: 13, color: "#e4e4e7", cursor: "grab", userSelect: "none" },
};
