function MyClass(a, b) {}
MyClass.prototype.myMethod = function() {}

var MyClass2 = function(a, b) {}
MyClass2.prototype.myMethod = function something() {}

function MyClass3() {}
function something2(a, b) {}
MyClass3.prototype.myMethod = something2;

var something3 = function(a, b) {}
var MyClass4 = something3;
MyClass4.prototype.myMethod = function something() {}