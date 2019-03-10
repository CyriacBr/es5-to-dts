
Number.prototype.mod = function(n) {
    return ((this % n) + n) % n;
  };
  
  SomethingGlobal.changed = true;
  
  function Animal(name, age, race) {
    this.name = name;
    this.age = age;
    this.race = race;
    this._owner = null;
  }
  
  /**
   * Create a new dog
   *
   * @param {String} name
   * @param {'Pug'|'Shiba Inu'} race
   */
  function Dog() {
    this.initialize.apply(this, arguments);
  }
  
  Dog.prototype = Object.create(Animal.prototype);
  Dog.prototype.constructor = Dog;
  
  Dog._count = 0;
  
  Dog.prototype.initialize = function(name, race) {
    Animal.prototype.initialize.call(this, name, 0, race);
    this.likes = 'bones';
    this.friend = new Animal();
    Dog._count++;
  };
  
  /**
   * Bark for a number of times
   *
   * @param {Number} times
   */
  Dog.prototype.bark = function(times) {
    this.barking = true;
  };
  
  Dog.getCount = function() {
    return this._count;
  }
  
  Object.defineProperty(Animal.prototype, 'owner', {
    get: function() {
        return this._owner;
    },
    configurable: true
  });