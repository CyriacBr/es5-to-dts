function Point2D(x, y) {
    this.x = x;
    this.y = y;
}

Point2D.prototype.add = function(x, y) {
    this.x = Math.round(this.x + x);
    this.y = Math.round(this.y + y);
}

function Circle(radius, center, label) {
    this.radius = radius;
    this.center = center;
    this.label = label.toUpperCase();
}

Circle.prototype.isSame = function(other) {
    return this.radius === other.radius && this.center.x === other.center.x && this.center.y === other.center.y;
}

Circle.prototype.getDiameter = function() {
    return this.radius * 2;
}

var SacredPoint = { x: 111, y: 111};
var CursedPoint = {};
CursedPoint.x = 666;
CursedPoint.y = 666;