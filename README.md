# ES5 To DTS
This tool generates TypeScript declaration files from legacy JS code.
It works by identifying certain patterns from old JS.

It might not work properly or cover 100% of the possible cases, so you'll probably need to tweak the generated `dts` manually. But it gets the job done and save a lot of time. It is even better if the legacy code contains JsDoc comments.

Made using TypeScript compiler API and this AST visualizer:  
https://astexplorer.net/


## Changelog
- 1.0.0: Initial release
- 1.0.3: Fixed lib.es5.d.ts not found
- 1.0.4: Added two more patterns to handle


## Installation
`npm -g i es5-to-dts`  
To generate a declaration file:  
`es5-to-dts oldFile.js NamespaceName`


## Example
Old JS code:  
```javascript

Number.prototype.mod = function(n) {
  return ((this % n) + n) % n;
};

SomethingGlobal.changed = true;
var isNotGlobal;
isNotGlobal.a = 5;

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
```

Result:  
```typescript
declare global {
    interface Number {
        mod: (n: any) => number;
    }
    interface SomethingGlobal {
        changed: boolean;
    }
}

export declare namespace MyNamespace {
    class Animal {
        new(name: any, age: any, race: any);
        name: any;

        age: any;

        race: any;

        _owner: any;

        readonly owner: any;
    }
    
    class Dog extends Animal {
        /**
         * Create a new dog
         *
         * @param {String} name
         * @param {'Pug'|'Shiba Inu'} race
         */
        new(name: string, race: 'Pug' | 'Shiba Inu');
        static _count: number;

        likes: string;

        friend: Animal;

        /**
         * Bark for a number of times
         *
         * @param {Number} times
         */
        bark: (times: number) => any;

        barking: boolean;

        static getCount: () => any;
    }
}
```
