!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var n;"undefined"!=typeof window?n=window:"undefined"!=typeof global?n=global:"undefined"!=typeof self&&(n=self),n.asyncgenerator=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){
(function (process){

// Use the fastest possible means to execute a task in a future turn
// of the event loop.

// linked list of tasks (single, with head node)
var head = {task: void 0, next: null};
var tail = head;
var flushing = false;
var requestFlush = void 0;
var isNodeJS = false;

function flush() {
    /* jshint loopfunc: true */

    while (head.next) {
        head = head.next;
        var task = head.task;
        head.task = void 0;
        var domain = head.domain;

        if (domain) {
            head.domain = void 0;
            domain.enter();
        }

        try {
            task();

        } catch (e) {
            if (isNodeJS) {
                // In node, uncaught exceptions are considered fatal errors.
                // Re-throw them synchronously to interrupt flushing!

                // Ensure continuation if the uncaught exception is suppressed
                // listening "uncaughtException" events (as domains does).
                // Continue in next event to avoid tick recursion.
                if (domain) {
                    domain.exit();
                }
                setTimeout(flush, 0);
                if (domain) {
                    domain.enter();
                }

                throw e;

            } else {
                // In browsers, uncaught exceptions are not fatal.
                // Re-throw them asynchronously to avoid slow-downs.
                setTimeout(function() {
                   throw e;
                }, 0);
            }
        }

        if (domain) {
            domain.exit();
        }
    }

    flushing = false;
}

if (typeof process !== "undefined" && process.nextTick) {
    // Node.js before 0.9. Note that some fake-Node environments, like the
    // Mocha test runner, introduce a `process` global without a `nextTick`.
    isNodeJS = true;

    requestFlush = function () {
        process.nextTick(flush);
    };

} else if (typeof setImmediate === "function") {
    // In IE10, Node.js 0.9+, or https://github.com/NobleJS/setImmediate
    if (typeof window !== "undefined") {
        requestFlush = setImmediate.bind(window, flush);
    } else {
        requestFlush = function () {
            setImmediate(flush);
        };
    }

} else if (typeof MessageChannel !== "undefined") {
    // modern browsers
    // http://www.nonblocking.io/2011/06/windownexttick.html
    var channel = new MessageChannel();
    channel.port1.onmessage = flush;
    requestFlush = function () {
        channel.port2.postMessage(0);
    };

} else {
    // old browsers
    requestFlush = function () {
        setTimeout(flush, 0);
    };
}

function asap(task) {
    tail = tail.next = {
        task: task,
        domain: isNodeJS && process.domain,
        next: null
    };

    if (!flushing) {
        flushing = true;
        requestFlush();
    }
};

module.exports = asap;


}).call(this,_dereq_("FWaASH"))
},{"FWaASH":2}],2:[function(_dereq_,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],3:[function(_dereq_,module,exports){
'use strict';

module.exports = _dereq_('./is-implemented')() ? Symbol : _dereq_('./polyfill');

},{"./is-implemented":4,"./polyfill":18}],4:[function(_dereq_,module,exports){
'use strict';

module.exports = function () {
	var symbol;
	if (typeof Symbol !== 'function') return false;
	symbol = Symbol('test symbol');
	try {
		if (String(symbol) !== 'Symbol (test symbol)') return false;
	} catch (e) { return false; }
	if (typeof Symbol.iterator === 'symbol') return true;

	// Return 'true' for polyfills
	if (typeof Symbol.isConcatSpreadable !== 'object') return false;
	if (typeof Symbol.isRegExp !== 'object') return false;
	if (typeof Symbol.iterator !== 'object') return false;
	if (typeof Symbol.toPrimitive !== 'object') return false;
	if (typeof Symbol.toStringTag !== 'object') return false;
	if (typeof Symbol.unscopables !== 'object') return false;

	return true;
};

},{}],5:[function(_dereq_,module,exports){
'use strict';

var assign        = _dereq_('es5-ext/object/assign')
  , normalizeOpts = _dereq_('es5-ext/object/normalize-options')
  , isCallable    = _dereq_('es5-ext/object/is-callable')
  , contains      = _dereq_('es5-ext/string/#/contains')

  , d;

d = module.exports = function (dscr, value/*, options*/) {
	var c, e, w, options, desc;
	if ((arguments.length < 2) || (typeof dscr !== 'string')) {
		options = value;
		value = dscr;
		dscr = null;
	} else {
		options = arguments[2];
	}
	if (dscr == null) {
		c = w = true;
		e = false;
	} else {
		c = contains.call(dscr, 'c');
		e = contains.call(dscr, 'e');
		w = contains.call(dscr, 'w');
	}

	desc = { value: value, configurable: c, enumerable: e, writable: w };
	return !options ? desc : assign(normalizeOpts(options), desc);
};

d.gs = function (dscr, get, set/*, options*/) {
	var c, e, options, desc;
	if (typeof dscr !== 'string') {
		options = set;
		set = get;
		get = dscr;
		dscr = null;
	} else {
		options = arguments[3];
	}
	if (get == null) {
		get = undefined;
	} else if (!isCallable(get)) {
		options = get;
		get = set = undefined;
	} else if (set == null) {
		set = undefined;
	} else if (!isCallable(set)) {
		options = set;
		set = undefined;
	}
	if (dscr == null) {
		c = true;
		e = false;
	} else {
		c = contains.call(dscr, 'c');
		e = contains.call(dscr, 'e');
	}

	desc = { get: get, set: set, configurable: c, enumerable: e };
	return !options ? desc : assign(normalizeOpts(options), desc);
};

},{"es5-ext/object/assign":6,"es5-ext/object/is-callable":9,"es5-ext/object/normalize-options":13,"es5-ext/string/#/contains":15}],6:[function(_dereq_,module,exports){
'use strict';

module.exports = _dereq_('./is-implemented')()
	? Object.assign
	: _dereq_('./shim');

},{"./is-implemented":7,"./shim":8}],7:[function(_dereq_,module,exports){
'use strict';

module.exports = function () {
	var assign = Object.assign, obj;
	if (typeof assign !== 'function') return false;
	obj = { foo: 'raz' };
	assign(obj, { bar: 'dwa' }, { trzy: 'trzy' });
	return (obj.foo + obj.bar + obj.trzy) === 'razdwatrzy';
};

},{}],8:[function(_dereq_,module,exports){
'use strict';

var keys  = _dereq_('../keys')
  , value = _dereq_('../valid-value')

  , max = Math.max;

module.exports = function (dest, src/*, …srcn*/) {
	var error, i, l = max(arguments.length, 2), assign;
	dest = Object(value(dest));
	assign = function (key) {
		try { dest[key] = src[key]; } catch (e) {
			if (!error) error = e;
		}
	};
	for (i = 1; i < l; ++i) {
		src = arguments[i];
		keys(src).forEach(assign);
	}
	if (error !== undefined) throw error;
	return dest;
};

},{"../keys":10,"../valid-value":14}],9:[function(_dereq_,module,exports){
// Deprecated

'use strict';

module.exports = function (obj) { return typeof obj === 'function'; };

},{}],10:[function(_dereq_,module,exports){
'use strict';

module.exports = _dereq_('./is-implemented')()
	? Object.keys
	: _dereq_('./shim');

},{"./is-implemented":11,"./shim":12}],11:[function(_dereq_,module,exports){
'use strict';

module.exports = function () {
	try {
		Object.keys('primitive');
		return true;
	} catch (e) { return false; }
};

},{}],12:[function(_dereq_,module,exports){
'use strict';

var keys = Object.keys;

module.exports = function (object) {
	return keys(object == null ? object : Object(object));
};

},{}],13:[function(_dereq_,module,exports){
'use strict';

var assign = _dereq_('./assign')

  , forEach = Array.prototype.forEach
  , create = Object.create, getPrototypeOf = Object.getPrototypeOf

  , process;

process = function (src, obj) {
	var proto = getPrototypeOf(src);
	return assign(proto ? process(proto, obj) : obj, src);
};

module.exports = function (options/*, …options*/) {
	var result = create(null);
	forEach.call(arguments, function (options) {
		if (options == null) return;
		process(Object(options), result);
	});
	return result;
};

},{"./assign":6}],14:[function(_dereq_,module,exports){
'use strict';

module.exports = function (value) {
	if (value == null) throw new TypeError("Cannot use null or undefined");
	return value;
};

},{}],15:[function(_dereq_,module,exports){
'use strict';

module.exports = _dereq_('./is-implemented')()
	? String.prototype.contains
	: _dereq_('./shim');

},{"./is-implemented":16,"./shim":17}],16:[function(_dereq_,module,exports){
'use strict';

var str = 'razdwatrzy';

module.exports = function () {
	if (typeof str.contains !== 'function') return false;
	return ((str.contains('dwa') === true) && (str.contains('foo') === false));
};

},{}],17:[function(_dereq_,module,exports){
'use strict';

var indexOf = String.prototype.indexOf;

module.exports = function (searchString/*, position*/) {
	return indexOf.call(this, searchString, arguments[1]) > -1;
};

},{}],18:[function(_dereq_,module,exports){
'use strict';

var d = _dereq_('d')

  , create = Object.create, defineProperties = Object.defineProperties
  , generateName, Symbol;

generateName = (function () {
	var created = create(null);
	return function (desc) {
		var postfix = 0;
		while (created[desc + (postfix || '')]) ++postfix;
		desc += (postfix || '');
		created[desc] = true;
		return '@@' + desc;
	};
}());

module.exports = Symbol = function (description) {
	var symbol;
	if (this instanceof Symbol) {
		throw new TypeError('TypeError: Symbol is not a constructor');
	}
	symbol = create(Symbol.prototype);
	description = (description === undefined ? '' : String(description));
	return defineProperties(symbol, {
		__description__: d('', description),
		__name__: d('', generateName(description))
	});
};

Object.defineProperties(Symbol, {
	create: d('', Symbol('create')),
	hasInstance: d('', Symbol('hasInstance')),
	isConcatSpreadable: d('', Symbol('isConcatSpreadable')),
	isRegExp: d('', Symbol('isRegExp')),
	iterator: d('', Symbol('iterator')),
	toPrimitive: d('', Symbol('toPrimitive')),
	toStringTag: d('', Symbol('toStringTag')),
	unscopables: d('', Symbol('unscopables'))
});

defineProperties(Symbol.prototype, {
	properToString: d(function () {
		return 'Symbol (' + this.__description__ + ')';
	}),
	toString: d('', function () { return this.__name__; })
});
Object.defineProperty(Symbol.prototype, Symbol.toPrimitive, d('',
	function (hint) {
		throw new TypeError("Conversion of symbol objects is not allowed");
	}));
Object.defineProperty(Symbol.prototype, Symbol.toStringTag, d('c', 'Symbol'));

},{"d":5}],19:[function(_dereq_,module,exports){
'use strict';

module.exports = _dereq_('./lib/core.js')
_dereq_('./lib/done.js')
_dereq_('./lib/es6-extensions.js')
_dereq_('./lib/node-extensions.js')
},{"./lib/core.js":20,"./lib/done.js":21,"./lib/es6-extensions.js":22,"./lib/node-extensions.js":23}],20:[function(_dereq_,module,exports){
'use strict';

var asap = _dereq_('asap')

module.exports = Promise;
function Promise(fn) {
  if (typeof this !== 'object') throw new TypeError('Promises must be constructed via new')
  if (typeof fn !== 'function') throw new TypeError('not a function')
  var state = null
  var value = null
  var deferreds = []
  var self = this

  this.then = function(onFulfilled, onRejected) {
    return new self.constructor(function(resolve, reject) {
      handle(new Handler(onFulfilled, onRejected, resolve, reject))
    })
  }

  function handle(deferred) {
    if (state === null) {
      deferreds.push(deferred)
      return
    }
    asap(function() {
      var cb = state ? deferred.onFulfilled : deferred.onRejected
      if (cb === null) {
        (state ? deferred.resolve : deferred.reject)(value)
        return
      }
      var ret
      try {
        ret = cb(value)
      }
      catch (e) {
        deferred.reject(e)
        return
      }
      deferred.resolve(ret)
    })
  }

  function resolve(newValue) {
    try { //Promise Resolution Procedure: https://github.com/promises-aplus/promises-spec#the-promise-resolution-procedure
      if (newValue === self) throw new TypeError('A promise cannot be resolved with itself.')
      if (newValue && (typeof newValue === 'object' || typeof newValue === 'function')) {
        var then = newValue.then
        if (typeof then === 'function') {
          doResolve(then.bind(newValue), resolve, reject)
          return
        }
      }
      state = true
      value = newValue
      finale()
    } catch (e) { reject(e) }
  }

  function reject(newValue) {
    state = false
    value = newValue
    finale()
  }

  function finale() {
    for (var i = 0, len = deferreds.length; i < len; i++)
      handle(deferreds[i])
    deferreds = null
  }

  doResolve(fn, resolve, reject)
}


function Handler(onFulfilled, onRejected, resolve, reject){
  this.onFulfilled = typeof onFulfilled === 'function' ? onFulfilled : null
  this.onRejected = typeof onRejected === 'function' ? onRejected : null
  this.resolve = resolve
  this.reject = reject
}

/**
 * Take a potentially misbehaving resolver function and make sure
 * onFulfilled and onRejected are only called once.
 *
 * Makes no guarantees about asynchrony.
 */
function doResolve(fn, onFulfilled, onRejected) {
  var done = false;
  try {
    fn(function (value) {
      if (done) return
      done = true
      onFulfilled(value)
    }, function (reason) {
      if (done) return
      done = true
      onRejected(reason)
    })
  } catch (ex) {
    if (done) return
    done = true
    onRejected(ex)
  }
}

},{"asap":24}],21:[function(_dereq_,module,exports){
'use strict';

var Promise = _dereq_('./core.js')
var asap = _dereq_('asap')

module.exports = Promise
Promise.prototype.done = function (onFulfilled, onRejected) {
  var self = arguments.length ? this.then.apply(this, arguments) : this
  self.then(null, function (err) {
    asap(function () {
      throw err
    })
  })
}
},{"./core.js":20,"asap":24}],22:[function(_dereq_,module,exports){
'use strict';

//This file contains the ES6 extensions to the core Promises/A+ API

var Promise = _dereq_('./core.js')
var asap = _dereq_('asap')

module.exports = Promise

/* Static Functions */

function ValuePromise(value) {
  this.then = function (onFulfilled) {
    if (typeof onFulfilled !== 'function') return this
    return new Promise(function (resolve, reject) {
      asap(function () {
        try {
          resolve(onFulfilled(value))
        } catch (ex) {
          reject(ex);
        }
      })
    })
  }
}
ValuePromise.prototype = Promise.prototype

var TRUE = new ValuePromise(true)
var FALSE = new ValuePromise(false)
var NULL = new ValuePromise(null)
var UNDEFINED = new ValuePromise(undefined)
var ZERO = new ValuePromise(0)
var EMPTYSTRING = new ValuePromise('')

Promise.resolve = function (value) {
  if (value instanceof Promise) return value

  if (value === null) return NULL
  if (value === undefined) return UNDEFINED
  if (value === true) return TRUE
  if (value === false) return FALSE
  if (value === 0) return ZERO
  if (value === '') return EMPTYSTRING

  if (typeof value === 'object' || typeof value === 'function') {
    try {
      var then = value.then
      if (typeof then === 'function') {
        return new Promise(then.bind(value))
      }
    } catch (ex) {
      return new Promise(function (resolve, reject) {
        reject(ex)
      })
    }
  }

  return new ValuePromise(value)
}

Promise.all = function (arr) {
  var args = Array.prototype.slice.call(arr)

  return new Promise(function (resolve, reject) {
    if (args.length === 0) return resolve([])
    var remaining = args.length
    function res(i, val) {
      try {
        if (val && (typeof val === 'object' || typeof val === 'function')) {
          var then = val.then
          if (typeof then === 'function') {
            then.call(val, function (val) { res(i, val) }, reject)
            return
          }
        }
        args[i] = val
        if (--remaining === 0) {
          resolve(args);
        }
      } catch (ex) {
        reject(ex)
      }
    }
    for (var i = 0; i < args.length; i++) {
      res(i, args[i])
    }
  })
}

Promise.reject = function (value) {
  return new Promise(function (resolve, reject) { 
    reject(value);
  });
}

Promise.race = function (values) {
  return new Promise(function (resolve, reject) { 
    values.forEach(function(value){
      Promise.resolve(value).then(resolve, reject);
    })
  });
}

/* Prototype Methods */

Promise.prototype['catch'] = function (onRejected) {
  return this.then(null, onRejected);
}

},{"./core.js":20,"asap":24}],23:[function(_dereq_,module,exports){
'use strict';

//This file contains then/promise specific extensions that are only useful for node.js interop

var Promise = _dereq_('./core.js')
var asap = _dereq_('asap')

module.exports = Promise

/* Static Functions */

Promise.denodeify = function (fn, argumentCount) {
  argumentCount = argumentCount || Infinity
  return function () {
    var self = this
    var args = Array.prototype.slice.call(arguments)
    return new Promise(function (resolve, reject) {
      while (args.length && args.length > argumentCount) {
        args.pop()
      }
      args.push(function (err, res) {
        if (err) reject(err)
        else resolve(res)
      })
      fn.apply(self, args)
    })
  }
}
Promise.nodeify = function (fn) {
  return function () {
    var args = Array.prototype.slice.call(arguments)
    var callback = typeof args[args.length - 1] === 'function' ? args.pop() : null
    var ctx = this
    try {
      return fn.apply(this, arguments).nodeify(callback, ctx)
    } catch (ex) {
      if (callback === null || typeof callback == 'undefined') {
        return new Promise(function (resolve, reject) { reject(ex) })
      } else {
        asap(function () {
          callback.call(ctx, ex)
        })
      }
    }
  }
}

Promise.prototype.nodeify = function (callback, ctx) {
  if (typeof callback != 'function') return this

  this.then(function (value) {
    asap(function () {
      callback.call(ctx, null, value)
    })
  }, function (err) {
    asap(function () {
      callback.call(ctx, err)
    })
  })
}

},{"./core.js":20,"asap":24}],24:[function(_dereq_,module,exports){
module.exports=_dereq_(1)
},{"FWaASH":2}],25:[function(_dereq_,module,exports){
var Promise = _dereq_('promise');
var Symbol = _dereq_('es6-symbol');

var asap = _dereq_('asap');

function decorate(iterator, onDone) {
    var done = false;
    return Object.create(
        iterator,
        {
            throw: {
                value: function(e) {
                    var throwFn = iterator.throw;                    
                    if (!done) {
                        done = true;
                        if (onDone) {
                            onDone.call(this);
                        }

                        if (throwFn) {
                            return throwFn.call(iterator, e);
                        }
                    }
                }
            },
            return: {
                value: function(v) {
                    var returnFn = iterator.return;
                    if (!done) {
                        done = true;
                        if (onDone) {
                            onDone.call(this);
                        }

                        if (returnFn) {
                            return returnFn.call(iterator, v);
                        }
                    }
                }
            },
        });
};

var microTaskScheduler = function(fn, args) {
    //asap(fn.bind(null, args));
    setTimeout(function() {
        fn(args);
    })
};

function Observable(observeDefn) {
    this.observe = observeDefn;
}

Observable.fromEventPattern = function(add, remove, scheduler) {
    scheduler = scheduler || microTaskScheduler;

    return new Observable(function observe(iterator) {
        var next = iterator.next;
        var handler = function() {
            if (next) {
                next.apply(iterator, Array.prototype.slice.call(arguments));
            }
        };

        scheduler(function() { add(handler) });

        return decorate(iterator, function() {
            remove(handler);
        });
    });
};

// Convert any DOM event into an async generator
Observable.fromEvent = function(dom, eventName, syncAction, scheduler) {
    scheduler = scheduler || microTaskScheduler;

    return new Observable(function fromDOMEventObserve(iterator) {
        var handler = function(e) {
                if (syncAction) {
                    syncAction(e);
                }

                iterator.next(e);
            },
            decoratedIterator = 
                decorate(
                    iterator,
                    function onDone() {
                         dom.removeEventListener(eventName, handler);
                    });
            
        scheduler(function() {
            dom.addEventListener(eventName, handler)
        });

        return decoratedIterator;
    });
};

Observable.empty = function(scheduler) {
    scheduler = scheduler || microTaskScheduler;
    return new Observable(function(iterator) {
        var done = false,
            decoratedIterator = decorate(iterator);

        scheduler(decoratedIterator.return.bind(decoratedIterator));

        return decoratedIterator;
    });
};

Observable.from = function(arr, scheduler) {
    scheduler = scheduler || microTaskScheduler;

    return new Observable(function(iterator) {
        var done = false,
            decoratedIterator = 
                decorate(iterator, function() { done = true });

        scheduler(function() {
            for(var count = 0; count < arr.length; count++) {
                if (done) {
                    return;
                }
                decoratedIterator.next(arr[count]);
            }
            if (done) {
                return;
            }
            decoratedIterator.return();
        });

        return decoratedIterator;
    })
};

Observable.merge = function() {
    return Observable.from(Array.prototype.slice.call(arguments)).mergeAll();
}

Observable.concat = function() {
    return Observable.from(Array.prototype.slice.call(arguments)).concatAll();
}

Observable.of = function() {
    return Observable.from(Array.prototype.slice.call(arguments));
};

Observable.interval = function(time) {
    return new Observable(function forEach(observer) {
        var handle,
            decoratedObserver = decorate(observer, function() { clearInterval(handle); });

        handle = setInterval(function() {
            decoratedObserver.next();
        }, time);

        return decoratedObserver;
    });
};

Observable.timeout = function(time) {
    return new Observable(function forEach(observer) {
        var handle,
            decoratedObserver = decorate(observer, function() { clearInterval(handle); });

        handle = setTimeout(function() {
            decoratedObserver.next();
            decoratedObserver.return();
        }, time);

        return decoratedObserver;
    });
};

Observable.prototype = {
    lift: function(iteratorTransform) {
        var self = this;
        return new Observable(function(iterator) {
            return self.observe(iteratorTransform.call(this, iterator));
        });
    },
    map: function(projection, thisArg) {
        var index = 0;
        return this.lift(
            function(iterator) {
                thisArg = thisArg !== undefined ? thisArg : this;            
                return Object.create(
                    iterator,
                    {
                        next: {
                            value: function(value) {
                                var next = iterator.next;
                                if (next) {
                                    try {
                                        return next.call(iterator, projection.call(thisArg, value), index++, this);
                                    }
                                    catch(e) {
                                        return this.throw(e);
                                    }
                                }
                            }
                        }
                    })
            });
    },
    filter: function(predicate, thisArg) {
        return this.lift(
            function(iterator) {
                thisArg = thisArg !== undefined ? thisArg : this;
                return Object.create(
                    iterator,
                    {
                        next: {
                            value: function(value) {
                                var next = iterator.next,
                                    throwFn;

                                if (next && predicate.call(thisArg, value)) {
                                    try {
                                        return next.call(iterator, value);    
                                    }
                                    catch(e) {
                                        throwFn = this.throw;
                                        if (throwFn) {
                                            throwFn.call(this, e);
                                        }
                                    }
                                }
                            }
                        }
                    })
            });
    },
    scan: function(combiner, acc) {
        return this.lift(
            function(iterator) {
                var next = iterator.next,
                    returnFn = iterator.return,
                    index = 0,
                    self = this;

                return Object.create(
                    iterator,
                    {
                        next: {
                            value: function(value) {  
                                if (initialValue === undefined) {
                                    acc = value;
                                }
                                else if (next && predicate(value)) {
                                    return next.call(iterator, combiner.call(null, acc, value, index++, self));
                                }
                            }
                        },
                        return: {
                            value: function(value) {
                                if (next) {
                                    next.call(iterator, acc);
                                }
                                if (returnFn) {
                                    return returnFn.call(iterator, value);
                                }
                            }
                        }
                    })
            });
    },
    reverse: function() {
        return this.
            toArray().
            mergeMap(function(arr) {
                return Observable.from(arr.reverse());
            });
    },
    toArray: function() {
        return this.
            reduce(function(acc, cur) {
                acc.push(cur);
                return acc;
            }, [])
    },    
    first: function() {
        return this.lift(
            function(iterator) {
                var next = iterator.next,
                    returnFn = iterator.return;

                return Object.create(
                    iterator,
                    {
                        next: {
                            value: function(value) {  
                                if (next) {
                                    next.call(iterator, value);
                                }
                                this.return();
                            }
                        }
                    })
            });
    },
    last: function() {
        var lastValue;
        return this.lift(
            function(iterator) {
                var next = iterator.next,
                    returnFn = iterator.return;

                return Object.create(
                    iterator,
                    {
                        next: {
                            value: function(value) {  
                                lastValue = value;
                            }
                        },
                        return: {
                            value: function(value) {
                                if (next && lastValue !== undefined) {
                                    next.call(iterator, lastValue);
                                }
                                if (returnFn) {
                                    return returnFn.call(iterator, value);
                                }
                            }
                        }
                    })
            });
    },
    reduce: function(combiner, acc) {
        return this.scan(combiner, acc).last();
    },
    find: function(predicate, thisArg) {
        return this.filter(predicate, thisArg).first();
    },
    skip: function(num) {
        return this.lift(
            function(iterator) {
                var next = iterator.next,
                    returnFn = iterator.return;

                return Object.create(
                    iterator,
                    {
                        next: {
                            value: function(value) {  
                                num--;
                                if (num < 0 && next) {
                                    next.call(iterator,value);
                                }
                            }
                        }
                    })
            });
    },
    forEach: function(next) {
        var self = this;
        return new Promise(function(resolve, reject) {
            self.observe({
                next: next,
                return: function() {
                    resolve();
                },
                throw: reject
            });
        });
    },
    done: function() {
        var self = this;
        return new Promise(function(resolve, reject) {
            self.observe({
                next: function(){},
                return: resolve,
                throw: reject
            });
        });        
    },
    take: function(num) {
        var self = this,
            count = 0;

        return this.lift(
            function(iterator) {
                var next = iterator.next;
                return Object.create(
                    iterator,
                    {
                        next: {
                            value: function(value) {                            
                                var result = next.call(iterator, value);

                                if (count === num - 1) {
                                    result = this.return();
                                }
                                
                                count++;
                                return result;
                            }
                        }
                    });
            });
    },
    takeUntil: function(stops) {
        var self = this;
        return new Observable(function(iterator) {
            var next = iterator.next,
                throwFn = iterator.throw,
                returnFn = iterator.return,
                decoratedIterator,
                stopIterator = 
                    stops.observe({
                        done: false,
                        next: function(v) {
                            stopIterator.return();
                            return decoratedIterator.return();
                        },
                        throw: function(e) {
                            return decoratedIterator.throw(e);
                        },
                        return: function(v) {
                            return decoratedIterator.return();
                        }
                    });

                decoratedIterator =
                    self.observe(
                        Object.create(
                            iterator,
                            {
                                throw: {
                                    value: function(e) {
                                        stopIterator.return();
                                        if (throwFn) {
                                            throwFn.call(iterator, e);
                                        }
                                    }
                                },
                                return: {
                                    value: function(value) {
                                        stopIterator.return();
                                        if (returnFn) {
                                            returnFn.call(this, value);
                                        }
                                    }
                                }
                            }));

                return decoratedIterator;
        });
    },
    /*
    flatten: function(
        errorBufferSize,
        errorBufferOverrunPolicy, // BUFFER_OVERRUN_POLICY.THROW | BUFFER_OVERRUN_POLICY.LATEST | BUFFER_OVERRUN_POLICY.OLDEST
        maxConcurrent, 
        switchPolicy, // SWITCH.ON_COMPLETION | SWITCH.ON_ARRIVAL | SWITCH.ON_NOTIFICATION
        observableBufferSize, 
        observableBufferOverrunPolicy, 
        orderResults,
        itemsBufferSize,
        itemBufferOverrunPolicy) { }
    */
    //TODO: Use symbol to avoid collision on index member added to iterator
    mergeAll: function(delayErrors) {
        var self = this;

        return new Observable(function observe(observer) {
            var indexSymbol = Symbol("index"), // key at which index of observer can be found. Index of each observer in observers map is stored at this symbol. This won't be necessary when we have Map.
                observers = Object.create(null),
                numObservers = 1,
                nextObserverIndex = 1, 
                next = observer.next,
                errors = [],
                // finishes all inner and outer observation operations.
                onDone = function() {
                    var key,
                        innerObserver,
                        returnFn;

                    for(key in observers) {
                        innerObserver = observers[key];
                        if (innerObserver) {
                            returnFn = innerObserver.return;
                            if (returnFn) {
                                returnFn.call(innerObserver);
                            }
                        }
                    }
                },
                // The observer two which the merged output is sent. Finishes all inner and outer observation operations when terminated.
                decoratedObserver = decorate(observer, onDone),
                // The prototype used for the outer observer and all the inner observers
                // Both type of observer remove themself from the observers array,
                // then send a termination message to the decoratedObserver
                observerPrototype = {
                    // In event of error, removes itself from observers
                    throw: function(e) {
                        delete observers[this[indexSymbol]];
                        numObservers--;

                        errors.push(e);                            

                        if (!delayErrors || numObservers === 0) {
                            decoratedObserver.throw(errors.length > 1 ? {errors: errors} : errors[0]);
                        }
                    },
                    // In event of return, forwards on value if last observer, removes itself from observers
                    return: function(v) {
                        delete observers[this[indexSymbol]];
                        numObservers--;

                        if (numObservers === 0) {
                            decoratedObserver.return(v);
                        }
                        // NOTE THAT WE ONLY CAPTURE THE LAST RETURN VALUE, could add accumulater function to capture all return values.
                    }
                },                              
                observeInner = function(innerObservable) {
                    // Wrap each inner observer and forward along any data received
                    var innerObserver = {
                        next: {
                            value: function(value) {
                                if (next) {
                                    return next.call(decoratedObserver, value);
                                }
                            }
                        }
                    };
                    innerObserver[indexSymbol] = { value: nextObserverIndex };

                    observers[nextObserverIndex] = 
                        innerObservable.observe(
                            Object.create(
                                observerPrototype, 
                                innerObserver));

                    numObservers++;
                    nextObserverIndex++;
                },
                outerObserver = 
                    Object.create(
                        observerPrototype,
                        {
                            next: {
                                value: observeInner
                            }
                        });

            outerObserver[indexSymbol] = 0;
            observers[0] = self.observe(outerObserver);

            return decoratedObserver;
        });
    },
    concatAll: function(delayErrors) {
        var self = this;

        return new Observable(function observe(observer) {
            var indexSymbol = Symbol("index"), // key at which index of observer can be found. Index of each observer in observers map is stored at this symbol. This won't be necessary when we have Map.
                observers = {},
                numObservers = 1,
                nextObserverIndex = 1,
                observables = [],    
                next = observer.next,
                errors = [],
                onDone = function() {
                    var key,
                        innerObserver,
                        returnFn;

                    for(key in observers) {
                        innerObserver = observers[key];
                        if (innerObserver) {
                            returnFn = innerObserver.return;
                            if (returnFn) {
                                returnFn.call(innerObserver);
                            }
                        }
                    }
                },
                decoratedObserver = decorate(observer, onDone),
                observerPrototype = {
                    throw: function(e) {
                        delete observers[this[indexSymbol]];
                        numObservers--;
                        observables.shift();
                        
                        errors.push(e);                            

                        if (delayErrors && (numObservers > 0 || observables.length > 0)) {
                            if (observables.length > 0) {
                                observeInner();
                            }
                        }
                        else {
                            decoratedObserver.throw(errors.length > 1 ? {errors: errors} : errors[0]);
                        }
                    },
                    return: function(v) {
                        delete observers[this[indexSymbol]];
                        numObservers--;
                        observables.shift();

                        if (observables.length > 0) {
                            observeInner();
                        }
                        else if (observers[0] === undefined) {
                            decoratedObserver.return(v);
                        }
                    }
                },                             
                observeInner = function() {
                    var innerObservable = observables[0],
                        innerObserver = 
                            Object.create(
                                observerPrototype, 
                                {
                                    next: {
                                        value: function(value) {
                                            if (next) {
                                                return next.call(decoratedObserver, value);
                                            }
                                        }
                                    }
                                });
                        innerObserver[indexSymbol] = nextObserverIndex;

                    if (innerObservable) {
                        observers[nextObserverIndex] = innerObservable.observe(innerObserver);

                        numObservers++;
                        nextObserverIndex++;
                    }
                },
                outerObserver = 
                    Object.create(
                        observerPrototype,
                        {
                            next: {
                                value: function(innerObservable) {
                                    observables.push(innerObservable);
                                    observeInner();
                                }
                            }
                        });
                outerObserver[indexSymbol] = 0;

            observers[0] = self.observe(outerObserver);

            return decoratedObserver;
        });
    },    
    switchLatest: function(delayErrors) {
        var self = this;

        return new Observable(function observe(observer) {
            var indexSymbol = Symbol("index"), // key at which index of observer can be found. Index of each observer in observers map is stored at this symbol. This won't be necessary when we have Map.
                innerObservable,
                observers = {},
                numObservers = 0,
                errors = [],
                onDone = function() {
                    var key,
                        innerObserver,
                        returnFn;

                    if (innerObserver = observers[numObservers - 1]) {
                        innerObserver.return();
                    }

                    if (outerObserver) {
                        outerObserver.return();
                    }
                },
                decoratedObserver = decorate(observer, onDone),
                innerObserverPrototype = {
                    throw: function(e) {
                        delete observers[this[indexSymbol]];
                        
                        errors.push(e);                            

                        if (!delayErrors || !outerObserver) {
                            return decoratedObserver.throw(errors.length > 1 ? {errors: errors} : errors[0]);
                        }
                    },
                    return: function(v) {
                        delete observers[this[indexSymbol]];
                        
                        if (!outerObserver) {
                            return decoratedObserver.return(v);
                        }
                    }
                },
                outerObserver = 
                    Object.create(
                        {
                            throw: function(e) {
                                var innerObserver = observers[numObservers - 1];
                                outerObserver = undefined;
                                
                                errors.push(e);                            

                                if (!delayErrors || !innerObserver) {
                                    return decoratedObserver.throw(errors.length > 1 ? {errors: errors} : errors[0]);
                                }
                            },
                            return: function(v) {
                                var innerObserver = observers[numObservers - 1];
                                outerObserver = undefined;
                                
                                if (!innerObserver) {
                                    return decoratedObserver.return(v);
                                }
                            }
                        },
                        {
                            next: {
                                value: function(innerObservable) {
                                    var innerObserver = observers[numObservers - 1];

                                    if (innerObserver) {
                                        innerObserver.return();
                                    }

                                    innerObserver = 
                                        Object.create(
                                            innerObserverPrototype, 
                                            {
                                                next: {
                                                    value: function(value) {
                                                        return decoratedObserver.next(value);
                                                    }
                                                }
                                            });

                                    innerObserver[indexSymbol] = numObservers;
                                    observers[numObservers] = innerObservable.observe(innerObserver);
                                    numObservers++;
                                }
                            }
                        });

            outerObserver = self.observe(outerObserver);

            return decoratedObserver;
        });
    },
    /*exclusive: function(delayErrors) {
        var self = this;

        return new Observable(function observe(observer) {
            var indexSymbol = Symbol("index"), // key at which index of observer can be found. Index of each observer in observers map is stored at this symbol. This won't be necessary when we have Map.
                observers = {},
                numObservers = 1,
                next = observer.next,
                errors = [],
                onDone = function() {
                    var key,
                        innerObserver,
                        returnFn;

                    for(key in observers) {
                        innerObserver = observers[key];
                        if (innerObserver) {
                            returnFn = innerObserver.return;
                            if (returnFn) {
                                returnFn.call(innerObserver);
                            }
                        }
                    }
                },
                decoratedObserver = decorate(observer, onDone),
                observerPrototype = {
                    throw: function(e) {
                        observers[this[indexSymbol]] = undefined;
                        numObservers--;
                        
                        errors.push(e);                            

                        if (delayErrors && numObservers > 0) {
                            if (observable[1]) {
                                observeInner();
                            }
                        }
                        else {
                            decoratedObserver.throw(errors.length > 1 ? {errors: errors} : errors[0]);
                        }
                    },
                    return: function(v) {
                        observers[this[indexSymbol]] = undefined;
                        numObservers--;

                        if (observable) {
                            observeInner();
                        }
                        else if (observers[0] === undefined) {
                            if (returnFn) {
                                result = returnFn.call(decoratedObserver, v);
                            }
                        }
                    }
                },                             
                observeInner = function() {
                    var innerObservable = observable,
                        innerObserver;
                    observable = undefined;

                    if (innerObservable) {
                        innerObserver = 
                            Object.create(
                                observerPrototype, 
                                {
                                    next: {
                                        value: function(value) {
                                            if (next) {
                                                return next.call(decoratedObserver, value);
                                            }
                                        }
                                    }
                                });
                        innerObserver[indexSymbol] = 1;

                        observers[1] = innerObservable.observe(innerObserver);

                        numObservers++;
                    }
                },
                outerObserver = 
                    Object.create(
                        observerPrototype,
                        {
                            next: {
                                value: function(innerObservable) {
                                    observable = innerObservable;
                                    if (observers[1]) {
                                        observers[1].return();
                                    }
                                    else {
                                        observeInner();
                                    }
                                }
                            }
                        });
                outerObserver[indexSymbol] = 0;

            observers[0] = self.observe(outerObserver);

            return decoratedObserver;
        });
    },*/
    merge: function() {
        return Observable.from(
            [this].concat(
                Array.prototype.slice.
                    call(arguments).
                    map(function(i) {
                        return i instanceof Observable ? i : Observable.of(i);
                    }))).
            mergeAll();
    },
    concat: function() {
        return Observable.from(
            [this].concat(
                Array.prototype.slice.
                    call(arguments).
                    map(function(i) {
                        return i instanceof Observable ? i : Observable.of(i);
                    }))).
            concatAll();
    },
    mergeMap: function(projection) {
        return this.map(projection).mergeAll();
    },
    concatMap: function(projection) {
        return this.map(projection).concatAll();
    },
    switchMap: function(projection) {
        return this.map(projection).switchLatest();
    },
    exclusiveMap: function(projection) {
        return this.map(projection).exclusive();
    }
};


module.exports.Observable = Observable;










},{"asap":1,"es6-symbol":3,"promise":19}]},{},[25])
(25)
});