/* ── CLI de l'atelier — livré par l'image (plugins/atelier/tools/atelier.mjs) ──
     node atelier.mjs valide <workbook.json>          # normalise en mémoire puis valide
     node atelier.mjs migre  <workbook.json> --ecrit  # réécrit le fichier en 3.0
   Sans --ecrit, migre imprime le 3.0 sur stdout (relecture avant d'écrire). */
import { readFileSync, writeFileSync } from 'node:fs';
import { normalise } from './convert.js';
import { valide } from './regles.js';

const [cmd, path, ...opts] = process.argv.slice(2);
if (!cmd || !path) {
  console.error('usage: atelier.mjs valide <workbook.json> | migre <workbook.json> [--ecrit]');
  process.exit(2);
}
const brut = JSON.parse(readFileSync(path, 'utf8'));
const wb = normalise(brut);

if (cmd === 'valide') {
  const errs = valide(wb);
  const meta = `workbook ${wb.projet || '?'} ${brut.schemaVersion === '3.0' ? '3.0' : brut.schemaVersion + ' (normalisé 3.0)'} — ${(wb.pieces || []).length} pièces, ${(wb.debit || []).length} plaques`;
  console.log(meta);
  if (errs.length) { console.log(`\n✗ ${errs.length} erreur(s) :`); for (const e of errs) console.log('  •', e); process.exit(1); }
  console.log('\n✓ valide.');
} else if (cmd === 'migre') {
  const errs = valide(wb);
  if (errs.length) { console.error(`✗ le converti ne valide pas (${errs.length} erreurs) — on n'écrit pas du faux :`); for (const e of errs) console.error('  •', e); process.exit(1); }
  const txt = JSON.stringify(wb, null, 1) + '\n';
  if (opts.includes('--ecrit')) { writeFileSync(path, txt); console.log(`✓ ${path} réécrit en 3.0.`); }
  else process.stdout.write(txt);
} else {
  console.error(`commande inconnue « ${cmd} »`);
  process.exit(2);
}
