declare type Guess<T> = Partial<T>;

export declare namespace Test {
  var SacredPoint: Guess<Point2D>;
  var CursedPoint: Guess<Point2D>;
  class Point2D {
    constructor(x: any, y: any);
    x: Guess<number>;
    y: Guess<number>;
    add(x: Guess<number>, y: Guess<number>): void;
  }
  class Circle {
    constructor(radius: any, center: any, label: any);
    radius: Guess<number>;
    center: any;
    label: any;
    isSame(other: Guess<Circle>): boolean;
    getDiameter(): number;
  }
}
