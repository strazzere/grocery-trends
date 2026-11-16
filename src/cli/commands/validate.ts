import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { StoreConfigSchema } from '../../types/index.js';
import { httpClient } from '../../utils/http-client.js';
import { diffStores, parseStoreList } from '../../utils/store-discovery.js';

const CONFIG_DIR = path.join(process.cwd(), 'config', 'stores');

export const validateCommand = new Command('validate')
  .description('Validate store configuration files')
  .option(
    '--discover',
    'Also compare configs against the live store list on nuggetmarket.com',
  )
  .action(async (opts) => {
    if (!fs.existsSync(CONFIG_DIR)) {
      console.error(`Config dir not found: ${CONFIG_DIR}`);
      process.exit(1);
    }
    const files = fs.readdirSync(CONFIG_DIR).filter((f) => f.endsWith('.json'));
    let failed = 0;

    for (const file of files) {
      const full = path.join(CONFIG_DIR, file);
      try {
        const parsed = JSON.parse(fs.readFileSync(full, 'utf-8'));
        const result = StoreConfigSchema.safeParse(parsed);
        if (result.success) {
          console.log(
            `[OK]   ${file} → ${result.data.name} (store ${result.data.storeId})`,
          );
        } else {
          failed++;
          console.log(`[FAIL] ${file}`);
          for (const issue of result.error.issues) {
            console.log(
              `         ${issue.path.join('.') || '(root)'}: ${issue.message}`,
            );
          }
        }
      } catch (error) {
        failed++;
        const msg = error instanceof Error ? error.message : String(error);
        console.log(`[FAIL] ${file}: ${msg}`);
      }
    }

    console.log(`\n${files.length - failed}/${files.length} configs valid.`);

    if (opts.discover) {
      const ids: number[] = [];
      for (const file of files) {
        try {
          const parsed = StoreConfigSchema.parse(
            JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, file), 'utf-8')),
          );
          ids.push(parsed.storeId);
        } catch {
          // already reported above
        }
      }
      const html = await httpClient.get(
        'https://www.nuggetmarket.com/specials/',
      );
      const discovered = parseStoreList(html);
      if (discovered.length === 0) {
        console.log('[FAIL] Could not find the store list on the live site');
        failed++;
      } else {
        const knownPath = path.join(
          process.cwd(),
          'config',
          'known-stores.json',
        );
        const known: number[] = fs.existsSync(knownPath)
          ? JSON.parse(fs.readFileSync(knownPath, 'utf-8')).storeIds
          : [];
        const { untracked, missing } = diffStores(discovered, [
          ...ids,
          ...known,
        ]);
        // Known-but-unconfigured stores are intentionally not scraped.
        const missingConfigured = missing.filter((id) => ids.includes(id));
        for (const s of untracked) {
          // ::warning:: renders as an annotation in GitHub Actions.
          console.log(
            `::warning::New Nugget store ${s.storeId} (${s.name}) - add a config/stores file or list it in config/known-stores.json`,
          );
        }
        for (const id of missingConfigured) {
          console.log(
            `::warning::Configured store ${id} is no longer in the live store list`,
          );
        }
        console.log(
          `Discovery: ${discovered.length} live stores, ${untracked.length} new, ${missingConfigured.length} configured-but-missing.`,
        );
      }
    }

    if (failed > 0) process.exit(1);
  });

export default validateCommand;
