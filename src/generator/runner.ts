import { File, setNamespace, createProgram, makeFunctionDeclarations } from '../utils';
import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import { PropertyCollector } from './propertyCollector';
import { ClassCollector } from './classCollector';
import { DTSWriter } from './dtsWriter';
import ora from 'ora';
import * as Readline from 'readline';
import { ErrorLogger } from './errorLogger';

export class Runner {
  static run(
    namespace: string = 'UnknownNamespace',
    file: File,
    fileName: string,
    callerPath: string,
    mode: 'output' | 'write' = 'write'
  ): string {
    setNamespace(namespace);

    try {
      const lib: File = {
        content: fs.readFileSync(path.resolve(__dirname, '../../lib/lib.es5.d.ts')).toString(),
        fileName: 'lib.es2018.d.ts'
      };
      const program: ts.Program = createProgram([file, lib], {});

      const properties = this._runPhase('Collecting properties', () =>
        new PropertyCollector().collect(program)
      );
      const builtData = this._runPhase('Collecting pseudo classes', () =>
        new ClassCollector().collect(program, properties)
      );
      const text = this._runPhase('Generating & writing result', () => {
        const result = DTSWriter.make(builtData.classes, builtData.functions);
        if (mode === 'write') {
          const resultFileName = fileName.replace(/\.(t|j)s/i, '') + '.d.ts';
          fs.writeFileSync(path.resolve(callerPath, resultFileName), result);
        }
        return result;
      });

      if (mode === 'write') {
        const hasError = ErrorLogger.archive.length > 0;
        if (hasError) {
          const readline = Readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          readline.question(`Show error logs? (y/n): `, value => {
            if (value && value[0].toLowerCase().trim() === 'y') {
              console.log(ErrorLogger.display(program));
            }
            readline.close();
          });
        }
      }
      return text;
    } catch (error) {
      console.log('An unexpected error occurred.');
      throw error;
    }
  }

  static _runPhase<T>(message: string, func: () => T) {
    const spinner = ora(message).start();
    const result = func();
    const hasError = ErrorLogger.logs.length > 0;
    if (hasError) {
      spinner.fail(`${message} | ${ErrorLogger.logs.length} error(s)`);
    } else {
      spinner.succeed();
    }
    ErrorLogger.store();
    return result;
  }
}
