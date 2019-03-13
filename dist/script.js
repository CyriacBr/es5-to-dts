#!/usr/bin/env node
'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var ts = require('typescript');
var fs = require('fs');
var path = require('path');
var util = require('util');
var chalk = _interopDefault(require('chalk'));
var Beautify = require('js-beautify');
var ora = _interopDefault(require('ora'));
var Readline = require('readline');

var _namespace = 'MyNamespace';
var setNamespace = function (name) { return (_namespace = name); };
var getNamespace = function () { return _namespace; };
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
    PropertyCollector.prototype._visit = function (node) {
        try {
            if (ts.isVariableStatement(node)) {
                this._onVariableStatement(node);
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
    PropertyCollector.prototype._onVariableStatement = function (node) {
        for (var _i = 0, _a = node.declarationList.declarations; _i < _a.length; _i++) {
            var declaration = _a[_i];
            if (declaration.initializer) {
                if (ts.isFunctionExpression(declaration.initializer) ||
                    getTypeString(this.checker, declaration.initializer).match(/^\(.+\)\s*\=\>/))
                    continue;
            }
            if (ts.isIdentifier(declaration.name))
                this.localVariables.push(declaration.name.escapedText.toString());
        }
    };
    PropertyCollector.prototype._onFunctionDeclaration = function (node) {
        var name = node.name.escapedText.toString();
        var statements = node.body.statements;
        for (var _i = 0, statements_1 = statements; _i < statements_1.length; _i++) {
            var statement = statements_1[_i];
            this.state.parentSymbol = name;
            this.state.fromStatic = false;
            this._visit(statement);
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
                linkedToFunction: ts.isIdentifier(expr.right) ? expr.right.escapedText.toString() : null
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
            var _class = this_1.classes.find(function (c) { return c.name === p.parentSymbol; });
            if (!_class) {
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
    DTSWriter.make = function (classes, functions) {
        var _this = this;
        var globals = classes.map(function (c) { return (c.global ? c : null); }).filter(function (v) { return !!v; });
        var text = '';
        if (globals.length > 0) {
            text = "declare global {\n            " + globals
                .map(function (c) { return "interface " + c.name + " {\n              " + c.properties.map(function (p) { return _this.propertyToString(p).replace('static', ''); }).join('\n') + "\n            }"; })
                .join('\n') + "\n        }\n        ";
        }
        var normal = classes.filter(function (c) { return !c.global; });
        text += "export declare namespace " + getNamespace() + "{\n          " + functions.map(function (f) { return _this.functionToString(f); }).join('\n') + "\n          " + normal.map(function (c) { return _this.classToString(c); }).join('\n') + "\n        }";
        return Beautify.js(text);
    };
    DTSWriter.propertyToString = function (property) {
        return ("" + (property.jsDoc && property.jsDoc.getText ? property.jsDoc.getText() + '\n' : '') + (property.static ? 'static ' : '') + (property.readonly ? 'readonly ' : '') + property.name + ": " + property.type + ";").trim();
    };
    DTSWriter.classToString = function (_class) {
        var _this = this;
        var constructorDoc = _class.jsDoc && _class.jsDoc.getText ? _class.jsDoc.getText() : '';
        return "class " + _class.name + (_class.extends ? " extends " + _class.extends : '') + " {" + constructorDoc + "\n          " + (_class.constructorProperty
            ? "new " + _class.constructorProperty.type.replace(/ \=\>.+/i, '') + ";\n"
            : "new " + _class.constructorSignature + ";\n") + _class.properties
            .filter(function (p) { return p !== _class.constructorProperty; })
            .map(function (p) { return _this.propertyToString(p); })
            .join('\n\n') + "\n        }";
    };
    DTSWriter.functionToString = function (func) {
        var doc = func.jsDoc && func.jsDoc.getText ? func.jsDoc.getText() : '';
        return doc + "function " + func.name + func.constructorSignature + ";";
    };
    return DTSWriter;
}());

var Runner = /** @class */ (function () {
    function Runner() {
    }
    Runner.run = function (namespace, file, fileName, callerPath, mode) {
        if (namespace === void 0) { namespace = 'UnknownNamespace'; }
        if (mode === void 0) { mode = 'write'; }
        setNamespace(namespace);
        try {
            var lib = {
                content: fs.readFileSync(path.resolve(__dirname, '../lib/lib.es5.d.ts')).toString(),
                fileName: 'lib.es2018.d.ts'
            };
            var program_1 = createProgram([file, lib], {});
            var properties_1 = this._runPhase('Collecting properties', function () {
                return new PropertyCollector().collect(program_1);
            });
            var builtData_1 = this._runPhase('Collecting pseudo classes', function () {
                return new ClassCollector().collect(program_1, properties_1);
            });
            var text = this._runPhase('Generating & writing result', function () {
                var result = DTSWriter.make(builtData_1.classes, builtData_1.functions);
                if (mode === 'write') {
                    var resultFileName = fileName.replace(/\.(t|j)s/i, '') + '.d.ts';
                    fs.writeFileSync(path.resolve(callerPath, resultFileName), result);
                }
                return result;
            });
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
    return Runner;
}());

var callerPath = process.cwd();
var fileName = process.argv[2];
var namespace = process.argv[3];
setNamespace(namespace || 'UnknownNamespace');
var file = {
    content: fs.readFileSync(path.resolve(callerPath, fileName)).toString(),
    fileName: 'file1.ts'
};
Runner.run(namespace, file, fileName, callerPath);
