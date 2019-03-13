import { PseudoClass } from './classCollector';
import { Property } from './propertyCollector';
export declare class DTSWriter {
    static make(classes: PseudoClass[], functions: PseudoClass[]): string;
    static propertyToString(property: Property): string;
    static classToString(_class: PseudoClass): string;
    static functionToString(func: PseudoClass): string;
}
