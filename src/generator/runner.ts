import { File, createProgram, makeFunctionDeclarations } from '../utils';
import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import { PropertyCollector, Property } from './propertyCollector';
import { ClassCollector, PseudoClass } from './classCollector';
import { DTSWriter } from './dtsWriter';
import ora from 'ora';
import * as Readline from 'readline';
import { ErrorLogger } from './errorLogger';
import { TypeGuesser } from './typeGuesser';

export interface Options {
  namespace?: string;
  allFiles?: boolean;
  collectRootVariables?: boolean;
  guessTypes?: boolean;
}

export class Runner {
  static options: Options = {};
  static result: {
    properties: Property[];
    builtData: {
      classes: PseudoClass[];
      functions: PseudoClass[];
    };
  };

  static makeProgram(file: File) {
    const lib: File = {
      content: fs.readFileSync(path.resolve(__dirname, '../../lib/lib.es5.d.ts')).toString(),
      fileName: 'lib.es2018.d.ts'
    };
    return createProgram([file, lib], {});
  }

  static run(
    options: Options,
    file: File,
    fileName: string,
    callerPath: string,
    mode: 'output' | 'write' = 'write'
  ): string {
    this.options = options;

    try {
      const program = this.makeProgram(file);

      const properties = this._runPhase('Collecting properties', () =>
        new PropertyCollector().collect(program)
      );
      const builtData = this._runPhase('Collecting pseudo classes', () =>
        new ClassCollector().collect(program, properties)
      );
      if(options.guessTypes) {
        this._runPhase('Guessing properties typings', () => {
          TypeGuesser.guess(program, properties, builtData.classes);
        });
      }
      const text = this._runPhase('Generating & writing result', () => {
        const result = DTSWriter.make(builtData.classes, builtData.functions, properties);
        if (mode === 'write') {
          const resultFileName = fileName.replace(/\.(t|j)s/i, '') + '.d.ts';
          fs.writeFileSync(path.resolve(callerPath, resultFileName), result);
        }
        return result;
      });
      this.result = {
        builtData,
        properties
      };

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
