import * as ts from 'typescript';
import { PseudoClass } from './generator/classCollector';
export interface File {
    fileName: string;
    content: string;
    sourceFile?: ts.SourceFile;
}
export declare function createProgram(files: File[], compilerOptions?: ts.CompilerOptions): ts.Program;
export declare const EQUAL_TOKEN = 59;
export declare const THIS_TOKEN = 100;
export interface Variable {
    name: string;
    type: string;
}
export declare function makeFunctionDeclarations(classes: PseudoClass[]): PseudoClass[][];
export declare function makePropertyFromObjectLiteral(checker: ts.TypeChecker, expr: ts.ObjectLiteralExpression, jsDoc: ts.JSDoc): {
    readonly: boolean;
    type: string;
};
export declare function makeVariablesFromParameters(checker: ts.TypeChecker, params: ts.ParameterDeclaration[]): Variable[];
export declare function traverseProgram(program: ts.Program, callback: (node: ts.Node) => any): void;
export declare function getTypeString(checker: ts.TypeChecker, node: ts.Node): string;
export declare function convertJsDocType(type: string): any;
export declare function extractJsDocType(doc: ts.JSDoc, currentType?: string): any;
export declare function objectLiteralToObject(expr: ts.ObjectLiteralExpression): {};
export declare function collectNodesBy(program: ts.Program, constraint: (node: ts.Node) => boolean, startingNode?: ts.Node): any[];
