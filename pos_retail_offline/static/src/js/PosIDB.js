var PosIDB = (function (exports) {
    'use strict';

    const {get, set, del, keys, clear, Store} = idbKeyval;
    // Here we use custom store in using idbKeyVal. This is to avoid
    // overlap with other service workers that uses the library.
    // This is an added future-proofing to prevent name conflicts
    // when other modules started to introduce service worker with
    // the use of idbkeyval library as well.
    const store = new Store('POS-Cache', 'POS-Cache-Database');

    const PosIDB = {
        get(key) {
            const datas = get(key, store);
            console.warn('get key: ' + key + ' with datas: ' + datas)
            return datas
        },
        set(key, value) {
            console.warn('set key: ' + key + ' with value: ' + value)
            return set(key, value, store);
        },
        del(key) {
            return del(key, store);
        },
        keys() {
            return keys(store);
        },
        clear() {
            return clear(store);
        },
        getPos() {
            debugger
        }
    };

    Object.assign(exports, PosIDB);

    return exports;
})({});