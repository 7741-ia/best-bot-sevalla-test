// Charge une librairie lourde seulement à sa première utilisation (économise RAM et temps de démarrage).
function lazy(name) {
    let mod;
    const load = () => (mod || (mod = require(name)));
    return new Proxy(function () {}, {
        get: (_, prop) => Reflect.get(load(), prop),
        has: (_, prop) => prop in load(),
        apply: (_, thisArg, args) => Reflect.apply(load(), thisArg, args),
        construct: (_, args) => Reflect.construct(load(), args),
    });
}
module.exports = lazy;
