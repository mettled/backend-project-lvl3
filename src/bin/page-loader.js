#!/usr/bin/env node

import { program } from 'commander';
import pageLoader from '..';

program
  .description('Page loader')
  .version('0.0.1')
  .option('-o, --out-dir [type]', 'Output directory', process.cwd())
  .arguments('<url>')
  .action((url, cmdObj) => {
    pageLoader(url, cmdObj.outDir)
      .catch(({ errno, message }) => {
        console.error(`Error number: ${errno}. Error: ${message}`);
        process.exitCode = 1;
      });
  });

program.parse(process.argv);
