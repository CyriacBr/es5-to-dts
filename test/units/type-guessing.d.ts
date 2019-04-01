type Guess<T> = Partial<T>;

export declare namespace Test {
  var SacredPoint: Guess<Point2D>;
  var CursedPoint: Guess<Point2D>;
  class Point2D {
    new(x: any, y: any);
    x: any;
    y: any;
  }
  class Circle {
    new(radius: any, center: any);
    radius: any;
    center: any;
    isSame: (other: Guess<Circle>) => boolean;
  }
}
