/**
 * Parser for Slov-Lex static statute pages.
 *
 * Source pattern:
 *   - History: https://static.slov-lex.sk/static/SK/ZZ/{year}/{number}/
 *   - Version: https://static.slov-lex.sk/static/SK/ZZ/{year}/{number}/{yyyymmdd}.html
 */

export type DocumentStatus = 'in_force' | 'amended' | 'repealed' | 'not_yet_in_force';

export interface TargetLaw {
  id: string;
  year: number;
  number: number;
  seedFile: string;
  titleEn: string;
  shortName: string;
  description: string;
}

export interface HistoryEntry {
  href: string;
  inForceFrom: string;
  inForceTo: string;
  isPromulgatedVersion: boolean;
}

export interface ParsedProvision {
  provision_ref: string;
  chapter?: string;
  section: string;
  title: string;
  content: string;
}

export interface ParsedDefinition {
  term: string;
  definition: string;
  source_provision: string;
}

export interface ParsedAct {
  id: string;
  type: 'statute';
  title: string;
  title_en: string;
  short_name: string;
  status: DocumentStatus;
  issued_date?: string;
  in_force_date?: string;
  url: string;
  description: string;
  provisions: ParsedProvision[];
  definitions: ParsedDefinition[];
}

export const TARGET_SLOVAK_LAWS: TargetLaw[] = [
  {
    id: 'act-18-2018',
    year: 2018,
    number: 18,
    seedFile: 'act-18-2018-data-protection.json',
    titleEn: 'Act No. 18/2018 Coll. on Personal Data Protection',
    shortName: 'Data Protection Act',
    description: 'Personal data protection law implementing the GDPR framework in the Slovak Republic.',
  },
  {
    id: 'act-69-2018',
    year: 2018,
    number: 69,
    seedFile: 'act-69-2018-cybersecurity.json',
    titleEn: 'Act No. 69/2018 Coll. on Cybersecurity',
    shortName: 'Cybersecurity Act',
    description: 'Framework law for cybersecurity governance and obligations of entities operating key services and systems.',
  },
  {
    id: 'act-452-2021',
    year: 2021,
    number: 452,
    seedFile: 'act-452-2021-electronic-communications.json',
    titleEn: 'Act No. 452/2021 Coll. on Electronic Communications',
    shortName: 'Electronic Communications Act',
    description: 'Regulates electronic communications networks and services, including rights and obligations of operators.',
  },
  {
    id: 'act-22-2004',
    year: 2004,
    number: 22,
    seedFile: 'act-22-2004-information-society.json',
    titleEn: 'Act No. 22/2004 Coll. on Electronic Commerce',
    shortName: 'E-Commerce Act',
    description: 'Legal framework for selected information society services and electronic commerce obligations.',
  },
  {
    id: 'act-211-2000',
    year: 2000,
    number: 211,
    seedFile: 'act-211-2000-freedom-of-information.json',
    titleEn: 'Act No. 211/2000 Coll. on Free Access to Information',
    shortName: 'Freedom of Information Act',
    description: 'Guarantees access to information held by public authorities and sets conditions for disclosure.',
  },
  {
    id: 'act-272-2016',
    year: 2016,
    number: 272,
    seedFile: 'act-272-2016-trust-services.json',
    titleEn: 'Act No. 272/2016 Coll. on Trust Services for Electronic Transactions',
    shortName: 'Trust Services Act',
    description: 'Regulates trust services and related supervisory mechanisms for electronic transactions.',
  },
  {
    id: 'act-300-2005',
    year: 2005,
    number: 300,
    seedFile: 'act-300-2005-criminal-code.json',
    titleEn: 'Act No. 300/2005 Coll. Criminal Code',
    shortName: 'Criminal Code',
    description: 'Core criminal statute including offences relevant to cybercrime and information systems.',
  },
  {
    id: 'act-95-2019',
    year: 2019,
    number: 95,
    seedFile: 'act-95-2019-information-technologies.json',
    titleEn: 'Act No. 95/2019 Coll. on Information Technologies in Public Administration',
    shortName: 'IT Public Administration Act',
    description: 'Sets governance and requirements for information technologies used in public administration.',
  },
  {
    id: 'act-45-2011',
    year: 2011,
    number: 45,
    seedFile: 'act-45-2011-critical-infrastructure.json',
    titleEn: 'Act No. 45/2011 Coll. on Critical Infrastructure',
    shortName: 'Critical Infrastructure Act',
    description: 'Regulates designation and protection of critical infrastructure elements and related duties.',
  },
  {
    id: 'act-513-1991',
    year: 1991,
    number: 513,
    seedFile: 'act-513-1991-commercial-code.json',
    titleEn: 'Act No. 513/1991 Coll. Commercial Code',
    shortName: 'Commercial Code',
    description: 'Commercial law code governing business entities, commercial obligations, and trade-related rules.',
  },
];

const SLOVAK_MONTHS: Record<string, string> = {
  januara: '01',
  'januára': '01',
  februara: '02',
  'februára': '02',
  marca: '03',
  aprila: '04',
  'apríla': '04',
  maja: '05',
  'mája': '05',
  juna: '06',
  'júna': '06',
  jula: '07',
  'júla': '07',
  augusta: '08',
  septembra: '09',
  oktobra: '10',
  'októbra': '10',
  novembra: '11',
  decembra: '12',
};

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&ndash;/g, '-')
    .replace(/&mdash;/g, '-')
    .replace(/&hellip;/g, '...')
    .replace(/&#(\d+);/g, (_all, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_all, hex) => String.fromCodePoint(parseInt(hex, 16)));
}

function stripTags(input: string): string {
  return decodeHtmlEntities(input)
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\u00a0/g, ' ');
}

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

function normalizeLine(input: string): string {
  return normalizeWhitespace(input.replace(/[ \t]+\n/g, '\n'));
}

function cleanTextFragment(input: string): string {
  return normalizeLine(
    stripTags(
      input
        .replace(/<a[^>]*class="citacnyOdkazJednoduchy"[^>]*>[\s\S]*?<\/a>/gi, '')
        .replace(/<sup[^>]*>[\s\S]*?<\/sup>/gi, '')
        .replace(/<a[^>]*>/gi, '')
        .replace(/<\/a>/gi, '')
    )
  );
}

function parseSlovakDate(raw: string): string | undefined {
  const clean = normalizeWhitespace(stripTags(raw)).toLowerCase();
  const match = clean.match(/(\d{1,2})\.\s*([a-záäčďéíĺľňóôŕšťúýž]+)\s+(\d{4})/i);
  if (!match) return undefined;

  const day = match[1].padStart(2, '0');
  const month = SLOVAK_MONTHS[match[2].toLowerCase()];
  const year = match[3];
  if (!month) return undefined;

  return `${year}-${month}-${day}`;
}

function extractByRegex(html: string, regex: RegExp): string | undefined {
  const match = html.match(regex);
  if (!match?.[1]) return undefined;
  const value = cleanTextFragment(match[1]);
  return value.length > 0 ? value : undefined;
}

function extractPredpisBlock(html: string): string {
  const start = html.indexOf('<div class="predpis Skupina " id="predpis">');
  if (start < 0) {
    throw new Error('Unable to locate predpis root block in statute HTML');
  }

  let end = html.length;
  for (const marker of ['<div id="Poznamky"', '<div id="Prilohy"', '<div class="poznamky"']) {
    const idx = html.indexOf(marker, start);
    if (idx !== -1 && idx < end) {
      end = idx;
    }
  }

  return html.slice(start, end);
}

function findLastHierarchyUnit(
  snippet: string,
  unit: 'cast' | 'hlava' | 'diel' | 'oddiel' | 'skupinaParagrafov',
): string | undefined {
  const re = new RegExp(
    `<div class="${unit}Oznacenie"[^>]*>([\\s\\S]*?)<\\/div>(?:\\s*<div class="${unit}Nadpis NADPIS"[^>]*>([\\s\\S]*?)<\\/div>)?`,
    'gi'
  );

  let match: RegExpExecArray | null;
  let last: string | undefined;
  while ((match = re.exec(snippet)) !== null) {
    const ozn = cleanTextFragment(match[1] ?? '');
    const nadpis = cleanTextFragment(match[2] ?? '');
    const merged = normalizeWhitespace(`${ozn} ${nadpis}`);
    if (merged) {
      last = merged;
    }
  }

  return last;
}

function findChapterLabel(predpisHtml: string, paragraphPos: number): string | undefined {
  const lookbackStart = Math.max(0, paragraphPos - 15000);
  const snippet = predpisHtml.slice(lookbackStart, paragraphPos);

  const parts = [
    findLastHierarchyUnit(snippet, 'cast'),
    findLastHierarchyUnit(snippet, 'hlava'),
    findLastHierarchyUnit(snippet, 'diel'),
    findLastHierarchyUnit(snippet, 'oddiel'),
    findLastHierarchyUnit(snippet, 'skupinaParagrafov'),
  ].filter((part): part is string => Boolean(part));

  if (parts.length === 0) return undefined;
  return parts.join(' / ');
}

function buildProvisionContent(paragraphHtml: string): string {
  const withoutHeader = paragraphHtml
    .replace(/<div class="paragrafOznacenie"[^>]*>[\s\S]*?<\/div>/i, '')
    .replace(/<div class="paragrafNadpis[^>]*>[\s\S]*?<\/div>/i, '');

  const tokenRegex = /<div class="(odsekOznacenie|pismenoOznacenie|bodOznacenie|text)"[^>]*>([\s\S]*?)<\/div>/gi;
  const lines: string[] = [];
  let markerBuffer: string[] = [];

  let token: RegExpExecArray | null;
  while ((token = tokenRegex.exec(withoutHeader)) !== null) {
    const kind = token[1];
    const raw = token[2];
    const value = cleanTextFragment(raw);
    if (!value) continue;

    if (kind === 'text') {
      const prefix = markerBuffer.length > 0 ? `${markerBuffer.join(' ')} ` : '';
      lines.push(normalizeLine(`${prefix}${value}`));
      markerBuffer = [];
    } else {
      markerBuffer.push(value);
    }
  }

  if (lines.length === 0) {
    return normalizeLine(cleanTextFragment(withoutHeader));
  }

  const deduped: string[] = [];
  for (const line of lines) {
    if (deduped.length === 0 || deduped[deduped.length - 1] !== line) {
      deduped.push(line);
    }
  }

  return deduped.join('\n');
}

function extractDefinitions(provisions: ParsedProvision[]): ParsedDefinition[] {
  const out: ParsedDefinition[] = [];
  const seen = new Set<string>();

  for (const provision of provisions) {
    const lowerTitle = provision.title.toLowerCase();
    const lowerContent = provision.content.toLowerCase();
    const isDefinitionLike =
      lowerTitle.includes('vymedzenie') ||
      lowerTitle.includes('pojmov') ||
      lowerContent.includes('na účely tohto zákona sa rozumie') ||
      lowerContent.includes('na účely tohto zákona sa rozumejú');

    if (!isDefinitionLike) continue;

    for (const line of provision.content.split('\n')) {
      const match = line.match(/^[a-z]\)\s+(.+)/i);
      if (!match) continue;

      const definitionText = normalizeWhitespace(match[1]);
      if (definitionText.length < 12) continue;

      const term = normalizeWhitespace(
        definitionText.split(/,|;|\sje\s|\ssú\s|\ssa\srozumie|\ssa\spovažuje|\sktor[ýaéeíôú]/i)[0] ?? ''
      );

      if (term.length < 2 || term.length > 140) continue;

      const key = `${provision.provision_ref}|${term.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      out.push({
        term,
        definition: definitionText,
        source_provision: provision.provision_ref,
      });
    }
  }

  return out;
}

export function getHistoryUrl(law: TargetLaw): string {
  return `https://static.slov-lex.sk/static/SK/ZZ/${law.year}/${law.number}/`;
}

export function getCanonicalPortalUrl(law: TargetLaw): string {
  return `https://www.slov-lex.sk/ezbierky/pravne-predpisy/SK/ZZ/${law.year}/${law.number}/`;
}

export function parseHistoryEntries(historyHtml: string): HistoryEntry[] {
  const rows = [
    ...historyHtml.matchAll(
      /<tr class="effectivenessHistoryItem"[^>]*data-vyhlasene="([01])"[^>]*data-ucinnostod="([^"]*)"[^>]*data-ucinnostdo="([^"]*)"[^>]*>[\s\S]*?<a href="([^"]+)"/g
    ),
  ];

  return rows.map(row => ({
    isPromulgatedVersion: row[1] === '1',
    inForceFrom: row[2].trim(),
    inForceTo: row[3].trim(),
    href: row[4].trim(),
  }));
}

function compareDate(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function selectHistoryEntry(
  entries: HistoryEntry[],
  asOfDate: string,
): { selected: HistoryEntry; status: DocumentStatus; firstInForceDate?: string } {
  const effective = entries
    .filter(entry => !entry.isPromulgatedVersion && entry.inForceFrom.length > 0)
    .sort((a, b) => compareDate(a.inForceFrom, b.inForceFrom));

  if (effective.length === 0) {
    throw new Error('No effective (non-promulgated) versions found on history page');
  }

  const firstInForceDate = effective[0].inForceFrom;
  const active = effective.filter(entry => {
    const started = compareDate(entry.inForceFrom, asOfDate) <= 0;
    const notEnded = entry.inForceTo.length === 0 || compareDate(entry.inForceTo, asOfDate) >= 0;
    return started && notEnded;
  });

  if (active.length > 0) {
    return { selected: active[active.length - 1], status: 'in_force', firstInForceDate };
  }

  const future = effective.filter(entry => compareDate(entry.inForceFrom, asOfDate) > 0);
  if (future.length > 0) {
    return { selected: future[0], status: 'not_yet_in_force', firstInForceDate: future[0].inForceFrom };
  }

  return { selected: effective[effective.length - 1], status: 'repealed', firstInForceDate };
}

export function parseActFromVersionPage(
  versionHtml: string,
  law: TargetLaw,
  status: DocumentStatus,
  inForceDate?: string,
): ParsedAct {
  const citation = extractByRegex(versionHtml, /<h1>([\s\S]*?)<\/h1>/i) ?? `${law.number}/${law.year} Z. z.`;
  const predpisDatumRaw = extractByRegex(versionHtml, /<div class="predpisDatum"[^>]*>([\s\S]*?)<\/div>/i);
  const titleBody = extractByRegex(versionHtml, /<div class="predpisNadpis NADPIS"[^>]*>([\s\S]*?)<\/div>/i);
  const issuedDate = predpisDatumRaw ? parseSlovakDate(predpisDatumRaw) : undefined;

  const baseTitle = titleBody ? normalizeWhitespace(titleBody) : '';
  const title = baseTitle
    ? normalizeWhitespace(`Zákon č. ${citation} ${baseTitle}`)
    : normalizeWhitespace(`Zákon č. ${citation}`);

  const predpisHtml = extractPredpisBlock(versionHtml);

  const starts = [
    ...predpisHtml.matchAll(/<div class="paragraf Skupina [^"]*" id="(paragraf-[^"]+)">/g),
  ].map(match => ({
    id: match[1],
    index: match.index ?? 0,
  }));

  const provisions: ParsedProvision[] = [];
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i].index;
    const end = i + 1 < starts.length ? starts[i + 1].index : predpisHtml.length;
    const block = predpisHtml.slice(start, end);

    const provisionRefRaw = extractByRegex(block, /<div class="paragrafOznacenie"[^>]*>([\s\S]*?)<\/div>/i)
      ?? `§ ${starts[i].id.replace('paragraf-', '')}`;
    const provisionRef = normalizeWhitespace(provisionRefRaw).replace(/^§\s+/u, '§');
    const section = normalizeWhitespace(provisionRef.replace(/^§\s*/i, ''));
    const heading = extractByRegex(block, /<div class="paragrafNadpis[^>]*>([\s\S]*?)<\/div>/i);
    const titleValue = heading ? normalizeWhitespace(heading) : provisionRef;

    const content = buildProvisionContent(block);
    if (!content || content.length < 5) continue;

    const chapter = findChapterLabel(predpisHtml, start);

    provisions.push({
      provision_ref: provisionRef,
      chapter,
      section,
      title: titleValue,
      content,
    });
  }

  const definitions = extractDefinitions(provisions);

  return {
    id: law.id,
    type: 'statute',
    title,
    title_en: law.titleEn,
    short_name: law.shortName,
    status,
    issued_date: issuedDate,
    in_force_date: inForceDate,
    url: getCanonicalPortalUrl(law),
    description: law.description,
    provisions,
    definitions,
  };
}
