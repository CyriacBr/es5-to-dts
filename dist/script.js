#!/usr/bin/env node
'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var fs = require('fs');
var path = require('path');
var ts = require('typescript');
var util = require('util');
var chalk = _interopDefault(require('chalk'));
var ora = _interopDefault(require('ora'));
var Readline = require('readline');
var DotObject = require('dot-object');

function createProgram(files, compilerOptions) {
    var tsConfigJson = ts.parseConfigFileTextToJson('tsconfig.json', compilerOptions
        ? JSON.stringify(compilerOptions)
        : "{\n      \"compilerOptions\": {\n        \"target\": \"es2018\",   \n        \"module\": \"commonjs\",\n        \"rootDir\": \".\",\n        \"strict\": false,   \n        \"esModuleInterop\": true,\n        \"allowJs\": true\n      }\n    ");
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
    compilerHost.resolveTypeReferenceDirectives = function (typeReferenceDirectiveNames, containingFile) {
        return [];
    };
    return ts.createProgram(files.map(function (f) { return f.fileName; }), options, compilerHost);
}
// ---------------
var EQUAL_TOKEN = 59;
var THIS_TOKEN = 100;
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
function objectLiteralToObject(expr) {
    if (expr.getText().length < 2)
        return {};
    var str = expr.getText().replace(/(^\{|\}$)/ig, '');
    var props = str.split(/(;|,)/);
    var obj = {};
    var _loop_1 = function (p) {
        if (p.match(/(.+)\:(.+)/)) {
            var key = RegExp.$1.trim();
            var value_1 = RegExp.$2.trim();
            if (value_1.match(/\{.+\}/)) {
                value_1 = objectLiteralToObject({
                    getText: function () { return value_1; }
                });
            }
            obj[key] = value_1;
        }
    };
    for (var _i = 0, props_1 = props; _i < props_1.length; _i++) {
        var p = props_1[_i];
        _loop_1(p);
    }
    return obj;
}
function collectNodesBy(program, constraint, startingNode) {
    var nodes = [];
    var visit = function (node) {
        if (constraint(node)) {
            nodes.push(node);
        }
        else {
            node.forEachChild(visit);
        }
    };
    if (startingNode) {
        startingNode.forEachChild(visit);
    }
    else {
        traverseProgram(program, visit);
    }
    return nodes;
}

var ErrorLogger = /** @class */ (function () {
    function ErrorLogger() {
    }
    ErrorLogger.add = function (node, error) {
        this.logs.push({ node: node, error: error });
    };
    ErrorLogger.store = function () {
        this.archive = [].concat(this.archive, this.logs);
        this.logs = [];
    };
    ErrorLogger.display = function (program) {
        var srcFile = program.getSourceFiles()[0];
        return "" + this.archive
            .map(function (l, i) {
            var _a = srcFile.getLineAndCharacterOfPosition(l.node.getStart()), line = _a.line, character = _a.character;
            return chalk.bgRed("Error " + (i + 1) + ":") + " " + l.error.message + "\nSourcefile " + chalk.yellow("line " + line) + ", " + chalk.yellow("character " + character) + "\n" + chalk.bold('Stacktrace:') + " " + l.error.stack + "\n" + chalk.bold('Node:') + " " + util.inspect(l.node);
        })
            .join('\n\n');
    };
    ErrorLogger.logs = [];
    ErrorLogger.archive = [];
    return ErrorLogger;
}());

var PropertyCollector = /** @class */ (function () {
    function PropertyCollector() {
        this.properties = [];
        this.localVariables = [];
        this.state = {};
    }
    PropertyCollector.prototype.collect = function (program) {
        this.program = program;
        this.checker = program.getTypeChecker();
        traverseProgram(program, this._visit.bind(this));
        return this.properties;
    };
    PropertyCollector.prototype._visit = function (node, parentNode) {
        if (parentNode === void 0) { parentNode = null; }
        try {
            if (ts.isVariableStatement(node)) {
                this._onVariableStatement(node, parentNode);
            }
            else if (ts.isFunctionDeclaration(node)) {
                this._onFunctionDeclaration(node);
            }
            else if (ts.isExpressionStatement(node) &&
                ts.isBinaryExpression(node.expression) &&
                node.expression.operatorToken.kind === EQUAL_TOKEN) {
                if (ts.isPropertyAccessExpression(node.expression.left)) {
                    this._onExpressionStatement(node, node.expression, node.expression.left);
                }
            }
        }
        catch (error) {
            ErrorLogger.add(node, error);
        }
    };
    PropertyCollector.prototype._onVariableStatement = function (node, parentNode) {
        for (var _i = 0, _a = node.declarationList.declarations; _i < _a.length; _i++) {
            var declaration = _a[_i];
            if (declaration.initializer) {
                if (ts.isFunctionExpression(declaration.initializer) ||
                    getTypeString(this.checker, declaration.initializer).match(/^\(.+\)\s*\=\>/))
                    continue;
            }
            if (ts.isIdentifier(declaration.name)) {
                if (Runner.options.collectRootVariables && !parentNode) {
                    this.properties.push({
                        name: declaration.name.escapedText.toString(),
                        type: declaration.initializer ? getTypeString(this.checker, declaration.initializer) : 'any',
                        rightNode: declaration.initializer,
                        parentSymbol: null
                    });
                }
                else {
                    this.localVariables.push(declaration.name.escapedText.toString());
                }
            }
        }
    };
    PropertyCollector.prototype._onFunctionDeclaration = function (node) {
        var name = node.name.escapedText.toString();
        var statements = node.body.statements;
        for (var _i = 0, statements_1 = statements; _i < statements_1.length; _i++) {
            var statement = statements_1[_i];
            this.state.parentSymbol = name;
            this.state.fromStatic = false;
            this._visit(statement, node);
        }
    };
    PropertyCollector.prototype._onExpressionStatement = function (node, expr, left) {
        var symbol, name, type, _static;
        if (left.expression.kind === THIS_TOKEN) {
            // this.a = 10
            symbol = this.state.parentSymbol;
            _static = this.state.fromStatic;
            name = left.name.escapedText.toString();
            type = getTypeString(this.checker, expr.right);
        }
        else if (ts.isIdentifier(left.expression)) {
            // Global.a = 10
            symbol = left.expression.escapedText.toString();
            _static = true;
            name = left.name.escapedText.toString();
            type = getTypeString(this.checker, expr.right);
        }
        else if (ts.isPropertyAccessExpression(left.expression) &&
            left.expression.name.kind === 72 /* prototype */ &&
            ts.isIdentifier(left.expression.expression)) {
            // Global.prototype.a = 10
            symbol = left.expression.expression.escapedText.toString();
            name = left.name.escapedText.toString();
            type = getTypeString(this.checker, expr.right);
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
                jsDoc: doc,
                linkedToFunction: ts.isIdentifier(expr.right) ? expr.right.escapedText.toString() : null,
                rightNode: expr.right
            };
            var exist = this.properties.find(function (p) {
                return p.name === property_1.name &&
                    p.parentSymbol === property_1.parentSymbol &&
                    p.static === property_1.static;
            });
            var forbidden = ['constructor', 'prototype'];
            var localCheck = left.expression.kind === THIS_TOKEN
                ? true
                : !this.localVariables.includes(name) && !this.localVariables.includes(symbol);
            if (!exist && !forbidden.includes(name) && localCheck) {
                this.properties.push(property_1);
                if (ts.isFunctionExpression(expr.right)) {
                    var statements = expr.right.body.statements;
                    for (var _i = 0, statements_2 = statements; _i < statements_2.length; _i++) {
                        var statement = statements_2[_i];
                        this.state.parentSymbol = symbol;
                        this.state.fromStatic = _static;
                        this._visit(statement);
                    }
                }
            }
        }
    };
    return PropertyCollector;
}());

/*! *****************************************************************************
Copyright (c) Microsoft Corporation. All rights reserved.
Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at http://www.apache.org/licenses/LICENSE-2.0

THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
MERCHANTABLITY OR NON-INFRINGEMENT.

See the Apache Version 2.0 License for specific language governing permissions
and limitations under the License.
***************************************************************************** */

var __assign = function() {
    __assign = Object.assign || function __assign(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};

var ClassCollector = /** @class */ (function () {
    function ClassCollector() {
        this.properties = [];
        this.classes = [];
        this.localVariables = [];
        this.state = {};
    }
    ClassCollector.prototype.collect = function (program, properties) {
        this.program = program;
        this.checker = program.getTypeChecker();
        this.properties = properties;
        traverseProgram(program, this._visit.bind(this));
        var _loop_1 = function (p) {
            if (!p.parentSymbol)
                return "continue";
            var _class = this_1.classes.find(function (c) { return c.name === p.parentSymbol; });
            if (!_class) {
                var parentAsProp = properties.find(function (_p) { return _p.name === p.parentSymbol; });
                if (parentAsProp && !parentAsProp.parentSymbol)
                    return "continue";
                this_1.classes.push({
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
        var this_1 = this;
        // - Find out global pseudo classes
        for (var _i = 0, properties_1 = properties; _i < properties_1.length; _i++) {
            var p = properties_1[_i];
            _loop_1(p);
        }
        var result = this._makePureFunctions(this.classes);
        this.classes = result[0];
        var functions = result[1];
        return {
            classes: this.classes,
            functions: functions
        };
    };
    ClassCollector.prototype._makePureFunctions = function (classes) {
        var _this = this;
        var functions = [];
        /*
        Remove pseudo classes who do not have any properties and
        1) are not used as a parent for inheritance
        2) don't inherit anything
        */
        classes = classes.filter(function (c) {
            if (c.properties.length > 0)
                return true;
            var child = classes.find(function (child) { return child.extends === c.name; });
            if (!!child)
                return true;
            if (!!c.extends)
                return true;
            functions.push(c);
            return false;
        });
        // Exclude linked functions
        functions = functions.filter(function (f) { return !_this.properties.find(function (p) { return p.linkedToFunction === f.name; }); });
        return [classes, functions];
    };
    ClassCollector.prototype._visit = function (node) {
        try {
            if (ts.isFunctionDeclaration(node)) {
                this._onFunctionDeclaration(node);
            }
            else if (ts.isVariableStatement(node)) {
                this._onVariableStatement(node);
            }
            else if (ts.isExpressionStatement(node)) {
                this._onExpressionStatement(node);
            }
        }
        catch (error) {
            ErrorLogger.add(node, error);
        }
    };
    ClassCollector.prototype._onFunctionDeclaration = function (node) {
        var name = node.name.escapedText.toString();
        var constructorArgs = makeVariablesFromParameters(this.checker, Array.from(node.parameters || []));
        var _a = this._makeConstructorSpecs(node, node.body, name, constructorArgs), constructorSignature = _a.constructorSignature, constructorProperty = _a.constructorProperty, jsDoc = _a.jsDoc;
        this.classes.push({
            name: name,
            constructorArgs: constructorArgs,
            properties: this.properties.map(function (p) { return (p.parentSymbol === name ? p : null); }).filter(function (v) { return !!v; }),
            constructorProperty: constructorProperty,
            jsDoc: jsDoc || null,
            constructorSignature: constructorSignature
        });
    };
    ClassCollector.prototype._onVariableStatement = function (node) {
        var declaration = node.declarationList.declarations[0];
        if (ts.isVariableDeclaration(declaration) &&
            declaration.initializer) {
            if (ts.isFunctionExpression(declaration.initializer)) {
                var name_1 = declaration.name.escapedText.toString();
                var constructorArgs = makeVariablesFromParameters(this.checker, Array.from(declaration.initializer.parameters || []));
                var body = declaration.initializer.body;
                var _a = this._makeConstructorSpecs(node, body, name_1, constructorArgs), constructorSignature = _a.constructorSignature, constructorProperty = _a.constructorProperty, jsDoc = _a.jsDoc;
                this.classes.push({
                    name: name_1,
                    constructorArgs: constructorArgs,
                    properties: this.properties.map(function (p) { return (p.parentSymbol === name_1 ? p : null); }).filter(function (v) { return !!v; }),
                    constructorProperty: constructorProperty,
                    jsDoc: jsDoc || null,
                    constructorSignature: constructorSignature
                });
            }
            else if (ts.isIdentifier(declaration.initializer)) {
                var name_2 = declaration.name.escapedText.toString();
                var funcName_1 = declaration.initializer.escapedText.toString();
                var _class_1;
                this.classes = this.classes.filter(function (c) {
                    if (c.name === funcName_1) {
                        _class_1 = c;
                        return false;
                    }
                    return true;
                });
                if (_class_1) {
                    this.classes.push(__assign({}, _class_1, { name: name_2, properties: this.properties.map(function (p) { return (p.parentSymbol === name_2 ? p : null); }).filter(function (v) { return !!v; }) }));
                }
            }
        }
    };
    ClassCollector.prototype._onExpressionStatement = function (node) {
        this._checkPrototypeInheritance(node) || this._checkPropertiesDefinition(node);
    };
    ClassCollector.prototype._checkPrototypeInheritance = function (node) {
        var str = node.getText();
        if (str.match(/(.+)\.prototype\s*\=\s*Object\.create\((.+)\.prototype\)/i)) {
            var _class = this.classes.find(function (c) { return c.name === RegExp.$1; });
            if (!_class) {
                _class = {
                    constructorArgs: [],
                    global: true,
                    name: RegExp.$1,
                    properties: [],
                    extends: RegExp.$2
                };
                this.classes.push(_class);
            }
            else {
                _class.extends = RegExp.$2;
            }
            return true;
        }
        return false;
    };
    ClassCollector.prototype._checkPropertiesDefinition = function (node) {
        var str = node.getText();
        if (str.match(/Object\.definePropert.+\((.+?),/i) && ts.isCallExpression(node.expression)) {
            // - Extract properties from getter/setter
            var properties = [];
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
                    var result = makePropertyFromObjectLiteral(this.checker, objArg, lastJsDoc);
                    properties.push({
                        name: arg.text,
                        parentSymbol: symbol_1,
                        static: _static,
                        type: result.type,
                        readonly: result.readonly
                    });
                }
            }
            else if (ts.isObjectLiteralExpression(arg)) {
                for (var _i = 0, _a = arg.properties; _i < _a.length; _i++) {
                    var prop = _a[_i];
                    if (ts.isPropertyAssignment(prop)) {
                        var jsDoc = prop.jsDoc || null;
                        var lastJsDoc = jsDoc ? jsDoc[jsDoc.length - 1] : null;
                        var name = prop.name.escapedText.toString();
                        if (ts.isObjectLiteralExpression(prop.initializer)) {
                            var result = makePropertyFromObjectLiteral(this.checker, prop.initializer, lastJsDoc);
                            properties.push({
                                name: name,
                                parentSymbol: symbol_1,
                                readonly: result.readonly,
                                static: _static,
                                type: result.type,
                                jsDoc: jsDoc
                            });
                        }
                        else {
                            properties.push({
                                name: name,
                                parentSymbol: symbol_1,
                                readonly: true,
                                static: _static,
                                type: getTypeString(this.checker, prop.initializer),
                                jsDoc: jsDoc
                            });
                        }
                    }
                }
            }
            var _class = this.classes.find(function (c) { return c.name === symbol_1; });
            if (!_class) {
                _class = {
                    constructorArgs: [],
                    global: true,
                    name: symbol_1,
                    properties: properties.slice()
                };
                this.classes.push(_class);
            }
            else {
                _class.properties = [].concat(_class.properties, properties);
            }
            return true;
        }
        return false;
    };
    ClassCollector.prototype._makeConstructorSpecs = function (node, body, name, constructorArgs) {
        var jsDoc = node.jsDoc;
        var lastJsDoc = jsDoc ? jsDoc[jsDoc.length - 1] : null;
        if (!body || !body.statements)
            return;
        /*
            -  Look for call of the true constructor
            function Test() {
                this.init.apply(this, arguments);
            }
        */
        var constructorProperty = null;
        for (var _i = 0, _a = body.statements; _i < _a.length; _i++) {
            var statement = _a[_i];
            if (ts.isExpressionStatement(statement)) {
                var str = statement.getText();
                if (str.match(/this\.(.+)\.apply\(this,/i)) {
                    constructorProperty = this.properties.find(function (p) { return p.parentSymbol === name && p.name === RegExp.$1; });
                    if (jsDoc)
                        constructorProperty.type = extractJsDocType(lastJsDoc, constructorProperty.type);
                }
            }
        }
        var constructorSignature = null;
        // - Didn't find a call to a pseudo constructor
        if (!constructorProperty) {
            constructorSignature = jsDoc
                ? extractJsDocType(lastJsDoc).replace(/\=\>.+/i, '')
                : "(" + constructorArgs.map(function (p) { return p.name + ": " + p.type; }).join(', ') + ")";
        }
        return {
            constructorSignature: constructorSignature,
            constructorProperty: constructorProperty,
            jsDoc: lastJsDoc
        };
    };
    return ClassCollector;
}());

var DTSWriter = /** @class */ (function () {
    function DTSWriter() {
    }
    DTSWriter.print = function (dts) {
        var printer = ts.createPrinter();
        var sourceFile = ts.createSourceFile('test.ts', dts, ts.ScriptTarget.ES2017, true, ts.ScriptKind.TS);
        return printer.printFile(sourceFile);
    };
    DTSWriter.make = function (classes, functions, properties) {
        var _this = this;
        var globals = classes.map(function (c) { return (c.global ? c : null); }).filter(function (v) { return !!v; });
        var text = '';
        if (Runner.options.guessTypes) {
            text += 'declare type Guess<T> = Partial<T>;\n';
        }
        if (globals.length > 0) {
            text = "declare global {\n            " + globals
                .map(function (c) { return "interface " + c.name + " {\n              " + c.properties
                .map(function (p) { return _this.propertyToString(p, true).replace('static', ''); })
                .join('\n') + "\n            }"; })
                .join('\n') + "\n        }\n        ";
        }
        var normal = classes.filter(function (c) { return !c.global; });
        var rootProps = properties.filter(function (p) { return !p.parentSymbol; });
        var namespace = Runner.options.namespace;
        if (namespace) {
            text += "export declare namespace " + namespace + "{\n            " + rootProps.map(function (p) { return "var " + p.name + ": " + _this.propertyTypeToString(p) + ";"; }).join('\n') + "\n            " + functions.map(function (f) { return _this.functionToString(f); }).join('\n') + "\n            " + normal.map(function (c) { return _this.classToString(c); }).join('\n') + "\n          }";
        }
        else {
            text += "\n            " + rootProps
                .map(function (p) { return "export var " + p.name + ": " + _this.propertyTypeToString(p) + ";"; })
                .join('\n') + "\n            " + functions.map(function (f) { return 'export ' + _this.functionToString(f); }).join('\n') + "\n            " + normal.map(function (c) { return 'export ' + _this.classToString(c); }).join('\n') + "\n          ";
        }
        return this.print(text);
    };
    DTSWriter.propertyToString = function (property, isMethod) {
        if (isMethod === void 0) { isMethod = false; }
        return ("" + (property.jsDoc && property.jsDoc.getText ? property.jsDoc.getText() + '\n' : '') + (property.static ? 'static ' : '') + (property.readonly ? 'readonly ' : '') + (isMethod
            ? "" + this.toMethodTypeString(property)
            : property.name + ": " + this.propertyTypeToString(property)) + ";").trim();
    };
    DTSWriter.propertyTypeToString = function (property) {
        return "" + (property.typeGuessing ? property.typeGuessing.toInlineString() : property.type);
    };
    DTSWriter.toMethodTypeString = function (property) {
        var str = this.propertyTypeToString(property);
        if (str.match(/^\((.*)\)\s*\=\>\s*(.+)/i)) {
            return property.name + "(" + RegExp.$1 + "): " + RegExp.$2;
        }
        return property.name + ": " + this.propertyTypeToString(property);
    };
    DTSWriter.classToString = function (_class) {
        var _this = this;
        var constructorDoc = _class.jsDoc && _class.jsDoc.getText ? _class.jsDoc.getText() : '';
        return "class " + _class.name + (_class.extends ? " extends " + _class.extends : '') + " {" + constructorDoc + "\n          " + (_class.constructorProperty
            ? "constructor" + _class.constructorProperty.type.replace(/ \=\>.+/i, '') + ";\n"
            : "constructor" + _class.constructorSignature + ";\n") + _class.properties
            .filter(function (p) { return p !== _class.constructorProperty; })
            .map(function (p) { return _this.propertyToString(p, true); })
            .join('\n\n') + "\n        }";
    };
    DTSWriter.functionToString = function (func) {
        var doc = func.jsDoc && func.jsDoc.getText ? func.jsDoc.getText() : '';
        return doc + "function " + func.name + func.constructorSignature + ";";
    };
    return DTSWriter;
}());

var Guess = /** @class */ (function () {
    function Guess(value, name) {
        this.value = value;
        this.name = name;
    }
    Guess.prototype.asTypeSymbol = function () {
        return "T" + (this.name[0].toUpperCase() + this.name.substr(1, this.name.length - 1));
    };
    Guess.prototype.asInterfaceSymbol = function () {
        return "I" + (this.name[0].toUpperCase() + this.name.substr(1, this.name.length - 1));
    };
    Guess.prototype.toInlineString = function () {
        return "Guess<" + this.value
            .map(function (v) { return util.inspect(v, true, Infinity); })
            .join(' | ')
            .replace(/\'(.*?)\'/gi, '$1') + ">";
    };
    Guess.prototype.toTypeString = function () {
        var interfaceStr = this.toInterfaceString();
        var typeSymbol = this.asTypeSymbol();
        var intSymbol = this.asInterfaceSymbol();
        return (interfaceStr + '\n' || '') + "type " + typeSymbol + " = Guess<" + this.value.map(function (v) {
            return typeof v === 'object' ? "" + intSymbol : v;
        }) + ">";
    };
    Guess.prototype.toInterfaceString = function () {
        var typings = this.value.find(function (v) { return typeof v === 'object'; });
        var intSymbol = this.asInterfaceSymbol();
        if (typings) {
            return "interface " + intSymbol + " {\n          " + Object.entries(typings)
                .map(function (_a) {
                var key = _a[0], value = _a[1];
                return key + ": " + util.inspect(value, true, Infinity) + ";";
            })
                .join('\n')
                .replace(/\'(.*?)\'/gi, '$1') + "\n        }";
        }
        return null;
    };
    return Guess;
}());
var TypeGuesser = /** @class */ (function () {
    function TypeGuesser() {
    }
    TypeGuesser.guess = function (program, properties, classes) {
        this.program = program;
        this.knownClasses = classes.filter(function (c) { return !c.global; });
        this.guessRootPropertiesType(properties);
        this.guessPropertiesFunctionType(properties);
        this.guessClassPropertiesType(classes);
    };
    TypeGuesser.guessRootPropertiesType = function (properties) {
        this.guessFromBody(this.program.getSourceFiles()[0], properties.filter(function (p) { return !p.parentSymbol; }));
    };
    TypeGuesser.guessPropertiesFunctionType = function (properties) {
        var _loop_1 = function (prop) {
            if (prop.rightNode && ts.isFunctionExpression(prop.rightNode)) {
                if (prop.type.match(/\((.+?)\)\s*\=\>\s*(.+)/i)) {
                    var props = [];
                    var paramsWithType = RegExp.$1.split(',');
                    var returnType = RegExp.$2.trim();
                    for (var _i = 0, paramsWithType_1 = paramsWithType; _i < paramsWithType_1.length; _i++) {
                        var p = paramsWithType_1[_i];
                        if (p.match(/(.+)\s*\:\s*(.+)/i)) {
                            var name = RegExp.$1.trim();
                            var type = RegExp.$2.trim();
                            props.push({
                                name: name,
                                type: type,
                                parentSymbol: null
                            });
                        }
                    }
                    var guessedTypes_1 = this_1.guessParametersType(prop.rightNode, props);
                    var resultType = "(" + props.map(function (p) {
                        return p.name + ": " + (guessedTypes_1[p.name] || p.type);
                    }) + ") => " + returnType;
                    prop.type = resultType;
                }
            }
        };
        var this_1 = this;
        for (var _i = 0, properties_1 = properties; _i < properties_1.length; _i++) {
            var prop = properties_1[_i];
            _loop_1(prop);
        }
    };
    TypeGuesser.guessClassPropertiesType = function (classes) {
        for (var _i = 0, classes_1 = classes; _i < classes_1.length; _i++) {
            var _class = classes_1[_i];
            var props = _class.properties.map(function (prop) {
                return __assign({}, prop, { name: 'this.' + prop.name });
            });
            for (var _a = 0, _b = _class.properties; _a < _b.length; _a++) {
                var prop = _b[_a];
                if (prop.rightNode && ts.isFunctionExpression(prop.rightNode)) {
                    this.guessFromBody(prop.rightNode, props);
                    //nodes.push(prop.rightNode);
                }
            }
            //console.log('props :', props);
            for (var i = 0; i < props.length; i++) {
                _class.properties[i].guessedType = props[i].guessedType;
                _class.properties[i].typeGuessing = props[i].typeGuessing;
                //console.log(classProp.name, ' ', props[i].typeGuessing);
            }
        }
    };
    TypeGuesser.guessClassConstructorTypes = function (_class) { };
    TypeGuesser.guessParametersType = function (node, props) {
        this.guessFromBody(node.body, props);
        var result = {};
        for (var _i = 0, props_1 = props; _i < props_1.length; _i++) {
            var prop = props_1[_i];
            if (prop.guessedType) {
                result[prop.name] = prop.guessedType;
            }
        }
        return result;
    };
    TypeGuesser.guessFromBody = function (body, properties) {
        var _this = this;
        var data = this.inferDataFromCallExpressions(body, properties);
        var assignedTypes = data.assignedTypes;
        var typings = __assign({}, this.typingFromAmbientUsage(body, properties), data.typings);
        body.forEachChild(function (node) {
            if (ts.isVariableStatement(node)) {
                var declaration = node.declarationList.declarations[0];
                var left_1 = declaration.name;
                var right = declaration.initializer;
                if (!right || !left_1)
                    return;
                var prop = properties.find(function (p) {
                    var regex = new RegExp("^" + p.name);
                    return !!left_1.getText().match(regex);
                });
                if (prop) {
                    _this.infer(prop, left_1, right, {
                        assignedTypes: assignedTypes,
                        typings: typings
                    });
                }
            }
            else if (ts.isExpressionStatement(node) && ts.isBinaryExpression(node.expression)) {
                var _a = node.expression, left_2 = _a.left, right = _a.right;
                if (!right || !left_2)
                    return;
                var prop = properties.find(function (p) {
                    var regex = new RegExp("^" + p.name);
                    return !!left_2.getText().match(regex);
                });
                if (prop) {
                    _this.infer(prop, left_2, right, {
                        assignedTypes: assignedTypes,
                        typings: typings
                    });
                }
            }
        });
        //console.log('typings :', typings);
        for (var _i = 0, properties_2 = properties; _i < properties_2.length; _i++) {
            var prop = properties_2[_i];
            var typingObj = this.inferFromKnownSymbols(typings[prop.name]);
            var usage = {};
            for (var _a = 0, _b = assignedTypes[prop.name] || []; _a < _b.length; _a++) {
                var type = _b[_a];
                var typeStr = typeof type === 'string' ? type : JSON.stringify(type);
                if (!usage[typeStr]) {
                    usage[typeStr] = 0;
                }
                usage[typeStr]++;
            }
            var mostAssignedTypes = Object.entries(usage)
                .sort(function (_a, _b) {
                var aKey = _a[0], aValue = _a[1];
                var bKey = _b[0], bValue = _b[1];
                return bValue - aValue;
            })
                .map(function (_a) {
                var key = _a[0], value = _a[1];
                return key;
            });
            var possibleTypes = [];
            for (var i = 0; i < 2; i++) {
                if (!mostAssignedTypes[i])
                    break;
                possibleTypes[i] = mostAssignedTypes[i];
            }
            var types = possibleTypes.filter(function (v) { return v !== 'any' && v !== '{}'; }).concat([
                typeof typingObj === 'object' ? this.Dot.object(typingObj) : typingObj
            ]).filter(function (v) {
                if (typeof v == 'object' && Object.keys(v).length == 0)
                    return false;
                return true;
            });
            if (types.length === 0)
                return;
            if (types.length === 1 && types[0] === prop.type)
                return;
            prop.typeGuessing = new Guess(types, prop.name);
            prop.guessedType = prop.typeGuessing.toInlineString();
        }
    };
    TypeGuesser.typingFromAmbientUsage = function (node, properties) {
        var typings = {};
        var text = node.getFullText();
        for (var _i = 0, properties_3 = properties; _i < properties_3.length; _i++) {
            var prop = properties_3[_i];
            typings[prop.name] = {};
            var str = "[^\\.](" + prop.name + "\\..+?)\\)*?[\\s;\\(\\[]";
            var regex = new RegExp(str, 'g');
            while (regex.exec(text)) {
                var matchStr = RegExp.$1.trim().replace(prop.name + '.', '');
                typings[prop.name][matchStr] = 'any';
            }
        }
        return typings;
    };
    TypeGuesser.inferDataFromCallExpressions = function (node, properties) {
        var typings = {};
        var assignedTypes = {};
        var expressions = collectNodesBy(this.program, function (node) {
            return ts.isCallExpression(node);
        });
        var typeChecker = this.program.getTypeChecker();
        for (var _i = 0, expressions_1 = expressions; _i < expressions_1.length; _i++) {
            var expr = expressions_1[_i];
            //console.log('expr :', expr);
            var propsAsArgs = expr.arguments.map(function (arg) {
                var props = [];
                var regex = new RegExp('\\b(\\S+)\\b', 'g');
                var _loop_3 = function () {
                    var str_1 = RegExp.$1.trim();
                    if (str_1.match(/^(.+)\..+/i) && RegExp.$1.trim() !== 'this') {
                        var prop = properties.find(function (p) { return str_1.startsWith(p.name); });
                        if (prop)
                            props.push({ propName: prop.name, str: str_1 });
                    }
                    else {
                        var prop = properties.find(function (p) { return p.name === str_1; });
                        if (prop)
                            props.push(prop);
                    }
                };
                while (regex.exec(arg.getText())) {
                    _loop_3();
                }
                return props;
                /*if (ts.isIdentifier(arg)) {
                  let prop = properties.find(p => p.name === arg.escapedText.toString());
                  return [prop] || null;
                } else {
                  let identifiers = collectNodesBy(
                    this.program,
                    (node: ts.Node) => ts.isIdentifier(node),
                    arg
                  ) as ts.Identifier[];
                  return identifiers.map(i => properties.find(p => p.name === i.escapedText.toString()));
                }*/
            });
            var symbol = typeChecker.getSymbolAtLocation(expr.expression);
            if (!symbol) {
                if (ts.isPropertyAccessExpression(expr.expression)) {
                    //console.log('need handling');
                    //let symbol = tc.getSymbolAtLocation(expr.expression.expression);
                    continue;
                }
                continue;
            }
            var type = typeChecker.getTypeOfSymbolAtLocation(symbol, expr);
            var str = typeChecker.typeToString(type);
            if (str.match(/^\((.+)\)\s*\=\>/i)) {
                var args = RegExp.$1.split(',');
                var _loop_2 = function (i) {
                    var props = propsAsArgs[i].filter(function (v) { return !!v; });
                    var argStr = args[i];
                    if (argStr && argStr.match(/.+\s*\:\s*(.+)/i)) {
                        var type_1 = RegExp.$1.trim();
                        if (type_1 !== 'any') {
                            props.forEach(function (prop) {
                                if (prop.propName) {
                                    if (!typings[prop.propName]) {
                                        typings[prop.propName] = {};
                                    }
                                    typings[prop.propName][prop.str.replace(prop.propName + '.', '')] = type_1;
                                }
                                else {
                                    if (Array.isArray(assignedTypes[prop.name])) {
                                        assignedTypes[prop.name].push(type_1);
                                    }
                                    else {
                                        assignedTypes[prop.name] = [type_1];
                                    }
                                }
                            });
                        }
                    }
                };
                for (var i = 0; i < propsAsArgs.length; i++) {
                    _loop_2(i);
                }
            }
        }
        return {
            assignedTypes: assignedTypes,
            typings: typings
        };
    };
    TypeGuesser.infer = function (prop, left, right, data) {
        var assignedTypes = data.assignedTypes, typings = data.typings;
        var leftStr = left.getText();
        var type = getTypeString(this.program.getTypeChecker(), right);
        /**
         * If an object literal is found, it is converted to an object
         * so that we can infer the proper type
         */
        if (ts.isObjectLiteralExpression(right)) {
            type = this.inferFromKnownSymbols(objectLiteralToObject(right));
        }
        if (leftStr.match(/^(.+?)\./i)) {
            if (!typings[prop.name]) {
                typings[prop.name] = {};
            }
            typings[prop.name][leftStr.replace(prop.name + '.', '')] = type;
        }
        else {
            if (!assignedTypes[prop.name]) {
                assignedTypes[prop.name] = [];
            }
            assignedTypes[prop.name].push(type);
        }
    };
    TypeGuesser.inferFromKnownSymbols = function (typings, root) {
        if (root === void 0) { root = true; }
        if (root) {
            var sym = '_$$$_';
            var inferObj = {};
            inferObj[sym] = typings;
            this.inferFromKnownSymbols(inferObj, false);
            return inferObj[sym];
        }
        var _loop_4 = function (key, value) {
            if (typeof value === 'object') {
                var keys_1 = Object.keys(value);
                var matchingSymbols = this_2.knownClasses
                    .map(function (s) {
                    var matchingProps = s.properties.map(function (p) { return keys_1.includes(p.name); }).filter(function (v) { return !!v; });
                    return matchingProps.length > 0 ? s : null;
                })
                    .filter(function (v) { return !!v; })
                    .sort(function (a, b) {
                    var nbrPropsA = a.properties.map(function (p) { return keys_1.includes(p.name); }).filter(function (v) { return !!v; }).length;
                    var nbrPropsB = b.properties.map(function (p) { return keys_1.includes(p.name); }).filter(function (v) { return !!v; }).length;
                    return nbrPropsB - nbrPropsA;
                });
                if (matchingSymbols.length > 0 && keys_1.length) {
                    var symb = matchingSymbols[0];
                    if (keys_1.length <= symb.properties.length) {
                        //const partial = symb.properties.length > keys.length;
                        //typings[key] = partial ? `Partial<${symb.name}>` : symb.name;
                        typings[key] = symb.name;
                        return "continue";
                    }
                }
                this_2.inferFromKnownSymbols(value, false);
            }
        };
        var this_2 = this;
        for (var _i = 0, _a = Object.entries(typings); _i < _a.length; _i++) {
            var _b = _a[_i], key = _b[0], value = _b[1];
            _loop_4(key, value);
        }
    };
    TypeGuesser.symbol = Symbol();
    TypeGuesser.Dot = new DotObject('.', true);
    TypeGuesser.knownClasses = [];
    return TypeGuesser;
}());
// const str = ts.generateTypesForGlobal('test', { name: 'hi', val: 1, add: (a, b) => a + b }, {});
// const program = Runner.makeProgram({
//   fileName: 'test.ts',
//   content: `
//   var myVar = {};
//   myVar.hello = {};
//   myVar.hello.world = true;
//   myVar.hey = "what?";
//   myVar.aVal = 5;
//   Math.round(myVar);
//   function MyClass(a, b) {
//     this.myProp = {};
//     this.myProp.x = 0;
//     this.myProp.y = 0;
//     this.myNbr = null;
//   }
//   MyClass.prototype.myMethod = function(a, b) {
//     Math.round(this.myNbr);
//     return Math.round(a);
//   }
//   `
// });
// TypeGuesser.program = program;
// const props: Property[] = [
//   {
//     name: 'myVar',
//     type: 'any',
//     parentSymbol: null
//   }
// ];
// //TypeGuesser.guessFromBody(program.getSourceFiles()[0].statements as any, props);
// //console.log('props :', props);
// TypeGuesser.guessClassPropertiesType([
//   {
//     name: 'MyClass',
//     constructorArgs: [],
//     properties: [
//       {
//         name: 'myProp',
//         parentSymbol: 'MyClass',
//         type: 'any'
//       },
//       {
//         name: 'myNbr',
//         parentSymbol: 'MyClass',
//         type: 'any'
//       }
//     ]
//   }
// ]);
/*
let result = utils.collectVariableUsage(program.getSourceFiles()[0]);
let entries = result.entries();
let tab;
while(tab = entries.next().value) {
  let [key, value]: [ts.Identifier, VariableInfo] = tab;
  if(key.escapedText.toString() === 'MyClass') {
    console.log("---");
    //console.log('key :', key);
    console.log('value :', value);
  }
}
*/

var MockupWriter = /** @class */ (function () {
    function MockupWriter() {
    }
    MockupWriter.print = function (dts) {
        var printer = ts.createPrinter();
        var sourceFile = ts.createSourceFile('test.ts', dts, ts.ScriptTarget.ES2017, true, ts.ScriptKind.TS);
        return printer.printFile(sourceFile);
    };
    MockupWriter.make = function (classes, functions, properties) {
        var _this = this;
        var text = '';
        if (Runner.options.guessTypes) {
            text += 'declare type Guess<T> = Partial<T>;\n';
        }
        var normal = classes.filter(function (c) { return !c.global; });
        var rootProps = properties.filter(function (p) { return !p.parentSymbol; });
        var namespace = Runner.options.namespace;
        if (namespace) {
            text += "export declare namespace " + namespace + "{\n            " + rootProps.map(function (p) { return "var " + p.name + ": " + _this.propertyTypeToString(p) + ";"; }).join('\n') + "\n            " + functions.map(function (f) { return _this.functionToString(f); }).join('\n') + "\n            " + normal.map(function (c) { return _this.classToString(c); }).join('\n') + "\n          }";
        }
        else {
            text += "\n            " + rootProps
                .map(function (p) { return "export var " + p.name + ": " + _this.propertyTypeToString(p) + ";"; })
                .join('\n') + "\n            " + functions.map(function (f) { return 'export ' + _this.functionToString(f); }).join('\n') + "\n            " + normal.map(function (c) { return 'export ' + _this.classToString(c); }).join('\n') + "\n          ";
        }
        return this.print(text);
    };
    MockupWriter.propertyToString = function (property, isMethod) {
        if (isMethod === void 0) { isMethod = false; }
        return ("" + (property.jsDoc && property.jsDoc.getText ? property.jsDoc.getText() + '\n' : '') + (property.static ? 'static ' : '') + (property.readonly ? 'readonly ' : '') + (isMethod
            ? "" + this.toMethodTypeString(property)
            : property.name + ": " + this.propertyTypeToString(property))).trim();
    };
    MockupWriter.propertyTypeToString = function (property) {
        return "" + (property.typeGuessing ? property.typeGuessing.toInlineString() : property.type);
    };
    MockupWriter.toMethodTypeString = function (property) {
        var str = this.propertyTypeToString(property);
        if (str.match(/^\((.*)\)\s*\=\>\s*(.+)/i)) {
            var returnType = RegExp.$2.trim();
            if (returnType !== 'void') {
                return property.name + "(" + RegExp.$1 + "): " + returnType + " { return null; }";
            }
            return property.name + "(" + RegExp.$1 + "): " + returnType + " {}";
        }
        return property.name + ": " + this.propertyTypeToString(property);
    };
    MockupWriter.classToString = function (_class) {
        var _this = this;
        var constructorDoc = _class.jsDoc && _class.jsDoc.getText ? _class.jsDoc.getText() : '';
        return "class " + _class.name + (_class.extends ? " extends " + _class.extends : '') + " {" + constructorDoc + "\n          " + (_class.constructorProperty
            ? "constructor" + _class.constructorProperty.type.replace(/ \=\>.+/i, '') + " {}\n"
            : "constructor" + _class.constructorSignature + " {}\n") + _class.properties
            .filter(function (p) { return p !== _class.constructorProperty; })
            .map(function (p) { return _this.propertyToString(p, true); })
            .join('\n\n') + "\n        }";
    };
    MockupWriter.functionToString = function (func) {
        var doc = func.jsDoc && func.jsDoc.getText ? func.jsDoc.getText() : '';
        return doc + "function " + func.name + func.constructorSignature + " { return null; }";
    };
    return MockupWriter;
}());

var Runner = /** @class */ (function () {
    function Runner() {
    }
    Runner.makeProgram = function (files) {
        var lib = {
            content: fs.readFileSync(path.resolve(__dirname, '../lib/lib.es5.d.ts')).toString(),
            fileName: 'lib.es2018.d.ts'
        };
        return createProgram(files.concat([lib]), {});
    };
    Runner.run = function (options, files, fileName, callerPath, mode) {
        if (mode === void 0) { mode = 'write'; }
        this.options = options;
        try {
            var program_1 = this.makeProgram(files);
            var properties_1 = this._runPhase('Collecting properties', function () {
                return new PropertyCollector().collect(program_1);
            });
            var builtData_1 = this._runPhase('Collecting pseudo classes', function () {
                return new ClassCollector().collect(program_1, properties_1);
            });
            if (options.guessTypes) {
                this._runPhase('Guessing properties typings', function () {
                    TypeGuesser.guess(program_1, properties_1, builtData_1.classes);
                });
            }
            var text = this._runPhase('Generating & writing result', function () {
                var result;
                var resultFileName;
                if (options.mockupMode) {
                    result = MockupWriter.make(builtData_1.classes, builtData_1.functions, properties_1);
                    resultFileName = fileName.replace(/\.(t|j)s/i, '') + '.ts';
                }
                else {
                    result = DTSWriter.make(builtData_1.classes, builtData_1.functions, properties_1);
                    resultFileName = fileName.replace(/\.(t|j)s/i, '') + '.d.ts';
                }
                if (resultFileName && mode === 'write') {
                    fs.writeFileSync(path.resolve(callerPath, resultFileName), result);
                }
                return result;
            });
            this.result = {
                builtData: builtData_1,
                properties: properties_1
            };
            if (mode === 'write') {
                var hasError = ErrorLogger.archive.length > 0;
                if (hasError) {
                    var readline_1 = Readline.createInterface({
                        input: process.stdin,
                        output: process.stdout
                    });
                    readline_1.question("Show error logs? (y/n): ", function (value) {
                        if (value && value[0].toLowerCase().trim() === 'y') {
                            console.log(ErrorLogger.display(program_1));
                        }
                        readline_1.close();
                    });
                }
            }
            return text;
        }
        catch (error) {
            console.log('An unexpected error occurred.');
            throw error;
        }
    };
    Runner._runPhase = function (message, func) {
        var spinner = ora(message).start();
        var result = func();
        var hasError = ErrorLogger.logs.length > 0;
        if (hasError) {
            spinner.fail(message + " | " + ErrorLogger.logs.length + " error(s)");
        }
        else {
            spinner.succeed();
        }
        ErrorLogger.store();
        return result;
    };
    Runner.options = {};
    return Runner;
}());

var version = "1.1.2";

var cli = require('commander');
cli
    .version(version)
    .option('-n, --namespace [namespace]', 'Wrap the file into a namespace')
    .option('-a, --all-files [outputName]', 'Process all files in the directory and output a single d.ts')
    .option('-b, --bundled-output', 'When -a is used, bundle the output into a single file')
    .option('-r, --root-variables', 'Collect root variables')
    .option('-g, --guess-types', 'Guess types')
    .option('-m, --mockup', 'Generate a mockup of the definition file instead of a d.ts')
    .parse(process.argv);
var callerPath = process.cwd();
var fileName;
var namespace = cli.namespace;
var files = [];
if (cli.allFiles) {
    fileName = cli.outputName || 'output';
    var filesName = fs.readdirSync(callerPath);
    var i = 1;
    for (var _i = 0, filesName_1 = filesName; _i < filesName_1.length; _i++) {
        var fileName_1 = filesName_1[_i];
        files.push({
            content: fs.readFileSync(path.resolve(callerPath, fileName_1)).toString(),
            fileName: "file" + i + ".ts"
        });
        i++;
    }
}
else {
    fileName = process.argv[2];
    files.push({
        content: fs.readFileSync(path.resolve(callerPath, fileName)).toString(),
        fileName: 'file1.ts'
    });
}
Runner.run({
    namespace: namespace,
    allFiles: cli.allFiles,
    collectRootVariables: cli.rootVariables,
    guessTypes: cli.guessTypes,
    mockupMode: cli.mockup
}, files, fileName, callerPath);
