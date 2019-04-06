import * as ts from 'typescript';
import { Property } from './propertyCollector';
import { PseudoClass } from './classCollector';
export declare class Guess {
    value: any[];
    name: string;
    constructor(value: any[], name: string);
    asTypeSymbol(): string;
    asInterfaceSymbol(): string;
    toInlineString(): string;
    toTypeString(): string;
    toInterfaceString(): string;
}
export interface InferData {
    assignedTypes: {
        [propName: string]: any[];
    };
    typings: {
        [propName: string]: any;
    };
}
export declare class TypeGuesser {
    static symbol: symbol;
    static Dot: any;
    static program: ts.Program;
    static knownClasses: PseudoClass[];
    static guess(program: ts.Program, properties: Property[], classes: PseudoClass[]): void;
    static guessRootPropertiesType(properties: Property[]): void;
    static guessPropertiesFunctionType(properties: Property[]): void;
    static guessClassPropertiesType(classes: PseudoClass[]): void;
    static guessClassConstructorTypes(_class: PseudoClass): void;
    static guessParametersType(node: ts.FunctionExpression, props: Property[]): {
        [propName: string]: string;
    };
    static guessFromBody(body: ts.Node, properties: Property[]): void;
    static typingFromAmbientUsage(node: ts.Node, properties: Property[]): {};
    static inferDataFromCallExpressions(node: ts.Node, properties: Property[]): {
        assignedTypes: {};
        typings: {};
    };
    static infer(prop: Property, left: ts.Node, right: ts.Node, data: InferData): void;
    static inferFromKnownSymbols(typings: any, root?: boolean): any;
}
