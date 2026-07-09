#!/usr/bin/env node
import { Command } from 'commander';
import { scrapeCommand } from './commands/scrape.js';
import { analyzeCommand } from './commands/analyze.js';
import { validateCommand } from './commands/validate.js';
import { listCommand } from './commands/list.js';

const program = new Command();

program
  .name('nugget-specials')
  .description(
    'Scrape Nugget Markets weekly specials and compute deal/trend analysis',
  )
  .version('1.0.0');

program.addCommand(scrapeCommand);
program.addCommand(analyzeCommand);
program.addCommand(validateCommand);
program.addCommand(listCommand);

program.parseAsync(process.argv).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
