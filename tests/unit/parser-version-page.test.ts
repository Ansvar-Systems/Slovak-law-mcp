import { describe, expect, it } from 'vitest';

import {
  parseActFromVersionPage,
  parseHistoryEntries,
  type TargetLaw,
} from '../../scripts/lib/parser.js';

/**
 * Regression tests for the body-identity and date-shape gaps found in the
 * adversarial review of PR #50:
 *
 * - parseActFromVersionPage silently fell back to the EXPECTED citation when
 *   the <h1> was absent and never compared the extracted citation to the
 *   requested law — a redirected/wrong-law page could be written under the
 *   target's id (the dutch#119 defect class).
 * - parseHistoryEntries accepted any string in data-ucinnostod/do; version
 *   selection compares those lexicographically, so an upstream date-format
 *   drift (e.g. dd.mm.yyyy) would silently scramble version selection.
 * - The flatText fallback fabricates a single provision (ref "text") when no
 *   paragraf divs parse; that marker is load-bearing for the overwrite guard.
 */

const DATA_PROTECTION_ACT: TargetLaw = {
  id: 'act-18-2018',
  year: 2018,
  number: 18,
  seedFile: 'act-18-2018-data-protection.json',
  titleEn: 'Act No. 18/2018 Coll. on Personal Data Protection',
  shortName: 'Data Protection Act',
  description: 'Personal data protection law implementing the GDPR framework in the Slovak Republic.',
};

const COMMERCIAL_CODE: TargetLaw = {
  id: 'act-513-1991',
  year: 1991,
  number: 513,
  seedFile: 'act-513-1991-commercial-code.json',
  titleEn: 'Act No. 513/1991 Coll. Commercial Code',
  shortName: 'Commercial Code',
  description: 'Commercial law code governing business entities and commercial obligations.',
};

function paragrafBlock(num: number, heading: string, text: string): string {
  return `
    <div class="paragraf Skupina " id="paragraf-${num}">
      <div class="paragrafOznacenie">§ ${num}</div>
      <div class="paragrafNadpis NADPIS">${heading}</div>
      <div class="odsek"><div class="text">${text}</div></div>
    </div>`;
}

function versionPage(options: {
  h1?: string;
  body?: string;
}): string {
  const h1 = options.h1 === undefined ? '' : `<h1>${options.h1}</h1>`;
  const body = options.body ?? paragrafBlock(1, 'Predmet úpravy', 'Tento zákon upravuje ochranu osobných údajov fyzických osôb.');
  return `<!DOCTYPE html><html><body>
    ${h1}
    <div class="predpisTyp">Zákon</div>
    <div class="predpisDatum">z 29. novembra 2017</div>
    <div class="predpisNadpis NADPIS">o ochrane osobných údajov</div>
    <div class="predpis Skupina " id="predpis">
      ${body}
    </div>
  </body></html>`;
}

describe('parseActFromVersionPage — body-identity assertion before write', () => {
  it('parses a page whose <h1> citation matches the requested law', () => {
    const act = parseActFromVersionPage(versionPage({ h1: '18/2018 Z. z.' }), DATA_PROTECTION_ACT, 'in_force', '2018-05-25');

    expect(act.id).toBe('act-18-2018');
    expect(act.provisions).toHaveLength(1);
    expect(act.provisions[0].provision_ref).toBe('§1');
  });

  it('accepts pre-1993 "Zb." citations (Commercial Code is 513/1991 Zb., not Z. z.)', () => {
    const html = versionPage({
      h1: '513/1991 Zb.',
      body: paragrafBlock(17, 'Obchodné tajomstvo', 'Predmetom práv patriacich k podniku je aj obchodné tajomstvo.'),
    });

    const act = parseActFromVersionPage(html, COMMERCIAL_CODE, 'in_force', '1992-01-01');
    expect(act.provisions).toHaveLength(1);
  });

  it('refuses a page whose <h1> citation belongs to a DIFFERENT law', () => {
    // The dutch#119 class: a redirect serves the wrong document; the parse
    // succeeds with >0 provisions and would land under the target's id.
    expect(() =>
      parseActFromVersionPage(versionPage({ h1: '300/2005 Z. z.' }), DATA_PROTECTION_ACT, 'in_force', '2018-05-25'),
    ).toThrow(/18\/2018/);
  });

  it('refuses a page without an <h1> citation instead of fabricating identity', () => {
    expect(() =>
      parseActFromVersionPage(versionPage({}), DATA_PROTECTION_ACT, 'in_force', '2018-05-25'),
    ).toThrow(/h1|citation/i);
  });
});

describe('parseActFromVersionPage — flat-text fallback stays enumerable', () => {
  it('marks a structureless parse with the single "text" provision_ref', () => {
    const html = versionPage({
      h1: '18/2018 Z. z.',
      body: '<div class="text" id="predpis.text">Celý text predpisu bez paragrafového členenia.</div>',
    });

    const act = parseActFromVersionPage(html, DATA_PROTECTION_ACT, 'in_force', '2018-05-25');
    expect(act.provisions).toHaveLength(1);
    expect(act.provisions[0].provision_ref).toBe('text');
  });
});

describe('parseHistoryEntries — date-shape validation at parse time', () => {
  function row(from: string, to: string, href = '20260401.html'): string {
    return `<tr class="effectivenessHistoryItem" data-iri="/SK/ZZ/2005/300/x" data-vyhlasene="0" data-ucinnostod="${from}" data-ucinnostdo="${to}">
      <td><a href="${href}">Znenie</a></td>
    </tr>`;
  }

  it('accepts ISO dates and the empty open-ended window', () => {
    const entries = parseHistoryEntries(row('2026-04-01', '') + row('2026-06-12', '2026-06-30', '20260612.html'));
    expect(entries).toHaveLength(2);
  });

  it('fails loud when data-ucinnostod drifts away from ISO', () => {
    // Version selection compares these strings lexicographically; a silent
    // format drift (dd.mm.yyyy) would scramble started/notEnded comparisons.
    expect(() => parseHistoryEntries(row('01.04.2026', ''))).toThrow(/ISO|date/i);
  });

  it('fails loud when data-ucinnostdo drifts away from ISO', () => {
    expect(() => parseHistoryEntries(row('2026-04-01', '11.06.2026'))).toThrow(/ISO|date/i);
  });
});
