import * as ts from 'typescript';
export interface Property {
    parentSymbol: string;
    name: string;
    type: string;
    static?: boolean;
    readonly?: boolean;
    jsDoc?: ts.JSDoc;
    linkedToFunction?: string;
}
export declare class PropertyCollector {
    program: ts.Program;
    checker: ts.TypeChecker;
    properties: Property[];
    localVariables: string[];
    state: {
        parentSymbol?: string;
        fromStatic?: boolean;
    };
    collect(program: ts.Program): Property[];
    _visit(node: ts.Node): void;
    _onVariableStatement(node: ts.VariableStatement): void;
    _onFunctionDeclaration(node: ts.FunctionDeclaration): void;
    _onExpressionStatement(node: ts.ExpressionStatement, expr: ts.BinaryExpression, left: ts.PropertyAccessExpression): void;
}
