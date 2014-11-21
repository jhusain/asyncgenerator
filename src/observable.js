var Promise = require('promise');
var Symbol = require('es6-symbol');

var asap = require('asap');

function decorate(iterator, onDone) {
    var done = false,
        nextFn = iterator.next;

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

    return new Observable(function observe(generator) {
        var handler,
            decoratedGenerator =
            decorate(
                generator, 
                function() {
                    remove(handler);
                }),
            next = decoratedGenerator.next;

        handler = function() {
            if (next) {
                next.apply(decoratedGenerator, Array.prototype.slice.call(arguments));
            }
        };

        scheduler(function() { add(handler) });

        return decoratedGenerator;
    });
};

// Convert any DOM event into an async generator
Observable.fromEvent = function(dom, eventName, syncAction, scheduler) {
    scheduler = scheduler || microTaskScheduler;

    return new Observable(function fromDOMEventObserve(generator) {
        var handler,
            decoratedGenerator = 
                decorate(
                    generator,
                    function onDone() {
                         dom.removeEventListener(eventName, handler);
                    });

            handler = function(e) {
                if (syncAction) {
                    syncAction(e);
                }

                decoratedGenerator.next(e);
            };
                
        scheduler(function() {
            dom.addEventListener(eventName, handler)
        });

        return decoratedGenerator;
    });
};

Observable.empty = function(scheduler) {
    scheduler = scheduler || microTaskScheduler;
    return new Observable(function(generator) {
        var done = false,
            decoratedGenerator = decorate(generator);

        scheduler(decoratedGenerator.return.bind(decoratedGenerator));

        return decoratedGenerator;
    });
};

Observable.from = function(arr, scheduler) {
    scheduler = scheduler || microTaskScheduler;

    return new Observable(function(generator) {
        var done = false,
            decoratedGenerator = 
                decorate(generator, function() { done = true });

        scheduler(function() {
            for(var count = 0; count < arr.length; count++) {
                if (done) {
                    return;
                }
                decoratedGenerator.next(arr[count]);
            }
            if (done) {
                return;
            }
            decoratedGenerator.return();
        });

        return decoratedGenerator;
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
    return new Observable(function forEach(generator) {
        var handle,
            decoratedGenerator = decorate(generator, function() { clearInterval(handle); });

        handle = setInterval(function() {
            decoratedGenerator.next();
        }, time);

        return decoratedGenerator;
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
    lift: function(generatorTransform) {
        var self = this;
        return new Observable(function(generator) {
            return self.observe(generatorTransform.call(this, generator));
        });
    },
    map: function(projection, thisArg) {
        var index = 0;
        return this.lift(
            function(generator) {
                thisArg = thisArg !== undefined ? thisArg : this;            
                return Object.create(
                    generator,
                    {
                        next: {
                            value: function(value) {
                                var next = generator.next;
                                if (next) {
                                    try {
                                        return next.call(generator, projection.call(thisArg, value), index++, this);
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
            function(generator) {
                thisArg = thisArg !== undefined ? thisArg : this;
                return Object.create(
                    generator,
                    {
                        next: {
                            value: function(value) {
                                var next = generator.next,
                                    throwFn;

                                if (next && predicate.call(thisArg, value)) {
                                    try {
                                        return next.call(generator, value);    
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
            function(generator) {
                var next = generator.next,
                    returnFn = generator.return,
                    index = 0,
                    self = this;

                return Object.create(
                    generator,
                    {
                        next: {
                            value: function(value) {  
                                if (initialValue === undefined) {
                                    acc = value;
                                }
                                else if (next && predicate(value)) {
                                    return next.call(generator, combiner.call(null, acc, value, index++, self));
                                }
                            }
                        },
                        return: {
                            value: function(value) {
                                if (next) {
                                    next.call(generator, acc);
                                }
                                if (returnFn) {
                                    return returnFn.call(generator, value);
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
            function(generator) {
                var next = generator.next,
                    returnFn = generator.return;

                return Object.create(
                    generator,
                    {
                        next: {
                            value: function(value) {  
                                if (next) {
                                    next.call(generator, value);
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
            function(generator) {
                var next = generator.next,
                    returnFn = generator.return;

                return Object.create(
                    generator,
                    {
                        next: {
                            value: function(value) {  
                                lastValue = value;
                            }
                        },
                        return: {
                            value: function(value) {
                                if (next && lastValue !== undefined) {
                                    next.call(generator, lastValue);
                                }
                                if (returnFn) {
                                    return returnFn.call(generator, value);
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
            function(generator) {
                var next = generator.next,
                    returnFn = generator.return;

                return Object.create(
                    generator,
                    {
                        next: {
                            value: function(value) {  
                                num--;
                                if (num < 0 && next) {
                                    next.call(generator,value);
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
            function(generator) {
                var next = generator.next;
                return Object.create(
                    generator,
                    {
                        next: {
                            value: function(value) {                            
                                var result = next.call(generator, value);

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
        return new Observable(function(generator) {
            var next = generator.next,
                throwFn = generator.throw,
                returnFn = generator.return,
                decoratedGenerator,
                stopGenerator = 
                    stops.observe({
                        done: false,
                        next: function(v) {
                            stopGenerator.return();
                            return decoratedGenerator.return();
                        },
                        throw: function(e) {
                            return decoratedGenerator.throw(e);
                        },
                        return: function(v) {
                            return decoratedGenerator.return();
                        }
                    });

                decoratedGenerator =
                    self.observe(
                        Object.create(
                            generator,
                            {
                                throw: {
                                    value: function(e) {
                                        stopGenerator.return();
                                        if (throwFn) {
                                            throwFn.call(generator, e);
                                        }
                                    }
                                },
                                return: {
                                    value: function(value) {
                                        stopGenerator.return();
                                        if (returnFn) {
                                            returnFn.call(this, value);
                                        }
                                    }
                                }
                            }));

                return decoratedGenerator;
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









