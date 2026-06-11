import { describe, expect, it } from 'vitest';

import { parseHistoryEntries, selectHistoryEntry, type HistoryEntry } from '../../scripts/lib/parser.js';

/**
 * Regression tests for the corpus version-pin defect class (issue #49).
 *
 * The trap: a statute history can contain FUTURE-dated consolidation states
 * (e.g. the Criminal Code lists 20260701, in force from 2026-07-01). Version
 * selection must pick the latest version in force ON the as-of date, never
 * max(date). These entries mirror the real Slov-Lex history page for
 * 300/2005 Z. z. as fetched on 2026-06-11.
 */

function entry(href: string, from: string, to: string, promulgated = false): HistoryEntry {
  return { href, inForceFrom: from, inForceTo: to, isPromulgatedVersion: promulgated };
}

const CRIMINAL_CODE_TAIL: HistoryEntry[] = [
  entry('vyhlasene_znenie.html', '', '', true),
  entry('20060101.html', '2006-01-01', '2006-12-31'),
  entry('20251227.html', '2025-12-27', '2026-03-31'),
  entry('20260401.html', '2026-04-01', '2026-06-11'),
  entry('20260612.html', '2026-06-12', '2026-06-30'),
  entry('20260701.html', '2026-07-01', ''),
];

describe('selectHistoryEntry — future-dated version trap', () => {
  it('picks the latest in-force version <= asOfDate, not max(date)', () => {
    const { selected, status } = selectHistoryEntry(CRIMINAL_CODE_TAIL, '2026-06-11');

    expect(selected.href).toBe('20260401.html');
    expect(status).toBe('in_force');
  });

  it('never selects a future-dated entry even when it is the open-ended latest', () => {
    // 20260701 has an empty inForceTo (open-ended) — the max(date) bug would pick it.
    const { selected } = selectHistoryEntry(CRIMINAL_CODE_TAIL, '2026-06-11');
    expect(selected.href).not.toBe('20260701.html');
    expect(selected.href).not.toBe('20260612.html');
  });

  it('includes a version whose inForceTo equals the asOfDate (boundary day)', () => {
    // 20260401 is in force through exactly 2026-06-11.
    const { selected } = selectHistoryEntry(CRIMINAL_CODE_TAIL, '2026-06-11');
    expect(selected.inForceTo).toBe('2026-06-11');
  });

  it('rolls over to the next version the day after a boundary', () => {
    const { selected, status } = selectHistoryEntry(CRIMINAL_CODE_TAIL, '2026-06-12');
    expect(selected.href).toBe('20260612.html');
    expect(status).toBe('in_force');
  });

  it('reports first in-force date separately from the selected version', () => {
    const { selected, firstInForceDate } = selectHistoryEntry(CRIMINAL_CODE_TAIL, '2026-06-11');
    // firstInForceDate is statute-level metadata (2006-01-01); it must not be
    // confused with the identity of the selected consolidation (2026-04-01).
    expect(firstInForceDate).toBe('2006-01-01');
    expect(selected.inForceFrom).toBe('2026-04-01');
  });

  it('marks a statute whose versions are all future as not_yet_in_force and picks the earliest', () => {
    const future = [
      entry('vyhlasene_znenie.html', '', '', true),
      entry('20270101.html', '2027-01-01', '2027-06-30'),
      entry('20270701.html', '2027-07-01', ''),
    ];
    const { selected, status } = selectHistoryEntry(future, '2026-06-11');
    expect(status).toBe('not_yet_in_force');
    expect(selected.href).toBe('20270101.html');
  });

  it('marks a statute whose versions all ended as repealed and keeps the last text', () => {
    const ended = [
      entry('20000101.html', '2000-01-01', '2010-12-31'),
      entry('20110101.html', '2011-01-01', '2020-12-31'),
    ];
    const { selected, status } = selectHistoryEntry(ended, '2026-06-11');
    expect(status).toBe('repealed');
    expect(selected.href).toBe('20110101.html');
  });

  it('ignores the promulgated (vyhlásené) entry', () => {
    const { selected } = selectHistoryEntry(CRIMINAL_CODE_TAIL, '2026-06-11');
    expect(selected.isPromulgatedVersion).toBe(false);
  });

  it('fails loud when only promulgated entries exist', () => {
    expect(() => selectHistoryEntry([entry('vyhlasene_znenie.html', '', '', true)], '2026-06-11'))
      .toThrow(/No effective/);
  });
});

describe('parseHistoryEntries — real Slov-Lex row shape', () => {
  it('extracts ISO in-force dates from effectivenessHistoryItem rows', () => {
    const html = `
      <tr class="effectivenessHistoryItem" data-iri="/SK/ZZ/2005/300/20260401" data-vyhlasene="0" data-ucinnostod="2026-04-01" data-ucinnostdo="2026-06-11">
        <td><a href="20260401.html">Znenie</a></td>
      </tr>
      <tr class="effectivenessHistoryItem" data-iri="/SK/ZZ/2005/300/20260701" data-vyhlasene="0" data-ucinnostod="2026-07-01" data-ucinnostdo="">
        <td><a href="20260701.html">Znenie</a></td>
      </tr>`;

    const entries = parseHistoryEntries(html);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      href: '20260401.html',
      inForceFrom: '2026-04-01',
      inForceTo: '2026-06-11',
      isPromulgatedVersion: false,
    });
  });
});
