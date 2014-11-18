# Async Generators in ES7

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

|               | Pull          | Push          |
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

If a generator function modifies a function and causes it to return multiple values and the async modifier causes functions to push their values, _an asynchronous generator funciton must push multiple values_. What data type fits this description?

## What does an async generator function return?

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

The Iterator is a data source which can return a value, an error (via throw), or a final value (IterationResult::value where done === true):

```JavaScript
interface Observer {
  void next(value);
  void return(returnValue);
  void throw(error);
}
```

The Observer is a data sink which can be pushed a value, an error, or a final value (via return).

### Iteration and Observation

The difference between Iteration and Observation is which party is in control: the consumer or the producer. 

In Iteration the consumer is in control, because the consumer initiates the request for the next value. In this example a function consumes all of the data in an Array using iteration.

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

ES6 adds special support for Iteration by adding syntactic support via for...of, and ensuring all built-in collections implement the new Iterable contract:

```JavaScript
interface Iterable {
  Iterator @@iterator()
}
```

Using the new ES6 for...of syntax, the program above can be rewritten like this:

```JavaScript
function printNums(arr) {
  for(var value of arr) {
    console.log(value);
  }
}
```

Pure Iteration and Observation are both unidirectional comunication protocols. They are like long-term, one-sided conversations between a producer and a consumer. 

In 

interface Generator {
  IterationResult next(value);
  IterationResult throw(error);
  IterationResult return(returnValue);
}

Generators allow two functions to have a long-term conversation.

Async generators can be transpiled into Async functions. A transpiler is in the works.

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

