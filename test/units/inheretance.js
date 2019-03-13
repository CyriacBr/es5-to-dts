function Parent() {}

function Child() {}
Child.prototype = Object.create(Parent.prototype);
Child.prototype.constructor = Child;