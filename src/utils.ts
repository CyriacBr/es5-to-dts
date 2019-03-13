import * as ts from 'typescript';
import { PseudoClass } from './generator/classCollector';

let _namespace = 'MyNamespace';
export const setNamespace = (name: string) => (_namespace = name);
export const getNamespace = () => _namespace;

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
        "rootDir": ".",
        "strict": false,   
        "esModuleInterop": true,
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
  compilerHost.resolveTypeReferenceDirectives = function(
    typeReferenceDirectiveNames: string[],
    containingFile: string
  ): (ts.ResolvedTypeReferenceDirective | undefined)[] {
    return [];
  };
  return ts.createProgram(files.map(f => f.fileName), options, compilerHost);
}

// ---------------

export const EQUAL_TOKEN = 59;
export const THIS_TOKEN = 100;

export interface Variable {
  name: string;
  type: string;
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
