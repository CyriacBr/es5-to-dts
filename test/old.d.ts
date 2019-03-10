declare global {
    interface Number {
        mod: (n: any) => number;
    }
    interface SomethingGlobal {
        changed: boolean;
    }
}
export declare namespace Test {
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