var fs = require('fs');
var browserify = require('browserify');
var b = browserify();
b.add('./src/observable.js');
b.bundle({standalone:'asyncgenerator'}).pipe(fs.createWriteStream("./asyncgenerator.js"));
