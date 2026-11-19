"use client";
// A small map of who knows whom. You in the middle. Family linked. An introduction still waiting is a dashed line.
import { initial, type CircleAsk, type CircleContact } from "@/apps/messages/circle";

const ROLE_ORDER = ["family", "friend", "mentor", "colleague", "rival"];

interface Node {
  who: number;
  name: string;
  role: string;
  word: string;
  x: number;
  y: number;
  ghost: boolean;
}

function place(people: CircleContact[]): Node[] {
  const sorted = [...people].sort((a, b) => {
    const ar = ROLE_ORDER.indexOf(a.role);
    const br = ROLE_ORDER.indexOf(b.role);
    const ao = ar < 0 ? 9 : ar;
    const bo = br < 0 ? 9 : br;
    if (ao !== bo) return ao - bo;
    return a.name.localeCompare(b.name);
  });
  const inner = sorted.filter((p) => p.role === "family" || p.role === "friend" || p.role === "mentor");
  const rings = sorted.length > 18 && inner.length > 0 && inner.length < sorted.length;
  return sorted.map((p) => {
    const close = p.role === "family" || p.role === "friend" || p.role === "mentor";
    const group = !rings ? sorted : sorted.filter((x) => (x.role === "family" || x.role === "friend" || x.role === "mentor") === close);
    const i = group.indexOf(p);
    const radius = !rings ? 74 : close ? 46 : 86;
    const angle = -Math.PI / 2 + (group.length <= 1 ? 0 : (i * 2 * Math.PI) / group.length);
    return {
      who: p.who,
      name: p.name,
      role: p.role,
      word: p.bond.word || p.word,
      x: 160 + Math.cos(angle) * radius,
      y: 104 + Math.sin(angle) * radius,
      ghost: false,
    };
  });
}

export function CircleMap({ you, people, pending, links, selected, onPick }: {
  you: string;
  people: CircleContact[];
  pending: CircleAsk[];
  links: { a: number; b: number; why: string; kind: string }[];
  selected: number | null;
  onPick: (who: number) => void;
}) {
  const nodes = place(people);
  const byWho = new Map(nodes.map((n) => [n.who, n]));
  const family = nodes.filter((n) => n.role === "family");
  const crowded = nodes.length > 16;
  const showLine = (who: number) => !crowded || who === selected || family.some((n) => n.who === who);
  const ghosts: Node[] = [];
  const intros = pending.filter((a) => a.kind === "intro" && a.other >= 0);
  for (const ask of intros) {
    if (byWho.has(ask.other) || ghosts.some((g) => g.who === ask.other)) continue;
    const from = byWho.get(ask.from);
    const angle = from ? Math.atan2(from.y - 104, from.x - 160) + 0.55 : -0.4;
    ghosts.push({
      who: ask.other,
      name: ask.otherName || "Someone new",
      role: "colleague",
      word: "",
      x: 160 + Math.cos(angle) * 78,
      y: 104 + Math.sin(angle) * 78,
      ghost: true,
    });
  }
  const ghostBy = new Map(ghosts.map((g) => [g.who, g]));
  const label = nodes.length > 12 ? "" : "name";
  const dot = crowded ? 8 : 14;

  return (
    <div className="peo-map-wrap">
      <svg className="peo-map" viewBox="0 0 320 210" data-testid="circle-map" aria-label="Who knows whom">
        {nodes.filter((n) => showLine(n.who)).map((n) => (
          <line key={`you-${n.who}`} x1={160} y1={104} x2={n.x} y2={n.y} stroke="var(--line)" strokeWidth={1} />
        ))}
        {links.map((link) => {
          const a = byWho.get(link.a), b = byWho.get(link.b);
          if (!a || !b || (crowded && selected !== a.who && selected !== b.who)) return null;
          return (
            <line key={`link-${link.a}-${link.b}`} data-testid="circle-link"
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={link.kind === "family" ? "var(--acc)" : "var(--info)"} strokeWidth={1.5}>
              <title>{a.name} and {b.name} · {link.why}</title>
            </line>
          );
        })}
        {intros.map((ask) => {
          const from = byWho.get(ask.from);
          const to = byWho.get(ask.other) ?? ghostBy.get(ask.other);
          if (!from || !to) return null;
          return (
            <line
              key={`intro-${ask.id}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke="var(--info)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          );
        })}
        <g>
          <circle cx={160} cy={104} r={16} fill="var(--win2)" stroke="var(--acc)" />
          <text x={160} y={108} textAnchor="middle" fill="var(--fg)" fontSize={11}>{initial(you || "You")}</text>
        </g>
        {ghosts.map((n) => (
          <g key={`g-${n.who}`} data-testid="map-ghost">
            <circle cx={n.x} cy={n.y} r={13} fill="var(--win)" stroke="var(--info)" strokeDasharray="3 2" />
            <text x={n.x} y={n.y + 4} textAnchor="middle" fill="var(--fg-muted)" fontSize={10}>{initial(n.name)}</text>
          </g>
        ))}
        {nodes.map((n) => (
          <g
            key={n.who}
            role="button"
            tabIndex={0}
            data-testid="map-person"
            data-role={n.role}
            onClick={() => onPick(n.who)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(n.who); } }}
            style={{ cursor: "pointer" }}
          >
            <title>{`${n.name}, ${n.role}${n.word ? `, ${n.word}` : ""}`}</title>
            <circle cx={n.x} cy={n.y} r={n.who === selected ? dot + 3 : dot} fill="var(--win2)" stroke={n.who === selected ? "var(--acc)" : "var(--line)"} strokeWidth={n.who === selected ? 2 : 1} />
            <text x={n.x} y={n.y + 3} textAnchor="middle" fill="var(--fg)" fontSize={crowded ? 8 : 11}>{initial(n.name)}</text>
            {label ? (
              <text x={n.x} y={n.y + 28} textAnchor="middle" fill="var(--fg-muted)" fontSize={9}>
                {(n.name.split(/\s+/)[0] || "").slice(0, 8)}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
      <p className="peo-map-note">Lines are who knows whom. You are in the middle.</p>
    </div>
  );
}
