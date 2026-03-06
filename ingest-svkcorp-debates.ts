#!/usr/bin/env tsx
/**
 * Slovak SVKCorp Parliamentary Debates Ingestion (Zenodo)
 *
 * Source: Zenodo record 18543598 — SVKCorp: Corpus of Debates
 *         in the National Council of the Slovak Republic
 * Author: Michal Mochtak (2024)
 * DOI: 10.5281/zenodo.18543598
 * License: CC BY 4.0
 * Format: TSV (tab-separated, UTF-8)
 * Volume: 437,628 speeches across 8 parliamentary terms (1994-2023)
 *
 * Columns (27): term_id, term, meeting, date, time, type, mp_id,
 *   moderator, fullname, firstname, lastname, title, party, party_short,
 *   dob, gender, nationality, residence, district, email, personal_web,
 *   mp_web, difterm, transcript_link, speech, lem, agenda
 *
 * Usage:
 *   npx tsx ingest-svkcorp-debates.ts
 *   npx tsx ingest-svkcorp-debates.ts --db /path/to/database.db
 *   npx tsx ingest-svkcorp-debates.ts --terms 5,6,7,8
 *   npx tsx ingest-svkcorp-debates.ts --limit 1000
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as readline from 'readline';

const DB_PATH = path.resolve(process.cwd(), 'data', 'database.db');
const CUSTOM_DB = process.argv.indexOf('--db') >= 0 ? path.resolve(process.argv[process.argv.indexOf('--db') + 1]) : null;
const LIMIT = process.argv.indexOf('--limit') >= 0 ? parseInt(process.argv[process.argv.indexOf('--limit') + 1]) : 0;
const TERMS_ARG = process.argv.indexOf('--terms') >= 0 ? process.argv[process.argv.indexOf('--terms') + 1] : null;
const SELECTED_TERMS = TERMS_ARG ? TERMS_ARG.split(',').map(Number) : [1, 2, 3, 4, 5, 6, 7, 8];
const TEMP_DIR = '/tmp/sk-svkcorp';
const ZENODO_RECORD = '18543598';
const SPEECH_TRUNCATE = 50000;
const BATCH_SIZE = 5000;

interface SVKCorpRow {
  term_id: string;
  term: string;
  meeting: string;
  date: string;
  time: string;
  type: string;
  mp_id: string;
  moderator: string;
  fullname: string;
  firstname: string;
  lastname: string;
  title: string;
  party: string;
  party_short: string;
  dob: string;
  gender: string;
  nationality: string;
  residence: string;
  district: string;
  email: string;
  personal_web: string;
  mp_web: string;
  difterm: string;
  transcript_link: string;
  speech: string;
  lem: string;
  agenda: string;
}

function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const request = (downloadUrl: string) => {
      https.get(downloadUrl, { timeout: 300000 }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          file.close();
          try { fs.unlinkSync(destPath); } catch {}
          const newFile = fs.createWriteStream(destPath);
          https.get(res.headers.location!, { timeout: 300000 }, (res2) => {
            if (res2.statusCode !== 200) {
              newFile.close();
              try { fs.unlinkSync(destPath); } catch {}
              return reject(new Error('HTTP ' + res2.statusCode + ' on redirect'));
            }
            const totalBytes = parseInt(res2.headers['content-length'] || '0');
            let downloaded = 0;
            res2.on('data', (chunk: Buffer) => {
              downloaded += chunk.length;
              if (totalBytes > 0 && downloaded % (10 * 1024 * 1024) < chunk.length) {
                const pct = ((downloaded / totalBytes) * 100).toFixed(1);
                process.stdout.write('\r    Downloaded ' + (downloaded / (1024 * 1024)).toFixed(1) + '/' + (totalBytes / (1024 * 1024)).toFixed(1) + ' MB (' + pct + '%)');
              }
            });
            res2.pipe(newFile);
            newFile.on('finish', () => { newFile.close(); console.log(); resolve(); });
            newFile.on('error', (err) => { try { fs.unlinkSync(destPath); } catch {} reject(err); });
          }).on('error', (err) => { newFile.close(); try { fs.unlinkSync(destPath); } catch {} reject(err); });
          return;
        }
        if (res.statusCode !== 200) {
          file.close();
          try { fs.unlinkSync(destPath); } catch {}
          return reject(new Error('HTTP ' + res.statusCode + ' for ' + downloadUrl));
        }
        const totalBytes = parseInt(res.headers['content-length'] || '0');
        let downloaded = 0;
        res.on('data', (chunk: Buffer) => {
          downloaded += chunk.length;
          if (totalBytes > 0 && downloaded % (10 * 1024 * 1024) < chunk.length) {
            const pct = ((downloaded / totalBytes) * 100).toFixed(1);
            process.stdout.write('\r    Downloaded ' + (downloaded / (1024 * 1024)).toFixed(1) + '/' + (totalBytes / (1024 * 1024)).toFixed(1) + ' MB (' + pct + '%)');
          }
        });
        res.pipe(file);
        file.on('finish', () => { file.close(); console.log(); resolve(); });
        file.on('error', (err) => { try { fs.unlinkSync(destPath); } catch {} reject(err); });
      }).on('error', (err) => { file.close(); try { fs.unlinkSync(destPath); } catch {} reject(err); });
    };
    request(url);
  });
}

function parseSvkDate(dateStr: string): string | null {
  if (!dateStr || dateStr === 'NA') return null;
  const s = dateStr.trim();
  if (s.length === 8 && /^\d{8}$/.test(s)) {
    return s.substring(0, 4) + '-' + s.substring(4, 6) + '-' + s.substring(6, 8);
  }
  return null;
}

function mapSpeechType(type: string): string {
  const t = type.toLowerCase().trim();
  if (t.includes('predsedajúc') || t.includes('moderator') || t.includes('vstup predsed')) return 'chairman_statement';
  if (t.includes('rozprava') || t.includes('diskusia')) return 'debate';
  if (t.includes('otázk') || t.includes('interpeláci')) return 'question';
  if (t.includes('vyhláseni') || t.includes('prehláseni')) return 'statement';
  if (t.includes('hlasovani')) return 'vote';
  if (t.includes('návrh')) return 'motion';
  return 'speech';
}

function parseTsvLine(line: string, headers: string[]): SVKCorpRow | null {
  const fields = line.split('\t');
  if (fields.length < 27) return null;

  const row: any = {};
  for (let i = 0; i < headers.length && i < fields.length; i++) {
    row[headers[i]] = fields[i] || '';
  }
  return row as SVKCorpRow;
}

async function processTsvFile(
  filePath: string,
  db: Database.Database,
  insert: Database.Statement,
  insertFull: Database.Statement,
  termNum: number,
  limit: number,
): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;
  let lineCount = 0;
  let headers: string[] = [];
  let batch: any[] = [];

  const fileStream = fs.createReadStream(filePath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const flushBatch = () => {
    if (batch.length === 0) return;
    const tx = db.transaction(() => {
      for (const params of batch) {
        try {
          const result = insert.run(params.main);
          if (result.changes > 0 && params.fullText && params.fullText.length > 0) {
            const prepWorkId = result.lastInsertRowid;
            try {
              insertFull.run({ prepWorkId, fullText: params.fullText, sectionSummaries: null });
            } catch {}
          }
          inserted++;
        } catch (err: any) {
          if (!err.message?.includes('UNIQUE')) {
            if (skipped < 5) console.error('    Insert error: ' + err.message);
          }
          skipped++;
        }
      }
    });
    tx();
    batch = [];
  };

  for await (const line of rl) {
    lineCount++;

    if (lineCount === 1) {
      headers = line.split('\t').map(h => h.trim());
      continue;
    }

    if (limit > 0 && inserted >= limit) break;

    const row = parseTsvLine(line, headers);
    if (!row) { skipped++; continue; }
    if (!row.speech || row.speech === 'NA' || row.speech.trim().length < 10) { skipped++; continue; }

    const date = parseSvkDate(row.date);
    const speechType = mapSpeechType(row.type || '');
    const agenda = row.agenda && row.agenda !== 'NA' ? row.agenda.trim() : '';
    const speaker = row.fullname && row.fullname !== 'NA' ? row.fullname.trim() : '';
    const party = row.party_short && row.party_short !== 'NA' ? row.party_short.trim() : '';

    const titleText = agenda
      ? agenda.substring(0, 500)
      : (speaker ? 'Speech by ' + speaker : 'Term ' + termNum + ' Meeting ' + row.meeting + ' Item ' + row.term_id);

    const summary = [
      speechType !== 'speech' ? speechType.replace(/_/g, ' ') : '',
      speaker ? 'Speaker: ' + speaker : '',
      party ? 'Party: ' + party : '',
      row.time && row.time !== 'NA' ? 'Time: ' + row.time : '',
    ].filter(Boolean).join(' | ');

    const speechText = row.speech.trim();
    const truncatedText = speechText.length > SPEECH_TRUNCATE
      ? speechText.substring(0, SPEECH_TRUNCATE)
      : speechText;

    const documentId = 'svkcorp-t' + termNum + '-m' + row.meeting + '-' + row.term_id;

    batch.push({
      main: {
        documentId,
        type: speechType,
        title: titleText,
        billNumber: null,
        legislativePeriod: termNum + 'th Term NRSR',
        summary: summary.substring(0, 2000),
        fullText: truncatedText,
        dateIntroduced: date,
        dateEnacted: null,
        status: 'delivered',
        votingResult: null,
        url: row.transcript_link && row.transcript_link !== 'NA' ? row.transcript_link : null,
        legislature: termNum,
        committee: null,
        proposer: speaker || null,
      },
      fullText: speechText.length > SPEECH_TRUNCATE ? speechText : null,
    });

    if (batch.length >= BATCH_SIZE) {
      flushBatch();
      if (inserted % 25000 === 0) {
        process.stdout.write('\r    Term ' + termNum + ': ' + inserted.toLocaleString() + ' inserted, ' + skipped.toLocaleString() + ' skipped');
      }
    }
  }

  flushBatch();
  return { inserted, skipped };
}

async function main(): Promise<void> {
  const dbPath = CUSTOM_DB || DB_PATH;
  console.log('Slovak SVKCorp Parliamentary Debates Ingestion\n');
  console.log('  Database: ' + dbPath);
  console.log('  Source: Zenodo 10.5281/zenodo.18543598 (CC BY 4.0)');
  console.log('  Terms: ' + SELECTED_TERMS.join(', '));
  if (LIMIT > 0) console.log('  Limit: ' + LIMIT + ' records per term');

  if (!fs.existsSync(dbPath)) {
    console.error('ERROR: Database not found at ' + dbPath);
    process.exit(1);
  }

  if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const hasPrepWorks = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='preparatory_works'").get();
  if (!hasPrepWorks) {
    console.error('ERROR: preparatory_works table not found. Run build-db-paid.ts first.');
    db.close();
    process.exit(1);
  }

  const insert = db.prepare(
    'INSERT OR IGNORE INTO preparatory_works (' +
    '  document_id, type, title, bill_number, legislative_period,' +
    '  summary, full_text, date_introduced, date_enacted, status,' +
    '  voting_result, url, legislature, committee, proposer, source' +
    ') VALUES (' +
    '  @documentId, @type, @title, @billNumber, @legislativePeriod,' +
    '  @summary, @fullText, @dateIntroduced, @dateEnacted, @status,' +
    '  @votingResult, @url, @legislature, @committee, @proposer, \'svkcorp_zenodo\'' +
    ')'
  );

  const insertFull = db.prepare(
    'INSERT OR IGNORE INTO preparatory_works_full (prep_work_id, full_text, section_summaries) ' +
    'VALUES (@prepWorkId, @fullText, @sectionSummaries)'
  );

  let grandTotal = 0;
  let grandSkipped = 0;
  const startTime = Date.now();

  for (const termNum of SELECTED_TERMS) {
    const tsvFile = 'SK_term_' + termNum + '.tsv';
    const tsvPath = path.join(TEMP_DIR, tsvFile);
    const downloadUrl = 'https://zenodo.org/api/records/' + ZENODO_RECORD + '/files/' + tsvFile + '/content';

    console.log('\n  --- Term ' + termNum + ' ---');

    if (fs.existsSync(tsvPath) && fs.statSync(tsvPath).size > 1000) {
      console.log('    Using cached: ' + tsvPath + ' (' + (fs.statSync(tsvPath).size / (1024 * 1024)).toFixed(1) + ' MB)');
    } else {
      console.log('    Downloading: ' + downloadUrl);
      try {
        await downloadFile(downloadUrl, tsvPath);
        console.log('    Saved: ' + tsvPath + ' (' + (fs.statSync(tsvPath).size / (1024 * 1024)).toFixed(1) + ' MB)');
      } catch (err: any) {
        console.error('    Download failed: ' + err.message);
        continue;
      }
    }

    console.log('    Processing...');
    const { inserted, skipped } = await processTsvFile(tsvPath, db, insert, insertFull, termNum, LIMIT);
    console.log('\r    Term ' + termNum + ': ' + inserted.toLocaleString() + ' inserted, ' + skipped.toLocaleString() + ' skipped');

    grandTotal += inserted;
    grandSkipped += skipped;
  }

  if (grandTotal > 0) {
    console.log('\n  Rebuilding FTS index...');
    try {
      db.exec("INSERT INTO preparatory_works_fts(preparatory_works_fts) VALUES ('rebuild')");
      console.log('    FTS rebuild complete.');
    } catch (err: any) {
      console.log('    FTS rebuild note: ' + err.message);
    }
  }

  const totalPW = (db.prepare('SELECT COUNT(*) as c FROM preparatory_works').get() as { c: number }).c;
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);

  console.log('\n=== SVKCorp Ingestion Complete ===');
  console.log('  Terms processed: ' + SELECTED_TERMS.join(', '));
  console.log('  New records: ' + grandTotal.toLocaleString());
  console.log('  Skipped: ' + grandSkipped.toLocaleString());
  console.log('  Total preparatory_works: ' + totalPW.toLocaleString());
  console.log('  Duration: ' + elapsed + 's');

  db.close();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
