declare global {
  interface Number {
    mod: (n: any) => number;
  }
}
export declare namespace MyNamespace {
  function add(a: any, b: any);
  class Moduleee {
    new(rawModule: any, runtime: any);
    addChild: (key: any, module: any) => void;
  }
}
