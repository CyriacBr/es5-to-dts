import * as ts from 'typescript';
export declare const setNamespace: (name: string) => string;
export interface File {
    fileName: string;
    content: string;
    sourceFile?: ts.SourceFile;
}
export declare function createProgram(files: File[], compilerOptions?: ts.CompilerOptions): ts.Program;
export interface Variable {
    name: string;
    type: string;
}
export interface Property {
    parentSymbol: string;
    name: string;
    type: string;
    static?: boolean;
    readonly?: boolean;
    jsDoc?: ts.JSDoc;
}
export declare function collectProperties(program: ts.Program): Property[];
interface PseudoClass {
    name: string;
    constructorArgs: Variable[];
    properties: Property[];
    global?: boolean;
    constructorProperty?: Property;
    constructorSignature?: string;
    extends?: string;
    jsDoc?: ts.JSDoc;
}
export declare function makePseudoClasses(program: ts.Program, properties: Property[]): PseudoClass[];
export declare function makePropertyFromObjectLiteral(checker: ts.TypeChecker, expr: ts.ObjectLiteralExpression, jsDoc: ts.JSDoc): {
    readonly: boolean;
    type: string;
};
export declare function makeVariablesFromParameters(checker: ts.TypeChecker, params: ts.ParameterDeclaration[]): Variable[];
export declare function traverseProgram(program: ts.Program, callback: (node: ts.Node) => any): void;
export declare function getTypeString(checker: ts.TypeChecker, node: ts.Node): string;
export declare function convertJsDocType(type: string): any;
export declare function extractJsDocType(doc: ts.JSDoc, currentType?: string): any;
export declare function makeDTS(classes: PseudoClass[]): any;
export declare function propertyToString(property: Property): string;
export declare function classToString(_class: PseudoClass): string;
export {};
