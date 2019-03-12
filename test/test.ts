import { File, createProgram, collectProperties, makePseudoClasses, makeDTS, makeFunctionDeclarations } from '../src/generator';
import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';

const code = `

function add(a, b) {
  return a + b;
}

var Moduleee = function Module(rawModule, runtime) {
};

Moduleee.prototype.addChild = function(key, module) {
  this._children[key] = module;
};

Number.prototype.mod = function(n) {
  return ((this % n) + n) % n;
};
`;

const file: File = {
  content: code,
  fileName: 'file1.ts'
};

const lib: File = {
  content: fs
    .readFileSync(path.resolve(__dirname, '../lib/lib.es5.d.ts'))
    .toString(),
  fileName: 'lib.es2018.d.ts'
};
const program: ts.Program = createProgram([file, lib], {});
const properties = collectProperties(program);
const builtClasses = makePseudoClasses(program, properties);
const [classes, functions] = makeFunctionDeclarations(builtClasses);
const result = makeDTS(classes, functions);
fs.writeFileSync(path.resolve(__dirname, './test.d.ts'), result);
