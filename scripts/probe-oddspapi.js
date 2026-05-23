// probe-oddspapi.js — find out where api.oddspapi.io is hosted and how fast we can reach it
//
// Usage: node scripts/probe-oddspapi.js
//
// What it does:
//   1. Resolves api.oddspapi.io to an IP
//   2. Looks up the IP's hosting country/city/ASN via ipinfo.io (free, no key)
//   3. Times 10 HTTPS GET requests to a cheap endpoint and reports DNS / Connect / TLS / TTFB / Total
//   4. Prints a summary you can paste into the GridV2 roadmap
//
// Run this from California first (your laptop). Once you have a VPS in Falkenstein,
// SSH in and run it again — compare the TTFB numbers. The delta is your real
// "VPS region penalty" for OddsPapi ingestion.

import dns from 'node:dns/promises';
import https from 'node:https';
import { performance } from 'node:perf_hooks';

const HOST = 'api.oddspapi.io';
const PROBE_PATH = '/v4/sports'; // small, cacheable endpoint — adjust if you prefer
const ATTEMPTS = 10;

function timeRequest(url) {
  return new Promise((resolve, reject) => {
    const marks = { start: performance.now() };
    const req = https.get(url, { timeout: 10_000 }, (res) => {
      marks.firstByte = performance.now();
      res.on('data', () => {});
      res.on('end', () => {
        marks.end = performance.now();
        resolve({
          status: res.statusCode,
          ttfb_ms: marks.firstByte - marks.start,
          total_ms: marks.end - marks.start,
        });
      });
    });
    req.on('socket', (sock) => {
      sock.on('lookup', () => { marks.dns = performance.now(); });
      sock.on('connect', () => { marks.tcp = performance.now(); });
      sock.on('secureConnect', () => { marks.tls = performance.now(); });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
  });
}

async function geolocate(ip) {
  return new Promise((resolve) => {
    https.get(`https://ipinfo.io/${ip}/json`, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { resolve({ error: 'parse failed', raw: body }); }
      });
    }).on('error', (err) => resolve({ error: err.message }));
  });
}

function stats(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    min: sorted[0].toFixed(1),
    p50: sorted[Math.floor(sorted.length / 2)].toFixed(1),
    p95: sorted[Math.floor(sorted.length * 0.95)].toFixed(1),
    max: sorted[sorted.length - 1].toFixed(1),
    avg: (sum / sorted.length).toFixed(1),
  };
}

async function main() {
  console.log(`\n=== Probing ${HOST}${PROBE_PATH} ===\n`);

  // 1. DNS
  console.log('--- DNS ---');
  const records = await dns.resolve4(HOST).catch(() => []);
  if (!records.length) {
    console.log('No A records found. Aborting.');
    process.exit(1);
  }
  console.log(`A records: ${records.join(', ')}`);
  const primaryIP = records[0];

  // 2. Geolocation
  console.log('\n--- Hosting location ---');
  const geo = await geolocate(primaryIP);
  if (geo.error) {
    console.log(`ipinfo lookup failed: ${geo.error}`);
  } else {
    console.log(`IP:       ${geo.ip}`);
    console.log(`Country:  ${geo.country}`);
    console.log(`Region:   ${geo.region}`);
    console.log(`City:     ${geo.city}`);
    console.log(`Org:      ${geo.org}`);
    console.log(`Hostname: ${geo.hostname || '(none)'}`);
  }

  // 3. Timing
  console.log(`\n--- HTTPS timing (${ATTEMPTS} requests) ---`);
  const ttfbs = [];
  const totals = [];
  for (let i = 1; i <= ATTEMPTS; i++) {
    try {
      const r = await timeRequest(`https://${HOST}${PROBE_PATH}`);
      ttfbs.push(r.ttfb_ms);
      totals.push(r.total_ms);
      console.log(`#${String(i).padStart(2)}  status=${r.status}  TTFB=${r.ttfb_ms.toFixed(1)}ms  Total=${r.total_ms.toFixed(1)}ms`);
    } catch (err) {
      console.log(`#${String(i).padStart(2)}  ERROR: ${err.message}`);
    }
  }

  if (ttfbs.length) {
    const t = stats(ttfbs);
    console.log(`\nTTFB:  min=${t.min}  p50=${t.p50}  p95=${t.p95}  max=${t.max}  avg=${t.avg} ms`);
    const o = stats(totals);
    console.log(`Total: min=${o.min}  p50=${o.p50}  p95=${o.p95}  max=${o.max}  avg=${o.avg} ms`);
  }

  // 4. Summary line
  console.log('\n--- Verdict ---');
  if (geo.country) {
    const cc = geo.country;
    if (['US', 'CA'].includes(cc)) {
      console.log(`OddsPapi hosts in ${cc}. Falkenstein VPS will add ~80ms per ingest call vs Ashburn.`);
      console.log('At 15-30s poll cadence this is negligible. At 1s polling with chained calls, reconsider.');
    } else if (['DE', 'NL', 'FR', 'GB', 'IE', 'FI', 'CH', 'IS', 'RO'].includes(cc)) {
      console.log(`OddsPapi hosts in ${cc} (Europe). Falkenstein is actually BETTER than Ashburn here.`);
    } else {
      console.log(`OddsPapi hosts in ${cc}. Compare TTFB from Falkenstein once provisioned.`);
    }
  }
  console.log('');
}

main().catch((err) => {
  console.error('Probe failed:', err);
  process.exit(1);
});
