import * as ts from 'typescript';
import {
  traverseProgram,
  getTypeString,
  extractJsDocType,
  makeVariablesFromParameters,
  makePropertyFromObjectLiteral,
  Variable
} from '../utils';
import { Property } from './propertyCollector';
import { ErrorLogger } from './errorLogger';


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

export class ClassCollector {
  program: ts.Program;
  checker: ts.TypeChecker;
  properties: Property[] = [];
  classes: PseudoClass[] = [];
  localVariables: string[] = [];
  state: {
    parentSymbol?: string;
    fromStatic?: boolean;
  } = {};

  collect(program: ts.Program, properties: Property[]) {
    this.program = program;
    this.checker = program.getTypeChecker();
    this.properties = properties;

    traverseProgram(program, this._visit.bind(this));
    // - Find out global pseudo classes
    for (const p of properties) {
      if(!p.parentSymbol) continue;
      const _class = this.classes.find(c => c.name === p.parentSymbol);
      if (!_class) {
        const parentAsProp = properties.find(_p => _p.name === p.parentSymbol);
        if(parentAsProp && !parentAsProp.parentSymbol) continue;
        this.classes.push({
          constructorArgs: [],
          constructorProperty: null,
          global: true,
          name: p.parentSymbol,
          properties: properties
            .map(_p => (_p.parentSymbol === p.parentSymbol ? _p : null))
            .filter(v => !!v)
        });
      }
    }

    const result = this._makePureFunctions(this.classes);
    this.classes = result[0];
    const functions = result[1];
    return {
      classes: this.classes,
      functions
    };
  }

  _makePureFunctions(classes: PseudoClass[]) {
    let functions: PseudoClass[] = [];
    /*
    Remove pseudo classes who do not have any properties and
    1) are not used as a parent for inheritance
    2) don't inherit anything
    */
    classes = classes.filter(c => {
      if (c.properties.length > 0) return true;
      const child = classes.find(child => child.extends === c.name);
      if(!!child) return true;
      if(!!c.extends) return true;
      functions.push(c);
      return false;
    });
    // Exclude linked functions
    functions = functions.filter(f => !this.properties.find(p => p.linkedToFunction === f.name));
    return [classes, functions];
  }

  _visit(node: ts.Node) {
    try {
      if (ts.isFunctionDeclaration(node)) {
        this._onFunctionDeclaration(node);
      } else if (ts.isVariableStatement(node)) {
        this._onVariableStatement(node);
      } else if (ts.isExpressionStatement(node)) {
        this._onExpressionStatement(node);
      }
    } catch (error) {
      ErrorLogger.add(node, error);
    }
  }

  _onFunctionDeclaration(node: ts.FunctionDeclaration) {
    const name = node.name.escapedText.toString();
    const constructorArgs = makeVariablesFromParameters(
      this.checker,
      Array.from(node.parameters || [])
    );
    const { constructorSignature, constructorProperty, jsDoc } = this._makeConstructorSpecs(
      node,
      node.body,
      name,
      constructorArgs
    );
    this.classes.push({
      name,
      constructorArgs,
      properties: this.properties.map(p => (p.parentSymbol === name ? p : null)).filter(v => !!v),
      constructorProperty,
      jsDoc: jsDoc || null,
      constructorSignature
    });
  }

  _onVariableStatement(node: ts.VariableStatement) {
    const declaration = node.declarationList.declarations[0];
    if (
      ts.isVariableDeclaration(declaration) &&
      declaration.initializer
    ) {
      if(ts.isFunctionExpression(declaration.initializer)) {
        const name = (declaration.name as ts.Identifier).escapedText.toString();
        const constructorArgs = makeVariablesFromParameters(
          this.checker,
          Array.from(declaration.initializer.parameters || [])
        );
        const body = declaration.initializer.body;
        const { constructorSignature, constructorProperty, jsDoc } = this._makeConstructorSpecs(
          node,
          body,
          name,
          constructorArgs
        );
        this.classes.push({
          name,
          constructorArgs,
          properties: this.properties.map(p => (p.parentSymbol === name ? p : null)).filter(v => !!v),
          constructorProperty,
          jsDoc: jsDoc || null,
          constructorSignature
        });
      } else if(ts.isIdentifier(declaration.initializer)) {
        const name = (declaration.name as ts.Identifier).escapedText.toString();
        const funcName = declaration.initializer.escapedText.toString();
        let _class: PseudoClass;
        this.classes = this.classes.filter(c => {
          if(c.name === funcName) {
            _class = c;
            return false;
          }
          return true;
        });
        if(_class) {
          this.classes.push({
            ..._class,
            name,
            properties: this.properties.map(p => (p.parentSymbol === name ? p : null)).filter(v => !!v)
          });
        }
      }
    }
  }

  _onExpressionStatement(node: ts.ExpressionStatement) {
    this._checkPrototypeInheritance(node) || this._checkPropertiesDefinition(node);
  }

  _checkPrototypeInheritance(node: ts.ExpressionStatement) {
    const str = node.getText();
    if (str.match(/(.+)\.prototype\s*\=\s*Object\.create\((.+)\.prototype\)/i)) {
      let _class = this.classes.find(c => c.name === RegExp.$1);
      if (!_class) {
        _class = {
          constructorArgs: [],
          global: true,
          name: RegExp.$1,
          properties: [],
          extends: RegExp.$2
        };
        this.classes.push(_class);
      } else {
        _class.extends = RegExp.$2;
      }
      return true;
    }
    return false;
  }

  _checkPropertiesDefinition(node: ts.ExpressionStatement) {
    const str = node.getText();
    if (str.match(/Object\.definePropert.+\((.+?),/i) && ts.isCallExpression(node.expression)) {
      // - Extract properties from getter/setter
      const properties: Property[] = [];
      const value = RegExp.$1;
      let symbol: string, _static: boolean;
      if (value.match(/(.+)\.prototype/)) {
        symbol = RegExp.$1;
        _static = false;
      } else {
        symbol = value;
        _static = true;
      }
      const arg = (node.expression as ts.CallExpression).arguments[1];
      if (ts.isStringLiteral(arg)) {
        let jsDoc: ts.JSDoc = (node as any).jsDoc || null;
        const lastJsDoc: ts.JSDoc = jsDoc ? jsDoc[(jsDoc as any).length - 1] : null;
        const objArg = (node.expression as ts.CallExpression).arguments[2];
        if (ts.isObjectLiteralExpression(objArg)) {
          const result = makePropertyFromObjectLiteral(this.checker, objArg, lastJsDoc);
          properties.push({
            name: arg.text,
            parentSymbol: symbol,
            static: _static,
            type: result.type,
            readonly: result.readonly
          });
        }
      } else if (ts.isObjectLiteralExpression(arg)) {
        for (const prop of arg.properties) {
          if (ts.isPropertyAssignment(prop)) {
            let jsDoc: ts.JSDoc = (prop as any).jsDoc || null;
            const lastJsDoc: ts.JSDoc = jsDoc ? jsDoc[(jsDoc as any).length - 1] : null;
            const name = (prop.name as ts.Identifier).escapedText.toString();
            if (ts.isObjectLiteralExpression(prop.initializer)) {
              const result = makePropertyFromObjectLiteral(
                this.checker,
                prop.initializer,
                lastJsDoc
              );
              properties.push({
                name,
                parentSymbol: symbol,
                readonly: result.readonly,
                static: _static,
                type: result.type,
                jsDoc
              });
            } else {
              properties.push({
                name,
                parentSymbol: symbol,
                readonly: true,
                static: _static,
                type: getTypeString(this.checker, prop.initializer),
                jsDoc
              });
            }
          }
        }
      }
      let _class = this.classes.find(c => c.name === symbol);
      if (!_class) {
        _class = {
          constructorArgs: [],
          global: true,
          name: symbol,
          properties: [...properties]
        };
        this.classes.push(_class);
      } else {
        _class.properties = [].concat(_class.properties, properties);
      }
      return true;
    }
    return false;
  }

  _makeConstructorSpecs(
    node: ts.FunctionDeclaration | ts.VariableStatement,
    body: ts.Block,
    name: string,
    constructorArgs
  ) {
    const jsDoc: ts.JSDoc = (node as any).jsDoc;
    const lastJsDoc: ts.JSDoc = jsDoc ? jsDoc[(jsDoc as any).length - 1] : null;

    if (!body || !body.statements) return;
    /*
        -  Look for call of the true constructor
        function Test() {
            this.init.apply(this, arguments);
        }
    */
    let constructorProperty: Property = null;
    for (const statement of body.statements) {
      if (ts.isExpressionStatement(statement)) {
        const str = statement.getText();
        if (str.match(/this\.(.+)\.apply\(this,/i)) {
          constructorProperty = this.properties.find(
            p => p.parentSymbol === name && p.name === RegExp.$1
          );
          if (jsDoc)
            constructorProperty.type = extractJsDocType(lastJsDoc, constructorProperty.type);
        }
      }
    }
    let constructorSignature = null;
    // - Didn't find a call to a pseudo constructor
    if (!constructorProperty) {
      constructorSignature = jsDoc
        ? extractJsDocType(lastJsDoc).replace(/\=\>.+/i, '')
        : `(${constructorArgs.map(p => `${p.name}: ${p.type}`).join(', ')})`;
    }
    return {
      constructorSignature,
      constructorProperty,
      jsDoc: lastJsDoc
    };
  }
}
