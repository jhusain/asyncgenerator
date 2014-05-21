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

var microTaskScheduler = {
    schedule: function(action) {
        // will be window.asap in ES7
        setTimeout(action);
    }
};

function Observable(observeDefn) {
    this.observe = observeDefn;
}

Observable.fromEventPattern = function(add, remove, scheduler) {
    scheduler = scheduler || microTaskScheduler;

    return new Observable(function fromEventPatternObserve(iterator) {
        var next = iterator.next;
        var handler = function() {
            if (next) {
                next.apply(iterator, Array.prototype.slice.call(arguments));
            }
        };

        scheduler.schedule(function() { add(handler) });

        return decorate(iterator, function() {
            remove(handler);
        });
    });
};

// Convert any DOM event into an async generator
Observable.fromEvent = function(dom, eventName, syncAction, scheduler) {
    scheduler = scheduler || microTaskScheduler;

    return new Observable(function fromEventObserve(iterator) {
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
            
        scheduler.schedule(function() {
            dom.addEventListener(eventName, handler)
        });

        return decoratedIterator;
    });
};

Observable.empty = function(scheduler) {
    scheduler = scheduler || microTaskScheduler;
    return new Observable(function emptyObserve(iterator) {
        var decoratedIterator = decorate(iterator);

        scheduler.schedule(function() { decoratedIterator.return(); });

        return decoratedIterator;
    });
};

Observable.from = function(arr, scheduler) {
    scheduler = scheduler || microTaskScheduler;

    return new Observable(function fromObserve(iterator) {
        var done = false,
            decoratedIterator = decorate(iterator, function() {
                done = true;
            });

        scheduler.schedule(function() {
            for(var count = 0; count < arr.length; count++) {
                if (done) {
                    return;
                }
                iterator.next(arr[count]);
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
                                    return next.call(iterator, projection.call(thisArg, value), index++, this);
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
                                var next = iterator.next;
                                if (next && predicate.call(thisArg, value)) {
                                    return next.call(iterator, value);
                                }
                            }
                        }
                    })
            });
    },
    some: function(callback, thisArg) {
       return this.lift(
            function(iterator) {
                var next = iterator.next;
                var returnFn = iterator.return;
                var value;
                thisArg = thisArg !== undefined ? thisArg : this;
                return Object.create(
                    iterator,
                    {
                        next: {
                            value: function(v) {
                                var result;
                                if (next && callback.call(thisArg, v)) {
                                    value = v;
                                    result = next.call(iterator, true);
                                    this.return();
                                    return result;
                                }
                            }
                        },
                        return: {
                            value: function() {
                                if (value === undefined && returnFn) {
                                    returnFn.call(this);
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
        return this.toArray().mergeMap(function(arr) {
            return Observable.from(arr.reverse());
        });
    },
    toArray: function() {
        return this.reduce(function(acc, cur) {
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
                                var result;                            
                                if (next) {
                                    result = next.call(iterator, value);
                                }
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
    mergeAll: function(delayErrors) {
        var self = this;

        return new Observable(function observe(iterator) {
            var iterators = {},
                numIterators = 1,
                nextIteratorIndex = 1,    
                returnFn = iterator.return,
                next = iterator.next,
                throwFn = iterator.throw,              
                dispose = function() {
                    for(var key in iterators) {
                        var innerIterator = iterators[key],
                            returnFn;
                        if (innerIterator) {
                            returnFn = innerIterator.return;
                            if (returnFn) {
                                returnFn.call(innerIterator);
                            }
                        }
                    }
                    iterators = undefined;
                },
                throwFn = function(e) {
                    delete iterators[this.index];
                    numIterators--;

                    dispose();           

                    if (throwFn) {
                        throwFn.call(iterator, e);
                    }                                
                };

            iterators[0] =
                self.observe({
                    index: 0,
                    next: function(innerObservable) {
                        iterators[nextIteratorIndex] = 
                            innerObservable.observe(
                            {
                                index: nextIteratorIndex,
                                next: function(value) {
                                    if (next) {
                                        return next.call(iterator, value);
                                    }
                                },
                                throw: throwFn,
                                return: function(v) {
                                    delete iterators[this.index];
                                    numIterators--;

                                    if (numIterators === 0) {
                                        if (returnFn) {
                                            return returnFn.call(iterator, v);
                                        }
                                    }
                                    // NOTE THAT WE ONLY CAPTURE THE LAST RETURN VALUE
                                }
                            });

                        nextIteratorIndex++;
                        numIterators++;
                    },
                    throw: throwFn,
                    return: function(v) {
                        delete iterators[this.index];
                        numIterators--;

                        if (numIterators === 0) {
                            if (returnFn) {
                                return returnFn.call(iterator, v);
                            }
                        }
                        else {
                            if (v !== undefined && next) {
                                return this.next(v);
                            }
                        }
                    }
                });

            return Object.create(
                iterator,
                {
                    return: {
                        value: function(value) {
                            dispose();
                            if (returnFn && value !== undefined) {
                                returnFn.call(iterator, value);
                            }
                        }
                    }
                });
        });
    },
    concatAll: function() {
        var self = this;
        return new Observable(function observe(iterator) {
            var outerIterator,
                innerIterator,
                observables = [],
                returnFn = iterator.return,
                next = iterator.next,
                throwFn = iterator.throw,
                observeInnerObservable = function(innerObservable) {
                    innerIterator = 
                        innerObservable.observe(
                        {
                            next: function(value) {
                                if (next) {
                                    return next.call(iterator, value);
                                }
                            },
                            throw: function(e) {
                                innerIterator = undefined;
                                if (outerIterator) {
                                    outerIterator.return();
                                }

                                if (throwFn) {
                                    throwFn.call(iterator, e);
                                }                                
                            },
                            return: function(v) {
                                var result;

                                innerIterator = undefined;

                                observables.shift();
                                if (observables.length > 0) {
                                    observeInnerObservable(observables[observables.length - 1]);
                                }
                                else if (outerIterator === undefined) {
                                    if (returnFn) {
                                        result = returnFn.call(iterator, v);
                                    }
                                }

                                return result;
                            }
                        });
                };

            outerIterator =
                self.observe({
                    next: function(innerObservable) {
                        var self = this;
                        
                        observables.push(innerObservable);
                        if (observables.length === 1) {
                            observeInnerObservable(innerObservable);
                        }
                    },
                    throw: function(e) {
                        var throwFn = iterator.throw;              
                        outerIterator = undefined;

                        if (innerIterator)
                            innerIterator.return();

                        if (throwFn) {
                            throwFn.call(iterator, e);
                        }                                
                    },
                    return: function(v) {
                        outerIterator = undefined;

                        if (!innerIterator) {
                            if (returnFn) {
                                return returnFn.call(iterator, v);
                            }
                        }
                    }
                });

            return Object.create(
                iterator,
                {
                    return: {
                        value: function(value) {
                            if (outerIterator) {
                                outerIterator.return();
                            }
                            if (innerIterator) {
                                innerIterator.return();
                            }

                            if (returnFn && value !== undefined) {
                                returnFn.call(iterator, value);
                            }
                        }
                    }
                });
        });
    },   
    switchLatest: function() {
        var self = this;
        return new Observable(function observe(iterator) {
            var outerIterator,
                innerIterator,
                observable,
                returnFn = iterator.return,
                next = iterator.next,
                throwFn = iterator.throw;               

            outerIterator =
                self.observe({
                    next: function(innerObservable) {
                        var self = this;
                        if (observable) {
                            innerIterator.return();
                        }
                        observable = innerObservable;
                        innerIterator = 
                            innerObservable.observe(
                            {
                                next: function(value) {
                                    if (next) {
                                        return next.call(iterator, value);
                                    }
                                },
                                throw: function(e) {
                                    observable = undefined;
                                    innerIterator = undefined;
                                    if (outerIterator) {
                                        outerIterator.return();
                                    }

                                    if (throwFn) {
                                        throwFn.call(iterator, e);
                                    }                                
                                },
                                return: function(v) {
                                    var result;

                                    innerIterator = undefined;
                                    observable = undefined;
                                    if (outerIterator === undefined) {
                                        if (returnFn) {
                                            result = returnFn.call(iterator, v);
                                        }
                                    }

                                    return result;
                                }
                            });
                    },
                    throw: function(e) {
                        var throwFn = iterator.throw;              
                        outerIterator = undefined;
                        observable = undefined;

                        if (innerIterator)
                            innerIterator.return();

                        if (throwFn) {
                            throwFn.call(iterator, e);
                        }                                
                    },
                    return: function(v) {
                        outerIterator = undefined;

                        if (!innerIterator) {
                            if (returnFn) {
                                return returnFn.call(iterator, v);
                            }
                        }
                    }
                });

            return Object.create(
                iterator,
                {
                    return: {
                        value: function(value) {
                            if (outerIterator) {
                                outerIterator.return();
                            }
                            if (innerIterator) {
                                innerIterator.return();
                            }

                            observable = undefined;

                            if (returnFn && value !== undefined) {
                                returnFn.call(iterator, value);
                            }
                        }
                    }
                });
        });
    },    
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
    }
};

