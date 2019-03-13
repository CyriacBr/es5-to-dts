import { File, createProgram, setNamespace, makeFunctionDeclarations } from './utils';
import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import { PropertyCollector } from './generator/propertyCollector';
import { ClassCollector } from './generator/classCollector';
import { DTSWriter } from './generator/dtsWriter';
import { Runner } from './generator/runner';

const callerPath = process.cwd();
const fileName = process.argv[2] as string;
const namespace = process.argv[3] as string;
setNamespace(namespace || 'UnknownNamespace');

const file: File = {
  content: fs.readFileSync(path.resolve(callerPath, fileName)).toString(),
  fileName: 'file1.ts'
};
Runner.run(namespace, file, fileName, callerPath);
