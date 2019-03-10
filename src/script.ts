import { File, createProgram, collectProperties, makePseudoClasses, makeDTS, setNamespace } from './generator';
import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';

const callerPath = process.cwd();
const fileName = process.argv[2] as string;
const namespace = process.argv[3] as string;
setNamespace(namespace || 'UnknownNamespace');

try {
  const file: File = {
    content: fs.readFileSync(path.resolve(callerPath, fileName)).toString(),
    fileName: 'file1.ts'
  };

  const lib: File = {
    content: fs
      .readFileSync(path.resolve(__dirname, '../node_modules/typescript/lib/lib.es5.d.ts'))
      .toString(),
    fileName: 'lib.es2018.d.ts'
  };
  const program: ts.Program = createProgram([file, lib], {});
  console.log(' - TS program created');
  console.log(' - Collecting properties');
  const properties = collectProperties(program);
  console.log(' -> Done');
  console.log(' - Collecting pseudo classes');
  const classes = makePseudoClasses(program, properties);
  console.log(' -> Done');
  console.log(' - Writing result');
  const result = makeDTS(classes);
  const resultFileName = fileName.replace(/\.(t|j)s/i, '') + '.d.ts';
  fs.writeFileSync(path.resolve(callerPath, resultFileName), result);
  console.log(' -> Done');
} catch (error) {
  console.log('An error occured.');
  throw error;
}
