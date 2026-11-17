"use client";
// The city's society: the rich list, the seats of power, this month's rises and falls, and the month.
import { useState } from "react";
import { useShell, useShellStore } from "@/components/shell/ShellContext";
import { viewportOf } from "@/shell/wm";
import { useSimSnap } from "@/shell/simSession";
import { gameDate, moneyFromCents, MONTHS } from "@/components/ui/format";
import { kindWord, parsePlans } from "@/apps/diary/read";
import { Why } from "@/apps/profile/data";
import "@/apps/profile/life.css";
import "@/components/ui/named.css";
import {
  chipText, doorsOf, linkFirms, monthDays, monthStories, opensLine, parseCalendar, parseSociety,
  powerGroups, rankWord, roleFirm,
  type CalDay, type FirmName, type PowerRow, type RichRow, type Story,
} from "./read";
import "./society.css";

function PersonLink({ person, name }: { person: number; name: string }) {
  const store = useShellStore();
  if (person < 0 || !name) return <>{name}</>;
  return (
    <button type="button" className="name-link" onClick={() => store.getState().open("people", `who:${person}`)}>
      {name}
    </button>
  );
}

function FirmBits({ text, firms, onFirm }: { text: string; firms: FirmName[]; onFirm: (id: string) => void }) {
  const bits = linkFirms(text, firms);
  if (!bits.length) return <>{text}</>;
  return (
    <>
      {bits.map((bit, i) => bit.kind === "firm" && bit.id ? (
        <button key={i} type="button" className="name-link" onClick={() => onFirm(bit.id!)}>{bit.text}</button>
      ) : (
        <span key={i}>{bit.text}</span>
      ))}
    </>
  );
}

function changeOf(cents: number): { word: string; cls: string; money: string } {
  if (!cents) return { word: "Unchanged", cls: "", money: moneyFromCents(0) };
  if (cents > 0) return { word: "Up", cls: "gain", money: `+${moneyFromCents(cents)}` };
  return { word: "Down", cls: "loss", money: moneyFromCents(cents) };
}

export default function SocietyApp() {
  const phone = useShell((s) => viewportOf(s.vw) === "phone");
  const view = useSimSnap().view;
  const store = useShellStore();
  const vis = useShell((s) => s.vis);
  const [pick, setPick] = useState<number | null>(null);
  const soc = parseSociety(view?.society);
  const calendar = parseCalendar(view?.calendar);
  const firms = view?.firms ?? [];

  const openFirm = (id: string) => {
    if (vis.businesses === "unlocked") {
      store.getState().open("businesses", id);
      return;
    }
    const quote = view?.quotes.find((q) => q.issuer === id);
    if (quote) {
      store.getState().open("markets", quote.instr);
      return;
    }
    if (view?.companies?.some((c) => c.id === id)) store.getState().open("company", id);
  };

  if (!view || !soc) {
    return <div className={`soc${phone ? " q-phone" : ""}`} data-testid="society"><p className="quay-state" role="status">Reading the city…</p></div>;
  }

  const abs = view.date.abs;
  const standing = soc.standing;
  const rank = soc.rank;
  const doors = standing ? doorsOf(standing.score, soc.rich, soc.powerful, view.contacts ?? []) : { come: [], stay: [] };
  const stories = monthStories(soc.stories, abs);
  const rises = stories.filter((s) => s.dir === "rise");
  const falls = stories.filter((s) => s.dir === "fall");
  const days = monthDays(abs, calendar);
  const chosen = days.find((d) => d.day === (pick ?? abs)) ?? days.find((d) => d.day === abs);
  const groups = powerGroups(soc.powerful);
  const monthName = MONTHS[(view.date.month - 1 + 12) % 12] ?? "";
  const parties = parsePlans(view.plans).filter((p) => (p.kind === "gala" || p.kind === "party") && p.day >= abs).slice(0, 6);

  return (
    <div className={`soc${phone ? " q-phone" : ""}`} data-testid="society">
      <div className="soc-grid">
      <section className="soc-card soc-parties" data-testid="soc-parties" aria-label="The season">
        <h2>The season</h2>
        <p className="soc-kicker">Parties and galas the rich list attends.</p>
        {parties.length ? parties.map((p) => (
            <article className="soc-party" key={p.key}>
              <p><span className="label">{kindWord(p.kind)}</span> · <span className="num">{gameDate(p.day)}</span></p>
              {p.place ? <p>{p.place}</p> : null}
              <p>{p.who.map((w, i) => (
                <span key={`${w.person}-${i}`}>{i ? ", " : ""}{w.self ? "You" : <PersonLink person={w.person} name={w.name} />}</span>
              ))}</p>
              <p>{p.answer || (p.invite ? "You are invited." : "You were not invited.")}</p>
              {p.reason ? <p className="soc-why">{p.reason}</p> : null}
            </article>
          )) : <p>No party is set in the next month.</p>}
      </section>
      <section className="soc-card soc-month" data-testid="soc-month" aria-label="The month">
        <h2>{monthName} · Year {view.date.year}</h2>
        <p className="soc-kicker">{chipText(abs, calendar)}</p>
        <div className="soc-cal">
          {days.map((d) => (
            <button
              key={d.day}
              type="button"
              className="soc-day"
              data-today={d.day === abs ? "1" : "0"}
              data-closed={d.closed ? "1" : "0"}
              data-on={chosen?.day === d.day ? "1" : "0"}
              title={d.closed ? (d.items.find((i) => i.kind === "society.holiday")?.title || "The exchange is closed") : d.items.map((i) => i.title).join(". ")}
              onClick={() => setPick(d.day)}
            >
              <span className="num">{d.date}</span>
              {d.closed ? <small>Closed</small> : d.items[0] && d.items[0].title !== "Earnings season" ? <small>{d.items[0].title.replace(/^The /, "")}</small> : null}
            </button>
          ))}
        </div>
        {chosen ? <DayDetail day={chosen} /> : null}
      </section>
        <section className="soc-card soc-standing" data-testid="soc-standing" aria-label="Your standing">
          <p className="soc-kicker">Your standing</p>
          {standing ? (
            <>
              <p className="soc-word" title={String(standing.score)}>{standing.word}</p>
              <p>{standing.line}{standing.eventId >= 0 ? <> <Why id={standing.eventId} /></> : null}</p>
              {standing.whys.filter((w) => w.text && w.text !== standing.line).slice(-3).map((w, i) => (
                <p className="soc-door" key={`${w.eventId}-${i}`} title={w.delta ? `${w.delta > 0 ? "+" : ""}${w.delta}` : undefined}>
                  {w.text}{w.eventId >= 0 ? <> <Why id={w.eventId} /></> : null}
                </p>
              ))}
              <p>{opensLine(standing.score)}</p>
              <DoorLine title="Will come" rows={doors.come} />
              <DoorLine title="Will not" rows={doors.stay} />
            </>
          ) : <p className="soc-kicker">The city has not written your name yet.</p>}
        </section>
        <section className="soc-card soc-rank" data-testid="soc-rank" aria-label="Your place">
          <p className="soc-kicker">Your place</p>
          {rank && rank.rank > 0 ? (
            <>
              <p className="soc-word" title={`${rank.rank} of ${rank.households} households`}>{rankWord(rank.rank, rank.households)}</p>
              <p className="num" title={moneyFromCents(rank.worth)}>{moneyFromCents(rank.worth)}</p>
              <p title={moneyFromCents(rank.gap)}>
                {rank.nextPerson >= 0 && rank.next ? (
                  <>{rank.ahead ? "Ahead of " : "Behind "}<PersonLink person={rank.nextPerson} name={rank.next} /></>
                ) : "No neighbour on the list"}
              </p>
              {rank.eventId >= 0 ? <p><Why id={rank.eventId} /></p> : null}
            </>
          ) : <p className="soc-kicker">You are not on the household list.</p>}
        </section>
        <section className="soc-card soc-richcard" aria-label="Rich list">
          <h2>The rich list</h2>
          <p className="soc-kicker">This year, and why.</p>
          {soc.rich.length ? (
            <div className="soc-rich" data-testid="soc-rich">
              {soc.rich.map((row) => (
                <RichLine key={row.person} row={row} mine={rank?.person === row.person} firms={firms} onFirm={openFirm} />
              ))}
            </div>
          ) : <p className="soc-kicker">The month has not turned. The list is still the opening books.</p>}
        </section>
          <section className="soc-card soc-seats" aria-label="The powerful">
            <h2>The powerful</h2>
            {groups.length ? groups.map((g) => (
              <div key={g.title}>
                <h3>{g.title}</h3>
                {g.rows.map((row) => <PowerLine key={`${g.title}-${row.person}`} row={row} firms={firms} onFirm={openFirm} />)}
              </div>
            )) : <p className="soc-kicker">No seats are filled.</p>}
          </section>
          <section className="soc-card soc-stories" data-testid="soc-stories" aria-label="This month">
            <h2>This month</h2>
            {stories.length ? (
              <>
                <StoryList title="Rising" rows={rises} />
                <StoryList title="Falling" rows={falls} />
              </>
            ) : <p className="soc-kicker">The month has not turned. The list is still the opening books.</p>}
          </section>
      </div>
    </div>
  );
}

function DoorLine({ title, rows }: { title: string; rows: { who: number; name: string; line: string }[] }) {
  if (!rows.length) return null;
  const groups = new Map<string, { who: number; name: string }[]>();
  for (const row of rows) {
    const list = groups.get(row.line) ?? [];
    list.push(row);
    groups.set(row.line, list);
  }
  return (
    <div className="soc-doors">
      <h3>{title}</h3>
      {[...groups.entries()].map(([line, people]) => {
        const shown = people.slice(0, 4);
        return (
          <p className="soc-door" key={line}>
            {line}{" "}
            {shown.map((d, i) => (
              <span key={d.who}>{i ? ", " : ""}<PersonLink person={d.who} name={d.name} /></span>
            ))}
            {people.length > shown.length ? `, and ${people.length - shown.length} more` : ""}.
          </p>
        );
      })}
    </div>
  );
}

function RichLine({ row, mine, firms, onFirm }: { row: RichRow; mine: boolean; firms: FirmName[]; onFirm: (id: string) => void }) {
  const ch = changeOf(row.change);
  return (
    <div className="soc-row" data-me={mine ? "1" : "0"}>
      <span className="num soc-kicker">{row.rank}</span>
      <PersonLink person={row.person} name={row.name} />
      <span className="num" title={moneyFromCents(row.worth)}>{moneyFromCents(row.worth)}</span>
      <p className="soc-why">
        <span className={ch.cls}>{ch.word}</span>{" "}
        <span className={`num ${ch.cls}`}>{ch.money}</span>
        {row.why ? <> · <FirmBits text={row.why} firms={firms} onFirm={onFirm} /></> : null}
        {row.eventId >= 0 ? <> <Why id={row.eventId} /></> : null}
      </p>
    </div>
  );
}

function PowerLine({ row, firms, onFirm }: { row: PowerRow; firms: FirmName[]; onFirm: (id: string) => void }) {
  const firmName = roleFirm(row.role);
  const firm = firmName ? firms.find((f) => f.name === firmName) : undefined;
  const head = row.role.slice(0, row.role.length - (firmName?.length ?? 0));
  return (
    <div className="soc-power">
      <p>
        <PersonLink person={row.person} name={row.name} />
        {" · "}
        {firm ? <>{head}<button type="button" className="name-link" onClick={() => onFirm(firm.id)}>{firm.name}</button></> : row.role}
      </p>
      <span title={String(row.standing)}>{row.word}</span>
      {row.eventId >= 0 ? <p className="soc-why"><Why id={row.eventId} /></p> : null}
    </div>
  );
}

function StoryList({ title, rows }: { title: string; rows: Story[] }) {
  if (!rows.length) return null;
  return (
    <div>
      <h3>{title}</h3>
      {rows.map((s) => {
        const rest = s.text.startsWith(s.name) ? s.text.slice(s.name.length) : ` ${s.text}`;
        return (
          <p className="soc-story" key={s.eventId}>
            <PersonLink person={s.person} name={s.name} />
            {rest}
            {s.eventId >= 0 ? <> <Why id={s.eventId} /></> : null}
          </p>
        );
      })}
    </div>
  );
}

function DayDetail({ day }: { day: CalDay }) {
  if (!day.items.length && !day.closed) return null;
  return (
    <div className="soc-pick">
      {day.closed ? <p>The exchange is closed.</p> : null}
      {day.items.map((item, i) => (
        <p key={`${item.kind}-${i}`}>{item.title}{item.eventId >= 0 ? <> <Why id={item.eventId} /></> : null}</p>
      ))}
    </div>
  );
}
