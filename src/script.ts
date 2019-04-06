import { File } from './utils';
import * as fs from 'fs';
import * as path from 'path';
import { Runner } from './generator/runner';
import * as pkg from '../package.json';

const cli = require('commander');
cli
  .version(pkg.version)
  .option('-n, --namespace [namespace]', 'Wrap the file into a namespace')
  .option('-a, --all-files [outputName]', 'Process all files in the directory and output a single d.ts')
  .option('-b, --bundled-output', 'When -a is used, bundle the output into a single file')
  .option('-r, --root-variables', 'Collect root variables')
  .option('-g, --guess-types', 'Guess types')
  .option('-m, --mockup', 'Generate a mockup of the definition file instead of a d.ts')
  .parse(process.argv);
const callerPath = process.cwd();
let fileName;
const namespace = cli.namespace as string;

const files: File[] = [];
if (cli.allFiles) {
  fileName = cli.outputName || 'output';
  let filesName = fs.readdirSync(callerPath);
  let i = 1;
  for (const fileName of filesName) {
    files.push({
      content: fs.readFileSync(path.resolve(callerPath, fileName)).toString(),
      fileName: `file${i}.ts`
    });
    i++;
  }
} else {
  fileName = process.argv[2] as string;
  files.push({
    content: fs.readFileSync(path.resolve(callerPath, fileName)).toString(),
    fileName: 'file1.ts'
  });
}
Runner.run(
  {
    namespace,
    allFiles: cli.allFiles,
    collectRootVariables: cli.rootVariables,
    guessTypes: cli.guessTypes,
    mockupMode: cli.mockup
  },
  files,
  fileName,
  callerPath
);
