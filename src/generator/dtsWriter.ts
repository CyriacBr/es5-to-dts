import { PseudoClass } from './classCollector';
import { Property } from './propertyCollector';
import { getNamespace } from '../utils';
import * as Beautify from 'js-beautify';

export class DTSWriter {
    static make(classes: PseudoClass[], functions: PseudoClass[]): string {
        const globals = classes.map(c => (c.global ? c : null)).filter(v => !!v);
        let text = '';
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
        text += `export declare namespace ${getNamespace()}{
          ${functions.map(f => this.functionToString(f)).join('\n')}
          ${normal.map(c => this.classToString(c)).join('\n')}
        }`;
        return Beautify.js(text);
      }

      static propertyToString(property: Property) {
        return `${property.jsDoc && property.jsDoc.getText ? property.jsDoc.getText() + '\n' : ''}${
          property.static ? 'static ' : ''
        }${property.readonly ? 'readonly ' : ''}${property.name}: ${property.type};`.trim();
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