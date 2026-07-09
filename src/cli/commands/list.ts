import { Command } from 'commander';
import { registry } from '../../scrapers/registry.js';

export const listCommand = new Command('list')
  .description('List configured store locations')
  .option('--json', 'Output as JSON')
  .action((opts) => {
    const stores = registry.listStores();
    if (opts.json) {
      console.log(JSON.stringify(stores, null, 2));
      return;
    }
    console.log('Configured stores:\n');
    for (const s of stores) {
      const flag = s.enabled ? '' : ' (disabled)';
      console.log(
        `  ${s.id.padEnd(14)} store #${String(s.storeId).padEnd(4)} ${s.name}${flag}`,
      );
    }
    console.log(`\n${stores.length} store(s).`);
  });

export default listCommand;
