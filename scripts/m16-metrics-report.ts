import fs from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: tsx scripts/m16-metrics-report.ts reports/<metrics.json>');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(file, 'utf-8'));

console.log('\n=== M16.4 Metrics Dashboard (CLI) ===\n');
console.log(`Run: ${data.runId}`);
console.log(`Project: ${data.projectId}`);
console.log(`Range: EP${data.range.fromEpisode} - EP${data.range.toEpisode}`);
console.log(`Score: ${data.aggregates.health.score}`);
console.log('');

console.log('Reveal type counts:', data.aggregates.reveal.typeCounts);
console.log('Reveal cadence:', data.aggregates.reveal.cadence);
console.log('Pressure vector counts:', data.aggregates.pressure.vectorCounts);
console.log('Retry:', data.aggregates.retry);
console.log('');

if (data.aggregates.health.errors.length) {
  console.log('ERRORS:');
  for (const e of data.aggregates.health.errors) console.log(' -', e);
  console.log('');
}
if (data.aggregates.health.warnings.length) {
  console.log('WARNINGS:');
  for (const w of data.aggregates.health.warnings) console.log(' -', w);
  console.log('');
}

console.log('Per-episode:');
for (const ep of data.episodes) {
  const r = ep.contract.reveal;
  const p = ep.contract.pressure || {};
  console.log(
    `EP${ep.episode} | ${r.type}/${r.scope} | cadence=${r.cadenceTag || 'NORMAL'} | ` +
      `pressure=${p.vector || '-'} | retries=${ep.writer.slotRetries} | ` +
      `post=${ep.postSignals ? JSON.stringify(ep.postSignals) : '-'}`
  );
}
console.log('');

