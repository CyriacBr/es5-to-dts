import { File } from '../utils';
import * as ts from 'typescript';
import { Property } from './propertyCollector';
import { PseudoClass } from './classCollector';
export interface Options {
    namespace?: string;
    allFiles?: boolean;
    collectRootVariables?: boolean;
    guessTypes?: boolean;
    mockupMode?: boolean;
}
export declare class Runner {
    static options: Options;
    static result: {
        properties: Property[];
        builtData: {
            classes: PseudoClass[];
            functions: PseudoClass[];
        };
    };
    static makeProgram(files: File[]): ts.Program;
    static run(options: Options, files: File[], fileName: string, callerPath: string, mode?: 'output' | 'write'): string;
    static _runPhase<T>(message: string, func: () => T): T;
}
