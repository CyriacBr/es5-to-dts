declare global {
  interface Number {
    mod(n: any): number;
  }
  interface SomethingGlobal {
    changed: boolean;
  }
}
export declare namespace Test {
  
}
