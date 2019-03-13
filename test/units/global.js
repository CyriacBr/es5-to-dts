Number.prototype.mod = function(n) {
  return ((this % n) + n) % n;
};

SomethingGlobal.changed = true;

var isNotGlobal;
isNotGlobal.changed = true;