function DirectCtr(x) {
  this.x = x;
}

function AltCtr() {
  this.initialize.apply(this, arguments);
}

AltCtr.prototype.initialize = function(x) {
  this.x = x;
};
