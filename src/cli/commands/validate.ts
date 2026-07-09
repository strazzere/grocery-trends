import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { StoreConfigSchema } from '../../types/index.js';

const CONFIG_DIR = path.join(process.cwd(), 'config', 'stores');

export const validateCommand = new Command('validate')
  .description('Validate store configuration files')
  .action(() => {
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
    if (failed > 0) process.exit(1);
  });

export default validateCommand;
