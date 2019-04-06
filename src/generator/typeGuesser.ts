import * as ts from 'typescript';
import { Property } from './propertyCollector';
import { getTypeString, objectLiteralToObject, traverseProgram, collectNodesBy } from '../utils';
import * as DotObject from 'dot-object';
import * as util from 'util';
import { PseudoClass } from './classCollector';

export class Guess {
  value: any[];
  name: string;
  constructor(value: any[], name: string) {
    this.value = value;
    this.name = name;
  }

  asTypeSymbol() {
    return `T${this.name[0].toUpperCase() + this.name.substr(1, this.name.length - 1)}`;
  }

  asInterfaceSymbol() {
    return `I${this.name[0].toUpperCase() + this.name.substr(1, this.name.length - 1)}`;
  }

  toInlineString() {
    return `Guess<${this.value
      .map(v => util.inspect(v, true, Infinity))
      .join(' | ')
      .replace(/\'(.*?)\'/gi, '$1')}>`;
  }

  toTypeString() {
    const interfaceStr = this.toInterfaceString();
    const typeSymbol = this.asTypeSymbol();
    const intSymbol = this.asInterfaceSymbol();
    return `${interfaceStr + '\n' || ''}type ${typeSymbol} = Guess<${this.value.map(v =>
      typeof v === 'object' ? `${intSymbol}` : v
    )}>`;
  }

  toInterfaceString() {
    const typings = this.value.find(v => typeof v === 'object');
    const intSymbol = this.asInterfaceSymbol();
    if (typings) {
      return `interface ${intSymbol} {
          ${Object.entries(typings)
            .map(([key, value]) => `${key}: ${util.inspect(value, true, Infinity)};`)
            .join('\n')
            .replace(/\'(.*?)\'/gi, '$1')}
        }`;
    }
    return null;
  }
}

export interface InferData {
  assignedTypes: { [propName: string]: any[] };
  typings: { [propName: string]: any };
}

export class TypeGuesser {
  static symbol = Symbol();
  static Dot = new DotObject('.', true);
  static program: ts.Program;
  static knownClasses: PseudoClass[] = [];

  static guess(program: ts.Program, properties: Property[], classes: PseudoClass[]) {
    this.program = program;
    this.knownClasses = classes.filter(c => !c.global);
    this.guessRootPropertiesType(properties);
    this.guessPropertiesFunctionType(properties);
    this.guessClassPropertiesType(classes);
  }

  static guessRootPropertiesType(properties: Property[]) {
    this.guessFromBody(this.program.getSourceFiles()[0], properties.filter(p => !p.parentSymbol));
  }

  static guessPropertiesFunctionType(properties: Property[]) {
    for (let prop of properties) {
      if (prop.rightNode && ts.isFunctionExpression(prop.rightNode)) {
        if (prop.type.match(/\((.+?)\)\s*\=\>\s*(.+)/i)) {
          const props: Property[] = [];
          const paramsWithType = RegExp.$1.split(',');
          const returnType = RegExp.$2.trim();
          for (const p of paramsWithType) {
            if (p.match(/(.+)\s*\:\s*(.+)/i)) {
              const name = RegExp.$1.trim();
              const type = RegExp.$2.trim();
              props.push({
                name,
                type,
                parentSymbol: null
              });
            }
          }
          const guessedTypes = this.guessParametersType(prop.rightNode, props);
          let resultType = `(${props.map(p => {
            return `${p.name}: ${guessedTypes[p.name] || p.type}`;
          })}) => ${returnType}`;
          prop.type = resultType;
        }
      }
    }
  }

  static guessClassPropertiesType(classes: PseudoClass[]) {
    for (const _class of classes) {
      let props: Property[] = _class.properties.map(prop => {
        return {
          ...prop,
          name: 'this.' + prop.name
        };
      });
      for (const prop of _class.properties) {
        if (prop.rightNode && ts.isFunctionExpression(prop.rightNode)) {
          this.guessFromBody(prop.rightNode, props);
          //nodes.push(prop.rightNode);
        }
      }
      //console.log('props :', props);
      for (let i = 0; i < props.length; i++) {
        _class.properties[i].guessedType = props[i].guessedType;
        _class.properties[i].typeGuessing = props[i].typeGuessing;
        //console.log(classProp.name, ' ', props[i].typeGuessing);
      }
    }
  }

  static guessClassConstructorTypes(_class: PseudoClass) {}

  static guessParametersType(node: ts.FunctionExpression, props: Property[]) {
    this.guessFromBody(node.body, props);
    const result: { [propName: string]: string } = {};
    for (const prop of props) {
      if (prop.guessedType) {
        result[prop.name] = prop.guessedType;
      }
    }
    return result;
  }

  static guessFromBody(body: ts.Node, properties: Property[]) {
    const data = this.inferDataFromCallExpressions(body, properties);
    const assignedTypes = data.assignedTypes;
    const typings = {
      ...this.typingFromAmbientUsage(body, properties),
      ...data.typings
    };
    body.forEachChild(node => {
      if (ts.isVariableStatement(node)) {
        const declaration = node.declarationList.declarations[0];
        const left = declaration.name;
        const right = declaration.initializer;
        if (!right || !left) return;
        const prop = properties.find(p => {
          const regex = new RegExp(`^${p.name}`);
          return !!left.getText().match(regex);
        });
        if (prop) {
          this.infer(prop, left, right, {
            assignedTypes,
            typings
          });
        }
      } else if (ts.isExpressionStatement(node) && ts.isBinaryExpression(node.expression)) {
        const { left, right } = node.expression;
        if (!right || !left) return;
        const prop = properties.find(p => {
          const regex = new RegExp(`^${p.name}`);
          return !!left.getText().match(regex);
        });
        if (prop) {
          this.infer(prop, left, right, {
            assignedTypes,
            typings
          });
        }
      }
    });
    //console.log('typings :', typings);
    for (const prop of properties) {
      const typingObj = this.inferFromKnownSymbols(typings[prop.name]);
      const usage = {};
      for (const type of assignedTypes[prop.name] || []) {
        let typeStr = typeof type === 'string' ? type : JSON.stringify(type);
        if (!usage[typeStr]) {
          usage[typeStr] = 0;
        }
        usage[typeStr]++;
      }
      const mostAssignedTypes = Object.entries(usage)
        .sort(([aKey, aValue], [bKey, bValue]) => {
          return (bValue as number) - (aValue as number);
        })
        .map(([key, value]) => key);
      const possibleTypes = [];
      for (let i = 0; i < 2; i++) {
        if (!mostAssignedTypes[i]) break;
        possibleTypes[i] = mostAssignedTypes[i];
      }
      const types = [
        ...possibleTypes.filter(v => v !== 'any' && v !== '{}'),
        typeof typingObj === 'object' ? this.Dot.object(typingObj) : typingObj
      ].filter(v => {
        if (typeof v == 'object' && Object.keys(v).length == 0) return false;
        return true;
      });
      if (types.length === 0) return;
      if (types.length === 1 && types[0] === prop.type) return;
      prop.typeGuessing = new Guess(types, prop.name);
      prop.guessedType = prop.typeGuessing.toInlineString();
    }
  }

  static typingFromAmbientUsage(node: ts.Node, properties: Property[]) {
    const typings = {};
    const text = node.getFullText();
    for (const prop of properties) {
      typings[prop.name] = {};
      const str = `[^\\.](${prop.name}\\..+?)\\)*?[\\s;\\(\\[]`;
      const regex = new RegExp(str, 'g');
      while (regex.exec(text)) {
        const matchStr = RegExp.$1.trim().replace(prop.name + '.', '');
        typings[prop.name][matchStr] = 'any';
      }
    }
    return typings;
  }

  static inferDataFromCallExpressions(node: ts.Node, properties: Property[]) {
    const typings = {};
    const assignedTypes = {};
    const expressions: ts.CallExpression[] = collectNodesBy(this.program, (node: ts.Node) =>
      ts.isCallExpression(node)
    );
    const typeChecker = this.program.getTypeChecker();
    for (const expr of expressions) {
      //console.log('expr :', expr);
      let propsAsArgs = expr.arguments.map(arg => {
        let props: (Property | { propName: string; str: string })[] = [];
        let regex = new RegExp('\\b(\\S+)\\b', 'g');
        while (regex.exec(arg.getText())) {
          let str = RegExp.$1.trim();
          if (str.match(/^(.+)\..+/i) && RegExp.$1.trim() !== 'this') {
            let prop = properties.find(p => str.startsWith(p.name));
            if (prop) props.push({ propName: prop.name, str });
          } else {
            let prop = properties.find(p => p.name === str);
            if (prop) props.push(prop);
          }
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
      let symbol = typeChecker.getSymbolAtLocation(expr.expression);
      if (!symbol) {
        if (ts.isPropertyAccessExpression(expr.expression)) {
          //console.log('need handling');
          //let symbol = tc.getSymbolAtLocation(expr.expression.expression);
          continue;
        }
        continue;
      }
      let type = typeChecker.getTypeOfSymbolAtLocation(symbol, expr);
      let str = typeChecker.typeToString(type);
      if (str.match(/^\((.+)\)\s*\=\>/i)) {
        let args = RegExp.$1.split(',');
        for (let i = 0; i < propsAsArgs.length; i++) {
          let props = propsAsArgs[i].filter(v => !!v);
          let argStr = args[i];
          if (argStr && argStr.match(/.+\s*\:\s*(.+)/i)) {
            let type = RegExp.$1.trim();
            if (type !== 'any') {
              props.forEach((prop: any) => {
                if (prop.propName) {
                  if (!typings[prop.propName]) {
                    typings[prop.propName] = {};
                  }
                  typings[prop.propName][prop.str.replace(prop.propName + '.', '')] = type;
                } else {
                  if (Array.isArray(assignedTypes[prop.name])) {
                    assignedTypes[prop.name].push(type);
                  } else {
                    assignedTypes[prop.name] = [type];
                  }
                }
              });
            }
          }
        }
      }
    }
    return {
      assignedTypes,
      typings
    };
  }

  static infer(prop: Property, left: ts.Node, right: ts.Node, data: InferData) {
    const { assignedTypes, typings } = data;
    const leftStr = left.getText();
    let type: any = getTypeString(this.program.getTypeChecker(), right);
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
    } else {
      if (!assignedTypes[prop.name]) {
        assignedTypes[prop.name] = [];
      }
      assignedTypes[prop.name].push(type);
    }
  }

  static inferFromKnownSymbols(typings: any, root: boolean = true) {
    if (root) {
      const sym = '_$$$_';
      const inferObj = {};
      inferObj[sym] = typings;
      this.inferFromKnownSymbols(inferObj, false);
      return inferObj[sym];
    }
    for (const [key, value] of Object.entries(typings)) {
      if (typeof value === 'object') {
        const keys = Object.keys(value);
        const matchingSymbols = this.knownClasses
          .map(s => {
            const matchingProps = s.properties.map(p => keys.includes(p.name)).filter(v => !!v);
            return matchingProps.length > 0 ? s : null;
          })
          .filter(v => !!v)
          .sort((a, b) => {
            const nbrPropsA = a.properties.map(p => keys.includes(p.name)).filter(v => !!v).length;
            const nbrPropsB = b.properties.map(p => keys.includes(p.name)).filter(v => !!v).length;
            return nbrPropsB - nbrPropsA;
          });
        if (matchingSymbols.length > 0 && keys.length) {
          const symb = matchingSymbols[0];
          if (keys.length <= symb.properties.length) {
            //const partial = symb.properties.length > keys.length;
            //typings[key] = partial ? `Partial<${symb.name}>` : symb.name;
            typings[key] = symb.name;
            continue;
          }
        }
        this.inferFromKnownSymbols(value, false);
      }
    }
  }
}

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
