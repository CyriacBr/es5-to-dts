import * as ts from 'typescript';
import { Guess } from './typeGuesser';
export interface Property {
    parentSymbol: string;
    name: string;
    type: string;
    static?: boolean;
    readonly?: boolean;
    jsDoc?: ts.JSDoc;
    linkedToFunction?: string;
    typeGuessing?: Guess;
    guessedType?: string;
    rightNode?: ts.Node;
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
    _visit(node: ts.Node, parentNode?: ts.Node): void;
    _onVariableStatement(node: ts.VariableStatement, parentNode: ts.Node): void;
    _onFunctionDeclaration(node: ts.FunctionDeclaration): void;
    _onExpressionStatement(node: ts.ExpressionStatement, expr: ts.BinaryExpression, left: ts.PropertyAccessExpression): void;
}
