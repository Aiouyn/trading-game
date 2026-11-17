"use client";
// Spouse, children, the tree, the will, and the house.
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { presentNote } from "@/components/ui/format";
import { Named } from "@/components/ui/Named";
import {
  ChoiceButton, Closed, Result, WordNum, ageWord, fortuneWord, generationWord, schoolWord, tallyWord, useAct, useLife,
  type LifePerson,
} from "@/apps/profile/data";
import "@/apps/profile/life.css";

export default function EstateApp() {
  const { life } = useLife();
  const { note, busy, go } = useAct();
  const contacts = life?.contacts ?? [];
  const [slot, setSlot] = useState(0);
  const [nth, setNth] = useState(0);
  if (!life) return <Closed title="Estate" />;
  const family = life.family;
  const spouse = family?.spouse ?? null;
  const children = family?.children ?? [];
  const people = life.dynasty?.people ?? [];
  const d = life.dynasty;
  const heir = life.heir;
  const firms = (life.companies ?? []).filter((c) => c.family && c.role === "chief executive");
  const pick = contacts[Math.min(slot, Math.max(0, contacts.length - 1))];
  const child = children[nth];
  const wage = life.tape?.events?.wage;
  const lead = !spouse ? (pick ? "will-slot" : "marry") : !children.length ? "child" : child ? "will-child" : "will-spouse";

  return (
    <div className="qy-life" data-testid="estate">
      <header className="qy-block">
        <h2>The house</h2>
        {spouse ? <p className="qy-kicker">Married to {spouse.name}</p> : null}
      </header>
      <Result note={note} />
      <section className="qy-block">
        <h3>Family</h3>
        <div className="qy-row">
          <span className="label">Spouse</span>
          {spouse ? (
            <span className="qy-pair"><Named name={spouse.name} /><WordNum word={`${ageWord(spouse.age)}${spouse.alive ? "" : ", gone"}`} hover={`${spouse.age} years`} eventId={personEv(people, spouse.index)} /></span>
          ) : <span className="qy-muted">None</span>}
        </div>
        {children.length ? children.map((k, i) => (
          <div className="qy-row" key={k.index}>
            <span className="label">Child</span>
            <span className="qy-pair">
              <Named name={k.name} />
              <WordNum word={ageWord(k.age)} hover={`${k.age} years`} eventId={personEv(people, k.index)} />
              <WordNum word={schoolWord(k.school)} hover={`${k.school} years of school`} eventId={personEv(people, k.index)} />
              <Button variant="secondary" size="sm" disabled={busy} data-testid={`school-${i}`} onClick={() => void go({ kind: "school", nth: i })}>
                Another year
              </Button>
            </span>
          </div>
        )) : <p className="qy-muted">No children.</p>}
      </section>
      <section className="qy-block">
        <h3>The tree</h3>
        <ul className="qy-tree" data-testid="family-tree">
          {tree(people).map((p) => (
            <li key={`${p.role}-${p.index}`} style={{ marginLeft: depth(p.role) * 16 }}>
              <span className="label">{p.role}</span>
              <Named name={p.name} />
              <WordNum
                word={p.alive === false ? "Gone" : p.age !== undefined ? ageWord(p.age) : "Kin"}
                hover={p.age !== undefined ? `${p.age} years` : (p.role ?? "kin")}
                eventId={p.eventId}
              />
            </li>
          ))}
        </ul>
      </section>
      <section className="qy-block">
        <h3>The will</h3>
        <p>{family?.will ? presentNote(family.will) : "No will. The city's rule stands."}</p>
        <div className="qy-row">
          <span className="label">Heir</span>
          {heir ? <span className="qy-pair"><Named name={heir.name} /><WordNum word="Named in the will" hover="named in the will" eventId={heir.eventId} /></span> : <span className="qy-muted">Nobody named</span>}
        </div>
      </section>
      {d ? (
        <section className="qy-block" data-testid="dynasty">
          <h3>Dynasty</h3>
          <div className="qy-stats">
            <div className="qy-row"><span className="label">Generation</span><WordNum word={generationWord(d.generation)} hover={`Generation ${d.generation}`} eventId={d.eventId} /></div>
            <div className="qy-row"><span className="label">House</span><WordNum word={fortuneWord(d.worth)} hover={moneyLabel(d.worth)} eventId={d.eventId} /></div>
            <div className="qy-row"><span className="label">Founded</span><WordNum word={tallyWord(d.founded, "No firm founded", "One firm founded", "Firms founded")} hover={String(d.founded)} eventId={d.eventId} /></div>
            <div className="qy-row"><span className="label">Controlled</span><WordNum word={tallyWord(d.controlled, "No firm controlled", "One firm controlled", "Firms controlled")} hover={String(d.controlled)} eventId={d.eventId} /></div>
            <div className="qy-row"><span className="label">Offices</span><WordNum word={tallyWord(d.offices, "No office held", "One office held", "Offices held")} hover={String(d.offices)} eventId={d.eventId} /></div>
            <div className="qy-row"><span className="label">Convictions</span><WordNum word={tallyWord(d.convictions, "No conviction", "One conviction", "Convictions")} hover={String(d.convictions)} eventId={d.eventId} /></div>
          </div>
        </section>
      ) : null}
      <section className="qy-block">
        <h3>Acts</h3>
        <label className="qy-field">
          <span className="label">Contact</span>
          <select value={pick?.slot ?? 0} data-testid="estate-contact" onChange={(e) => setSlot(contacts.findIndex((c) => c.slot === Number(e.target.value)))}>
            {contacts.length ? contacts.map((c) => <option key={c.slot} value={c.slot}>{c.name}</option>) : <option value={0}>No contacts</option>}
          </select>
        </label>
        <div className="qy-actions">
          <ChoiceButton primary={lead === "marry"} disabled={busy || !pick} testId="marry" onClick={() => pick && void go({ kind: "marry", slot: pick.slot })}>
            Marry
          </ChoiceButton>
          <ChoiceButton primary={lead === "child"} disabled={busy} testId="child" onClick={() => void go({ kind: "child" })}>
            Have a child
          </ChoiceButton>
          {children.length ? (
            <label className="qy-field">
              <span className="label">Child for the will</span>
              <select value={nth} onChange={(e) => setNth(Number(e.target.value))}>
                {children.map((k, i) => <option key={k.index} value={i}>{k.name}</option>)}
              </select>
            </label>
          ) : null}
          <ChoiceButton primary={lead === "will-spouse"} disabled={busy || !spouse} testId="will-spouse" onClick={() => void go({ kind: "will", how: "spouse", nth: 0 })}>
            Will to your spouse
          </ChoiceButton>
          <ChoiceButton primary={lead === "will-child"} disabled={busy || !child} testId="will-child" onClick={() => void go({ kind: "will", how: "child", nth })}>
            Will to a child
          </ChoiceButton>
          <ChoiceButton primary={lead === "will-slot"} disabled={busy || !pick} testId="will-slot" onClick={() => pick && void go({ kind: "will", how: "slot", nth: pick.slot })}>
            Will to this contact
          </ChoiceButton>
          {firms.map((f) => (
            <ChoiceButton key={f.id} primary={false} disabled={busy} testId={`hand-${f.id}`} onClick={() => void go({ kind: "hand", firm: f.id })}>
              Hand {f.name} on
            </ChoiceButton>
          ))}
          <p className="qy-muted">Handing the life over ends this one. The heir continues the house.</p>
          <ChoiceButton primary={false} disabled={busy} testId="hand-life" onClick={() => void go({ kind: "die" })}>
            {heir ? `Hand the life to ${heir.name}` : "Hand the life to your heir"}
          </ChoiceButton>
        </div>
        {wage !== undefined ? <span className="qy-muted">A year of school is priced from the wage. <WordNum word="Wage" hover="the city's wage" eventId={wage} /></span> : null}
      </section>
    </div>
  );
}

function personEv(people: LifePerson[], index: number): number | undefined {
  return people.find((p) => p.index === index)?.eventId;
}

function depth(role: string | undefined): number {
  if (role === "you" || role === "spouse") return 1;
  if (role === "child") return 2;
  return 0;
}

function tree(people: LifePerson[]): LifePerson[] {
  const rank = (role?: string) => role === "parent" ? 0 : role === "you" ? 1 : role === "spouse" ? 2 : role === "child" ? 3 : 4;
  return [...people].sort((a, b) => rank(a.role) - rank(b.role) || a.index - b.index);
}

function moneyLabel(cents: number): string {
  const sign = cents < 0 ? "−" : "";
  const n = Math.abs(Math.round(cents)) / 100;
  return sign + "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
