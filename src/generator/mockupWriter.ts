import { PseudoClass } from './classCollector';
import { Property } from './propertyCollector';
import { Runner } from './runner';
import * as ts from 'typescript';

export class MockupWriter {
  static print(dts: string) {
    const printer: ts.Printer = ts.createPrinter();
    const sourceFile: ts.SourceFile = ts.createSourceFile(
      'test.ts',
      dts,
      ts.ScriptTarget.ES2017,
      true,
      ts.ScriptKind.TS
    );
    return printer.printFile(sourceFile);
  }

  static make(classes: PseudoClass[], functions: PseudoClass[], properties: Property[]): string {
    let text = '';
    if (Runner.options.guessTypes) {
      text += 'declare type Guess<T> = Partial<T>;\n';
    }
    const normal = classes.filter(c => !c.global);
    const rootProps = properties.filter(p => !p.parentSymbol);
    const namespace = Runner.options.namespace;
    if (namespace) {
      text += `export declare namespace ${namespace}{
            ${rootProps.map(p => `var ${p.name}: ${this.propertyTypeToString(p)};`).join('\n')}
            ${functions.map(f => this.functionToString(f)).join('\n')}
            ${normal.map(c => this.classToString(c)).join('\n')}
          }`;
    } else {
      text += `
            ${rootProps
              .map(p => `export var ${p.name}: ${this.propertyTypeToString(p)};`)
              .join('\n')}
            ${functions.map(f => 'export ' + this.functionToString(f)).join('\n')}
            ${normal.map(c => 'export ' + this.classToString(c)).join('\n')}
          `;
    }
    return this.print(text);
  }

  static propertyToString(property: Property, isMethod = false) {
    return `${property.jsDoc && property.jsDoc.getText ? property.jsDoc.getText() + '\n' : ''}${
      property.static ? 'static ' : ''
    }${property.readonly ? 'readonly ' : ''}${
      isMethod
        ? `${this.toMethodTypeString(property)}`
        : `${property.name}: ${this.propertyTypeToString(property)}`
    };`.trim();
  }

  static propertyTypeToString(property: Property) {
    return `${property.typeGuessing ? property.typeGuessing.toInlineString() : property.type}`;
  }

  static toMethodTypeString(property: Property) {
    let str = this.propertyTypeToString(property);
    if (str.match(/^\((.*)\)\s*\=\>\s*(.+)/i)) {
      let returnType = RegExp.$2.trim();
      if (returnType !== 'void') {
        return `${property.name}(${RegExp.$1}): ${returnType} { return null; }`;
      }
      return `${property.name}(${RegExp.$1}): ${returnType} {}`;
    }
    return `${property.name}: ${this.propertyTypeToString(property)}`;
  }

  static classToString(_class: PseudoClass) {
    const constructorDoc = _class.jsDoc && _class.jsDoc.getText ? _class.jsDoc.getText() : '';
    return `class ${_class.name}${
      _class.extends ? ` extends ${_class.extends}` : ''
    } {${constructorDoc}
          ${
            _class.constructorProperty
              ? `constructor${_class.constructorProperty.type.replace(/ \=\>.+/i, '')} {};\n`
              : `constructor${_class.constructorSignature} {};\n`
          }${_class.properties
      .filter(p => p !== _class.constructorProperty)
      .map(p => this.propertyToString(p, true))
      .join('\n\n')}
        }`;
  }

  static functionToString(func: PseudoClass) {
    const doc = func.jsDoc && func.jsDoc.getText ? func.jsDoc.getText() : '';
    return `${doc}function ${func.name}${func.constructorSignature} { return null; };`;
  }
}
