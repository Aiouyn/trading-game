"use client";
// SET-08 About (17 §7.2, §3.3.2): version, disclaimers, licences, credits, integrity report. No primary action.
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Glyph } from "@/components/shell/Glyph";
import { CREDITS, LICENCES, buildSha, release } from "./about-data";
import { settingsStrings } from "./strings";
import "./about.css";

function ExternalLink({ href, children, newTab }: { href: string; children: React.ReactNode; newTab: string }) {
  return (
    <a className="about-ext" href={href} target="_blank" rel="noopener noreferrer">
      {children}<span className="about-ext-glyph" data-testid="ext-glyph"><Glyph name="external" size={12} /></span><span className="sr-only"> {newTab}</span>
    </a>
  );
}

export function About({ locale = "en" }: { locale?: string }) {
  const t = settingsStrings(locale);
  const version = t.versionLine(release(), buildSha());
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(version); setCopied(true); window.setTimeout(() => setCopied(false), 1500); } catch { /* clipboard denied: nothing to do */ }
  };
  return (
    <div className="about" data-testid="settings-about">
      <section className="about-sec">
        <Label>{t.version}</Label>
        <div className="about-row about-version">
          <span className="num" data-testid="about-version">{version}</span>
          <Button size="sm" variant="secondary" aria-label={t.copyVersion} data-testid="about-copy" onClick={copy}>{copied ? t.copied : t.copyVersion}</Button>
        </div>
      </section>
      <section className="about-sec">
        <Label>{t.disclaimers}</Label>
        <p className="about-muted">{t.disclaimerGame}</p>
        <p className="about-muted">{t.disclaimerAdvice}</p>
      </section>
      <section className="about-sec">
        <Label>{t.licences}</Label>
        <table className="about-licences" data-testid="about-licences">
          <thead><tr><th scope="col">{t.colComponent}</th><th scope="col">{t.colLicence}</th><th scope="col">{t.colLink}</th></tr></thead>
          <tbody>
            {LICENCES.map((r) => (
              <tr key={r.component} data-testid="about-licence-row">
                <td data-label={t.colComponent}>{r.component}</td>
                <td data-label={t.colLicence}>{r.licence}</td>
                <td data-label={t.colLink}>
                  <ExternalLink href={r.href} newTab={t.newTab}>{r.attribution === "chartsBy" ? t.chartsBy : r.licence}</ExternalLink>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="about-sec">
        <Label>{t.credits}</Label>
        <ul className="about-list">{CREDITS.map((c) => <li key={c.name} className="about-row">{`${c.name} · ${t.roles[c.roleKey]}`}</li>)}</ul>
      </section>
      <section className="about-sec">
        <div className="about-row"><Link href="/markets/MKT-08" data-testid="about-integrity">{t.integrity}</Link></div>
      </section>
    </div>
  );
}
