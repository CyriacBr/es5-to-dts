import { File } from '../utils';
export declare class Runner {
    static run(namespace: string, file: File, fileName: string, callerPath: string, mode?: 'output' | 'write'): string;
    static _runPhase<T>(message: string, func: () => T): T;
}
