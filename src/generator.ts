import * as ts from 'typescript';
import * as Beautify from 'js-beautify';

let _namespace = 'MyNamespace';
export const setNamespace = (name: string) => (_namespace = name);

export interface File {
  fileName: string;
  content: string;
  sourceFile?: ts.SourceFile;
}

export function createProgram(files: File[], compilerOptions?: ts.CompilerOptions): ts.Program {
  const tsConfigJson = ts.parseConfigFileTextToJson(
    'tsconfig.json',
    compilerOptions
      ? JSON.stringify(compilerOptions)
      : `{
      "compilerOptions": {
        "target": "es2018",   
        "module": "commonjs", 
        "lib": ["es2018"],
        "rootDir": ".",
        "strict": false,   
        "esModuleInterop": true,
        "noImplicitAny": true,
        "allowJs": true
      }
    `
  );
  let { options, errors } = ts.convertCompilerOptionsFromJson(
    tsConfigJson.config.compilerOptions,
    '.'
  );
  if (errors.length) {
    throw errors;
  }
  const compilerHost = ts.createCompilerHost(options);
  compilerHost.getSourceFile = function(
    fileName: string,
    languageVersion: ts.ScriptTarget,
    onError?: (message: string) => void,
    shouldCreateNewSourceFile?: boolean
  ): ts.SourceFile | undefined {
    const file = files.find(f => f.fileName === fileName);
    if (!file) return undefined;
    file.sourceFile =
      file.sourceFile || ts.createSourceFile(fileName, file.content, ts.ScriptTarget.ES2015, true);
    return file.sourceFile;
  };
  // in order to typechecker to work we need to implement the following method, the following implementation is enough:
  compilerHost.resolveTypeReferenceDirectives = function(
    typeReferenceDirectiveNames: string[],
    containingFile: string
  ): (ts.ResolvedTypeReferenceDirective | undefined)[] {
    return [];
  };
  return ts.createProgram(files.map(f => f.fileName), options, compilerHost);
}

// ---------------
const EQUAL_TOKEN = 59;
const THIS_TOKEN = 100;

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

export function collectProperties(program: ts.Program) {
  const properties: Property[] = [];
  const localVariables: string[] = [];

  const checker = program.getTypeChecker();

  function visit(node: ts.Node, parentSymbol: string = null, fromStatic: boolean = null) {
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (declaration.initializer && ts.isFunctionExpression(declaration.initializer)) continue;
        if (ts.isIdentifier(declaration.name))
          localVariables.push(declaration.name.escapedText.toString());
      }
    } else if (ts.isFunctionDeclaration(node)) {
      const name = node.name.escapedText.toString();
      const { statements } = node.body;
      for (const statement of statements) {
        visit(statement, name, false);
      }
    } else if (
      ts.isExpressionStatement(node) &&
      ts.isBinaryExpression(node.expression) &&
      node.expression.operatorToken.kind === EQUAL_TOKEN
    ) {
      if (ts.isPropertyAccessExpression(node.expression.left)) {
        const expr = node.expression.left;
        let symbol: string, name: string, type: string, _static: boolean;
        if (expr.expression.kind === THIS_TOKEN) {
          // this.a = 10
          symbol = parentSymbol;
          _static = fromStatic;
          name = expr.name.escapedText.toString();
          type = getTypeString(checker, node.expression.right);
        } else if (ts.isIdentifier(expr.expression)) {
          // Global.a = 10
          symbol = expr.expression.escapedText.toString();
          _static = true;
          name = expr.name.escapedText.toString();
          type = getTypeString(checker, node.expression.right);
        } else if (
          ts.isPropertyAccessExpression(expr.expression) &&
          expr.expression.name.kind === 72 /* prototype */ &&
          ts.isIdentifier(expr.expression.expression)
        ) {
          // Global.prototype.a = 10
          symbol = expr.expression.expression.escapedText.toString();
          name = expr.name.escapedText.toString();
          type = getTypeString(checker, node.expression.right);
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
            jsDoc: doc
          };
          const exist = properties.find(
            p =>
              p.name === property.name &&
              p.parentSymbol === property.parentSymbol &&
              p.static === property.static
          );
          const forbidden = ['constructor', 'prototype'];
          const localCheck =
            expr.expression.kind === THIS_TOKEN
              ? true
              : !localVariables.includes(name) && !localVariables.includes(symbol);
          if (!exist && !forbidden.includes(name) && localCheck) {
            properties.push(property);
            if (ts.isFunctionExpression(node.expression.right)) {
              const { statements } = node.expression.right.body;
              for (const statement of statements) {
                visit(statement, symbol, _static);
              }
            }
          }
        }
      }
    }
  }
  traverseProgram(program, visit);
  return properties;
}

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

export function makePseudoClasses(program: ts.Program, properties: Property[]) {
  let classes: PseudoClass[] = [];
  const checker = program.getTypeChecker();

  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) || ts.isVariableStatement(node)) {
      let name: string, constructorArgs: Variable[], body: ts.Block;
      if (ts.isFunctionDeclaration(node)) {
        name = node.name.escapedText.toString();
        constructorArgs = makeVariablesFromParameters(checker, Array.from(node.parameters || []));
        body = node.body;
      } else if (ts.isVariableStatement(node)) {
        const declaration = node.declarationList.declarations[0];
        if (
          ts.isVariableDeclaration(declaration) && declaration.initializer &&
          ts.isFunctionExpression(declaration.initializer)
        ) {
          name = (declaration.name as ts.Identifier).escapedText.toString();
          constructorArgs = makeVariablesFromParameters(
            checker,
            Array.from(declaration.initializer.parameters || [])
          );
          body = declaration.initializer.body;
        }
      }
      const jsDoc: ts.JSDoc = (node as any).jsDoc;
      const lastJsDoc: ts.JSDoc = jsDoc ? jsDoc[(jsDoc as any).length - 1] : null;

      if(!body || !body.statements) return;
      // - Look for call of the true constructor
      let constructorProperty: Property = null;
      for (const statement of body.statements) {
        if (ts.isExpressionStatement(statement)) {
          const str = statement.getText();
          if (str.match(/this\.(.+)\.apply\(this,/i)) {
            constructorProperty = properties.find(
              p => p.parentSymbol === name && p.name === RegExp.$1
            );
            if (jsDoc)
              constructorProperty.type = extractJsDocType(lastJsDoc, constructorProperty.type);
          }
        }
      }
      let constructorSignature = null;
      if (!constructorProperty) {
        constructorSignature = jsDoc
          ? extractJsDocType(lastJsDoc).replace(/\=\>.+/i, '')
          : `(${constructorArgs.map(p => `${p.name}: ${p.type}`).join(', ')})`;
      }
      classes.push({
        name,
        constructorArgs,
        properties: properties.map(p => (p.parentSymbol === name ? p : null)).filter(v => !!v),
        constructorProperty,
        jsDoc: jsDoc ? lastJsDoc : null,
        constructorSignature
      });
    } else if (ts.isExpressionStatement(node)) {
      const str = node.getText();
      if (str.match(/(.+)\.prototype\s*\=\s*Object\.create\((.+)\.prototype\)/i)) {
        // -
        let _class = classes.find(c => c.name === RegExp.$1);
        if (!_class) {
          _class = {
            constructorArgs: [],
            global: true,
            name: RegExp.$1,
            properties: [],
            extends: RegExp.$2
          };
          classes.push(_class);
        } else {
          _class.extends = RegExp.$2;
        }
      } else if (
        str.match(/Object\.definePropert.+\((.+?),/i) &&
        ts.isCallExpression(node.expression)
      ) {
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
            const result = makePropertyFromObjectLiteral(checker, objArg, lastJsDoc);
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
                const result = makePropertyFromObjectLiteral(checker, prop.initializer, lastJsDoc);
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
                  type: getTypeString(checker, prop.initializer),
                  jsDoc
                });
              }
            }
          }
        }
        let _class = classes.find(c => c.name === symbol);
        if (!_class) {
          _class = {
            constructorArgs: [],
            global: true,
            name: symbol,
            properties: [...properties]
          };
          classes.push(_class);
        } else {
          _class.properties = [].concat(_class.properties, properties);
        }
      }
    }
    //ts.forEachChild(node, visit);
  }
  traverseProgram(program, visit);

  // - Find out global pseudo classes
  for (const p of properties) {
    const _class = classes.find(c => c.name === p.parentSymbol);
    if (!_class) {
      classes.push({
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
  return classes;
}

export function makeFunctionDeclarations(classes: PseudoClass[]) {
  const functions: PseudoClass[] = [];
  // - Remove pseudo classes without properties (= they are not classes then)
  classes = classes.filter(c => {
    if (c.properties.length > 0) return true;
    functions.push(c);
    return false;
  });
  return [classes, functions];
}

export function makePropertyFromObjectLiteral(
  checker: ts.TypeChecker,
  expr: ts.ObjectLiteralExpression,
  jsDoc: ts.JSDoc
) {
  let readonly: boolean = true;
  let type: string = 'any';
  for (const prop of expr.properties) {
    if (ts.isPropertyAssignment(prop)) {
      if ((prop.name as ts.Identifier).escapedText.toString() === 'set') {
        readonly = false;
      } else if ((prop.name as ts.Identifier).escapedText.toString() === 'get') {
        type = getTypeString(checker, prop.initializer);
        if (type.match(/\=\>(.+)/i)) {
          type = RegExp.$1.trim();
        }
        if (jsDoc) {
          type = extractJsDocType(jsDoc, type);
        }
      } else if ((prop.name as ts.Identifier).escapedText.toString() === 'value') {
        type = getTypeString(checker, prop.initializer);
        if (jsDoc) {
          type = extractJsDocType(jsDoc, type);
        }
      }
    }
  }
  return {
    readonly,
    type
  };
}

export function makeVariablesFromParameters(
  checker: ts.TypeChecker,
  params: ts.ParameterDeclaration[]
) {
  const variables: Variable[] = [];
  for (const param of params) {
    variables.push({
      name: (param.name as ts.Identifier).escapedText.toString(),
      type: getTypeString(checker, param)
    });
  }
  return variables;
}

export function traverseProgram(program: ts.Program, callback: (node: ts.Node) => any) {
  for (const sourceFile of program.getSourceFiles()) {
    if (!sourceFile.isDeclarationFile) {
      // Walk the tree to search for classes
      ts.forEachChild(sourceFile, callback);
    }
  }
}

export function getTypeString(checker: ts.TypeChecker, node: ts.Node) {
  let type = checker.getTypeAtLocation(node);
  if (node.getText().match(/^\s*new\s+(.+?)\(.*\)/i)) {
    return RegExp.$1.trim();
  }
  if (type.isLiteral()) {
    type = checker.getBaseTypeOfLiteralType(type);
  }
  const value = checker.typeToString(type, node, ts.TypeFormatFlags.NoTruncation);
  if (value === 'null') return 'any';
  if (value === 'false' || value === 'true') return 'boolean';
  return value;
}

export function convertJsDocType(type: string) {
  if (type.includes('|')) {
    return type
      .split('|')
      .map(v => convertJsDocType(v))
      .join(' | ');
  }
  type =
    {
      String: 'string',
      Number: 'number',
      Array: 'any[]',
      Any: 'any',
      Boolean: 'boolean',
      '*': 'any'
    }[type] || type;
  return type;
}

export function extractJsDocType(doc: ts.JSDoc, currentType: string = '') {
  const params: { name: string; type: string }[] = [];
  let returnType: string = 'any';
  let absoluteType: string;

  const extractType = (tag: any) => {
    let type: string;
    if (tag.typeExpression == null) {
      type = 'any';
    } else {
      type = tag.typeExpression.type.getText();
      // if (!(tag.typeExpression.type as any).typeName) {
      //   type = tag.typeExpression.type.getText();
      // } else {
      //   type = (tag.typeExpression.type as any).typeName.escapedText.toString();
      // }
    }
    return type;
  };

  let autoGeneratedArgs = 0;
  for (const tag of Array.from(doc.tags || [])) {
    if (ts.isJSDocTypeTag(tag)) {
      absoluteType = extractType(tag);
      return convertJsDocType(absoluteType);
    } else if (ts.isJSDocParameterTag(tag)) {
      const type = extractType(tag);
      let name = (tag.name as ts.Identifier).escapedText.toString();
      if (!name) {
        const commentArg = tag.comment.split(' ')[0];
        if (commentArg.startsWith('...')) {
          name = commentArg;
        } else {
          name = `arg${Number(autoGeneratedArgs++)}`;
        }
      }
      params.push({ name, type: convertJsDocType(type) });
    } else if (ts.isJSDocReturnTag(tag)) {
      const type = extractType(tag);
      returnType = convertJsDocType(type);
    }
  }
  if (currentType.match(/\(.+\)\s*\=\>\s*(.+)/)) {
    returnType = returnType || RegExp.$2.trim();
  }
  return `(${params.map(p => `${p.name}: ${p.type}`).join(', ')}) => ${returnType}`;
}

export function makeDTS(classes: PseudoClass[], functions: PseudoClass[]) {
  const globals = classes.map(c => (c.global ? c : null)).filter(v => !!v);
  let text = '';
  if (globals.length > 0) {
    text = `declare global {
      ${globals
        .map(
          c => `interface ${c.name} {
        ${c.properties.map(p => propertyToString(p).replace('static', '')).join('\n')}
      }`
        )
        .join('\n')}
  }
  `;
  }
  const normal = classes.filter(c => !c.global);
  text += `export declare namespace ${_namespace}{
    ${functions.map(f => functionToString(f)).join('\n')}
    ${normal.map(c => classToString(c)).join('\n')}
  }`;
  return Beautify.js(text, {});
}

export function propertyToString(property: Property) {
  return `${property.jsDoc && property.jsDoc.getText ? property.jsDoc.getText() + '\n' : ''}${
    property.static ? 'static ' : ''
  }${property.readonly ? 'readonly ' : ''}${property.name}: ${property.type};`.trim();
}

export function classToString(_class: PseudoClass) {
  const constructorDoc = _class.jsDoc && _class.jsDoc.getText ? _class.jsDoc.getText() : '';
  return `class ${_class.name}${
    _class.extends ? ` extends ${_class.extends}` : ''
  } {${constructorDoc}
    ${
      _class.constructorProperty
        ? `new ${_class.constructorProperty.type.replace(/ \=\>.+/i, '')};\n`
        : `new ${_class.constructorSignature};\n`
    }${_class.properties
    .filter(p => p !== _class.constructorProperty)
    .map(p => propertyToString(p))
    .join('\n\n')}
  }`;
}

export function functionToString(func: PseudoClass) {
  const doc = func.jsDoc && func.jsDoc.getText ? func.jsDoc.getText() : '';
  return `${doc}function ${func.name}${func.constructorSignature};`;
}
