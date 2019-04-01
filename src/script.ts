import { File } from './utils';
import * as fs from 'fs';
import * as path from 'path';
import { Runner } from './generator/runner';
import * as pkg from '../package.json';

const cli = require('commander');
cli
  .version(pkg.version)
  .option('-n, --namespace [namespace]', 'Wrap the file into a namespace')
  .option('-a, --all-files', 'Process all files in the directory')
  .option('-r, --root-variables', 'Collect root variables')
  .option('-g, --guess-types', 'Guess types')
  .parse(process.argv);
const callerPath = process.cwd();
const fileName = process.argv[2] as string;
const namespace = cli.namespace as string;

const file: File = {
  content: fs.readFileSync(path.resolve(callerPath, fileName)).toString(),
  fileName: 'file1.ts'
};
Runner.run(
  {
    namespace,
    allFiles: cli.allFiles,
    collectRootVariables: cli.rootVariables,
    guessTypes: cli.guessTypes
  },
  file,
  fileName,
  callerPath
);
