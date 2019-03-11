#!/usr/bin/env node

'use strict';

var ts = require('typescript');
var Beautify = require('js-beautify');
var fs = require('fs');
var path = require('path');

var _namespace = 'MyNamespace';
var setNamespace = function (name) { return (_namespace = name); };
function createProgram(files, compilerOptions) {
    var tsConfigJson = ts.parseConfigFileTextToJson('tsconfig.json', compilerOptions
        ? JSON.stringify(compilerOptions)
        : "{\n      \"compilerOptions\": {\n        \"target\": \"es2018\",   \n        \"module\": \"commonjs\", \n        \"lib\": [\"es2018\"],\n        \"rootDir\": \".\",\n        \"strict\": false,   \n        \"esModuleInterop\": true,\n        \"noImplicitAny\": true,\n        \"allowJs\": true\n      }\n    ");
    var _a = ts.convertCompilerOptionsFromJson(tsConfigJson.config.compilerOptions, '.'), options = _a.options, errors = _a.errors;
    if (errors.length) {
        throw errors;
    }
    var compilerHost = ts.createCompilerHost(options);
    compilerHost.getSourceFile = function (fileName, languageVersion, onError, shouldCreateNewSourceFile) {
        var file = files.find(function (f) { return f.fileName === fileName; });
        if (!file)
            return undefined;
        file.sourceFile =
            file.sourceFile || ts.createSourceFile(fileName, file.content, ts.ScriptTarget.ES2015, true);
        return file.sourceFile;
    };
    // in order to typechecker to work we need to implement the following method, the following implementation is enough:
    compilerHost.resolveTypeReferenceDirectives = function (typeReferenceDirectiveNames, containingFile) {
        return [];
    };
    return ts.createProgram(files.map(function (f) { return f.fileName; }), options, compilerHost);
}
// ---------------
var EQUAL_TOKEN = 59;
var THIS_TOKEN = 100;
function collectProperties(program) {
    var properties = [];
    var localVariables = [];
    var checker = program.getTypeChecker();
    function visit(node, parentSymbol, fromStatic) {
        if (parentSymbol === void 0) { parentSymbol = null; }
        if (fromStatic === void 0) { fromStatic = null; }
        if (ts.isVariableStatement(node)) {
            for (var _i = 0, _a = node.declarationList.declarations; _i < _a.length; _i++) {
                var declaration = _a[_i];
                if (ts.isIdentifier(declaration.name))
                    localVariables.push(declaration.name.escapedText.toString());
            }
        }
        else if (ts.isFunctionDeclaration(node)) {
            var name = node.name.escapedText.toString();
            var statements = node.body.statements;
            for (var _b = 0, statements_1 = statements; _b < statements_1.length; _b++) {
                var statement = statements_1[_b];
                visit(statement, name, false);
            }
        }
        else if (ts.isExpressionStatement(node) &&
            ts.isBinaryExpression(node.expression) &&
            node.expression.operatorToken.kind === EQUAL_TOKEN) {
            if (ts.isPropertyAccessExpression(node.expression.left)) {
                var expr = node.expression.left;
                var symbol = void 0, name = void 0, type = void 0, _static = void 0;
                if (expr.expression.kind === THIS_TOKEN) {
                    // this.a = 10
                    symbol = parentSymbol;
                    _static = fromStatic;
                    name = expr.name.escapedText.toString();
                    type = getTypeString(checker, node.expression.right);
                }
                else if (ts.isIdentifier(expr.expression)) {
                    // Global.a = 10
                    symbol = expr.expression.escapedText.toString();
                    _static = true;
                    name = expr.name.escapedText.toString();
                    type = getTypeString(checker, node.expression.right);
                }
                else if (ts.isPropertyAccessExpression(expr.expression) &&
                    expr.expression.name.kind === 72 /* prototype */ &&
                    ts.isIdentifier(expr.expression.expression)) {
                    // Global.prototype.a = 10
                    symbol = expr.expression.expression.escapedText.toString();
                    name = expr.name.escapedText.toString();
                    type = getTypeString(checker, node.expression.right);
                    _static = false;
                }
                // Found
                if (symbol) {
                    var doc = void 0;
                    if (node.jsDoc) {
                        doc = node.jsDoc[node.jsDoc.length - 1];
                        type = extractJsDocType(doc);
                    }
                    var property_1 = {
                        name: name,
                        parentSymbol: symbol,
                        static: _static,
                        type: type,
                        jsDoc: doc
                    };
                    var exist = properties.find(function (p) {
                        return p.name === property_1.name &&
                            p.parentSymbol === property_1.parentSymbol &&
                            p.static === property_1.static;
                    });
                    var forbidden = ['constructor', 'prototype'];
                    var localCheck = expr.expression.kind === THIS_TOKEN
                        ? true
                        : !localVariables.includes(name) && !localVariables.includes(symbol);
                    if (!exist && !forbidden.includes(name) && localCheck) {
                        properties.push(property_1);
                        if (ts.isFunctionExpression(node.expression.right)) {
                            var statements = node.expression.right.body.statements;
                            for (var _c = 0, statements_2 = statements; _c < statements_2.length; _c++) {
                                var statement = statements_2[_c];
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
function makePseudoClasses(program, properties) {
    var classes = [];
    var checker = program.getTypeChecker();
    function visit(node) {
        if (ts.isFunctionDeclaration(node)) {
            var name_1 = node.name.escapedText.toString();
            var constructorArgs = makeVariablesFromParameters(checker, Array.from(node.parameters || []));
            var jsDoc = node.jsDoc;
            var lastJsDoc = jsDoc ? jsDoc[jsDoc.length - 1] : null;
            // - Look for call of the true constructor
            var constructorProperty = null;
            for (var _i = 0, _a = node.body.statements; _i < _a.length; _i++) {
                var statement = _a[_i];
                if (ts.isExpressionStatement(statement)) {
                    var str = statement.getText();
                    if (str.match(/this\.(.+)\.apply\(this,/i)) {
                        constructorProperty = properties.find(function (p) { return p.parentSymbol === name_1 && p.name === RegExp.$1; });
                        if (jsDoc)
                            constructorProperty.type = extractJsDocType(lastJsDoc, constructorProperty.type);
                    }
                }
            }
            var constructorSignature = null;
            if (!constructorProperty) {
                constructorSignature = jsDoc
                    ? extractJsDocType(lastJsDoc).replace(/\=\>.+/i, '')
                    : "(" + constructorArgs.map(function (p) { return p.name + ": " + p.type; }).join(', ') + ")";
            }
            classes.push({
                name: name_1,
                constructorArgs: constructorArgs,
                properties: properties.map(function (p) { return (p.parentSymbol === name_1 ? p : null); }).filter(function (v) { return !!v; }),
                constructorProperty: constructorProperty,
                jsDoc: jsDoc ? lastJsDoc : null,
                constructorSignature: constructorSignature
            });
        }
        else if (ts.isExpressionStatement(node)) {
            var str = node.getText();
            if (str.match(/(.+)\.prototype\s*\=\s*Object\.create\((.+)\.prototype\)/i)) {
                // -
                var _class = classes.find(function (c) { return c.name === RegExp.$1; });
                if (!_class) {
                    _class = {
                        constructorArgs: [],
                        global: true,
                        name: RegExp.$1,
                        properties: [],
                        extends: RegExp.$2
                    };
                    classes.push(_class);
                }
                else {
                    _class.extends = RegExp.$2;
                }
            }
            else if (str.match(/Object\.definePropert.+\((.+?),/i) && ts.isCallExpression(node.expression)) {
                // - Extract properties from getter/setter
                var properties_2 = [];
                var value = RegExp.$1;
                var symbol_1, _static = void 0;
                if (value.match(/(.+)\.prototype/)) {
                    symbol_1 = RegExp.$1;
                    _static = false;
                }
                else {
                    symbol_1 = value;
                    _static = true;
                }
                var arg = node.expression.arguments[1];
                if (ts.isStringLiteral(arg)) {
                    var jsDoc = node.jsDoc || null;
                    var lastJsDoc = jsDoc ? jsDoc[jsDoc.length - 1] : null;
                    var objArg = node.expression.arguments[2];
                    if (ts.isObjectLiteralExpression(objArg)) {
                        var result = makePropertyFromObjectLiteral(checker, objArg, lastJsDoc);
                        properties_2.push({
                            name: arg.text,
                            parentSymbol: symbol_1,
                            static: _static,
                            type: result.type,
                            readonly: result.readonly
                        });
                    }
                }
                else if (ts.isObjectLiteralExpression(arg)) {
                    for (var _b = 0, _c = arg.properties; _b < _c.length; _b++) {
                        var prop = _c[_b];
                        if (ts.isPropertyAssignment(prop)) {
                            var jsDoc = prop.jsDoc || null;
                            var lastJsDoc = jsDoc ? jsDoc[jsDoc.length - 1] : null;
                            var name = prop.name.escapedText.toString();
                            if (ts.isObjectLiteralExpression(prop.initializer)) {
                                var result = makePropertyFromObjectLiteral(checker, prop.initializer, lastJsDoc);
                                properties_2.push({
                                    name: name,
                                    parentSymbol: symbol_1,
                                    readonly: result.readonly,
                                    static: _static,
                                    type: result.type,
                                    jsDoc: jsDoc
                                });
                            }
                            else {
                                properties_2.push({
                                    name: name,
                                    parentSymbol: symbol_1,
                                    readonly: true,
                                    static: _static,
                                    type: getTypeString(checker, prop.initializer),
                                    jsDoc: jsDoc
                                });
                            }
                        }
                    }
                }
                var _class = classes.find(function (c) { return c.name === symbol_1; });
                if (!_class) {
                    _class = {
                        constructorArgs: [],
                        global: true,
                        name: symbol_1,
                        properties: properties_2.slice()
                    };
                    classes.push(_class);
                }
                else {
                    _class.properties = [].concat(_class.properties, properties_2);
                }
            }
        }
        //ts.forEachChild(node, visit);
    }
    traverseProgram(program, visit);
    var _loop_1 = function (p) {
        var _class = classes.find(function (c) { return c.name === p.parentSymbol; });
        if (!_class) {
            classes.push({
                constructorArgs: [],
                constructorProperty: null,
                global: true,
                name: p.parentSymbol,
                properties: properties
                    .map(function (_p) { return (_p.parentSymbol === p.parentSymbol ? _p : null); })
                    .filter(function (v) { return !!v; })
            });
        }
    };
    // - Find out global pseudo classes
    for (var _i = 0, properties_1 = properties; _i < properties_1.length; _i++) {
        var p = properties_1[_i];
        _loop_1(p);
    }
    return classes;
}
function makePropertyFromObjectLiteral(checker, expr, jsDoc) {
    var readonly = true;
    var type = 'any';
    for (var _i = 0, _a = expr.properties; _i < _a.length; _i++) {
        var prop = _a[_i];
        if (ts.isPropertyAssignment(prop)) {
            if (prop.name.escapedText.toString() === 'set') {
                readonly = false;
            }
            else if (prop.name.escapedText.toString() === 'get') {
                type = getTypeString(checker, prop.initializer);
                if (type.match(/\=\>(.+)/i)) {
                    type = RegExp.$1.trim();
                }
                if (jsDoc) {
                    type = extractJsDocType(jsDoc, type);
                }
            }
            else if (prop.name.escapedText.toString() === 'value') {
                type = getTypeString(checker, prop.initializer);
                if (jsDoc) {
                    type = extractJsDocType(jsDoc, type);
                }
            }
        }
    }
    return {
        readonly: readonly,
        type: type
    };
}
function makeVariablesFromParameters(checker, params) {
    var variables = [];
    for (var _i = 0, params_1 = params; _i < params_1.length; _i++) {
        var param = params_1[_i];
        variables.push({
            name: param.name.escapedText.toString(),
            type: getTypeString(checker, param)
        });
    }
    return variables;
}
function traverseProgram(program, callback) {
    for (var _i = 0, _a = program.getSourceFiles(); _i < _a.length; _i++) {
        var sourceFile = _a[_i];
        if (!sourceFile.isDeclarationFile) {
            // Walk the tree to search for classes
            ts.forEachChild(sourceFile, callback);
        }
    }
}
function getTypeString(checker, node) {
    var type = checker.getTypeAtLocation(node);
    if (node.getText().match(/^\s*new\s+(.+?)\(.*\)/i)) {
        return RegExp.$1.trim();
    }
    if (type.isLiteral()) {
        type = checker.getBaseTypeOfLiteralType(type);
    }
    var value = checker.typeToString(type, node, ts.TypeFormatFlags.NoTruncation);
    if (value === 'null')
        return 'any';
    if (value === 'false' || value === 'true')
        return 'boolean';
    return value;
}
function convertJsDocType(type) {
    if (type.includes('|')) {
        return type
            .split('|')
            .map(function (v) { return convertJsDocType(v); })
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
function extractJsDocType(doc, currentType) {
    if (currentType === void 0) { currentType = ''; }
    var params = [];
    var returnType = 'any';
    var absoluteType;
    var extractType = function (tag) {
        var type;
        if (tag.typeExpression == null) {
            type = 'any';
        }
        else {
            type = tag.typeExpression.type.getText();
            // if (!(tag.typeExpression.type as any).typeName) {
            //   type = tag.typeExpression.type.getText();
            // } else {
            //   type = (tag.typeExpression.type as any).typeName.escapedText.toString();
            // }
        }
        return type;
    };
    var autoGeneratedArgs = 0;
    for (var _i = 0, _a = Array.from(doc.tags || []); _i < _a.length; _i++) {
        var tag = _a[_i];
        if (ts.isJSDocTypeTag(tag)) {
            absoluteType = extractType(tag);
            return convertJsDocType(absoluteType);
        }
        else if (ts.isJSDocParameterTag(tag)) {
            var type = extractType(tag);
            var name = tag.name.escapedText.toString();
            if (!name) {
                var commentArg = tag.comment.split(' ')[0];
                if (commentArg.startsWith('...')) {
                    name = commentArg;
                }
                else {
                    name = "arg" + Number(autoGeneratedArgs++);
                }
            }
            params.push({ name: name, type: convertJsDocType(type) });
        }
        else if (ts.isJSDocReturnTag(tag)) {
            var type = extractType(tag);
            returnType = convertJsDocType(type);
        }
    }
    if (currentType.match(/\(.+\)\s*\=\>\s*(.+)/)) {
        returnType = returnType || RegExp.$2.trim();
    }
    return "(" + params.map(function (p) { return p.name + ": " + p.type; }).join(', ') + ") => " + returnType;
}
function makeDTS(classes) {
    var globals = classes.map(function (c) { return (c.global ? c : null); }).filter(function (v) { return !!v; });
    var text = '';
    if (globals.length > 0) {
        text = "declare global {\n      " + globals
            .map(function (c) { return "interface " + c.name + " {\n        " + c.properties.map(function (p) { return propertyToString(p).replace('static', ''); }).join('\n') + "\n      }"; })
            .join('\n') + "\n  }\n  ";
    }
    var normal = classes.filter(function (c) { return !c.global; });
    text += "export declare namespace " + _namespace + "{\n    " + normal.map(function (c) { return classToString(c); }).join('\n') + "\n  }";
    return Beautify.js(text, {});
}
function propertyToString(property) {
    return ("" + (property.jsDoc && property.jsDoc.getText ? property.jsDoc.getText() + '\n' : '') + (property.static ? 'static ' : '') + (property.readonly ? 'readonly ' : '') + property.name + ": " + property.type + ";").trim();
}
function classToString(_class) {
    var constructorDoc = _class.jsDoc && _class.jsDoc.getText ? _class.jsDoc.getText() : '';
    return "class " + _class.name + (_class.extends ? " extends " + _class.extends : '') + " {" + constructorDoc + "\n    " + (_class.constructorProperty
        ? "new " + _class.constructorProperty.type.replace(/ \=\>.+/i, '') + ";\n"
        : "new " + _class.constructorSignature + ";\n") + _class.properties
        .filter(function (p) { return p !== _class.constructorProperty; })
        .map(function (p) { return propertyToString(p); })
        .join('\n\n') + "\n  }";
}

//#!/usr/bin/env node
var callerPath = process.cwd();
var fileName = process.argv[2];
var namespace = process.argv[3];
setNamespace(namespace || 'UnknownNamespace');
try {
    var file = {
        content: fs.readFileSync(path.resolve(callerPath, fileName)).toString(),
        fileName: 'file1.ts'
    };
    var lib = {
        content: fs.readFileSync(path.resolve(__dirname, '../lib/lib.es5.d.ts'))
            .toString(),
        fileName: 'lib.es2018.d.ts'
    };
    var program = createProgram([file, lib], {});
    console.log(' - TS program created');
    console.log(' - Collecting properties');
    var properties = collectProperties(program);
    console.log(' -> Done');
    console.log(' - Collecting pseudo classes');
    var classes = makePseudoClasses(program, properties);
    console.log(' -> Done');
    console.log(' - Writing result');
    var result = makeDTS(classes);
    var resultFileName = fileName.replace(/\.(t|j)s/i, '') + '.d.ts';
    fs.writeFileSync(path.resolve(callerPath, resultFileName), result);
    console.log(' -> Done');
}
catch (error) {
    console.log('An error occured.');
    throw error;
}
