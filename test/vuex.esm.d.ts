declare global {
    interface store {
        _devtoolHook: any;
        _actions: any;
        _mutations: any;
        _wrappedGetters: any;
        _modulesNamespaceMap: any;
        getters: {};
        _vm: any;
    }
}
export declare namespace Vuex {
    /**
     * vuex v3.1.0
     * (c) 2019 Evan You
     * @license MIT
     */
    function applyMixin();

    function devtoolPlugin(store: any);
    /**
     * forEach for object
     */
    function forEachValue();

    function isObject(obj: any);

    function isPromise(val: any);

    function assert(condition: any, msg: any);

    function update(path: any, targetModule: any, newModule: any);

    function assertRawModule(path: any, rawModule: any);

    function makeAssertionMessage(path: any, key: any, type: any, value: any, expected: any);

    function genericSubscribe(fn: any, subs: any);

    function resetStore(store: any, hot: any);

    function resetStoreVM(store: any, state: any, hot: any);

    function installModule(store: any, rootState: any, path: any, module: any, hot: any);
    /**
     * make localized dispatch, commit, getters and state
     * if there is no namespace, just use root ones
     */
    function makeLocalContext();

    function makeLocalGetters(store: any, namespace: any);

    function registerMutation(store: any, type: any, handler: any, local: any);

    function registerAction(store: any, type: any, handler: any, local: any);

    function registerGetter(store: any, type: any, rawGetter: any, local: any);

    function enableStrictMode(store: any);

    function getNestedState(state: any, path: any);

    function unifyObjectStyle(type: any, payload: any, options: any);

    function install(_Vue: any);
    /**
     * Rebinding namespace param for mapXXX function in special scoped, and return them by simple object
     * @param {String} namespace
     * @return {Object}
     */
    function createNamespacedHelpers(namespace: string);
    /**
     * Normalize the map
     * normalizeMap([1, 2, 3]) => [ { key: 1, val: 1 }, { key: 2, val: 2 }, { key: 3, val: 3 } ]
     * normalizeMap({a: 1, b: 2, c: 3}) => [ { key: 'a', val: 1 }, { key: 'b', val: 2 }, { key: 'c', val: 3 } ]
     * @param {Array|Object} map
     * @return {Object}
     */
    function normalizeMap(map: any[] | Object);
    /**
     * Return a function expect two param contains namespace and map. it will normalize the namespace and then the param's function will handle the new namespace and the map.
     * @param {Function} fn
     * @return {Function}
     */
    function normalizeNamespace(fn: Function);
    /**
     * Search a special module from store by namespace. if module not exist, print error message.
     * @param {Object} store
     * @param {String} helper
     * @param {String} namespace
     * @return {Object}
     */
    function getModuleByNamespace(store: Object, helper: string, namespace: string);
    class Module {
        new(rawModule: any, runtime: any);
        addChild: (key: any, module: any) => void;

        removeChild: (key: any) => void;

        getChild: (key: any) => any;

        update: (rawModule: any) => void;

        forEachChild: (fn: any) => void;

        forEachGetter: (fn: any) => void;

        forEachAction: (fn: any) => void;

        forEachMutation: (fn: any) => void;
    }
    class ModuleCollection {
        new(rawRootModule: any);
        get: (path: any) => any;

        getNamespace: (path: any) => any;

        update: (rawRootModule: any) => void;

        register: (path: any, rawModule: any, runtime: any) => void;

        unregister: (path: any) => void;
    }
    class Store {
        new(options: any);
        commit: (_type: any, _payload: any, _options: any) => void;

        dispatch: (_type: any, _payload: any) => any;

        subscribe: (fn: any) => () => void;

        subscribeAction: (fn: any) => () => void;

        watch: (getter: any, cb: any, options: any) => any;

        replaceState: (state: any) => void;

        registerModule: (path: any, rawModule: any, options: any) => void;

        unregisterModule: (path: any) => void;

        hotUpdate: (newOptions: any) => void;

        _withCommit: (fn: any) => void;

        _committing: boolean;
    }
}