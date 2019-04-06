import * as ts from 'typescript';
import { Variable } from '../utils';
import { Property } from './propertyCollector';
export interface PseudoClass {
    name: string;
    constructorArgs: Variable[];
    properties: Property[];
    global?: boolean;
    constructorProperty?: Property;
    constructorSignature?: string;
    extends?: string;
    jsDoc?: ts.JSDoc;
}
export declare class ClassCollector {
    program: ts.Program;
    checker: ts.TypeChecker;
    properties: Property[];
    classes: PseudoClass[];
    localVariables: string[];
    state: {
        parentSymbol?: string;
        fromStatic?: boolean;
    };
    collect(program: ts.Program, properties: Property[]): {
        classes: PseudoClass[];
        functions: PseudoClass[];
    };
    _makePureFunctions(classes: PseudoClass[]): PseudoClass[][];
    _visit(node: ts.Node): void;
    _onFunctionDeclaration(node: ts.FunctionDeclaration): void;
    _onVariableStatement(node: ts.VariableStatement): void;
    _onExpressionStatement(node: ts.ExpressionStatement): void;
    _checkPrototypeInheritance(node: ts.ExpressionStatement): boolean;
    _checkPropertiesDefinition(node: ts.ExpressionStatement): boolean;
    _makeConstructorSpecs(node: ts.FunctionDeclaration | ts.VariableStatement, body: ts.Block, name: string, constructorArgs: any): {
        constructorSignature: any;
        constructorProperty: Property;
        jsDoc: ts.JSDoc;
    };
}
