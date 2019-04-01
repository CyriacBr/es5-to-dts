import { PseudoClass } from './classCollector';
import { Property } from './propertyCollector';
import { Runner } from './runner';
import * as ts from 'typescript';

export class DTSWriter {
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
    const globals = classes.map(c => (c.global ? c : null)).filter(v => !!v);
    let text = '';
    if (Runner.options.guessTypes) {
      text += 'type Guess<T> = Partial<T>;\n';
    }
    if (globals.length > 0) {
      text = `declare global {
            ${globals
              .map(
                c => `interface ${c.name} {
              ${c.properties.map(p => this.propertyToString(p).replace('static', '')).join('\n')}
            }`
              )
              .join('\n')}
        }
        `;
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

  static propertyToString(property: Property) {
    return `${property.jsDoc && property.jsDoc.getText ? property.jsDoc.getText() + '\n' : ''}${
      property.static ? 'static ' : ''
    }${property.readonly ? 'readonly ' : ''}${property.name}: ${property.type};`.trim();
  }

  static propertyTypeToString(property: Property) {
    return `${property.typeGuessing ? property.typeGuessing.toInlineString() : property.type}`;
  }

  static classToString(_class: PseudoClass) {
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
      .map(p => this.propertyToString(p))
      .join('\n\n')}
        }`;
  }

  static functionToString(func: PseudoClass) {
    const doc = func.jsDoc && func.jsDoc.getText ? func.jsDoc.getText() : '';
    return `${doc}function ${func.name}${func.constructorSignature};`;
  }
}
