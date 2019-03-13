import * as ts from 'typescript';
export interface ErrorLog {
    node: ts.Node;
    error: Error;
}
export declare class ErrorLogger {
    static logs: ErrorLog[];
    static archive: ErrorLog[];
    static add(node: ts.Node, error: Error): void;
    static store(): void;
    static display(program: ts.Program): string;
}
