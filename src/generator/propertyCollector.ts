import * as ts from 'typescript';
import {
  traverseProgram,
  getTypeString,
  extractJsDocType,
  THIS_TOKEN,
  EQUAL_TOKEN
} from '../utils';
import { ErrorLogger } from './errorLogger';
import { Runner } from './runner';
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

export class PropertyCollector {
  program: ts.Program;
  checker: ts.TypeChecker;
  properties: Property[] = [];
  localVariables: string[] = [];
  state: {
    parentSymbol?: string;
    fromStatic?: boolean;
  } = {};

  collect(program: ts.Program) {
    this.program = program;
    this.checker = program.getTypeChecker();

    traverseProgram(program, this._visit.bind(this));
    return this.properties;
  }

  _visit(node: ts.Node, parentNode: ts.Node = null) {
    try {
      if (ts.isVariableStatement(node)) {
        this._onVariableStatement(node, parentNode);
      } else if (ts.isFunctionDeclaration(node)) {
        this._onFunctionDeclaration(node);
      } else if (
        ts.isExpressionStatement(node) &&
        ts.isBinaryExpression(node.expression) &&
        node.expression.operatorToken.kind === EQUAL_TOKEN
      ) {
        if (ts.isPropertyAccessExpression(node.expression.left)) {
          this._onExpressionStatement(node, node.expression, node.expression.left);
        }
      }
    } catch (error) {
      ErrorLogger.add(node, error);
    }
  }

  _onVariableStatement(node: ts.VariableStatement, parentNode: ts.Node) {
    for (const declaration of node.declarationList.declarations) {
      if (declaration.initializer) {
        if (
          ts.isFunctionExpression(declaration.initializer) ||
          getTypeString(this.checker, declaration.initializer).match(/^\(.+\)\s*\=\>/)
        )
          continue;
      }
      if (ts.isIdentifier(declaration.name)) {
        if(Runner.options.collectRootVariables && !parentNode) {
          this.properties.push({
            name: declaration.name.escapedText.toString(),
            type: declaration.initializer ? getTypeString(this.checker, declaration.initializer) : 'any',
            rightNode: declaration.initializer,
            parentSymbol: null
          });
        } else {
          this.localVariables.push(declaration.name.escapedText.toString());
        }
      }
        
    }
  }

  _onFunctionDeclaration(node: ts.FunctionDeclaration) {
    const name = node.name.escapedText.toString();
    const { statements } = node.body;
    for (const statement of statements) {
      this.state.parentSymbol = name;
      this.state.fromStatic = false;
      this._visit(statement, node);
    }
  }

  _onExpressionStatement(
    node: ts.ExpressionStatement,
    expr: ts.BinaryExpression,
    left: ts.PropertyAccessExpression
  ) {
    let symbol: string, name: string, type: string, _static: boolean;
    if (left.expression.kind === THIS_TOKEN) {
      // this.a = 10
      symbol = this.state.parentSymbol;
      _static = this.state.fromStatic;
      name = left.name.escapedText.toString();
      type = getTypeString(this.checker, expr.right);
    } else if (ts.isIdentifier(left.expression)) {
      // Global.a = 10
      symbol = left.expression.escapedText.toString();
      _static = true;
      name = left.name.escapedText.toString();
      type = getTypeString(this.checker, expr.right);
    } else if (
      ts.isPropertyAccessExpression(left.expression) &&
      left.expression.name.kind === 72 /* prototype */ &&
      ts.isIdentifier(left.expression.expression)
    ) {
      // Global.prototype.a = 10
      symbol = left.expression.expression.escapedText.toString();
      name = left.name.escapedText.toString();
      type = getTypeString(this.checker, expr.right);
      _static = false;
    }
    // Found
    if (symbol) {
      let doc: ts.JSDoc;
      if ((node as any).jsDoc) {
        doc = (node as any).jsDoc[(node as any).jsDoc.length - 1];
        type = extractJsDocType(doc);
      }
      const property: Property = {
        name,
        parentSymbol: symbol,
        static: _static,
        type,
        jsDoc: doc,
        linkedToFunction: ts.isIdentifier(expr.right) ? expr.right.escapedText.toString() : null,
        rightNode: expr.right
      };
      const exist = this.properties.find(
        p =>
          p.name === property.name &&
          p.parentSymbol === property.parentSymbol &&
          p.static === property.static
      );
      const forbidden = ['constructor', 'prototype'];
      const localCheck =
        left.expression.kind === THIS_TOKEN
          ? true
          : !this.localVariables.includes(name) && !this.localVariables.includes(symbol);
      if (!exist && !forbidden.includes(name) && localCheck) {
        this.properties.push(property);
        if (ts.isFunctionExpression(expr.right)) {
          const { statements } = expr.right.body;
          for (const statement of statements) {
            this.state.parentSymbol = symbol;
            this.state.fromStatic = _static;
            this._visit(statement);
          }
        }
      }
    }
  }
}
