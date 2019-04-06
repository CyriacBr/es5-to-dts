import { PseudoClass } from './classCollector';
import { Property } from './propertyCollector';
export declare class DTSWriter {
    static print(dts: string): string;
    static make(classes: PseudoClass[], functions: PseudoClass[], properties: Property[]): string;
    static propertyToString(property: Property): string;
    static propertyTypeToString(property: Property): string;
    static classToString(_class: PseudoClass): string;
    static functionToString(func: PseudoClass): string;
}
