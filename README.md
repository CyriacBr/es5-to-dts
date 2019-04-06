# ES5 To DTS
This tool generates TypeScript declaration files from legacy JS code.
It works by identifying certain patterns from old JS.

It might not work properly or cover 100% of the possible cases, so you'll probably need to tweak the generated `dts` manually. But it gets the job done and saves a lot of time. It is even better if the legacy code contains JsDoc comments.

Made using TypeScript compiler API and this AST visualizer:  
https://astexplorer.net/


## Caveats
As I said, the tool may not be able to handle some cases. Errors caught during generation are archived and can be
viewed at the end:  
![Error handling](https://i.imgur.com/ue7EJDu.png)

Feel free to open an issue with the logs and the concerned part of code.

Since 1.1.0, es5-to-dts now try to guess types from usage and objects' properties.  
(**However it's really unreliable for now**)

## Changelog
- 1.0.0: Initial release
- 1.0.3: Fixed lib.es5.d.ts not found
- 1.0.4: Added two more patterns to handle
- 1.0.5:  
Restructured code  
Added error handling  
Added unit testing  
Added many more patterns to handle  
- 1.1.0:  
Added cli options
Added type guessing
- 1.1.1: Added '--all-files' cli flag
- 1.1.2: Added '--mockup' cli flag, in order to generate mockup `ts` files instead of `d.ts`.
Mockup files are simply a `d.ts` version with empty implementation.

## TODO
- Remove duplicate properties
- Advanced type guessing


## Installation
`npm -g i es5-to-dts`  
Make sure you have the latest TypeScript package installed globally:  
`npm -g i typescript`

To generate a declaration file:  
`es5-to-dts oldFile.js`

### CLI Options
- `-n namespace` : The definitions will be wrapper inside a namespace.
- `-a` : Process all files inside the directory.
- `-r` : Collect root variables.  
- `-g` : Guess types. (WIP)
- `-a outputFileName` : Process all files in the folder and output a single `d.ts` file.
- `-m` : Generate a mockup of the definition file instead of a `d.ts`.

Example: `es5-to-dts oldFile.js -n MyNamespace`


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

Object.defineProperty(Animal.prototype, 'owner', {
  get: function() {
      return this._owner;
  },
  configurable: true
});

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
