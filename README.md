# Async Generator Proposal (ES7)

Async Generators are currently proposed for ES7 and are at the strawman phase. This proposal builds on the [async function](https://github.com/lukehoban/ecmascript-asyncawait) proposal.

JavaScript programs are single-threaded and therefore must streadfastly avoid blocking on IO operations. Today web developers must deal with a steadily increasing number of push stream APIs:

* Server sent events
* Web sockets
* DOM events

Developers should be able to easily consume these push data sources, as well as compose them together to build complex concurrent programs.

ES6 introduced generator functions for producing data via iteration, and a new for...of loop for consuming data via iteration.

```JavaScript
// data producer
function* nums() {
  yield 1;
  yield 2;
  yield 3;
}

// data consumer
function printData() {
  for(var x of nums()) {
    console.log(x);
  }
}
```

These features are ideal for progressively consuming data stored in collections or lazily-produced by computations. However they are not well-suited to consuming asynchronous streams of information, because Iteration is synchronous. 

The async generator proposal attempts to solve this problem by adding symmetrical support for Observation to ES7. It would introduce asynchronous generator functions for producing data via _observation_, and a new for..._on_ loop for consuming data via observation.

```JavaScript
// data producer
async function* nums() {
  yield 1;
  yield 2;
  yield 3;
}

// data consumer
async function printData() {
  for(var x on nums()) {
    console.log(x);
  }
}
```

The for..._on_ loop would allow any of the web's many push data streams to be consumed using the simple and familiar loop syntax. Here's an example that returns the a stream of stock price deltas that exceed a threshold.

```JavaScript
async function* getPriceSpikes(stockSymbol, threshold) {
  var delta,
    oldPrice,
    price;
    
  for(var price on toObservable(new WebSocket("ws://www.fakedomain.com/stockstream/" + stockSymbol))) {
    if (oldPrice == null) {
      oldPrice = price;
    }
    else {
      delta = Math.abs(price - oldPrice);
      oldPrice = price;
      if (delta > threshold) {
        yield {price, oldPrice};
      }
    }
  }
}

// get the first price that differs from previous spike by $5.00
getPriceSpikes("JNJ", 5.00).then(priceDelta => console.log("PRICE SPIKE:", priceDelta));
```

## Introducing Async Generators

An ES6 generator function differs from a normal function, in that it returns multiple values:

```JavaScript
function *nums() {
  yield 1;
  yield 2;
}

for(var num of nums) {
  console.log(num);
}
```

An [async function](https://github.com/lukehoban/ecmascript-asyncawait) (currently proposed for ES7) differs from a normal function, in that it _pushes_ its return value asynchronously via a Promise. A value is _pushed_ if it is delivered in the argument position, rather than in the return position.

```JavaScript
function getStockPrice(name) {
  return getPrice(getSymbol(name));
}

try {
  //  data delivered in return position
  var price = getStockPrice("JNJ");
  console.log(price);
}
catch(e) {
  console.error(e);
}

// async version of getStockPrice function
function async getStockPriceAsync(name) {
  return await getPriceAsync(await getSymbolAsync(name));
}

getStockPriceAsync("JNJ").
  then(
    // data delievered in argument position (push)
    price => console.log(price),
    error => console.error(error));
```

We can view these language features in a table like so:

|               | Sync          | Async         |
| ------------- |:-------------:|:-------------:|
| function      | T             | Promise<T>    |
| function*     | Iterator<T>   |      ???      |

An obvious question presents itself: _"What does an async generator function return?"_

```JavaScript
async function *getStockPrices(stockName, currency) {
  for(var price on getPrices(await getStockSymbol(stockName))) {
    yield convert(price, currency);
  }
}

// What type is prices?
var prices = getStockPrices("JNJ", "CAN");
```

If a generator function modifies a function and causes it to return multiple values and the async modifier causes functions to push their values, _an asynchronous generator function must push multiple values_. What data type fits this description?

## Introducing Observable

ES6 introduces the Generator interface, which is a combination of two different interfaces:

1. Iterator
2. Observer

The Iterator is a data source that can return a value, an error (via throw), or a final value (value where IterationResult::done).

```JavaScript
interface Iterator {
  IterationResult next();
}

type IterationResult = {done: boolean, value: any}

interface Iterable {
  Iterator iterator();
}
```

The Observer is a data _sink_ which can be pushed a value, an error (via throw()), or a final value (return()):

```JavaScript
interface Observer {
  void next(value);
  void return(returnValue);
  void throw(error);
}
```

These two data types mixed together forms a Generator:

```JavaScript
interface Generator {
  IterationResult next(value);
  IterationResult return(returnValue);
  IterationResult throw(error);
}
```

Iteration and Observation both enable a consumer to progressively retrieve 0...N values from a producer. _The only difference between Iteration and Observation is the party in control._ In iteration the consumer is in control because the consumer initiates the request for a value, and the producer must synchronously respond. 

In this example a consumer requests an Iterator from an Array, and progressively requests the next value until the stream is exhausted.

```JavaScript
function printNums(arr) {
  // requesting an iterator from the Array, which is an Iterable
  var iterator = arr[@@iterator](),
    pair;
  // consumer (this function)
  while(!(pair = iterator.next()).done) {
    console.log(pair.value);
  }
}
```

This code relies on the fact that in ES6, all collections implement the Iterable interface. ES6 also added special support for...of syntax, the program above can be rewritten like this:

```JavaScript
function printNums(arr) {
  for(var value of arr) {
    console.log(value);
  }
}
```

ES6 added great support for Iteration, but currently there is no equivalent of the Iterable type for Observation. How would we design such a type? By taking the dual of the Iterable type.

```JavaScript
interface Iterable {
  Generator @@iterator()
}
```

The dual of a type is derived by swapping the argument and return types of its methods, and taking the dual of each term. The dual of a Generator is a Generator, because it is symmetrical. The generator can both accept and return the same three types of notifications:

1. data
2. error
3. final value

Therefore all that is left to do is swap the arguments and return type of the Iterator's iterator method and then we have an Observable.

```JavaScript
interface Observable {
  void @@observer(Generator observer)
}
```

This interface is too simple. If iteration and observation can be thought of as long running functions, the party that is not in control needs a way to short-circuit the operation. In the case of observation, the producer is in control. As a result the consumer needs a way of terminating observation. If we use the terminology of events, we would say the consumer needs a way to _unsubscribe_. To allow for this, we make the following modification to the Observable interface:

```JavaScript
interface Observable {
  Generator @@observer(Generator observer)
}
```

This version of the Observable interface both accepts _and returns_ a Generator. The consumer can short-circuit observation (unsubscribe) by invoking the return() method on the Generator object returned for the Observable @@observer method. To demonstrate how this works, let's take a look at how we can adapt a common push stream API (DOM event) to an Observable.

```JavaScript
// The decorate method accepts a generator and dynamically inherits a new generator from it
// using Object.create. The new generator wraps the next, return, and throw methods, 
// intercepts any terminating operations, and invokes an onDone callback.
// This includes calls to return, throw, or next calls that return a pair with done === true
function decorate(generator, onDone) {
  var decoratedGenerator = Object.create(generator);
  decoratedGenerator.next = function(v) {
    var pair = generator.next(v);
    // if generator returns done = true, invoke onDone callback
    if (pair && pair.done) {
      onDone();
    }
    
    return pair;
  };
  
  ["throw","return"].forEach(method => {
    var superMethod = generator[method];
    decoratedGenerator[method] = function(v) {
      // if either throw or return invoked, invoke onDone callback
      onDone();
      superMethod.call(generator, v);
    };
  });
}

// Convert any DOM event into an async generator
Observable.fromEvent = function(dom, eventName) {
  // An Observable is created by passing the defn of its observer method to its constructor
  return new Observable(function observer(generator) {
      var handler,
        decoratedGenerator = 
          decorate(
              generator,
              // callback to invoke if generator is terminated
              function onDone() {
                   dom.removeEventListener(eventName, handler);
              });
        handler = function(e) {
          decoratedGenerator.next(e);
        };
      
      dom.addEventListener(eventName, handler);
      
      return decoratedGenerator;
  });
};

// Adapt a DOM element's mousemoves to an Observable
var mouseMoves = Observable.fromEvent(document.createElement('div'), "mousemove");

// subscribe to Observable stream of mouse moves
var decoratedGenerator = mouseMoves[@@observer]({
  next(e) {
    console.log(e);
  }
});

// unsubscribe 2 seconds later
setTimeout(function() {
  // short-circuit the observation/unsubscribe
  decoratedGenerator.return();
}, 2000);
```

Observable is the data type that a function modified by both * and async returns, because it _pushes_ multiple values.

|               | Sync          | Async         |
| ------------- |:-------------:|:-------------:|
| function      | T             | Promise<T>    |
| function*     | Iterator<T>   | Observable<T> |

 An Observable accepts a generator and pushes it 0...N values and optionally terminates by either pushing an error or a return value. The consumer can also short-circuit by calling return() on the Generator object returned from the Observable's @@observer method. 

In ES7, any collection that is Iterable should also be Observable. Here is an implementation for Array.

```
Array.prototype[@@observer] = function(observer) {
  var done,
    decoratedObserver = decorate(observer, () => done = true);
    
  for(var x of this) {
    decoratedObserver.next(v);
    if (done) {
      return;
    }
  }
  decoratedObserver.return();
  
  return decoratedObserver;
};
```

## Adapting existing push APIs to Observable

It's easy to adapt the web's many push stream APIs to Observable.

### Adapting DOM events to Observable
```JavaScript
Observable.fromEvent = function(dom, eventName) {
  // An Observable is created by passing the defn of its observer method to its constructor
  return new Observable(function observer(generator) {
      var handler,
        decoratedGenerator = 
          decorate(
              generator,
              // callback to invoke if generator is terminated
              function onDone() {
                   dom.removeEventListener(eventName, handler);
              });
        handler = function(e) {
          decoratedGenerator.next(e);
        };
      
      dom.addEventListener(eventName, handler);
      
      return decoratedGenerator;
  });
};
```

### Adapting Object.observe to Observable

```JavaScript
Observable.fromEventPattern = function(add, remove) {
  // An Observable is created by passing the defn of its observer method to its constructor
  return new Observable(function observer(generator) {
    var handler,
      decoratedGenerator =
        decorate(
            generator, 
            function() {
                remove(handler);
            });

    handler = decoratedGenerator.next.bind(decoratedGenerator);
    
    add(handler);

    return decoratedGenerator;
  });
};

Object.observations = function(obj) {
    return Observable.fromEventPattern(
        Object.observe.bind(Object, obj), 
        Object.unobserve.bind(Object, obj));
};
```

### Adapting WebSocket to Observable

```JavaScript

Observable.fromWebSocket = function(ws) {
  // An Observable is created by passing the defn of its observer method to its constructor
  return new Observable(function observer(generator) {
    var done = false,
      decoratedGenerator = 
        decorate(
          generator,
          () => {
            if (!done) {
              done = true;
              ws.close();
              ws.onmessage = null;
              ws.onclose = null;
              ws.onerror = null;
            }
          });
    
    ws.onmessage = function(m) {
      decoratedGenerator.next(m);
    };
    
    ws.onclose = function() {
      done = true;
      decoratedGenerator.return();
    };
    
    ws.onerror = function(e) {
      done = true;
      decoratedGenerator.throw(e);
    };
    
    return decoratedGenerator;
  });
}
```

### Adapting setInterval to Observable

```JavaScript
Observable.interval = function(time) {
  return new Observable(function observer(generator) {
      var handle,
          decoratedGenerator = decorate(generator, function() { clearInterval(handle); });

      handle = setInterval(function() {
          decoratedGenerator.next();
      }, time);

      return decoratedGenerator;
  });
};
```
## Observable Composition

The Observable type is composable. Once the various push stream APIs have been adapted to the Observable interface, it becomes possible to build complex asynchronous applications via composition instead of state machines. Third party libraries (a la Underscore) can easily be written which allow developers to build complex asynchronous applications using a declarative API similar to that of JavaScript's Array. Examples of such methods defined for Observable are included in this repo, but are _not_ proposed for standardization.

Let's take the following three Array methods:
```JavaScript
[1,2,3].map(x => x + 1) // [2,3,4]
[1,2,3].filter(x => x > 1) // [2,3]
```
Now let's also imagine that Array had the following method:
```JavaScript
[1,2,3].concatMap(x => [x + 1, x + 2]) // [2,3,3,4,4,5]
```
The concatMap method is a slight variation on map. The function passed to concatMap _must_ return an Array for each value it receives. This creates a tree. Then concatMap concatenates each inner array together left-to-right and flattens the tree by one dimension.
```JavaScript
[1,2,3].map(x => [x + 1, x + 2]) // [[2,3],[3,4],[4,5]]
[1,2,3].concatMap(x => [x + 1, x + 2]) // [2,3,3,4,4,5]
```
Note: Some may know concatMap by the name "flatMap", but I use the name concatMap deliberately and the reasons will soon become obvious.

These three methods are surprisingly versatile. Here's an example of some code that retrieves your favorite Netflix titles.

```JavaScript
var user = {
  genreLists: [
    {
      name: "Drama",
      titles: [
        { id: 66, name: "House of Cards", rating: 5 },
        { id: 22, name: "Orange is the New Black", rating: 5 },
        // more titles snipped
      ]
    },
    {
      name: "Comedy",
      titles: [
        { id: 55, name: "Arrested Development", rating: 5 },
        { id: 22, name: "Orange is the New Black", rating: 5 },
        // more titles snipped
      ]
    },
    // more genre lists snipped
  ]
}

// for each genreList, the map fn returns an array of all titles with
// a rating of 5.0.  These title arrays are then concatenated together 
// to create a flat list of the user's favorite titles.
function getFavTitles(user) {
  return user.genreLists.concatMap(genreList =>
    genreList.titles.filter(title => title.rating === 5));
}

// we consume the titles and write the to the console
getFavTitles(user).forEach(title => console.log(title.rating));

```
Using nearly the same code, we can build a drag and drop event. Observables are streams of values that arrive over time. They can be composed using the same Array methods we used in the example above (and a few more).
In this example we compose Observables together to create a mouse drag event for a DOM element.

```JavaScript
// for each mouse down event, the map fn returns the stream
// of all the mouse move events that will occur until the
// next mouse up event. This creates a stream of streams,
// each of which is concatenated together to form a flat
// stream of all the mouse drag events there ever will be.
function getMouseDrags(elmt) {
  var mouseDowns = Observable.fromEvent(elmt, "mousedown"),
  var documentMouseMoves = Observable.fromEvent(document.body, "mousemove"),
  var documentMouseUps = Observable.fromEvent(document.body, "mouseup");
  
  return mouseDowns.concatMap(mouseDown =>
    documentMouseMoves.takeUntil(documentMouseUps));
};

var image = document.createElement("img");
document.body.appendChild(image);

getMouseDrags(image).forEach(dragEvent => {
  image.style.left = dragEvent.clientX;
  image.style.top = dragEvent.clientY;
});
```

## A quick aside about Iterable and duality

The fact that the Observable and Iterable interface are not strict duals is a smell. If Observation and Iteration are truly dual, the correct definition of Iterable should be this:

```JavaScript
interface Iterable {
  Generator iterator(Generator);
}
```
In fact this definition is more useful than the current ES6 definition. In iteration, the party not in control is the producer. Using the same decorator pattern, the producer can now short-circuit the iterator without waiting for the consumer to call next. All the producer must do is invoke return() on the Generator passed to it, and the consumer will be notified. Now we have achieved duality, and given the party that is not in control the ability to short-circuit. I contend that collections should implement this new Iterable contract in ES7.

# Transpilation

Async generators can be transpiled into Async functions. A transpiler is in the works. Here's an example of the expected output.

The following code...

```JavaScript
async function* getStockPrices(stockNames, nameServiceUrl) {
    var stockPriceServiceUrl = await getStockPriceServiceUrl();

    // observable.buffer() -> AsyncObservable that supports backpressure by buffering
    for(var name on stockNames.buffer()) {
        // accessing arguments array instead of named paramater to demonstrate necessary renaming
        var price = await getPrice(await getSymbol(name, arguments[1]), stockPriceServiceUrl),
            topStories = [];

        for(var topStory on getStories(symbol).take(10)) {
            topStories.push(topStory);

            if (topStory.length === 2000) {
                break;
            }
        }

        // grab the last value in getStories - technically it's actually the return value, not the last next() value.
        var firstEverStory = await* getStories();

        // grab all similar stock prices and return them in the stream immediately
        // short-hand for: for(var x on obs) { yield x }
        yield* getStockPrices(getSimilarStocks(symbol), nameServiceUrl);

        // This is just here to demonstrate that you shouldn't replace yields inside a function
        // scope that was present in the unexpanded source. Note that this is a regular 
        // generator function, not an async one.
        var noop = function*() {
            yield somePromise;
        };

        yield {name: name, price: price, topStories: topStories, firstEverStory: firstEverStory };
    }
}
```

...can be transpiled into the [async/await](https://github.com/lukehoban/ecmascript-asyncawait) feature proposed for ES7:

```JavaScript
function getStockPrices(stockNames, nameServiceUrl) {
    var $args = Array.prototype.slice(arguments);

    return new Observable(function forEach($observer) {
        var $done,
            $decoratedObserver = 
                decorate(
                    $observer, 
                    // code when return or throw is called on observer
                    function() { $done = true});

        // inline invoke async function. This is like using a promise as a scheduler. Necessary
        // because ES6 doesn't expose microtask API
        (async function() {
            var stockPriceServiceUrl,
                name,
                $v0,
                price,
                topStories,
                topStory,
                firstEverStory,
                noop;

            // might've returned before microtask runs. This first check must run before any other
            // code. Not that the first await inline in the variable declaration has been moved down
            // beneath this line. 
            if ($done) { return; }

            stockPriceServiceUrl = await getStockPriceServiceUrl();
            if ($done) { return; }

            // for...on becomes forEach.
            // The function passed to observable.forEach becomes a next() function  the observer.
            // If the next method returns a Promise, the Observable must wait until the Promise is
            // resolved before pushing more values. This is how backpressure works.
            // If there is any await expression (or another for on) in the body of the for on, the 
            // function passed to forEach becomes an async function. Async functions return promises
            // so backpressure will be applied.
            await stockNames.buffer().forEach(async function($name) {
                // At the top of every forEach next() function, we must check if the async
                // function is short-circtuited via observer.return(). 
                if ($done) { this.return(); return; }

                name = $name;

                $v0 = await getSymbol(name, $args[1]);
                // Unsubscription might have happened after _every_ await, so expressions need to be 
                // broken into multiple statements so that we can check for done = true after each 
                // await, and return if done = true.             
                if ($done) { this.return(); return; }

                price = await getPrice($v0, stockPriceServiceUrl);
                if ($done) { this.return(); return; }

                topStories = [];

                // body of for...on contains no awaits, so function is not async
                await getStories.forEach(function($topStory) {
                    // check for unsubscription
                    if ($done) { this.return(); return; }
                    topStory = $topStory;
                    topStories.push(topStory);

                    if (topStory.length === 2000) {
                        // break turns into a return() and return
                        this.return();
                        return;
                    }
                });
                if ($done) { this.return(); return; }

                // await* blah just expands to await blah.returnValue()
                firstEverStory = await getStories().returnValue();
                if ($done) { this.return(); return; }

                // yield* obs -> for(var x on obs) { yield x } -> 
                // await obs.forEach(function(x) { if ($done) { this.return(); return; } $decoratatedObserver.next(x); })
                await getStockPrices(getSimilarStocks(symbol), nameServiceUrl).forEach(function($v1) {
                    // check for unsubscription
                    if ($done) { this.return(); return; }

                    $decoratedObserver.next($v1);
                });
                if ($done) { this.return(); return; }

                // Note that this yield is not replaced.
                noop = function*() {
                    yield somePromise;
                };

                // Every yield statement becomes a $decoratedObserver.next()
                $decoratedObserver.next({name: name, price: price, topStories: topStories, firstEverStory: firstEverStory });
            })
        }()).
            then(
                function(value) { 
                    if (!$done) {
                        decoratedObserver.return(value); 
                    }
                },
                function(error) { 
                    if (!done) {
                        return decoratedObserver.throw(error);
                    }
                });

        return decoratedObserver;
    });
}
```

