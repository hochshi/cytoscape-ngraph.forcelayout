(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}(g.cytoscapeNgraph || (g.cytoscapeNgraph = {})).forcelayout = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){
(function (process){
// vim:ts=4:sts=4:sw=4:
/*!
 *
 * Copyright 2009-2012 Kris Kowal under the terms of the MIT
 * license found at http://github.com/kriskowal/q/raw/master/LICENSE
 *
 * With parts by Tyler Close
 * Copyright 2007-2009 Tyler Close under the terms of the MIT X license found
 * at http://www.opensource.org/licenses/mit-license.html
 * Forked at ref_send.js version: 2009-05-11
 *
 * With parts by Mark Miller
 * Copyright (C) 2011 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

(function (definition) {
    "use strict";

    // This file will function properly as a <script> tag, or a module
    // using CommonJS and NodeJS or RequireJS module formats.  In
    // Common/Node/RequireJS, the module exports the Q API and when
    // executed as a simple <script>, it creates a Q global instead.

    // Montage Require
    if (typeof bootstrap === "function") {
        bootstrap("promise", definition);

    // CommonJS
    } else if (typeof exports === "object" && typeof module === "object") {
        module.exports = definition();

    // RequireJS
    } else if (typeof define === "function" && define.amd) {
        define(definition);

    // SES (Secure EcmaScript)
    } else if (typeof ses !== "undefined") {
        if (!ses.ok()) {
            return;
        } else {
            ses.makeQ = definition;
        }

    // <script>
    } else if (typeof window !== "undefined" || typeof self !== "undefined") {
        // Prefer window over self for add-on scripts. Use self for
        // non-windowed contexts.
        var global = typeof window !== "undefined" ? window : self;

        // Get the `window` object, save the previous Q global
        // and initialize Q as a global.
        var previousQ = global.Q;
        global.Q = definition();

        // Add a noConflict function so Q can be removed from the
        // global namespace.
        global.Q.noConflict = function () {
            global.Q = previousQ;
            return this;
        };

    } else {
        throw new Error("This environment was not anticipated by Q. Please file a bug.");
    }

})(function () {
"use strict";

var hasStacks = false;
try {
    throw new Error();
} catch (e) {
    hasStacks = !!e.stack;
}

// All code after this point will be filtered from stack traces reported
// by Q.
var qStartingLine = captureLine();
var qFileName;

// shims

// used for fallback in "allResolved"
var noop = function () {};

// Use the fastest possible means to execute a task in a future turn
// of the event loop.
var nextTick =(function () {
    // linked list of tasks (single, with head node)
    var head = {task: void 0, next: null};
    var tail = head;
    var flushing = false;
    var requestTick = void 0;
    var isNodeJS = false;
    // queue for late tasks, used by unhandled rejection tracking
    var laterQueue = [];

    function flush() {
        /* jshint loopfunc: true */
        var task, domain;

        while (head.next) {
            head = head.next;
            task = head.task;
            head.task = void 0;
            domain = head.domain;

            if (domain) {
                head.domain = void 0;
                domain.enter();
            }
            runSingle(task, domain);

        }
        while (laterQueue.length) {
            task = laterQueue.pop();
            runSingle(task);
        }
        flushing = false;
    }
    // runs a single function in the async queue
    function runSingle(task, domain) {
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
                setTimeout(function () {
                    throw e;
                }, 0);
            }
        }

        if (domain) {
            domain.exit();
        }
    }

    nextTick = function (task) {
        tail = tail.next = {
            task: task,
            domain: isNodeJS && process.domain,
            next: null
        };

        if (!flushing) {
            flushing = true;
            requestTick();
        }
    };

    if (typeof process === "object" &&
        process.toString() === "[object process]" && process.nextTick) {
        // Ensure Q is in a real Node environment, with a `process.nextTick`.
        // To see through fake Node environments:
        // * Mocha test runner - exposes a `process` global without a `nextTick`
        // * Browserify - exposes a `process.nexTick` function that uses
        //   `setTimeout`. In this case `setImmediate` is preferred because
        //    it is faster. Browserify's `process.toString()` yields
        //   "[object Object]", while in a real Node environment
        //   `process.nextTick()` yields "[object process]".
        isNodeJS = true;

        requestTick = function () {
            process.nextTick(flush);
        };

    } else if (typeof setImmediate === "function") {
        // In IE10, Node.js 0.9+, or https://github.com/NobleJS/setImmediate
        if (typeof window !== "undefined") {
            requestTick = setImmediate.bind(window, flush);
        } else {
            requestTick = function () {
                setImmediate(flush);
            };
        }

    } else if (typeof MessageChannel !== "undefined") {
        // modern browsers
        // http://www.nonblocking.io/2011/06/windownexttick.html
        var channel = new MessageChannel();
        // At least Safari Version 6.0.5 (8536.30.1) intermittently cannot create
        // working message ports the first time a page loads.
        channel.port1.onmessage = function () {
            requestTick = requestPortTick;
            channel.port1.onmessage = flush;
            flush();
        };
        var requestPortTick = function () {
            // Opera requires us to provide a message payload, regardless of
            // whether we use it.
            channel.port2.postMessage(0);
        };
        requestTick = function () {
            setTimeout(flush, 0);
            requestPortTick();
        };

    } else {
        // old browsers
        requestTick = function () {
            setTimeout(flush, 0);
        };
    }
    // runs a task after all other tasks have been run
    // this is useful for unhandled rejection tracking that needs to happen
    // after all `then`d tasks have been run.
    nextTick.runAfter = function (task) {
        laterQueue.push(task);
        if (!flushing) {
            flushing = true;
            requestTick();
        }
    };
    return nextTick;
})();

// Attempt to make generics safe in the face of downstream
// modifications.
// There is no situation where this is necessary.
// If you need a security guarantee, these primordials need to be
// deeply frozen anyway, and if you don’t need a security guarantee,
// this is just plain paranoid.
// However, this **might** have the nice side-effect of reducing the size of
// the minified code by reducing x.call() to merely x()
// See Mark Miller’s explanation of what this does.
// http://wiki.ecmascript.org/doku.php?id=conventions:safe_meta_programming
var call = Function.call;
function uncurryThis(f) {
    return function () {
        return call.apply(f, arguments);
    };
}
// This is equivalent, but slower:
// uncurryThis = Function_bind.bind(Function_bind.call);
// http://jsperf.com/uncurrythis

var array_slice = uncurryThis(Array.prototype.slice);

var array_reduce = uncurryThis(
    Array.prototype.reduce || function (callback, basis) {
        var index = 0,
            length = this.length;
        // concerning the initial value, if one is not provided
        if (arguments.length === 1) {
            // seek to the first value in the array, accounting
            // for the possibility that is is a sparse array
            do {
                if (index in this) {
                    basis = this[index++];
                    break;
                }
                if (++index >= length) {
                    throw new TypeError();
                }
            } while (1);
        }
        // reduce
        for (; index < length; index++) {
            // account for the possibility that the array is sparse
            if (index in this) {
                basis = callback(basis, this[index], index);
            }
        }
        return basis;
    }
);

var array_indexOf = uncurryThis(
    Array.prototype.indexOf || function (value) {
        // not a very good shim, but good enough for our one use of it
        for (var i = 0; i < this.length; i++) {
            if (this[i] === value) {
                return i;
            }
        }
        return -1;
    }
);

var array_map = uncurryThis(
    Array.prototype.map || function (callback, thisp) {
        var self = this;
        var collect = [];
        array_reduce(self, function (undefined, value, index) {
            collect.push(callback.call(thisp, value, index, self));
        }, void 0);
        return collect;
    }
);

var object_create = Object.create || function (prototype) {
    function Type() { }
    Type.prototype = prototype;
    return new Type();
};

var object_hasOwnProperty = uncurryThis(Object.prototype.hasOwnProperty);

var object_keys = Object.keys || function (object) {
    var keys = [];
    for (var key in object) {
        if (object_hasOwnProperty(object, key)) {
            keys.push(key);
        }
    }
    return keys;
};

var object_toString = uncurryThis(Object.prototype.toString);

function isObject(value) {
    return value === Object(value);
}

// generator related shims

// FIXME: Remove this function once ES6 generators are in SpiderMonkey.
function isStopIteration(exception) {
    return (
        object_toString(exception) === "[object StopIteration]" ||
        exception instanceof QReturnValue
    );
}

// FIXME: Remove this helper and Q.return once ES6 generators are in
// SpiderMonkey.
var QReturnValue;
if (typeof ReturnValue !== "undefined") {
    QReturnValue = ReturnValue;
} else {
    QReturnValue = function (value) {
        this.value = value;
    };
}

// long stack traces

var STACK_JUMP_SEPARATOR = "From previous event:";

function makeStackTraceLong(error, promise) {
    // If possible, transform the error stack trace by removing Node and Q
    // cruft, then concatenating with the stack trace of `promise`. See #57.
    if (hasStacks &&
        promise.stack &&
        typeof error === "object" &&
        error !== null &&
        error.stack &&
        error.stack.indexOf(STACK_JUMP_SEPARATOR) === -1
    ) {
        var stacks = [];
        for (var p = promise; !!p; p = p.source) {
            if (p.stack) {
                stacks.unshift(p.stack);
            }
        }
        stacks.unshift(error.stack);

        var concatedStacks = stacks.join("\n" + STACK_JUMP_SEPARATOR + "\n");
        error.stack = filterStackString(concatedStacks);
    }
}

function filterStackString(stackString) {
    var lines = stackString.split("\n");
    var desiredLines = [];
    for (var i = 0; i < lines.length; ++i) {
        var line = lines[i];

        if (!isInternalFrame(line) && !isNodeFrame(line) && line) {
            desiredLines.push(line);
        }
    }
    return desiredLines.join("\n");
}

function isNodeFrame(stackLine) {
    return stackLine.indexOf("(module.js:") !== -1 ||
           stackLine.indexOf("(node.js:") !== -1;
}

function getFileNameAndLineNumber(stackLine) {
    // Named functions: "at functionName (filename:lineNumber:columnNumber)"
    // In IE10 function name can have spaces ("Anonymous function") O_o
    var attempt1 = /at .+ \((.+):(\d+):(?:\d+)\)$/.exec(stackLine);
    if (attempt1) {
        return [attempt1[1], Number(attempt1[2])];
    }

    // Anonymous functions: "at filename:lineNumber:columnNumber"
    var attempt2 = /at ([^ ]+):(\d+):(?:\d+)$/.exec(stackLine);
    if (attempt2) {
        return [attempt2[1], Number(attempt2[2])];
    }

    // Firefox style: "function@filename:lineNumber or @filename:lineNumber"
    var attempt3 = /.*@(.+):(\d+)$/.exec(stackLine);
    if (attempt3) {
        return [attempt3[1], Number(attempt3[2])];
    }
}

function isInternalFrame(stackLine) {
    var fileNameAndLineNumber = getFileNameAndLineNumber(stackLine);

    if (!fileNameAndLineNumber) {
        return false;
    }

    var fileName = fileNameAndLineNumber[0];
    var lineNumber = fileNameAndLineNumber[1];

    return fileName === qFileName &&
        lineNumber >= qStartingLine &&
        lineNumber <= qEndingLine;
}

// discover own file name and line number range for filtering stack
// traces
function captureLine() {
    if (!hasStacks) {
        return;
    }

    try {
        throw new Error();
    } catch (e) {
        var lines = e.stack.split("\n");
        var firstLine = lines[0].indexOf("@") > 0 ? lines[1] : lines[2];
        var fileNameAndLineNumber = getFileNameAndLineNumber(firstLine);
        if (!fileNameAndLineNumber) {
            return;
        }

        qFileName = fileNameAndLineNumber[0];
        return fileNameAndLineNumber[1];
    }
}

function deprecate(callback, name, alternative) {
    return function () {
        if (typeof console !== "undefined" &&
            typeof console.warn === "function") {
            console.warn(name + " is deprecated, use " + alternative +
                         " instead.", new Error("").stack);
        }
        return callback.apply(callback, arguments);
    };
}

// end of shims
// beginning of real work

/**
 * Constructs a promise for an immediate reference, passes promises through, or
 * coerces promises from different systems.
 * @param value immediate reference or promise
 */
function Q(value) {
    // If the object is already a Promise, return it directly.  This enables
    // the resolve function to both be used to created references from objects,
    // but to tolerably coerce non-promises to promises.
    if (value instanceof Promise) {
        return value;
    }

    // assimilate thenables
    if (isPromiseAlike(value)) {
        return coerce(value);
    } else {
        return fulfill(value);
    }
}
Q.resolve = Q;

/**
 * Performs a task in a future turn of the event loop.
 * @param {Function} task
 */
Q.nextTick = nextTick;

/**
 * Controls whether or not long stack traces will be on
 */
Q.longStackSupport = false;

// enable long stacks if Q_DEBUG is set
if (typeof process === "object" && process && process.env && process.env.Q_DEBUG) {
    Q.longStackSupport = true;
}

/**
 * Constructs a {promise, resolve, reject} object.
 *
 * `resolve` is a callback to invoke with a more resolved value for the
 * promise. To fulfill the promise, invoke `resolve` with any value that is
 * not a thenable. To reject the promise, invoke `resolve` with a rejected
 * thenable, or invoke `reject` with the reason directly. To resolve the
 * promise to another thenable, thus putting it in the same state, invoke
 * `resolve` with that other thenable.
 */
Q.defer = defer;
function defer() {
    // if "messages" is an "Array", that indicates that the promise has not yet
    // been resolved.  If it is "undefined", it has been resolved.  Each
    // element of the messages array is itself an array of complete arguments to
    // forward to the resolved promise.  We coerce the resolution value to a
    // promise using the `resolve` function because it handles both fully
    // non-thenable values and other thenables gracefully.
    var messages = [], progressListeners = [], resolvedPromise;

    var deferred = object_create(defer.prototype);
    var promise = object_create(Promise.prototype);

    promise.promiseDispatch = function (resolve, op, operands) {
        var args = array_slice(arguments);
        if (messages) {
            messages.push(args);
            if (op === "when" && operands[1]) { // progress operand
                progressListeners.push(operands[1]);
            }
        } else {
            Q.nextTick(function () {
                resolvedPromise.promiseDispatch.apply(resolvedPromise, args);
            });
        }
    };

    // XXX deprecated
    promise.valueOf = function () {
        if (messages) {
            return promise;
        }
        var nearerValue = nearer(resolvedPromise);
        if (isPromise(nearerValue)) {
            resolvedPromise = nearerValue; // shorten chain
        }
        return nearerValue;
    };

    promise.inspect = function () {
        if (!resolvedPromise) {
            return { state: "pending" };
        }
        return resolvedPromise.inspect();
    };

    if (Q.longStackSupport && hasStacks) {
        try {
            throw new Error();
        } catch (e) {
            // NOTE: don't try to use `Error.captureStackTrace` or transfer the
            // accessor around; that causes memory leaks as per GH-111. Just
            // reify the stack trace as a string ASAP.
            //
            // At the same time, cut off the first line; it's always just
            // "[object Promise]\n", as per the `toString`.
            promise.stack = e.stack.substring(e.stack.indexOf("\n") + 1);
        }
    }

    // NOTE: we do the checks for `resolvedPromise` in each method, instead of
    // consolidating them into `become`, since otherwise we'd create new
    // promises with the lines `become(whatever(value))`. See e.g. GH-252.

    function become(newPromise) {
        resolvedPromise = newPromise;
        promise.source = newPromise;

        array_reduce(messages, function (undefined, message) {
            Q.nextTick(function () {
                newPromise.promiseDispatch.apply(newPromise, message);
            });
        }, void 0);

        messages = void 0;
        progressListeners = void 0;
    }

    deferred.promise = promise;
    deferred.resolve = function (value) {
        if (resolvedPromise) {
            return;
        }

        become(Q(value));
    };

    deferred.fulfill = function (value) {
        if (resolvedPromise) {
            return;
        }

        become(fulfill(value));
    };
    deferred.reject = function (reason) {
        if (resolvedPromise) {
            return;
        }

        become(reject(reason));
    };
    deferred.notify = function (progress) {
        if (resolvedPromise) {
            return;
        }

        array_reduce(progressListeners, function (undefined, progressListener) {
            Q.nextTick(function () {
                progressListener(progress);
            });
        }, void 0);
    };

    return deferred;
}

/**
 * Creates a Node-style callback that will resolve or reject the deferred
 * promise.
 * @returns a nodeback
 */
defer.prototype.makeNodeResolver = function () {
    var self = this;
    return function (error, value) {
        if (error) {
            self.reject(error);
        } else if (arguments.length > 2) {
            self.resolve(array_slice(arguments, 1));
        } else {
            self.resolve(value);
        }
    };
};

/**
 * @param resolver {Function} a function that returns nothing and accepts
 * the resolve, reject, and notify functions for a deferred.
 * @returns a promise that may be resolved with the given resolve and reject
 * functions, or rejected by a thrown exception in resolver
 */
Q.Promise = promise; // ES6
Q.promise = promise;
function promise(resolver) {
    if (typeof resolver !== "function") {
        throw new TypeError("resolver must be a function.");
    }
    var deferred = defer();
    try {
        resolver(deferred.resolve, deferred.reject, deferred.notify);
    } catch (reason) {
        deferred.reject(reason);
    }
    return deferred.promise;
}

promise.race = race; // ES6
promise.all = all; // ES6
promise.reject = reject; // ES6
promise.resolve = Q; // ES6

// XXX experimental.  This method is a way to denote that a local value is
// serializable and should be immediately dispatched to a remote upon request,
// instead of passing a reference.
Q.passByCopy = function (object) {
    //freeze(object);
    //passByCopies.set(object, true);
    return object;
};

Promise.prototype.passByCopy = function () {
    //freeze(object);
    //passByCopies.set(object, true);
    return this;
};

/**
 * If two promises eventually fulfill to the same value, promises that value,
 * but otherwise rejects.
 * @param x {Any*}
 * @param y {Any*}
 * @returns {Any*} a promise for x and y if they are the same, but a rejection
 * otherwise.
 *
 */
Q.join = function (x, y) {
    return Q(x).join(y);
};

Promise.prototype.join = function (that) {
    return Q([this, that]).spread(function (x, y) {
        if (x === y) {
            // TODO: "===" should be Object.is or equiv
            return x;
        } else {
            throw new Error("Can't join: not the same: " + x + " " + y);
        }
    });
};

/**
 * Returns a promise for the first of an array of promises to become settled.
 * @param answers {Array[Any*]} promises to race
 * @returns {Any*} the first promise to be settled
 */
Q.race = race;
function race(answerPs) {
    return promise(function (resolve, reject) {
        // Switch to this once we can assume at least ES5
        // answerPs.forEach(function (answerP) {
        //     Q(answerP).then(resolve, reject);
        // });
        // Use this in the meantime
        for (var i = 0, len = answerPs.length; i < len; i++) {
            Q(answerPs[i]).then(resolve, reject);
        }
    });
}

Promise.prototype.race = function () {
    return this.then(Q.race);
};

/**
 * Constructs a Promise with a promise descriptor object and optional fallback
 * function.  The descriptor contains methods like when(rejected), get(name),
 * set(name, value), post(name, args), and delete(name), which all
 * return either a value, a promise for a value, or a rejection.  The fallback
 * accepts the operation name, a resolver, and any further arguments that would
 * have been forwarded to the appropriate method above had a method been
 * provided with the proper name.  The API makes no guarantees about the nature
 * of the returned object, apart from that it is usable whereever promises are
 * bought and sold.
 */
Q.makePromise = Promise;
function Promise(descriptor, fallback, inspect) {
    if (fallback === void 0) {
        fallback = function (op) {
            return reject(new Error(
                "Promise does not support operation: " + op
            ));
        };
    }
    if (inspect === void 0) {
        inspect = function () {
            return {state: "unknown"};
        };
    }

    var promise = object_create(Promise.prototype);

    promise.promiseDispatch = function (resolve, op, args) {
        var result;
        try {
            if (descriptor[op]) {
                result = descriptor[op].apply(promise, args);
            } else {
                result = fallback.call(promise, op, args);
            }
        } catch (exception) {
            result = reject(exception);
        }
        if (resolve) {
            resolve(result);
        }
    };

    promise.inspect = inspect;

    // XXX deprecated `valueOf` and `exception` support
    if (inspect) {
        var inspected = inspect();
        if (inspected.state === "rejected") {
            promise.exception = inspected.reason;
        }

        promise.valueOf = function () {
            var inspected = inspect();
            if (inspected.state === "pending" ||
                inspected.state === "rejected") {
                return promise;
            }
            return inspected.value;
        };
    }

    return promise;
}

Promise.prototype.toString = function () {
    return "[object Promise]";
};

Promise.prototype.then = function (fulfilled, rejected, progressed) {
    var self = this;
    var deferred = defer();
    var done = false;   // ensure the untrusted promise makes at most a
                        // single call to one of the callbacks

    function _fulfilled(value) {
        try {
            return typeof fulfilled === "function" ? fulfilled(value) : value;
        } catch (exception) {
            return reject(exception);
        }
    }

    function _rejected(exception) {
        if (typeof rejected === "function") {
            makeStackTraceLong(exception, self);
            try {
                return rejected(exception);
            } catch (newException) {
                return reject(newException);
            }
        }
        return reject(exception);
    }

    function _progressed(value) {
        return typeof progressed === "function" ? progressed(value) : value;
    }

    Q.nextTick(function () {
        self.promiseDispatch(function (value) {
            if (done) {
                return;
            }
            done = true;

            deferred.resolve(_fulfilled(value));
        }, "when", [function (exception) {
            if (done) {
                return;
            }
            done = true;

            deferred.resolve(_rejected(exception));
        }]);
    });

    // Progress propagator need to be attached in the current tick.
    self.promiseDispatch(void 0, "when", [void 0, function (value) {
        var newValue;
        var threw = false;
        try {
            newValue = _progressed(value);
        } catch (e) {
            threw = true;
            if (Q.onerror) {
                Q.onerror(e);
            } else {
                throw e;
            }
        }

        if (!threw) {
            deferred.notify(newValue);
        }
    }]);

    return deferred.promise;
};

Q.tap = function (promise, callback) {
    return Q(promise).tap(callback);
};

/**
 * Works almost like "finally", but not called for rejections.
 * Original resolution value is passed through callback unaffected.
 * Callback may return a promise that will be awaited for.
 * @param {Function} callback
 * @returns {Q.Promise}
 * @example
 * doSomething()
 *   .then(...)
 *   .tap(console.log)
 *   .then(...);
 */
Promise.prototype.tap = function (callback) {
    callback = Q(callback);

    return this.then(function (value) {
        return callback.fcall(value).thenResolve(value);
    });
};

/**
 * Registers an observer on a promise.
 *
 * Guarantees:
 *
 * 1. that fulfilled and rejected will be called only once.
 * 2. that either the fulfilled callback or the rejected callback will be
 *    called, but not both.
 * 3. that fulfilled and rejected will not be called in this turn.
 *
 * @param value      promise or immediate reference to observe
 * @param fulfilled  function to be called with the fulfilled value
 * @param rejected   function to be called with the rejection exception
 * @param progressed function to be called on any progress notifications
 * @return promise for the return value from the invoked callback
 */
Q.when = when;
function when(value, fulfilled, rejected, progressed) {
    return Q(value).then(fulfilled, rejected, progressed);
}

Promise.prototype.thenResolve = function (value) {
    return this.then(function () { return value; });
};

Q.thenResolve = function (promise, value) {
    return Q(promise).thenResolve(value);
};

Promise.prototype.thenReject = function (reason) {
    return this.then(function () { throw reason; });
};

Q.thenReject = function (promise, reason) {
    return Q(promise).thenReject(reason);
};

/**
 * If an object is not a promise, it is as "near" as possible.
 * If a promise is rejected, it is as "near" as possible too.
 * If it’s a fulfilled promise, the fulfillment value is nearer.
 * If it’s a deferred promise and the deferred has been resolved, the
 * resolution is "nearer".
 * @param object
 * @returns most resolved (nearest) form of the object
 */

// XXX should we re-do this?
Q.nearer = nearer;
function nearer(value) {
    if (isPromise(value)) {
        var inspected = value.inspect();
        if (inspected.state === "fulfilled") {
            return inspected.value;
        }
    }
    return value;
}

/**
 * @returns whether the given object is a promise.
 * Otherwise it is a fulfilled value.
 */
Q.isPromise = isPromise;
function isPromise(object) {
    return object instanceof Promise;
}

Q.isPromiseAlike = isPromiseAlike;
function isPromiseAlike(object) {
    return isObject(object) && typeof object.then === "function";
}

/**
 * @returns whether the given object is a pending promise, meaning not
 * fulfilled or rejected.
 */
Q.isPending = isPending;
function isPending(object) {
    return isPromise(object) && object.inspect().state === "pending";
}

Promise.prototype.isPending = function () {
    return this.inspect().state === "pending";
};

/**
 * @returns whether the given object is a value or fulfilled
 * promise.
 */
Q.isFulfilled = isFulfilled;
function isFulfilled(object) {
    return !isPromise(object) || object.inspect().state === "fulfilled";
}

Promise.prototype.isFulfilled = function () {
    return this.inspect().state === "fulfilled";
};

/**
 * @returns whether the given object is a rejected promise.
 */
Q.isRejected = isRejected;
function isRejected(object) {
    return isPromise(object) && object.inspect().state === "rejected";
}

Promise.prototype.isRejected = function () {
    return this.inspect().state === "rejected";
};

//// BEGIN UNHANDLED REJECTION TRACKING

// This promise library consumes exceptions thrown in handlers so they can be
// handled by a subsequent promise.  The exceptions get added to this array when
// they are created, and removed when they are handled.  Note that in ES6 or
// shimmed environments, this would naturally be a `Set`.
var unhandledReasons = [];
var unhandledRejections = [];
var reportedUnhandledRejections = [];
var trackUnhandledRejections = true;

function resetUnhandledRejections() {
    unhandledReasons.length = 0;
    unhandledRejections.length = 0;

    if (!trackUnhandledRejections) {
        trackUnhandledRejections = true;
    }
}

function trackRejection(promise, reason) {
    if (!trackUnhandledRejections) {
        return;
    }
    if (typeof process === "object" && typeof process.emit === "function") {
        Q.nextTick.runAfter(function () {
            if (array_indexOf(unhandledRejections, promise) !== -1) {
                process.emit("unhandledRejection", reason, promise);
                reportedUnhandledRejections.push(promise);
            }
        });
    }

    unhandledRejections.push(promise);
    if (reason && typeof reason.stack !== "undefined") {
        unhandledReasons.push(reason.stack);
    } else {
        unhandledReasons.push("(no stack) " + reason);
    }
}

function untrackRejection(promise) {
    if (!trackUnhandledRejections) {
        return;
    }

    var at = array_indexOf(unhandledRejections, promise);
    if (at !== -1) {
        if (typeof process === "object" && typeof process.emit === "function") {
            Q.nextTick.runAfter(function () {
                var atReport = array_indexOf(reportedUnhandledRejections, promise);
                if (atReport !== -1) {
                    process.emit("rejectionHandled", unhandledReasons[at], promise);
                    reportedUnhandledRejections.splice(atReport, 1);
                }
            });
        }
        unhandledRejections.splice(at, 1);
        unhandledReasons.splice(at, 1);
    }
}

Q.resetUnhandledRejections = resetUnhandledRejections;

Q.getUnhandledReasons = function () {
    // Make a copy so that consumers can't interfere with our internal state.
    return unhandledReasons.slice();
};

Q.stopUnhandledRejectionTracking = function () {
    resetUnhandledRejections();
    trackUnhandledRejections = false;
};

resetUnhandledRejections();

//// END UNHANDLED REJECTION TRACKING

/**
 * Constructs a rejected promise.
 * @param reason value describing the failure
 */
Q.reject = reject;
function reject(reason) {
    var rejection = Promise({
        "when": function (rejected) {
            // note that the error has been handled
            if (rejected) {
                untrackRejection(this);
            }
            return rejected ? rejected(reason) : this;
        }
    }, function fallback() {
        return this;
    }, function inspect() {
        return { state: "rejected", reason: reason };
    });

    // Note that the reason has not been handled.
    trackRejection(rejection, reason);

    return rejection;
}

/**
 * Constructs a fulfilled promise for an immediate reference.
 * @param value immediate reference
 */
Q.fulfill = fulfill;
function fulfill(value) {
    return Promise({
        "when": function () {
            return value;
        },
        "get": function (name) {
            return value[name];
        },
        "set": function (name, rhs) {
            value[name] = rhs;
        },
        "delete": function (name) {
            delete value[name];
        },
        "post": function (name, args) {
            // Mark Miller proposes that post with no name should apply a
            // promised function.
            if (name === null || name === void 0) {
                return value.apply(void 0, args);
            } else {
                return value[name].apply(value, args);
            }
        },
        "apply": function (thisp, args) {
            return value.apply(thisp, args);
        },
        "keys": function () {
            return object_keys(value);
        }
    }, void 0, function inspect() {
        return { state: "fulfilled", value: value };
    });
}

/**
 * Converts thenables to Q promises.
 * @param promise thenable promise
 * @returns a Q promise
 */
function coerce(promise) {
    var deferred = defer();
    Q.nextTick(function () {
        try {
            promise.then(deferred.resolve, deferred.reject, deferred.notify);
        } catch (exception) {
            deferred.reject(exception);
        }
    });
    return deferred.promise;
}

/**
 * Annotates an object such that it will never be
 * transferred away from this process over any promise
 * communication channel.
 * @param object
 * @returns promise a wrapping of that object that
 * additionally responds to the "isDef" message
 * without a rejection.
 */
Q.master = master;
function master(object) {
    return Promise({
        "isDef": function () {}
    }, function fallback(op, args) {
        return dispatch(object, op, args);
    }, function () {
        return Q(object).inspect();
    });
}

/**
 * Spreads the values of a promised array of arguments into the
 * fulfillment callback.
 * @param fulfilled callback that receives variadic arguments from the
 * promised array
 * @param rejected callback that receives the exception if the promise
 * is rejected.
 * @returns a promise for the return value or thrown exception of
 * either callback.
 */
Q.spread = spread;
function spread(value, fulfilled, rejected) {
    return Q(value).spread(fulfilled, rejected);
}

Promise.prototype.spread = function (fulfilled, rejected) {
    return this.all().then(function (array) {
        return fulfilled.apply(void 0, array);
    }, rejected);
};

/**
 * The async function is a decorator for generator functions, turning
 * them into asynchronous generators.  Although generators are only part
 * of the newest ECMAScript 6 drafts, this code does not cause syntax
 * errors in older engines.  This code should continue to work and will
 * in fact improve over time as the language improves.
 *
 * ES6 generators are currently part of V8 version 3.19 with the
 * --harmony-generators runtime flag enabled.  SpiderMonkey has had them
 * for longer, but under an older Python-inspired form.  This function
 * works on both kinds of generators.
 *
 * Decorates a generator function such that:
 *  - it may yield promises
 *  - execution will continue when that promise is fulfilled
 *  - the value of the yield expression will be the fulfilled value
 *  - it returns a promise for the return value (when the generator
 *    stops iterating)
 *  - the decorated function returns a promise for the return value
 *    of the generator or the first rejected promise among those
 *    yielded.
 *  - if an error is thrown in the generator, it propagates through
 *    every following yield until it is caught, or until it escapes
 *    the generator function altogether, and is translated into a
 *    rejection for the promise returned by the decorated generator.
 */
Q.async = async;
function async(makeGenerator) {
    return function () {
        // when verb is "send", arg is a value
        // when verb is "throw", arg is an exception
        function continuer(verb, arg) {
            var result;

            // Until V8 3.19 / Chromium 29 is released, SpiderMonkey is the only
            // engine that has a deployed base of browsers that support generators.
            // However, SM's generators use the Python-inspired semantics of
            // outdated ES6 drafts.  We would like to support ES6, but we'd also
            // like to make it possible to use generators in deployed browsers, so
            // we also support Python-style generators.  At some point we can remove
            // this block.

            if (typeof StopIteration === "undefined") {
                // ES6 Generators
                try {
                    result = generator[verb](arg);
                } catch (exception) {
                    return reject(exception);
                }
                if (result.done) {
                    return Q(result.value);
                } else {
                    return when(result.value, callback, errback);
                }
            } else {
                // SpiderMonkey Generators
                // FIXME: Remove this case when SM does ES6 generators.
                try {
                    result = generator[verb](arg);
                } catch (exception) {
                    if (isStopIteration(exception)) {
                        return Q(exception.value);
                    } else {
                        return reject(exception);
                    }
                }
                return when(result, callback, errback);
            }
        }
        var generator = makeGenerator.apply(this, arguments);
        var callback = continuer.bind(continuer, "next");
        var errback = continuer.bind(continuer, "throw");
        return callback();
    };
}

/**
 * The spawn function is a small wrapper around async that immediately
 * calls the generator and also ends the promise chain, so that any
 * unhandled errors are thrown instead of forwarded to the error
 * handler. This is useful because it's extremely common to run
 * generators at the top-level to work with libraries.
 */
Q.spawn = spawn;
function spawn(makeGenerator) {
    Q.done(Q.async(makeGenerator)());
}

// FIXME: Remove this interface once ES6 generators are in SpiderMonkey.
/**
 * Throws a ReturnValue exception to stop an asynchronous generator.
 *
 * This interface is a stop-gap measure to support generator return
 * values in older Firefox/SpiderMonkey.  In browsers that support ES6
 * generators like Chromium 29, just use "return" in your generator
 * functions.
 *
 * @param value the return value for the surrounding generator
 * @throws ReturnValue exception with the value.
 * @example
 * // ES6 style
 * Q.async(function* () {
 *      var foo = yield getFooPromise();
 *      var bar = yield getBarPromise();
 *      return foo + bar;
 * })
 * // Older SpiderMonkey style
 * Q.async(function () {
 *      var foo = yield getFooPromise();
 *      var bar = yield getBarPromise();
 *      Q.return(foo + bar);
 * })
 */
Q["return"] = _return;
function _return(value) {
    throw new QReturnValue(value);
}

/**
 * The promised function decorator ensures that any promise arguments
 * are settled and passed as values (`this` is also settled and passed
 * as a value).  It will also ensure that the result of a function is
 * always a promise.
 *
 * @example
 * var add = Q.promised(function (a, b) {
 *     return a + b;
 * });
 * add(Q(a), Q(B));
 *
 * @param {function} callback The function to decorate
 * @returns {function} a function that has been decorated.
 */
Q.promised = promised;
function promised(callback) {
    return function () {
        return spread([this, all(arguments)], function (self, args) {
            return callback.apply(self, args);
        });
    };
}

/**
 * sends a message to a value in a future turn
 * @param object* the recipient
 * @param op the name of the message operation, e.g., "when",
 * @param args further arguments to be forwarded to the operation
 * @returns result {Promise} a promise for the result of the operation
 */
Q.dispatch = dispatch;
function dispatch(object, op, args) {
    return Q(object).dispatch(op, args);
}

Promise.prototype.dispatch = function (op, args) {
    var self = this;
    var deferred = defer();
    Q.nextTick(function () {
        self.promiseDispatch(deferred.resolve, op, args);
    });
    return deferred.promise;
};

/**
 * Gets the value of a property in a future turn.
 * @param object    promise or immediate reference for target object
 * @param name      name of property to get
 * @return promise for the property value
 */
Q.get = function (object, key) {
    return Q(object).dispatch("get", [key]);
};

Promise.prototype.get = function (key) {
    return this.dispatch("get", [key]);
};

/**
 * Sets the value of a property in a future turn.
 * @param object    promise or immediate reference for object object
 * @param name      name of property to set
 * @param value     new value of property
 * @return promise for the return value
 */
Q.set = function (object, key, value) {
    return Q(object).dispatch("set", [key, value]);
};

Promise.prototype.set = function (key, value) {
    return this.dispatch("set", [key, value]);
};

/**
 * Deletes a property in a future turn.
 * @param object    promise or immediate reference for target object
 * @param name      name of property to delete
 * @return promise for the return value
 */
Q.del = // XXX legacy
Q["delete"] = function (object, key) {
    return Q(object).dispatch("delete", [key]);
};

Promise.prototype.del = // XXX legacy
Promise.prototype["delete"] = function (key) {
    return this.dispatch("delete", [key]);
};

/**
 * Invokes a method in a future turn.
 * @param object    promise or immediate reference for target object
 * @param name      name of method to invoke
 * @param value     a value to post, typically an array of
 *                  invocation arguments for promises that
 *                  are ultimately backed with `resolve` values,
 *                  as opposed to those backed with URLs
 *                  wherein the posted value can be any
 *                  JSON serializable object.
 * @return promise for the return value
 */
// bound locally because it is used by other methods
Q.mapply = // XXX As proposed by "Redsandro"
Q.post = function (object, name, args) {
    return Q(object).dispatch("post", [name, args]);
};

Promise.prototype.mapply = // XXX As proposed by "Redsandro"
Promise.prototype.post = function (name, args) {
    return this.dispatch("post", [name, args]);
};

/**
 * Invokes a method in a future turn.
 * @param object    promise or immediate reference for target object
 * @param name      name of method to invoke
 * @param ...args   array of invocation arguments
 * @return promise for the return value
 */
Q.send = // XXX Mark Miller's proposed parlance
Q.mcall = // XXX As proposed by "Redsandro"
Q.invoke = function (object, name /*...args*/) {
    return Q(object).dispatch("post", [name, array_slice(arguments, 2)]);
};

Promise.prototype.send = // XXX Mark Miller's proposed parlance
Promise.prototype.mcall = // XXX As proposed by "Redsandro"
Promise.prototype.invoke = function (name /*...args*/) {
    return this.dispatch("post", [name, array_slice(arguments, 1)]);
};

/**
 * Applies the promised function in a future turn.
 * @param object    promise or immediate reference for target function
 * @param args      array of application arguments
 */
Q.fapply = function (object, args) {
    return Q(object).dispatch("apply", [void 0, args]);
};

Promise.prototype.fapply = function (args) {
    return this.dispatch("apply", [void 0, args]);
};

/**
 * Calls the promised function in a future turn.
 * @param object    promise or immediate reference for target function
 * @param ...args   array of application arguments
 */
Q["try"] =
Q.fcall = function (object /* ...args*/) {
    return Q(object).dispatch("apply", [void 0, array_slice(arguments, 1)]);
};

Promise.prototype.fcall = function (/*...args*/) {
    return this.dispatch("apply", [void 0, array_slice(arguments)]);
};

/**
 * Binds the promised function, transforming return values into a fulfilled
 * promise and thrown errors into a rejected one.
 * @param object    promise or immediate reference for target function
 * @param ...args   array of application arguments
 */
Q.fbind = function (object /*...args*/) {
    var promise = Q(object);
    var args = array_slice(arguments, 1);
    return function fbound() {
        return promise.dispatch("apply", [
            this,
            args.concat(array_slice(arguments))
        ]);
    };
};
Promise.prototype.fbind = function (/*...args*/) {
    var promise = this;
    var args = array_slice(arguments);
    return function fbound() {
        return promise.dispatch("apply", [
            this,
            args.concat(array_slice(arguments))
        ]);
    };
};

/**
 * Requests the names of the owned properties of a promised
 * object in a future turn.
 * @param object    promise or immediate reference for target object
 * @return promise for the keys of the eventually settled object
 */
Q.keys = function (object) {
    return Q(object).dispatch("keys", []);
};

Promise.prototype.keys = function () {
    return this.dispatch("keys", []);
};

/**
 * Turns an array of promises into a promise for an array.  If any of
 * the promises gets rejected, the whole array is rejected immediately.
 * @param {Array*} an array (or promise for an array) of values (or
 * promises for values)
 * @returns a promise for an array of the corresponding values
 */
// By Mark Miller
// http://wiki.ecmascript.org/doku.php?id=strawman:concurrency&rev=1308776521#allfulfilled
Q.all = all;
function all(promises) {
    return when(promises, function (promises) {
        var pendingCount = 0;
        var deferred = defer();
        array_reduce(promises, function (undefined, promise, index) {
            var snapshot;
            if (
                isPromise(promise) &&
                (snapshot = promise.inspect()).state === "fulfilled"
            ) {
                promises[index] = snapshot.value;
            } else {
                ++pendingCount;
                when(
                    promise,
                    function (value) {
                        promises[index] = value;
                        if (--pendingCount === 0) {
                            deferred.resolve(promises);
                        }
                    },
                    deferred.reject,
                    function (progress) {
                        deferred.notify({ index: index, value: progress });
                    }
                );
            }
        }, void 0);
        if (pendingCount === 0) {
            deferred.resolve(promises);
        }
        return deferred.promise;
    });
}

Promise.prototype.all = function () {
    return all(this);
};

/**
 * Returns the first resolved promise of an array. Prior rejected promises are
 * ignored.  Rejects only if all promises are rejected.
 * @param {Array*} an array containing values or promises for values
 * @returns a promise fulfilled with the value of the first resolved promise,
 * or a rejected promise if all promises are rejected.
 */
Q.any = any;

function any(promises) {
    if (promises.length === 0) {
        return Q.resolve();
    }

    var deferred = Q.defer();
    var pendingCount = 0;
    array_reduce(promises, function (prev, current, index) {
        var promise = promises[index];

        pendingCount++;

        when(promise, onFulfilled, onRejected, onProgress);
        function onFulfilled(result) {
            deferred.resolve(result);
        }
        function onRejected() {
            pendingCount--;
            if (pendingCount === 0) {
                deferred.reject(new Error(
                    "Can't get fulfillment value from any promise, all " +
                    "promises were rejected."
                ));
            }
        }
        function onProgress(progress) {
            deferred.notify({
                index: index,
                value: progress
            });
        }
    }, undefined);

    return deferred.promise;
}

Promise.prototype.any = function () {
    return any(this);
};

/**
 * Waits for all promises to be settled, either fulfilled or
 * rejected.  This is distinct from `all` since that would stop
 * waiting at the first rejection.  The promise returned by
 * `allResolved` will never be rejected.
 * @param promises a promise for an array (or an array) of promises
 * (or values)
 * @return a promise for an array of promises
 */
Q.allResolved = deprecate(allResolved, "allResolved", "allSettled");
function allResolved(promises) {
    return when(promises, function (promises) {
        promises = array_map(promises, Q);
        return when(all(array_map(promises, function (promise) {
            return when(promise, noop, noop);
        })), function () {
            return promises;
        });
    });
}

Promise.prototype.allResolved = function () {
    return allResolved(this);
};

/**
 * @see Promise#allSettled
 */
Q.allSettled = allSettled;
function allSettled(promises) {
    return Q(promises).allSettled();
}

/**
 * Turns an array of promises into a promise for an array of their states (as
 * returned by `inspect`) when they have all settled.
 * @param {Array[Any*]} values an array (or promise for an array) of values (or
 * promises for values)
 * @returns {Array[State]} an array of states for the respective values.
 */
Promise.prototype.allSettled = function () {
    return this.then(function (promises) {
        return all(array_map(promises, function (promise) {
            promise = Q(promise);
            function regardless() {
                return promise.inspect();
            }
            return promise.then(regardless, regardless);
        }));
    });
};

/**
 * Captures the failure of a promise, giving an oportunity to recover
 * with a callback.  If the given promise is fulfilled, the returned
 * promise is fulfilled.
 * @param {Any*} promise for something
 * @param {Function} callback to fulfill the returned promise if the
 * given promise is rejected
 * @returns a promise for the return value of the callback
 */
Q.fail = // XXX legacy
Q["catch"] = function (object, rejected) {
    return Q(object).then(void 0, rejected);
};

Promise.prototype.fail = // XXX legacy
Promise.prototype["catch"] = function (rejected) {
    return this.then(void 0, rejected);
};

/**
 * Attaches a listener that can respond to progress notifications from a
 * promise's originating deferred. This listener receives the exact arguments
 * passed to ``deferred.notify``.
 * @param {Any*} promise for something
 * @param {Function} callback to receive any progress notifications
 * @returns the given promise, unchanged
 */
Q.progress = progress;
function progress(object, progressed) {
    return Q(object).then(void 0, void 0, progressed);
}

Promise.prototype.progress = function (progressed) {
    return this.then(void 0, void 0, progressed);
};

/**
 * Provides an opportunity to observe the settling of a promise,
 * regardless of whether the promise is fulfilled or rejected.  Forwards
 * the resolution to the returned promise when the callback is done.
 * The callback can return a promise to defer completion.
 * @param {Any*} promise
 * @param {Function} callback to observe the resolution of the given
 * promise, takes no arguments.
 * @returns a promise for the resolution of the given promise when
 * ``fin`` is done.
 */
Q.fin = // XXX legacy
Q["finally"] = function (object, callback) {
    return Q(object)["finally"](callback);
};

Promise.prototype.fin = // XXX legacy
Promise.prototype["finally"] = function (callback) {
    callback = Q(callback);
    return this.then(function (value) {
        return callback.fcall().then(function () {
            return value;
        });
    }, function (reason) {
        // TODO attempt to recycle the rejection with "this".
        return callback.fcall().then(function () {
            throw reason;
        });
    });
};

/**
 * Terminates a chain of promises, forcing rejections to be
 * thrown as exceptions.
 * @param {Any*} promise at the end of a chain of promises
 * @returns nothing
 */
Q.done = function (object, fulfilled, rejected, progress) {
    return Q(object).done(fulfilled, rejected, progress);
};

Promise.prototype.done = function (fulfilled, rejected, progress) {
    var onUnhandledError = function (error) {
        // forward to a future turn so that ``when``
        // does not catch it and turn it into a rejection.
        Q.nextTick(function () {
            makeStackTraceLong(error, promise);
            if (Q.onerror) {
                Q.onerror(error);
            } else {
                throw error;
            }
        });
    };

    // Avoid unnecessary `nextTick`ing via an unnecessary `when`.
    var promise = fulfilled || rejected || progress ?
        this.then(fulfilled, rejected, progress) :
        this;

    if (typeof process === "object" && process && process.domain) {
        onUnhandledError = process.domain.bind(onUnhandledError);
    }

    promise.then(void 0, onUnhandledError);
};

/**
 * Causes a promise to be rejected if it does not get fulfilled before
 * some milliseconds time out.
 * @param {Any*} promise
 * @param {Number} milliseconds timeout
 * @param {Any*} custom error message or Error object (optional)
 * @returns a promise for the resolution of the given promise if it is
 * fulfilled before the timeout, otherwise rejected.
 */
Q.timeout = function (object, ms, error) {
    return Q(object).timeout(ms, error);
};

Promise.prototype.timeout = function (ms, error) {
    var deferred = defer();
    var timeoutId = setTimeout(function () {
        if (!error || "string" === typeof error) {
            error = new Error(error || "Timed out after " + ms + " ms");
            error.code = "ETIMEDOUT";
        }
        deferred.reject(error);
    }, ms);

    this.then(function (value) {
        clearTimeout(timeoutId);
        deferred.resolve(value);
    }, function (exception) {
        clearTimeout(timeoutId);
        deferred.reject(exception);
    }, deferred.notify);

    return deferred.promise;
};

/**
 * Returns a promise for the given value (or promised value), some
 * milliseconds after it resolved. Passes rejections immediately.
 * @param {Any*} promise
 * @param {Number} milliseconds
 * @returns a promise for the resolution of the given promise after milliseconds
 * time has elapsed since the resolution of the given promise.
 * If the given promise rejects, that is passed immediately.
 */
Q.delay = function (object, timeout) {
    if (timeout === void 0) {
        timeout = object;
        object = void 0;
    }
    return Q(object).delay(timeout);
};

Promise.prototype.delay = function (timeout) {
    return this.then(function (value) {
        var deferred = defer();
        setTimeout(function () {
            deferred.resolve(value);
        }, timeout);
        return deferred.promise;
    });
};

/**
 * Passes a continuation to a Node function, which is called with the given
 * arguments provided as an array, and returns a promise.
 *
 *      Q.nfapply(FS.readFile, [__filename])
 *      .then(function (content) {
 *      })
 *
 */
Q.nfapply = function (callback, args) {
    return Q(callback).nfapply(args);
};

Promise.prototype.nfapply = function (args) {
    var deferred = defer();
    var nodeArgs = array_slice(args);
    nodeArgs.push(deferred.makeNodeResolver());
    this.fapply(nodeArgs).fail(deferred.reject);
    return deferred.promise;
};

/**
 * Passes a continuation to a Node function, which is called with the given
 * arguments provided individually, and returns a promise.
 * @example
 * Q.nfcall(FS.readFile, __filename)
 * .then(function (content) {
 * })
 *
 */
Q.nfcall = function (callback /*...args*/) {
    var args = array_slice(arguments, 1);
    return Q(callback).nfapply(args);
};

Promise.prototype.nfcall = function (/*...args*/) {
    var nodeArgs = array_slice(arguments);
    var deferred = defer();
    nodeArgs.push(deferred.makeNodeResolver());
    this.fapply(nodeArgs).fail(deferred.reject);
    return deferred.promise;
};

/**
 * Wraps a NodeJS continuation passing function and returns an equivalent
 * version that returns a promise.
 * @example
 * Q.nfbind(FS.readFile, __filename)("utf-8")
 * .then(console.log)
 * .done()
 */
Q.nfbind =
Q.denodeify = function (callback /*...args*/) {
    var baseArgs = array_slice(arguments, 1);
    return function () {
        var nodeArgs = baseArgs.concat(array_slice(arguments));
        var deferred = defer();
        nodeArgs.push(deferred.makeNodeResolver());
        Q(callback).fapply(nodeArgs).fail(deferred.reject);
        return deferred.promise;
    };
};

Promise.prototype.nfbind =
Promise.prototype.denodeify = function (/*...args*/) {
    var args = array_slice(arguments);
    args.unshift(this);
    return Q.denodeify.apply(void 0, args);
};

Q.nbind = function (callback, thisp /*...args*/) {
    var baseArgs = array_slice(arguments, 2);
    return function () {
        var nodeArgs = baseArgs.concat(array_slice(arguments));
        var deferred = defer();
        nodeArgs.push(deferred.makeNodeResolver());
        function bound() {
            return callback.apply(thisp, arguments);
        }
        Q(bound).fapply(nodeArgs).fail(deferred.reject);
        return deferred.promise;
    };
};

Promise.prototype.nbind = function (/*thisp, ...args*/) {
    var args = array_slice(arguments, 0);
    args.unshift(this);
    return Q.nbind.apply(void 0, args);
};

/**
 * Calls a method of a Node-style object that accepts a Node-style
 * callback with a given array of arguments, plus a provided callback.
 * @param object an object that has the named method
 * @param {String} name name of the method of object
 * @param {Array} args arguments to pass to the method; the callback
 * will be provided by Q and appended to these arguments.
 * @returns a promise for the value or error
 */
Q.nmapply = // XXX As proposed by "Redsandro"
Q.npost = function (object, name, args) {
    return Q(object).npost(name, args);
};

Promise.prototype.nmapply = // XXX As proposed by "Redsandro"
Promise.prototype.npost = function (name, args) {
    var nodeArgs = array_slice(args || []);
    var deferred = defer();
    nodeArgs.push(deferred.makeNodeResolver());
    this.dispatch("post", [name, nodeArgs]).fail(deferred.reject);
    return deferred.promise;
};

/**
 * Calls a method of a Node-style object that accepts a Node-style
 * callback, forwarding the given variadic arguments, plus a provided
 * callback argument.
 * @param object an object that has the named method
 * @param {String} name name of the method of object
 * @param ...args arguments to pass to the method; the callback will
 * be provided by Q and appended to these arguments.
 * @returns a promise for the value or error
 */
Q.nsend = // XXX Based on Mark Miller's proposed "send"
Q.nmcall = // XXX Based on "Redsandro's" proposal
Q.ninvoke = function (object, name /*...args*/) {
    var nodeArgs = array_slice(arguments, 2);
    var deferred = defer();
    nodeArgs.push(deferred.makeNodeResolver());
    Q(object).dispatch("post", [name, nodeArgs]).fail(deferred.reject);
    return deferred.promise;
};

Promise.prototype.nsend = // XXX Based on Mark Miller's proposed "send"
Promise.prototype.nmcall = // XXX Based on "Redsandro's" proposal
Promise.prototype.ninvoke = function (name /*...args*/) {
    var nodeArgs = array_slice(arguments, 1);
    var deferred = defer();
    nodeArgs.push(deferred.makeNodeResolver());
    this.dispatch("post", [name, nodeArgs]).fail(deferred.reject);
    return deferred.promise;
};

/**
 * If a function would like to support both Node continuation-passing-style and
 * promise-returning-style, it can end its internal promise chain with
 * `nodeify(nodeback)`, forwarding the optional nodeback argument.  If the user
 * elects to use a nodeback, the result will be sent there.  If they do not
 * pass a nodeback, they will receive the result promise.
 * @param object a result (or a promise for a result)
 * @param {Function} nodeback a Node.js-style callback
 * @returns either the promise or nothing
 */
Q.nodeify = nodeify;
function nodeify(object, nodeback) {
    return Q(object).nodeify(nodeback);
}

Promise.prototype.nodeify = function (nodeback) {
    if (nodeback) {
        this.then(function (value) {
            Q.nextTick(function () {
                nodeback(null, value);
            });
        }, function (error) {
            Q.nextTick(function () {
                nodeback(error);
            });
        });
    } else {
        return this;
    }
};

Q.noConflict = function() {
    throw new Error("Q.noConflict only works when Q is used as a global");
};

// All code before this point will be filtered from stack traces.
var qEndingLine = captureLine();

return Q;

});

}).call(this,_dereq_('_process'))

},{"_process":38}],2:[function(_dereq_,module,exports){
var work = _dereq_('webworkify');
var tojson = _dereq_('ngraph.tojson');
var eventify = _dereq_('ngraph.events');

var createLayout = _dereq_('./lib/createLayout.js');
var validateOptions = _dereq_('./options.js');
var messageKind = _dereq_('./lib/messages.js');

module.exports = createAsyncLayout;

function createAsyncLayout(graph, options) {
  options = validateOptions(options);

  var assignPosition = options.is3d ? assignPosition3d : assignPosition2d;

  var pendingInitialization = false;
  var initRequestSent = false;
  var systemStable = false;
  var graphRect;
  var pinStatus = Object.create(null);
  var linkPositions;

  // Since this is fairly common message, there is no need to recreate it every time:
  var stepMessage = { kind: messageKind.step };

  var positions = Object.create(null);

  var layoutWorker = work(_dereq_('./lib/layoutWorker.js'));
  layoutWorker.addEventListener('message', handleMessageFromWorker);

  initWorker();
  initPositions();

  var api = {
    /**
     * Request to perform one iteration of force layout. The request is
     * forwarded to web worker
     *
     * @returns {boolean} true if system is considered stable; false otherwise.
     */
    step: asyncStep,

    /**
     * Gets the last known position of a given node by its identifier.
     *
     * @param {string} nodeId identifier of a node in question.
     * @returns {object} {x: number, y: number, z: number} coordinates of a node.
     */
    getNodePosition: getNodePosition,

    /**
     * Gets the last known position of a given link by its identifier.
     *
     * @param {string} linkId identifier of a link in question.
     * @returns {Object} Link position by link id
     * @returns {Object.from} {x, y} coordinates of link start
     * @returns {Object.to} {x, y} coordinates of link end
     */
    getLinkPosition: getLinkPosition,

    /**
     * Requests layout algorithm to pin/unpin node to its current position
     * Pinned nodes should not be affected by layout algorithm and always
     * remain at their position
     *
     * @param {object} node graph node that needs to be pinned
     * @param {boolean} isPinned status of the node.
     */
    pinNode: asyncPinNode,

    /**
     * Sets position of a node to a given coordinates
     * @param {string} nodeId node identifier
     * @param {number} x position of a node
     * @param {number} y position of a node
     * @param {number=} z position of node (only if 3d layout)
     */
    setNodePosition: asyncNodePosition,

    /**
     * Gets rectangle (or a box) that bounds the graph
     */
    getGraphRect: getGraphRect,

    /**
     * Returns true if node is currently pinned (i.e. not moved by layout);
     * False otherwise.
     */
    isNodePinned: isNodePinned
  };

  eventify(api);

  return api;

  function asyncStep() {
    // we cannot do anything until we receive 'initDone' message from worker
    // to confirm that it's ready to process layout requests.
    if (pendingInitialization) return;

    layoutWorker.postMessage(stepMessage);

    // TODO: I need to rewrite ngraph.forcelayout to be even-driven,
    // so that it can notify caller about stable/unstable change asynchronously
    return systemStable;
  }

  function asyncNodePosition(nodeId, x, y, z) {
    // let layout know that we changed the position
    layoutWorker.postMessage({
      kind: messageKind.setNodePosition,
      payload: {
        nodeId: nodeId,
        x: x,
        y: y,
        z: z
      }
    });
    // also update synchronously our last remember position:
    assignPosition(positions[nodeId], { x: x, y: y, z: z });
  }

  function getGraphRect() {
    return graphRect;
  }

  function asyncPinNode(node, isPinned) {
    layoutWorker.postMessage({
      kind: messageKind.pinNode,
      payload: {
        nodeId: node.id,
        isPinned: isPinned
      }
    });

    // we need to have sync way of answering to isNodePinned request.
    // This is not perfect, since original graph configuration may
    // include pinned nodes. We currently do not take that into account.
    pinStatus[node.id] = isPinned;
  }

  function isNodePinned(node) {
    return pinStatus[node.id];
  }

  function initWorker() {
    if (initRequestSent) {
      throw new Error('Init request is already sent to the worker');
    }

    layoutWorker.postMessage({
      kind: messageKind.init,
      payload: {
        graph: tojson(graph),
        options: JSON.stringify(options)
      }
    });

    initRequestSent = true;
  }

  function initPositions() {
    // we need to initialize positions just once
    var layout = createLayout(graph, options);
    graph.forEachNode(initPosition);
    graphRect = layout.getGraphRect();

    function initPosition(node) {
      positions[node.id] = layout.getNodePosition(node.id);
    }
  }

  function getNodePosition(nodeId) {
    return positions[nodeId];
  }

  function getLinkPosition(linkId) {
    if (!linkPositions) {
      initializeLinkPositions();
    }
    return linkPositions[linkId];
  }

  function initializeLinkPositions() {
    linkPositions = Object.create(null);
    graph.forEachLink(function(link) {
      linkPositions[link.id] = {
        from: getNodePosition(link.fromId),
        to: getNodePosition(link.toId)
      };
    });
  }

  function handleMessageFromWorker(message) {
    var kind = message.data.kind;
    var payload = message.data.payload

    if (kind === messageKind.cycleComplete) {
      setPositions(payload.positions, payload.systemStable);
      graphRect = payload.bbox;
      api.fire('cycle', payload.iterations, payload.systemStable);
    } if (kind === messageKind.initDone) {
      pendingInitialization = false;
      asyncStep();
    }
  }

  function setPositions(newPositions, newSystemStable) {
    systemStable = newSystemStable;
    Object.keys(newPositions).forEach(updatePosition);
    return;

    function updatePosition(nodeId) {
      var newPosition = newPositions[nodeId];
      var oldPosition = positions[nodeId];
      if (!oldPosition) {
        positions[nodeId] = newPosition;
      } else {
        assignPosition(oldPosition, newPosition);
      }
    }
  }
}

function assignPosition3d(oldPos, newPos) {
  oldPos.x = newPos.x;
  oldPos.y = newPos.y;
  oldPos.z = newPos.z;
}

function assignPosition2d(oldPos, newPos) {
  oldPos.x = newPos.x;
  oldPos.y = newPos.y;
}

},{"./lib/createLayout.js":3,"./lib/layoutWorker.js":4,"./lib/messages.js":5,"./options.js":6,"ngraph.events":7,"ngraph.tojson":37,"webworkify":40}],3:[function(_dereq_,module,exports){
var layout3d = _dereq_('ngraph.forcelayout3d');
var layout2d = layout3d.get2dLayout;

module.exports = createLayout;

function createLayout(graph, options) {
  options = options || {};

  return options.is3d ?
    layout3d(graph, options.physics) :
    layout2d(graph, options.physics);
}

},{"ngraph.forcelayout3d":17}],4:[function(_dereq_,module,exports){
var createLayout = _dereq_('./createLayout.js');
var fromjson = _dereq_('ngraph.fromjson');
var validateOptions = _dereq_('../options.js');
var messageKind = _dereq_('./messages.js');

module.exports = layoutWorker;

/**
 * This method is executed as a webworker thread. It expects 'init' signal
 * from the main thread to start layout.
 */
function layoutWorker(self) {
  var layout; // main thread will send a message to initialize this
  var asyncOptions;
  var completedIterations = 0;
  var stepCalled = false;
  var timeoutId = 0;
  var systemStable = false;
  var graph;

  var positions = Object.create(null);
  self.addEventListener('message', handleMessageFromMainThread);

  return; // public API is over. Below are private methods only.

  function handleMessageFromMainThread(message) {
    var kind = message.data.kind;
    var payload = message.data.payload;

    if (kind === messageKind.init) {
      graph = fromjson(payload.graph);
      var options = JSON.parse(payload.options);

      init(graph, options);
    } else if (kind === messageKind.step) {
      step();
    } else if (kind === messageKind.pinNode) {
      pinNode(payload.nodeId, payload.isPinned);
    } else if (kind === messageKind.setNodePosition) {
      setNodePosition(payload.nodeId, payload.x, payload.y, payload.z);
    }
    // TODO: listen for graph changes from main thread and update layout here.
  }

  function setNodePosition(nodeId, x, y, z) {
    assertInitialized();

    layout.setNodePosition.apply(layout, arguments);
    systemStable = false;
    step();
  }

  function pinNode(nodeId, isPinned) {
    assertInitialized();

    var node = graph.getNode(nodeId);
    if (!node) return; // ignoring right now. should it throw?

    layout.pinNode(node, isPinned);
  }

  function assertInitialized() {
    if (!graph) throw new Error('Pin node requested without initialied graph');
    if (!layout) throw new Error('Layout was not created. Something is really wrong here');
  }

  function init(graph, options) {
    // unfortunately we need to revalidate here, since POSITIVE_INFINITY could
    // be lost during threads transition
    options = validateOptions(options);
    asyncOptions = options.async;

    layout = createLayout(graph, options);
    graph.forEachNode(initPosition);

    // let main thread know that we can process layout
    self.postMessage({ kind: messageKind.initDone });
  }

  function initPosition(node) {
    positions[node.id] = layout.getNodePosition(node.id);
  }

  function step() {
    assertInitialized();

    stepCalled = true;

    if (!timeoutId) {
      runLayoutCycleAsync();
    }
  }

  function runLayoutCycleAsync() {
    if (systemStable) {
      timeoutId = 0;
      return;
    }

    // we have to unblock this thread to receive messages from the main thread.
    timeoutId = setTimeout(function() {
      runLayoutCycle();

      // We either wait until next `step` event from RAF, or run now if asked to
      // not wait for `step`.
      if (stepCalled || !asyncOptions.waitForStep) {
        stepCalled = false;
        runLayoutCycleAsync();
      } else {
        // wait for the next event from the main thread to continue;
        timeoutId = 0;
      }
    }, 0);
  }

  function runLayoutCycle() {
    var wasStable = systemStable;
    for (var i = 0; i < asyncOptions.stepsPerCycle; ++i) {
      systemStable = layout.step();
      completedIterations += 1;
    }

    if (completedIterations >= asyncOptions.maxIterations) {
      systemStable = true;
    }

    self.postMessage({
      kind: messageKind.cycleComplete,
      payload: {
        positions: positions,
        systemStable: systemStable,
        bbox: layout.getGraphRect(),
        iterations: completedIterations
      }
    });
  }
};

},{"../options.js":6,"./createLayout.js":3,"./messages.js":5,"ngraph.fromjson":23}],5:[function(_dereq_,module,exports){
/**
 * This file defines all possible messages between main thread and
 * web worker. The key is human readable message type, and the value is a
 * numeric attribute for quick matching
 */
module.exports = {
  /**
   * Sent from main thread to web worker to initialize force layout
   *
   * payload:
   *  {string} graph - result of ngraph.tojson(graph) operation.
   *  {string} options - stringified optinons received by ngraph.asyncforce().
   */
  init: 10,

  /**
   * Sent from web worker to main thread to confirm that worker has done
   * initializatino and can process incoming layout requests
   *
   * payload: undefined.
   */
  initDone: 11,

  /**
   * Sent from main thread to web worker to notify that rendering loop is currently
   * active and worker should perform layout (if required). Worker can decide
   * to ignore this request if, for example, layout is already computed, or
   * worker has performed more than options.async.maxIterations iterations.
   *
   * payload: undefined.
   */
  step: 12,

  /**
   * Sent from webworker to main thread to indicate that worker has finished
   * one cycle of layout iterations. Each cycle can perform up to
   * options.asnc.stepsPerCycle iterations of layout.
   *
   * payload:
   *  {object} positions - keys are node ids, values are {x, y, z} coordinates
   *  {boolean} systemStable - indicates that system is stable. NOTE: this will
   *  be removed from future version.
   */
  cycleComplete: 13,

  /**
   * Sent from main thread to web worker to pin node
   *
   * payload:
   *   {string} nodeId - identifier of the node that needs to be pinned
   *   {boolean} isPinned status of the node
   */
  pinNode: 41,

  /**
   * Sent from main thread to web worker to set position of the node
   *
   * payload:
   *  {string} nodeId - identifier of the node that needs position update.
   *  {number} x - x coordinate
   *  {number} y - y coordinate
   *  {number+} z - z coordinate - only applicable for 3d layout
   */
  setNodePosition: 43
};

},{}],6:[function(_dereq_,module,exports){
/**
 * This file defines configuration options for the asyncforce module. Every
 * configuration is optional. You can find its description and default value below.
 */
module.exports = validateOptions;

function validateOptions(options) {
  options = options || {};

  /**
   * Do we need to run 3D layout or 2D?
   */
  options.is3d = typeof options.is3d === 'boolean' ? options.is3d : false;

  // These options are in separate object since they configure web worker behavior
  // not layout.
  var async = (options.async = options.async || {});

  /**
   * Web worker computes layout in cycles. After each cycle is done web worker
   * notifies the main thread with updated positions. This options defines
   * how many layout steps should web worker complete within one cycle.
   */
  async.stepsPerCycle = typeof async.stepsPerCycle === 'number' ? async.stepsPerCycle : 5;

  /**
   * By default layout will be computed as long as each iteration brings too
   * much movement to the system. However if you'd like to compute only N iterations
   * of layout, you can set this option to N. Once layout reaches N it will consider
   * system stable and will not compute more iterations.
   */
  async.maxIterations = typeof async.maxIterations === 'number' ? async.maxIterations : Number.POSITIVE_INFINITY;

  /**
   * Unlike requestAnimationFrame() web workers are executed even when page is
   * not active (e.g. user switched to a different browser tab). This can result
   * in unnecessary CPU consumption and battery drain.
   *
   * By default asyncforce will calculate layout as long as you call
   * `asncforce.step()`. Normally you will call this method from
   * requestAnimationFrame() handler to manage CPU resources.
   *
   * However, if you prefer to keep computing layout in background set this
   * options to true. Layout will be computed until system is considered stable
   * (see `maxIterations` above).
   */
  async.waitForStep = typeof async.waitForStep === 'boolean' ? async.waitForStep : true;
  return options;
}

},{}],7:[function(_dereq_,module,exports){
module.exports = function(subject) {
  validateSubject(subject);

  var eventsStorage = createEventsStorage(subject);
  subject.on = eventsStorage.on;
  subject.off = eventsStorage.off;
  subject.fire = eventsStorage.fire;
  return subject;
};

function createEventsStorage(subject) {
  // Store all event listeners to this hash. Key is event name, value is array
  // of callback records.
  //
  // A callback record consists of callback function and its optional context:
  // { 'eventName' => [{callback: function, ctx: object}] }
  var registeredEvents = Object.create(null);

  return {
    on: function (eventName, callback, ctx) {
      if (typeof callback !== 'function') {
        throw new Error('callback is expected to be a function');
      }
      var handlers = registeredEvents[eventName];
      if (!handlers) {
        handlers = registeredEvents[eventName] = [];
      }
      handlers.push({callback: callback, ctx: ctx});

      return subject;
    },

    off: function (eventName, callback) {
      var wantToRemoveAll = (typeof eventName === 'undefined');
      if (wantToRemoveAll) {
        // Killing old events storage should be enough in this case:
        registeredEvents = Object.create(null);
        return subject;
      }

      if (registeredEvents[eventName]) {
        var deleteAllCallbacksForEvent = (typeof callback !== 'function');
        if (deleteAllCallbacksForEvent) {
          delete registeredEvents[eventName];
        } else {
          var callbacks = registeredEvents[eventName];
          for (var i = 0; i < callbacks.length; ++i) {
            if (callbacks[i].callback === callback) {
              callbacks.splice(i, 1);
            }
          }
        }
      }

      return subject;
    },

    fire: function (eventName) {
      var callbacks = registeredEvents[eventName];
      if (!callbacks) {
        return subject;
      }

      var fireArguments;
      if (arguments.length > 1) {
        fireArguments = Array.prototype.splice.call(arguments, 1);
      }
      for(var i = 0; i < callbacks.length; ++i) {
        var callbackInfo = callbacks[i];
        callbackInfo.callback.apply(callbackInfo.ctx, fireArguments);
      }

      return subject;
    }
  };
}

function validateSubject(subject) {
  if (!subject) {
    throw new Error('Eventify cannot use falsy object as events subject');
  }
  var reservedWords = ['on', 'fire', 'off'];
  for (var i = 0; i < reservedWords.length; ++i) {
    if (subject.hasOwnProperty(reservedWords[i])) {
      throw new Error("Subject cannot be eventified, since it already has property '" + reservedWords[i] + "'");
    }
  }
}

},{}],8:[function(_dereq_,module,exports){
module.exports = exposeProperties;

/**
 * Augments `target` object with getter/setter functions, which modify settings
 *
 * @example
 *  var target = {};
 *  exposeProperties({ age: 42}, target);
 *  target.age(); // returns 42
 *  target.age(24); // make age 24;
 *
 *  var filteredTarget = {};
 *  exposeProperties({ age: 42, name: 'John'}, filteredTarget, ['name']);
 *  filteredTarget.name(); // returns 'John'
 *  filteredTarget.age === undefined; // true
 */
function exposeProperties(settings, target, filter) {
  var needsFilter = Object.prototype.toString.call(filter) === '[object Array]';
  if (needsFilter) {
    for (var i = 0; i < filter.length; ++i) {
      augment(settings, target, filter[i]);
    }
  } else {
    for (var key in settings) {
      augment(settings, target, key);
    }
  }
}

function augment(source, target, key) {
  if (source.hasOwnProperty(key)) {
    if (typeof target[key] === 'function') {
      // this accessor is already defined. Ignore it
      return;
    }
    target[key] = function (value) {
      if (value !== undefined) {
        source[key] = value;
        return target;
      }
      return source[key];
    }
  }
}

},{}],9:[function(_dereq_,module,exports){
module.exports = createLayout;
module.exports.simulator = _dereq_('ngraph.physics.simulator');

/**
 * Creates force based layout for a given graph.
 * @param {ngraph.graph} graph which needs to be laid out
 * @param {object} physicsSettings if you need custom settings
 * for physics simulator you can pass your own settings here. If it's not passed
 * a default one will be created.
 */
function createLayout(graph, physicsSettings) {
  if (!graph) {
    throw new Error('Graph structure cannot be undefined');
  }

  var createSimulator = _dereq_('ngraph.physics.simulator');
  var physicsSimulator = createSimulator(physicsSettings);

  var nodeBodies = typeof Object.create === 'function' ? Object.create(null) : {};
  var springs = {};

  var springTransform = physicsSimulator.settings.springTransform || noop;

  // Initialize physical objects according to what we have in the graph:
  initPhysics();
  listenToGraphEvents();

  var api = {
    /**
     * Performs one step of iterative layout algorithm
     */
    step: function() {
      return physicsSimulator.step();
    },

    /**
     * For a given `nodeId` returns position
     */
    getNodePosition: function (nodeId) {
      return getInitializedBody(nodeId).pos;
    },

    /**
     * Sets position of a node to a given coordinates
     * @param {string} nodeId node identifier
     * @param {number} x position of a node
     * @param {number} y position of a node
     * @param {number=} z position of node (only if applicable to body)
     */
    setNodePosition: function (nodeId) {
      var body = getInitializedBody(nodeId);
      body.setPosition.apply(body, Array.prototype.slice.call(arguments, 1));
    },

    /**
     * @returns {Object} Link position by link id
     * @returns {Object.from} {x, y} coordinates of link start
     * @returns {Object.to} {x, y} coordinates of link end
     */
    getLinkPosition: function (linkId) {
      var spring = springs[linkId];
      if (spring) {
        return {
          from: spring.from.pos,
          to: spring.to.pos
        };
      }
    },

    /**
     * @returns {Object} area required to fit in the graph. Object contains
     * `x1`, `y1` - top left coordinates
     * `x2`, `y2` - bottom right coordinates
     */
    getGraphRect: function () {
      return physicsSimulator.getBBox();
    },

    /*
     * Requests layout algorithm to pin/unpin node to its current position
     * Pinned nodes should not be affected by layout algorithm and always
     * remain at their position
     */
    pinNode: function (node, isPinned) {
      var body = getInitializedBody(node.id);
       body.isPinned = !!isPinned;
    },

    /**
     * Checks whether given graph's node is currently pinned
     */
    isNodePinned: function (node) {
      return getInitializedBody(node.id).isPinned;
    },

    /**
     * Request to release all resources
     */
    dispose: function() {
      graph.off('changed', onGraphChanged);
    },

    /**
     * Gets physical body for a given node id. If node is not found undefined
     * value is returned.
     */
    getBody: getBody,

    /**
     * Gets spring for a given edge.
     *
     * @param {string} linkId link identifer. If two arguments are passed then
     * this argument is treated as formNodeId
     * @param {string=} toId when defined this parameter denotes head of the link
     * and first argument is trated as tail of the link (fromId)
     */
    getSpring: getSpring,

    /**
     * [Read only] Gets current physics simulator
     */
    simulator: physicsSimulator
  };

  return api;

  function getSpring(fromId, toId) {
    var linkId;
    if (toId === undefined) {
      if (typeof fromId === 'string') {
        // assume fromId as a linkId:
        linkId = fromId;
      } else {
        // assume fromId to be a link object:
        linkId = fromId.id;
      }
    } else {
      // toId is defined, should grab link:
      var link = graph.hasLink(fromId, toId);
      if (!link) return;
      linkId = link.id;
    }

    return springs[linkId];
  }

  function getBody(nodeId) {
    return nodeBodies[nodeId];
  }

  function listenToGraphEvents() {
    graph.on('changed', onGraphChanged);
  }

  function onGraphChanged(changes) {
    for (var i = 0; i < changes.length; ++i) {
      var change = changes[i];
      if (change.changeType === 'add') {
        if (change.node) {
          initBody(change.node.id);
        }
        if (change.link) {
          initLink(change.link);
        }
      } else if (change.changeType === 'remove') {
        if (change.node) {
          releaseNode(change.node);
        }
        if (change.link) {
          releaseLink(change.link);
        }
      }
    }
  }

  function initPhysics() {
    graph.forEachNode(function (node) {
      initBody(node.id);
    });
    graph.forEachLink(initLink);
  }

  function initBody(nodeId) {
    var body = nodeBodies[nodeId];
    if (!body) {
      var node = graph.getNode(nodeId);
      if (!node) {
        throw new Error('initBody() was called with unknown node id');
      }

      var pos = node.position;
      if (!pos) {
        var neighbors = getNeighborBodies(node);
        pos = physicsSimulator.getBestNewBodyPosition(neighbors);
      }

      body = physicsSimulator.addBodyAt(pos);

      nodeBodies[nodeId] = body;
      updateBodyMass(nodeId);

      if (isNodeOriginallyPinned(node)) {
        body.isPinned = true;
      }
    }
  }

  function releaseNode(node) {
    var nodeId = node.id;
    var body = nodeBodies[nodeId];
    if (body) {
      nodeBodies[nodeId] = null;
      delete nodeBodies[nodeId];

      physicsSimulator.removeBody(body);
    }
  }

  function initLink(link) {
    updateBodyMass(link.fromId);
    updateBodyMass(link.toId);

    var fromBody = nodeBodies[link.fromId],
        toBody  = nodeBodies[link.toId],
        spring = physicsSimulator.addSpring(fromBody, toBody, link.length);

    springTransform(link, spring);

    springs[link.id] = spring;
  }

  function releaseLink(link) {
    var spring = springs[link.id];
    if (spring) {
      var from = graph.getNode(link.fromId),
          to = graph.getNode(link.toId);

      if (from) updateBodyMass(from.id);
      if (to) updateBodyMass(to.id);

      delete springs[link.id];

      physicsSimulator.removeSpring(spring);
    }
  }

  function getNeighborBodies(node) {
    // TODO: Could probably be done better on memory
    var neighbors = [];
    if (!node.links) {
      return neighbors;
    }
    var maxNeighbors = Math.min(node.links.length, 2);
    for (var i = 0; i < maxNeighbors; ++i) {
      var link = node.links[i];
      var otherBody = link.fromId !== node.id ? nodeBodies[link.fromId] : nodeBodies[link.toId];
      if (otherBody && otherBody.pos) {
        neighbors.push(otherBody);
      }
    }

    return neighbors;
  }

  function updateBodyMass(nodeId) {
    var body = nodeBodies[nodeId];
    body.mass = nodeMass(nodeId);
  }

  /**
   * Checks whether graph node has in its settings pinned attribute,
   * which means layout algorithm cannot move it. Node can be preconfigured
   * as pinned, if it has "isPinned" attribute, or when node.data has it.
   *
   * @param {Object} node a graph node to check
   * @return {Boolean} true if node should be treated as pinned; false otherwise.
   */
  function isNodeOriginallyPinned(node) {
    return (node && (node.isPinned || (node.data && node.data.isPinned)));
  }

  function getInitializedBody(nodeId) {
    var body = nodeBodies[nodeId];
    if (!body) {
      initBody(nodeId);
      body = nodeBodies[nodeId];
    }
    return body;
  }

  /**
   * Calculates mass of a body, which corresponds to node with given id.
   *
   * @param {String|Number} nodeId identifier of a node, for which body mass needs to be calculated
   * @returns {Number} recommended mass of the body;
   */
  function nodeMass(nodeId) {
    return 1 + graph.getLinks(nodeId).length / 3.0;
  }
}

function noop() { }

},{"ngraph.physics.simulator":10}],10:[function(_dereq_,module,exports){
/**
 * Manages a simulation of physical forces acting on bodies and springs.
 */
module.exports = physicsSimulator;

function physicsSimulator(settings) {
  var Spring = _dereq_('./lib/spring');
  var expose = _dereq_('ngraph.expose');
  var merge = _dereq_('ngraph.merge');

  settings = merge(settings, {
      /**
       * Ideal length for links (springs in physical model).
       */
      springLength: 30,

      /**
       * Hook's law coefficient. 1 - solid spring.
       */
      springCoeff: 0.0008,

      /**
       * Coulomb's law coefficient. It's used to repel nodes thus should be negative
       * if you make it positive nodes start attract each other :).
       */
      gravity: -1.2,

      /**
       * Theta coefficient from Barnes Hut simulation. Ranged between (0, 1).
       * The closer it's to 1 the more nodes algorithm will have to go through.
       * Setting it to one makes Barnes Hut simulation no different from
       * brute-force forces calculation (each node is considered).
       */
      theta: 0.8,

      /**
       * Drag force coefficient. Used to slow down system, thus should be less than 1.
       * The closer it is to 0 the less tight system will be.
       */
      dragCoeff: 0.02,

      /**
       * Default time step (dt) for forces integration
       */
      timeStep : 20,

      /**
        * Maximum movement of the system which can be considered as stabilized
        */
      stableThreshold: 0.009
  });

  // We allow clients to override basic factory methods:
  var createQuadTree = settings.createQuadTree || _dereq_('ngraph.quadtreebh');
  var createBounds = settings.createBounds || _dereq_('./lib/bounds');
  var createDragForce = settings.createDragForce || _dereq_('./lib/dragForce');
  var createSpringForce = settings.createSpringForce || _dereq_('./lib/springForce');
  var integrate = settings.integrator || _dereq_('./lib/eulerIntegrator');
  var createBody = settings.createBody || _dereq_('./lib/createBody');

  var bodies = [], // Bodies in this simulation.
      springs = [], // Springs in this simulation.
      quadTree =  createQuadTree(settings),
      bounds = createBounds(bodies, settings),
      springForce = createSpringForce(settings),
      dragForce = createDragForce(settings);

  var publicApi = {
    /**
     * Array of bodies, registered with current simulator
     *
     * Note: To add new body, use addBody() method. This property is only
     * exposed for testing/performance purposes.
     */
    bodies: bodies,

    /**
     * Array of springs, registered with current simulator
     *
     * Note: To add new spring, use addSpring() method. This property is only
     * exposed for testing/performance purposes.
     */
    springs: springs,

    /**
     * Returns settings with which current simulator was initialized
     */
    settings: settings,

    /**
     * Performs one step of force simulation.
     *
     * @returns {boolean} true if system is considered stable; False otherwise.
     */
    step: function () {
      accumulateForces();
      var totalMovement = integrate(bodies, settings.timeStep);

      bounds.update();

      return totalMovement < settings.stableThreshold;
    },

    /**
     * Adds body to the system
     *
     * @param {ngraph.physics.primitives.Body} body physical body
     *
     * @returns {ngraph.physics.primitives.Body} added body
     */
    addBody: function (body) {
      if (!body) {
        throw new Error('Body is required');
      }
      bodies.push(body);

      return body;
    },

    /**
     * Adds body to the system at given position
     *
     * @param {Object} pos position of a body
     *
     * @returns {ngraph.physics.primitives.Body} added body
     */
    addBodyAt: function (pos) {
      if (!pos) {
        throw new Error('Body position is required');
      }
      var body = createBody(pos);
      bodies.push(body);

      return body;
    },

    /**
     * Removes body from the system
     *
     * @param {ngraph.physics.primitives.Body} body to remove
     *
     * @returns {Boolean} true if body found and removed. falsy otherwise;
     */
    removeBody: function (body) {
      if (!body) { return; }

      var idx = bodies.indexOf(body);
      if (idx < 0) { return; }

      bodies.splice(idx, 1);
      if (bodies.length === 0) {
        bounds.reset();
      }
      return true;
    },

    /**
     * Adds a spring to this simulation.
     *
     * @returns {Object} - a handle for a spring. If you want to later remove
     * spring pass it to removeSpring() method.
     */
    addSpring: function (body1, body2, springLength, springWeight, springCoefficient) {
      if (!body1 || !body2) {
        throw new Error('Cannot add null spring to force simulator');
      }

      if (typeof springLength !== 'number') {
        springLength = -1; // assume global configuration
      }

      var spring = new Spring(body1, body2, springLength, springCoefficient >= 0 ? springCoefficient : -1, springWeight);
      springs.push(spring);

      // TODO: could mark simulator as dirty.
      return spring;
    },

    /**
     * Removes spring from the system
     *
     * @param {Object} spring to remove. Spring is an object returned by addSpring
     *
     * @returns {Boolean} true if spring found and removed. falsy otherwise;
     */
    removeSpring: function (spring) {
      if (!spring) { return; }
      var idx = springs.indexOf(spring);
      if (idx > -1) {
        springs.splice(idx, 1);
        return true;
      }
    },

    getBestNewBodyPosition: function (neighbors) {
      return bounds.getBestNewPosition(neighbors);
    },

    /**
     * Returns bounding box which covers all bodies
     */
    getBBox: function () {
      return bounds.box;
    },

    gravity: function (value) {
      if (value !== undefined) {
        settings.gravity = value;
        quadTree.options({gravity: value});
        return this;
      } else {
        return settings.gravity;
      }
    },

    theta: function (value) {
      if (value !== undefined) {
        settings.theta = value;
        quadTree.options({theta: value});
        return this;
      } else {
        return settings.theta;
      }
    }
  };

  // allow settings modification via public API:
  expose(settings, publicApi);

  return publicApi;

  function accumulateForces() {
    // Accumulate forces acting on bodies.
    var body,
        i = bodies.length;

    if (i) {
      // only add bodies if there the array is not empty:
      quadTree.insertBodies(bodies); // performance: O(n * log n)
      while (i--) {
        body = bodies[i];
        // If body is pinned there is no point updating its forces - it should
        // never move:
        if (!body.isPinned) {
          body.force.reset();

          quadTree.updateBodyForce(body);
          dragForce.update(body);
        }
      }
    }

    i = springs.length;
    while(i--) {
      springForce.update(springs[i]);
    }
  }
};

},{"./lib/bounds":11,"./lib/createBody":12,"./lib/dragForce":13,"./lib/eulerIntegrator":14,"./lib/spring":15,"./lib/springForce":16,"ngraph.expose":8,"ngraph.merge":25,"ngraph.quadtreebh":27}],11:[function(_dereq_,module,exports){
module.exports = function (bodies, settings) {
  var random = _dereq_('ngraph.random').random(42);
  var boundingBox =  { x1: 0, y1: 0, x2: 0, y2: 0 };

  return {
    box: boundingBox,

    update: updateBoundingBox,

    reset : function () {
      boundingBox.x1 = boundingBox.y1 = 0;
      boundingBox.x2 = boundingBox.y2 = 0;
    },

    getBestNewPosition: function (neighbors) {
      var graphRect = boundingBox;

      var baseX = 0, baseY = 0;

      if (neighbors.length) {
        for (var i = 0; i < neighbors.length; ++i) {
          baseX += neighbors[i].pos.x;
          baseY += neighbors[i].pos.y;
        }

        baseX /= neighbors.length;
        baseY /= neighbors.length;
      } else {
        baseX = (graphRect.x1 + graphRect.x2) / 2;
        baseY = (graphRect.y1 + graphRect.y2) / 2;
      }

      var springLength = settings.springLength;
      return {
        x: baseX + random.next(springLength) - springLength / 2,
        y: baseY + random.next(springLength) - springLength / 2
      };
    }
  };

  function updateBoundingBox() {
    var i = bodies.length;
    if (i === 0) { return; } // don't have to wory here.

    var x1 = Number.MAX_VALUE,
        y1 = Number.MAX_VALUE,
        x2 = Number.MIN_VALUE,
        y2 = Number.MIN_VALUE;

    while(i--) {
      // this is O(n), could it be done faster with quadtree?
      // how about pinned nodes?
      var body = bodies[i];
      if (body.isPinned) {
        body.pos.x = body.prevPos.x;
        body.pos.y = body.prevPos.y;
      } else {
        body.prevPos.x = body.pos.x;
        body.prevPos.y = body.pos.y;
      }
      if (body.pos.x < x1) {
        x1 = body.pos.x;
      }
      if (body.pos.x > x2) {
        x2 = body.pos.x;
      }
      if (body.pos.y < y1) {
        y1 = body.pos.y;
      }
      if (body.pos.y > y2) {
        y2 = body.pos.y;
      }
    }

    boundingBox.x1 = x1;
    boundingBox.x2 = x2;
    boundingBox.y1 = y1;
    boundingBox.y2 = y2;
  }
}

},{"ngraph.random":35}],12:[function(_dereq_,module,exports){
var physics = _dereq_('ngraph.physics.primitives');

module.exports = function(pos) {
  return new physics.Body(pos);
}

},{"ngraph.physics.primitives":26}],13:[function(_dereq_,module,exports){
/**
 * Represents drag force, which reduces force value on each step by given
 * coefficient.
 *
 * @param {Object} options for the drag force
 * @param {Number=} options.dragCoeff drag force coefficient. 0.1 by default
 */
module.exports = function (options) {
  var merge = _dereq_('ngraph.merge'),
      expose = _dereq_('ngraph.expose');

  options = merge(options, {
    dragCoeff: 0.02
  });

  var api = {
    update : function (body) {
      body.force.x -= options.dragCoeff * body.velocity.x;
      body.force.y -= options.dragCoeff * body.velocity.y;
    }
  };

  // let easy access to dragCoeff:
  expose(options, api, ['dragCoeff']);

  return api;
};

},{"ngraph.expose":8,"ngraph.merge":25}],14:[function(_dereq_,module,exports){
/**
 * Performs forces integration, using given timestep. Uses Euler method to solve
 * differential equation (http://en.wikipedia.org/wiki/Euler_method ).
 *
 * @returns {Number} squared distance of total position updates.
 */

module.exports = integrate;

function integrate(bodies, timeStep) {
  var dx = 0, tx = 0,
      dy = 0, ty = 0,
      i,
      max = bodies.length;

  for (i = 0; i < max; ++i) {
    var body = bodies[i],
        coeff = timeStep / body.mass;

    body.velocity.x += coeff * body.force.x;
    body.velocity.y += coeff * body.force.y;
    var vx = body.velocity.x,
        vy = body.velocity.y,
        v = Math.sqrt(vx * vx + vy * vy);

    if (v > 1) {
      body.velocity.x = vx / v;
      body.velocity.y = vy / v;
    }

    dx = timeStep * body.velocity.x;
    dy = timeStep * body.velocity.y;

    body.pos.x += dx;
    body.pos.y += dy;

    tx += Math.abs(dx); ty += Math.abs(dy);
  }

  return (tx * tx + ty * ty)/bodies.length;
}

},{}],15:[function(_dereq_,module,exports){
module.exports = Spring;

/**
 * Represents a physical spring. Spring connects two bodies, has rest length
 * stiffness coefficient and optional weight
 */
function Spring(fromBody, toBody, length, coeff, weight) {
    this.from = fromBody;
    this.to = toBody;
    this.length = length;
    this.coeff = coeff;

    this.weight = typeof weight === 'number' ? weight : 1;
};

},{}],16:[function(_dereq_,module,exports){
/**
 * Represents spring force, which updates forces acting on two bodies, conntected
 * by a spring.
 *
 * @param {Object} options for the spring force
 * @param {Number=} options.springCoeff spring force coefficient.
 * @param {Number=} options.springLength desired length of a spring at rest.
 */
module.exports = function (options) {
  var merge = _dereq_('ngraph.merge');
  var random = _dereq_('ngraph.random').random(42);
  var expose = _dereq_('ngraph.expose');

  options = merge(options, {
    springCoeff: 0.0002,
    springLength: 80
  });

  var api = {
    /**
     * Upsates forces acting on a spring
     */
    update : function (spring) {
      var body1 = spring.from,
          body2 = spring.to,
          length = spring.length < 0 ? options.springLength : spring.length,
          dx = body2.pos.x - body1.pos.x,
          dy = body2.pos.y - body1.pos.y,
          r = Math.sqrt(dx * dx + dy * dy);

      if (r === 0) {
          dx = (random.nextDouble() - 0.5) / 50;
          dy = (random.nextDouble() - 0.5) / 50;
          r = Math.sqrt(dx * dx + dy * dy);
      }

      var d = r - length;
      var coeff = ((!spring.coeff || spring.coeff < 0) ? options.springCoeff : spring.coeff) * d / r * spring.weight;

      body1.force.x += coeff * dx;
      body1.force.y += coeff * dy;

      body2.force.x -= coeff * dx;
      body2.force.y -= coeff * dy;
    }
  };

  expose(options, api, ['springCoeff', 'springLength']);
  return api;
}

},{"ngraph.expose":8,"ngraph.merge":25,"ngraph.random":35}],17:[function(_dereq_,module,exports){
/**
 * This module provides all required forces to regular ngraph.physics.simulator
 * to make it 3D simulator. Ideally ngraph.physics.simulator should operate
 * with vectors, but on practices that showed performance decrease... Maybe
 * I was doing it wrong, will see if I can refactor/throw away this module.
 */
module.exports = createLayout;
createLayout.get2dLayout = _dereq_('ngraph.forcelayout');

function createLayout(graph, physicsSettings) {
  var merge = _dereq_('ngraph.merge');
  physicsSettings = merge(physicsSettings, {
        createQuadTree: _dereq_('ngraph.quadtreebh3d'),
        createBounds: _dereq_('./lib/bounds'),
        createDragForce: _dereq_('./lib/dragForce'),
        createSpringForce: _dereq_('./lib/springForce'),
        integrator: _dereq_('./lib/eulerIntegrator'),
        createBody: _dereq_('./lib/createBody')
      });

  return createLayout.get2dLayout(graph, physicsSettings);
}

},{"./lib/bounds":18,"./lib/createBody":19,"./lib/dragForce":20,"./lib/eulerIntegrator":21,"./lib/springForce":22,"ngraph.forcelayout":9,"ngraph.merge":25,"ngraph.quadtreebh3d":31}],18:[function(_dereq_,module,exports){
module.exports = function (bodies, settings) {
  var random = _dereq_('ngraph.random').random(42);
  var boundingBox =  { x1: 0, y1: 0, z1: 0, x2: 0, y2: 0, z2: 0 };

  return {
    box: boundingBox,

    update: updateBoundingBox,

    reset : function () {
      boundingBox.x1 = boundingBox.y1 = 0;
      boundingBox.x2 = boundingBox.y2 = 0;
      boundingBox.z1 = boundingBox.z2 = 0;
    },

    getBestNewPosition: function (neighbors) {
      var graphRect = boundingBox;

      var baseX = 0, baseY = 0, baseZ = 0;

      if (neighbors.length) {
        for (var i = 0; i < neighbors.length; ++i) {
          baseX += neighbors[i].pos.x;
          baseY += neighbors[i].pos.y;
          baseZ += neighbors[i].pos.z;
        }

        baseX /= neighbors.length;
        baseY /= neighbors.length;
        baseZ /= neighbors.length;
      } else {
        baseX = (graphRect.x1 + graphRect.x2) / 2;
        baseY = (graphRect.y1 + graphRect.y2) / 2;
        baseZ = (graphRect.z1 + graphRect.z2) / 2;
      }

      var springLength = settings.springLength;
      return {
        x: baseX + random.next(springLength) - springLength / 2,
        y: baseY + random.next(springLength) - springLength / 2,
        z: baseZ + random.next(springLength) - springLength / 2
      };
    }
  };

  function updateBoundingBox() {
    var i = bodies.length;
    if (i === 0) { return; } // don't have to wory here.

    var x1 = Number.MAX_VALUE,
        y1 = Number.MAX_VALUE,
        z1 = Number.MAX_VALUE,
        x2 = Number.MIN_VALUE,
        y2 = Number.MIN_VALUE,
        z2 = Number.MIN_VALUE;

    while(i--) {
      // this is O(n), could it be done faster with quadtree?
      // how about pinned nodes?
      var body = bodies[i];
      if (body.isPinned) {
        body.pos.x = body.prevPos.x;
        body.pos.y = body.prevPos.y;
        body.pos.z = body.prevPos.z;
      } else {
        body.prevPos.x = body.pos.x;
        body.prevPos.y = body.pos.y;
        body.prevPos.z = body.pos.z;
      }
      if (body.pos.x < x1) {
        x1 = body.pos.x;
      }
      if (body.pos.x > x2) {
        x2 = body.pos.x;
      }
      if (body.pos.y < y1) {
        y1 = body.pos.y;
      }
      if (body.pos.y > y2) {
        y2 = body.pos.y;
      }
      if (body.pos.z < z1) {
        z1 = body.pos.z;
      }
      if (body.pos.z > z2) {
        z2 = body.pos.z;
      }
    }

    boundingBox.x1 = x1;
    boundingBox.x2 = x2;
    boundingBox.y1 = y1;
    boundingBox.y2 = y2;
    boundingBox.z1 = z1;
    boundingBox.z2 = z2;
  }
};

},{"ngraph.random":35}],19:[function(_dereq_,module,exports){
var physics = _dereq_('ngraph.physics.primitives');

module.exports = function(pos) {
  return new physics.Body3d(pos);
}

},{"ngraph.physics.primitives":26}],20:[function(_dereq_,module,exports){
/**
 * Represents 3d drag force, which reduces force value on each step by given
 * coefficient.
 *
 * @param {Object} options for the drag force
 * @param {Number=} options.dragCoeff drag force coefficient. 0.1 by default
 */
module.exports = function (options) {
  var merge = _dereq_('ngraph.merge'),
      expose = _dereq_('ngraph.expose');

  options = merge(options, {
    dragCoeff: 0.02
  });

  var api = {
    update : function (body) {
      body.force.x -= options.dragCoeff * body.velocity.x;
      body.force.y -= options.dragCoeff * body.velocity.y;
      body.force.z -= options.dragCoeff * body.velocity.z;
    }
  };

  // let easy access to dragCoeff:
  expose(options, api, ['dragCoeff']);

  return api;
};

},{"ngraph.expose":8,"ngraph.merge":25}],21:[function(_dereq_,module,exports){
/**
 * Performs 3d forces integration, using given timestep. Uses Euler method to solve
 * differential equation (http://en.wikipedia.org/wiki/Euler_method ).
 *
 * @returns {Number} squared distance of total position updates.
 */

module.exports = integrate;

function integrate(bodies, timeStep) {
  var dx = 0, tx = 0,
      dy = 0, ty = 0,
      dz = 0, tz = 0,
      i,
      max = bodies.length;

  for (i = 0; i < max; ++i) {
    var body = bodies[i],
        coeff = timeStep / body.mass;

    body.velocity.x += coeff * body.force.x;
    body.velocity.y += coeff * body.force.y;
    body.velocity.z += coeff * body.force.z;

    var vx = body.velocity.x,
        vy = body.velocity.y,
        vz = body.velocity.z,
        v = Math.sqrt(vx * vx + vy * vy + vz * vz);

    if (v > 1) {
      body.velocity.x = vx / v;
      body.velocity.y = vy / v;
      body.velocity.z = vz / v;
    }

    dx = timeStep * body.velocity.x;
    dy = timeStep * body.velocity.y;
    dz = timeStep * body.velocity.z;

    body.pos.x += dx;
    body.pos.y += dy;
    body.pos.z += dz;

    tx += Math.abs(dx); ty += Math.abs(dy); tz += Math.abs(dz);
  }

  return (tx * tx + ty * ty + tz * tz)/bodies.length;
}

},{}],22:[function(_dereq_,module,exports){
/**
 * Represents 3d spring force, which updates forces acting on two bodies, conntected
 * by a spring.
 *
 * @param {Object} options for the spring force
 * @param {Number=} options.springCoeff spring force coefficient.
 * @param {Number=} options.springLength desired length of a spring at rest.
 */
module.exports = function (options) {
  var merge = _dereq_('ngraph.merge');
  var random = _dereq_('ngraph.random').random(42);
  var expose = _dereq_('ngraph.expose');

  options = merge(options, {
    springCoeff: 0.0002,
    springLength: 80
  });

  var api = {
    /**
     * Upsates forces acting on a spring
     */
    update : function (spring) {
      var body1 = spring.from,
          body2 = spring.to,
          length = spring.length < 0 ? options.springLength : spring.length,
          dx = body2.pos.x - body1.pos.x,
          dy = body2.pos.y - body1.pos.y,
          dz = body2.pos.z - body1.pos.z,
          r = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (r === 0) {
          dx = (random.nextDouble() - 0.5) / 50;
          dy = (random.nextDouble() - 0.5) / 50;
          dz = (random.nextDouble() - 0.5) / 50;
          r = Math.sqrt(dx * dx + dy * dy + dz * dz);
      }

      var d = r - length;
      var coeff = ((!spring.coeff || spring.coeff < 0) ? options.springCoeff : spring.coeff) * d / r * spring.weight;

      body1.force.x += coeff * dx;
      body1.force.y += coeff * dy;
      body1.force.z += coeff * dz;

      body2.force.x -= coeff * dx;
      body2.force.y -= coeff * dy;
      body2.force.z -= coeff * dz;
    }
  };

  expose(options, api, ['springCoeff', 'springLength']);
  return api;
}

},{"ngraph.expose":8,"ngraph.merge":25,"ngraph.random":35}],23:[function(_dereq_,module,exports){
module.exports = load;

var createGraph = _dereq_('ngraph.graph');

function load(jsonGraph, nodeTransform, linkTransform) {
  var stored;
  nodeTransform = nodeTransform || id;
  linkTransform = linkTransform || id;
  if (typeof jsonGraph === 'string') {
    stored = JSON.parse(jsonGraph);
  } else {
    stored = jsonGraph;
  }

  var graph = createGraph(),
      i;

  if (stored.links === undefined || stored.nodes === undefined) {
    throw new Error('Cannot load graph without links and nodes');
  }

  for (i = 0; i < stored.nodes.length; ++i) {
    var parsedNode = nodeTransform(stored.nodes[i]);
    if (!parsedNode.hasOwnProperty('id')) {
      throw new Error('Graph node format is invalid: Node id is missing');
    }

    graph.addNode(parsedNode.id, parsedNode.data);
  }

  for (i = 0; i < stored.links.length; ++i) {
    var link = linkTransform(stored.links[i]);
    if (!link.hasOwnProperty('fromId') || !link.hasOwnProperty('toId')) {
      throw new Error('Graph link format is invalid. Both fromId and toId are required');
    }

    graph.addLink(link.fromId, link.toId, link.data);
  }

  return graph;
}

function id(x) { return x; }

},{"ngraph.graph":24}],24:[function(_dereq_,module,exports){
/**
 * @fileOverview Contains definition of the core graph object.
 */

/**
 * @example
 *  var graph = require('ngraph.graph')();
 *  graph.addNode(1);     // graph has one node.
 *  graph.addLink(2, 3);  // now graph contains three nodes and one link.
 *
 */
module.exports = createGraph;

var eventify = _dereq_('ngraph.events');

/**
 * Creates a new graph
 */
function createGraph(options) {
  // Graph structure is maintained as dictionary of nodes
  // and array of links. Each node has 'links' property which
  // hold all links related to that node. And general links
  // array is used to speed up all links enumeration. This is inefficient
  // in terms of memory, but simplifies coding.
  options = options || {};
  if (options.uniqueLinkId === undefined) {
    // Request each link id to be unique between same nodes. This negatively
    // impacts `addLink()` performance (O(n), where n - number of edges of each
    // vertex), but makes operations with multigraphs more accessible.
    options.uniqueLinkId = true;
  }

  var nodes = typeof Object.create === 'function' ? Object.create(null) : {},
    links = [],
    // Hash of multi-edges. Used to track ids of edges between same nodes
    multiEdges = {},
    nodesCount = 0,
    suspendEvents = 0,

    forEachNode = createNodeIterator(),
    createLink = options.uniqueLinkId ? createUniqueLink : createSingleLink,

    // Our graph API provides means to listen to graph changes. Users can subscribe
    // to be notified about changes in the graph by using `on` method. However
    // in some cases they don't use it. To avoid unnecessary memory consumption
    // we will not record graph changes until we have at least one subscriber.
    // Code below supports this optimization.
    //
    // Accumulates all changes made during graph updates.
    // Each change element contains:
    //  changeType - one of the strings: 'add', 'remove' or 'update';
    //  node - if change is related to node this property is set to changed graph's node;
    //  link - if change is related to link this property is set to changed graph's link;
    changes = [],
    recordLinkChange = noop,
    recordNodeChange = noop,
    enterModification = noop,
    exitModification = noop;

  // this is our public API:
  var graphPart = {
    /**
     * Adds node to the graph. If node with given id already exists in the graph
     * its data is extended with whatever comes in 'data' argument.
     *
     * @param nodeId the node's identifier. A string or number is preferred.
     * @param [data] additional data for the node being added. If node already
     *   exists its data object is augmented with the new one.
     *
     * @return {node} The newly added node or node with given id if it already exists.
     */
    addNode: addNode,

    /**
     * Adds a link to the graph. The function always create a new
     * link between two nodes. If one of the nodes does not exists
     * a new node is created.
     *
     * @param fromId link start node id;
     * @param toId link end node id;
     * @param [data] additional data to be set on the new link;
     *
     * @return {link} The newly created link
     */
    addLink: addLink,

    /**
     * Removes link from the graph. If link does not exist does nothing.
     *
     * @param link - object returned by addLink() or getLinks() methods.
     *
     * @returns true if link was removed; false otherwise.
     */
    removeLink: removeLink,

    /**
     * Removes node with given id from the graph. If node does not exist in the graph
     * does nothing.
     *
     * @param nodeId node's identifier passed to addNode() function.
     *
     * @returns true if node was removed; false otherwise.
     */
    removeNode: removeNode,

    /**
     * Gets node with given identifier. If node does not exist undefined value is returned.
     *
     * @param nodeId requested node identifier;
     *
     * @return {node} in with requested identifier or undefined if no such node exists.
     */
    getNode: getNode,

    /**
     * Gets number of nodes in this graph.
     *
     * @return number of nodes in the graph.
     */
    getNodesCount: function() {
      return nodesCount;
    },

    /**
     * Gets total number of links in the graph.
     */
    getLinksCount: function() {
      return links.length;
    },

    /**
     * Gets all links (inbound and outbound) from the node with given id.
     * If node with given id is not found null is returned.
     *
     * @param nodeId requested node identifier.
     *
     * @return Array of links from and to requested node if such node exists;
     *   otherwise null is returned.
     */
    getLinks: getLinks,

    /**
     * Invokes callback on each node of the graph.
     *
     * @param {Function(node)} callback Function to be invoked. The function
     *   is passed one argument: visited node.
     */
    forEachNode: forEachNode,

    /**
     * Invokes callback on every linked (adjacent) node to the given one.
     *
     * @param nodeId Identifier of the requested node.
     * @param {Function(node, link)} callback Function to be called on all linked nodes.
     *   The function is passed two parameters: adjacent node and link object itself.
     * @param oriented if true graph treated as oriented.
     */
    forEachLinkedNode: forEachLinkedNode,

    /**
     * Enumerates all links in the graph
     *
     * @param {Function(link)} callback Function to be called on all links in the graph.
     *   The function is passed one parameter: graph's link object.
     *
     * Link object contains at least the following fields:
     *  fromId - node id where link starts;
     *  toId - node id where link ends,
     *  data - additional data passed to graph.addLink() method.
     */
    forEachLink: forEachLink,

    /**
     * Suspend all notifications about graph changes until
     * endUpdate is called.
     */
    beginUpdate: enterModification,

    /**
     * Resumes all notifications about graph changes and fires
     * graph 'changed' event in case there are any pending changes.
     */
    endUpdate: exitModification,

    /**
     * Removes all nodes and links from the graph.
     */
    clear: clear,

    /**
     * Detects whether there is a link between two nodes.
     * Operation complexity is O(n) where n - number of links of a node.
     * NOTE: this function is synonim for getLink()
     *
     * @returns link if there is one. null otherwise.
     */
    hasLink: getLink,

    /**
     * Gets an edge between two nodes.
     * Operation complexity is O(n) where n - number of links of a node.
     *
     * @param {string} fromId link start identifier
     * @param {string} toId link end identifier
     *
     * @returns link if there is one. null otherwise.
     */
    getLink: getLink
  };

  // this will add `on()` and `fire()` methods.
  eventify(graphPart);

  monitorSubscribers();

  return graphPart;

  function monitorSubscribers() {
    var realOn = graphPart.on;

    // replace real `on` with our temporary on, which will trigger change
    // modification monitoring:
    graphPart.on = on;

    function on() {
      // now it's time to start tracking stuff:
      graphPart.beginUpdate = enterModification = enterModificationReal;
      graphPart.endUpdate = exitModification = exitModificationReal;
      recordLinkChange = recordLinkChangeReal;
      recordNodeChange = recordNodeChangeReal;

      // this will replace current `on` method with real pub/sub from `eventify`.
      graphPart.on = realOn;
      // delegate to real `on` handler:
      return realOn.apply(graphPart, arguments);
    }
  }

  function recordLinkChangeReal(link, changeType) {
    changes.push({
      link: link,
      changeType: changeType
    });
  }

  function recordNodeChangeReal(node, changeType) {
    changes.push({
      node: node,
      changeType: changeType
    });
  }

  function addNode(nodeId, data) {
    if (nodeId === undefined) {
      throw new Error('Invalid node identifier');
    }

    enterModification();

    var node = getNode(nodeId);
    if (!node) {
      node = new Node(nodeId);
      nodesCount++;
      recordNodeChange(node, 'add');
    } else {
      recordNodeChange(node, 'update');
    }

    node.data = data;

    nodes[nodeId] = node;

    exitModification();
    return node;
  }

  function getNode(nodeId) {
    return nodes[nodeId];
  }

  function removeNode(nodeId) {
    var node = getNode(nodeId);
    if (!node) {
      return false;
    }

    enterModification();

    if (node.links) {
      while (node.links.length) {
        var link = node.links[0];
        removeLink(link);
      }
    }

    delete nodes[nodeId];
    nodesCount--;

    recordNodeChange(node, 'remove');

    exitModification();

    return true;
  }


  function addLink(fromId, toId, data) {
    enterModification();

    var fromNode = getNode(fromId) || addNode(fromId);
    var toNode = getNode(toId) || addNode(toId);

    var link = createLink(fromId, toId, data);

    links.push(link);

    // TODO: this is not cool. On large graphs potentially would consume more memory.
    addLinkToNode(fromNode, link);
    if (fromId !== toId) {
      // make sure we are not duplicating links for self-loops
      addLinkToNode(toNode, link);
    }

    recordLinkChange(link, 'add');

    exitModification();

    return link;
  }

  function createSingleLink(fromId, toId, data) {
    var linkId = makeLinkId(fromId, toId);
    return new Link(fromId, toId, data, linkId);
  }

  function createUniqueLink(fromId, toId, data) {
    // TODO: Get rid of this method.
    var linkId = makeLinkId(fromId, toId);
    var isMultiEdge = multiEdges.hasOwnProperty(linkId);
    if (isMultiEdge || getLink(fromId, toId)) {
      if (!isMultiEdge) {
        multiEdges[linkId] = 0;
      }
      var suffix = '@' + (++multiEdges[linkId]);
      linkId = makeLinkId(fromId + suffix, toId + suffix);
    }

    return new Link(fromId, toId, data, linkId);
  }

  function getLinks(nodeId) {
    var node = getNode(nodeId);
    return node ? node.links : null;
  }

  function removeLink(link) {
    if (!link) {
      return false;
    }
    var idx = indexOfElementInArray(link, links);
    if (idx < 0) {
      return false;
    }

    enterModification();

    links.splice(idx, 1);

    var fromNode = getNode(link.fromId);
    var toNode = getNode(link.toId);

    if (fromNode) {
      idx = indexOfElementInArray(link, fromNode.links);
      if (idx >= 0) {
        fromNode.links.splice(idx, 1);
      }
    }

    if (toNode) {
      idx = indexOfElementInArray(link, toNode.links);
      if (idx >= 0) {
        toNode.links.splice(idx, 1);
      }
    }

    recordLinkChange(link, 'remove');

    exitModification();

    return true;
  }

  function getLink(fromNodeId, toNodeId) {
    // TODO: Use sorted links to speed this up
    var node = getNode(fromNodeId),
      i;
    if (!node || !node.links) {
      return null;
    }

    for (i = 0; i < node.links.length; ++i) {
      var link = node.links[i];
      if (link.fromId === fromNodeId && link.toId === toNodeId) {
        return link;
      }
    }

    return null; // no link.
  }

  function clear() {
    enterModification();
    forEachNode(function(node) {
      removeNode(node.id);
    });
    exitModification();
  }

  function forEachLink(callback) {
    var i, length;
    if (typeof callback === 'function') {
      for (i = 0, length = links.length; i < length; ++i) {
        callback(links[i]);
      }
    }
  }

  function forEachLinkedNode(nodeId, callback, oriented) {
    var node = getNode(nodeId);

    if (node && node.links && typeof callback === 'function') {
      if (oriented) {
        return forEachOrientedLink(node.links, nodeId, callback);
      } else {
        return forEachNonOrientedLink(node.links, nodeId, callback);
      }
    }
  }

  function forEachNonOrientedLink(links, nodeId, callback) {
    var quitFast;
    for (var i = 0; i < links.length; ++i) {
      var link = links[i];
      var linkedNodeId = link.fromId === nodeId ? link.toId : link.fromId;

      quitFast = callback(nodes[linkedNodeId], link);
      if (quitFast) {
        return true; // Client does not need more iterations. Break now.
      }
    }
  }

  function forEachOrientedLink(links, nodeId, callback) {
    var quitFast;
    for (var i = 0; i < links.length; ++i) {
      var link = links[i];
      if (link.fromId === nodeId) {
        quitFast = callback(nodes[link.toId], link);
        if (quitFast) {
          return true; // Client does not need more iterations. Break now.
        }
      }
    }
  }

  // we will not fire anything until users of this library explicitly call `on()`
  // method.
  function noop() {}

  // Enter, Exit modification allows bulk graph updates without firing events.
  function enterModificationReal() {
    suspendEvents += 1;
  }

  function exitModificationReal() {
    suspendEvents -= 1;
    if (suspendEvents === 0 && changes.length > 0) {
      graphPart.fire('changed', changes);
      changes.length = 0;
    }
  }

  function createNodeIterator() {
    // Object.keys iterator is 1.3x faster than `for in` loop.
    // See `https://github.com/anvaka/ngraph.graph/tree/bench-for-in-vs-obj-keys`
    // branch for perf test
    return Object.keys ? objectKeysIterator : forInIterator;
  }

  function objectKeysIterator(callback) {
    if (typeof callback !== 'function') {
      return;
    }

    var keys = Object.keys(nodes);
    for (var i = 0; i < keys.length; ++i) {
      if (callback(nodes[keys[i]])) {
        return true; // client doesn't want to proceed. Return.
      }
    }
  }

  function forInIterator(callback) {
    if (typeof callback !== 'function') {
      return;
    }
    var node;

    for (node in nodes) {
      if (callback(nodes[node])) {
        return true; // client doesn't want to proceed. Return.
      }
    }
  }
}

// need this for old browsers. Should this be a separate module?
function indexOfElementInArray(element, array) {
  if (!array) return -1;

  if (array.indexOf) {
    return array.indexOf(element);
  }

  var len = array.length,
    i;

  for (i = 0; i < len; i += 1) {
    if (array[i] === element) {
      return i;
    }
  }

  return -1;
}

/**
 * Internal structure to represent node;
 */
function Node(id) {
  this.id = id;
  this.links = null;
  this.data = null;
}

function addLinkToNode(node, link) {
  if (node.links) {
    node.links.push(link);
  } else {
    node.links = [link];
  }
}

/**
 * Internal structure to represent links;
 */
function Link(fromId, toId, data, id) {
  this.fromId = fromId;
  this.toId = toId;
  this.data = data;
  this.id = id;
}

function hashCode(str) {
  var hash = 0, i, chr, len;
  if (str.length == 0) return hash;
  for (i = 0, len = str.length; i < len; i++) {
    chr   = str.charCodeAt(i);
    hash  = ((hash << 5) - hash) + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
}

function makeLinkId(fromId, toId) {
  return hashCode(fromId.toString() + '👉 ' + toId.toString());
}

},{"ngraph.events":7}],25:[function(_dereq_,module,exports){
module.exports = merge;

/**
 * Augments `target` with properties in `options`. Does not override
 * target's properties if they are defined and matches expected type in 
 * options
 *
 * @returns {Object} merged object
 */
function merge(target, options) {
  var key;
  if (!target) { target = {}; }
  if (options) {
    for (key in options) {
      if (options.hasOwnProperty(key)) {
        var targetHasIt = target.hasOwnProperty(key),
            optionsValueType = typeof options[key],
            shouldReplace = !targetHasIt || (typeof target[key] !== optionsValueType);

        if (shouldReplace) {
          target[key] = options[key];
        } else if (optionsValueType === 'object') {
          // go deep, don't care about loops here, we are simple API!:
          target[key] = merge(target[key], options[key]);
        }
      }
    }
  }

  return target;
}

},{}],26:[function(_dereq_,module,exports){
module.exports = {
  Body: Body,
  Vector2d: Vector2d,
  Body3d: Body3d,
  Vector3d: Vector3d
};

function Body(x, y) {
  this.pos = new Vector2d(x, y);
  this.prevPos = new Vector2d(x, y);
  this.force = new Vector2d();
  this.velocity = new Vector2d();
  this.mass = 1;
}

Body.prototype.setPosition = function (x, y) {
  this.prevPos.x = this.pos.x = x;
  this.prevPos.y = this.pos.y = y;
};

function Vector2d(x, y) {
  if (x && typeof x !== 'number') {
    // could be another vector
    this.x = typeof x.x === 'number' ? x.x : 0;
    this.y = typeof x.y === 'number' ? x.y : 0;
  } else {
    this.x = typeof x === 'number' ? x : 0;
    this.y = typeof y === 'number' ? y : 0;
  }
}

Vector2d.prototype.reset = function () {
  this.x = this.y = 0;
};

function Body3d(x, y, z) {
  this.pos = new Vector3d(x, y, z);
  this.prevPos = new Vector3d(x, y, z);
  this.force = new Vector3d();
  this.velocity = new Vector3d();
  this.mass = 1;
}

Body3d.prototype.setPosition = function (x, y, z) {
  this.prevPos.x = this.pos.x = x;
  this.prevPos.y = this.pos.y = y;
  this.prevPos.z = this.pos.z = z;
};

function Vector3d(x, y, z) {
  if (x && typeof x !== 'number') {
    // could be another vector
    this.x = typeof x.x === 'number' ? x.x : 0;
    this.y = typeof x.y === 'number' ? x.y : 0;
    this.z = typeof x.z === 'number' ? x.z : 0;
  } else {
    this.x = typeof x === 'number' ? x : 0;
    this.y = typeof y === 'number' ? y : 0;
    this.z = typeof z === 'number' ? z : 0;
  }
};

Vector3d.prototype.reset = function () {
  this.x = this.y = this.z = 0;
};

},{}],27:[function(_dereq_,module,exports){
/**
 * This is Barnes Hut simulation algorithm for 2d case. Implementation
 * is highly optimized (avoids recusion and gc pressure)
 *
 * http://www.cs.princeton.edu/courses/archive/fall03/cs126/assignments/barnes-hut.html
 */

module.exports = function(options) {
  options = options || {};
  options.gravity = typeof options.gravity === 'number' ? options.gravity : -1;
  options.theta = typeof options.theta === 'number' ? options.theta : 0.8;

  // we require deterministic randomness here
  var random = _dereq_('ngraph.random').random(1984),
    Node = _dereq_('./node'),
    InsertStack = _dereq_('./insertStack'),
    isSamePosition = _dereq_('./isSamePosition');

  var gravity = options.gravity,
    updateQueue = [],
    insertStack = new InsertStack(),
    theta = options.theta,

    nodesCache = [],
    currentInCache = 0,
    newNode = function() {
      // To avoid pressure on GC we reuse nodes.
      var node = nodesCache[currentInCache];
      if (node) {
        node.quad0 = null;
        node.quad1 = null;
        node.quad2 = null;
        node.quad3 = null;
        node.body = null;
        node.mass = node.massX = node.massY = 0;
        node.left = node.right = node.top = node.bottom = 0;
      } else {
        node = new Node();
        nodesCache[currentInCache] = node;
      }

      ++currentInCache;
      return node;
    },

    root = newNode(),

    // Inserts body to the tree
    insert = function(newBody) {
      insertStack.reset();
      insertStack.push(root, newBody);

      while (!insertStack.isEmpty()) {
        var stackItem = insertStack.pop(),
          node = stackItem.node,
          body = stackItem.body;

        if (!node.body) {
          // This is internal node. Update the total mass of the node and center-of-mass.
          var x = body.pos.x;
          var y = body.pos.y;
          node.mass = node.mass + body.mass;
          node.massX = node.massX + body.mass * x;
          node.massY = node.massY + body.mass * y;

          // Recursively insert the body in the appropriate quadrant.
          // But first find the appropriate quadrant.
          var quadIdx = 0, // Assume we are in the 0's quad.
            left = node.left,
            right = (node.right + left) / 2,
            top = node.top,
            bottom = (node.bottom + top) / 2;

          if (x > right) { // somewhere in the eastern part.
            quadIdx = quadIdx + 1;
            var oldLeft = left;
            left = right;
            right = right + (right - oldLeft);
          }
          if (y > bottom) { // and in south.
            quadIdx = quadIdx + 2;
            var oldTop = top;
            top = bottom;
            bottom = bottom + (bottom - oldTop);
          }

          var child = getChild(node, quadIdx);
          if (!child) {
            // The node is internal but this quadrant is not taken. Add
            // subnode to it.
            child = newNode();
            child.left = left;
            child.top = top;
            child.right = right;
            child.bottom = bottom;
            child.body = body;

            setChild(node, quadIdx, child);
          } else {
            // continue searching in this quadrant.
            insertStack.push(child, body);
          }
        } else {
          // We are trying to add to the leaf node.
          // We have to convert current leaf into internal node
          // and continue adding two nodes.
          var oldBody = node.body;
          node.body = null; // internal nodes do not cary bodies

          if (isSamePosition(oldBody.pos, body.pos)) {
            // Prevent infinite subdivision by bumping one node
            // anywhere in this quadrant
            var retriesCount = 3;
            do {
              var offset = random.nextDouble();
              var dx = (node.right - node.left) * offset;
              var dy = (node.bottom - node.top) * offset;

              oldBody.pos.x = node.left + dx;
              oldBody.pos.y = node.top + dy;
              retriesCount -= 1;
              // Make sure we don't bump it out of the box. If we do, next iteration should fix it
            } while (retriesCount > 0 && isSamePosition(oldBody.pos, body.pos));

            if (retriesCount === 0 && isSamePosition(oldBody.pos, body.pos)) {
              // This is very bad, we ran out of precision.
              // if we do not return from the method we'll get into
              // infinite loop here. So we sacrifice correctness of layout, and keep the app running
              // Next layout iteration should get larger bounding box in the first step and fix this
              return;
            }
          }
          // Next iteration should subdivide node further.
          insertStack.push(node, oldBody);
          insertStack.push(node, body);
        }
      }
    },

    update = function(sourceBody) {
      var queue = updateQueue,
        v,
        dx,
        dy,
        r, fx = 0,
        fy = 0,
        queueLength = 1,
        shiftIdx = 0,
        pushIdx = 1;

      queue[0] = root;

      while (queueLength) {
        var node = queue[shiftIdx],
          body = node.body;

        queueLength -= 1;
        shiftIdx += 1;
        var differentBody = (body !== sourceBody);
        if (body && differentBody) {
          // If the current node is a leaf node (and it is not source body),
          // calculate the force exerted by the current node on body, and add this
          // amount to body's net force.
          dx = body.pos.x - sourceBody.pos.x;
          dy = body.pos.y - sourceBody.pos.y;
          r = Math.sqrt(dx * dx + dy * dy);

          if (r === 0) {
            // Poor man's protection against zero distance.
            dx = (random.nextDouble() - 0.5) / 50;
            dy = (random.nextDouble() - 0.5) / 50;
            r = Math.sqrt(dx * dx + dy * dy);
          }

          // This is standard gravition force calculation but we divide
          // by r^3 to save two operations when normalizing force vector.
          v = gravity * body.mass * sourceBody.mass / (r * r * r);
          fx += v * dx;
          fy += v * dy;
        } else if (differentBody) {
          // Otherwise, calculate the ratio s / r,  where s is the width of the region
          // represented by the internal node, and r is the distance between the body
          // and the node's center-of-mass
          dx = node.massX / node.mass - sourceBody.pos.x;
          dy = node.massY / node.mass - sourceBody.pos.y;
          r = Math.sqrt(dx * dx + dy * dy);

          if (r === 0) {
            // Sorry about code duplucation. I don't want to create many functions
            // right away. Just want to see performance first.
            dx = (random.nextDouble() - 0.5) / 50;
            dy = (random.nextDouble() - 0.5) / 50;
            r = Math.sqrt(dx * dx + dy * dy);
          }
          // If s / r < θ, treat this internal node as a single body, and calculate the
          // force it exerts on sourceBody, and add this amount to sourceBody's net force.
          if ((node.right - node.left) / r < theta) {
            // in the if statement above we consider node's width only
            // because the region was squarified during tree creation.
            // Thus there is no difference between using width or height.
            v = gravity * node.mass * sourceBody.mass / (r * r * r);
            fx += v * dx;
            fy += v * dy;
          } else {
            // Otherwise, run the procedure recursively on each of the current node's children.

            // I intentionally unfolded this loop, to save several CPU cycles.
            if (node.quad0) {
              queue[pushIdx] = node.quad0;
              queueLength += 1;
              pushIdx += 1;
            }
            if (node.quad1) {
              queue[pushIdx] = node.quad1;
              queueLength += 1;
              pushIdx += 1;
            }
            if (node.quad2) {
              queue[pushIdx] = node.quad2;
              queueLength += 1;
              pushIdx += 1;
            }
            if (node.quad3) {
              queue[pushIdx] = node.quad3;
              queueLength += 1;
              pushIdx += 1;
            }
          }
        }
      }

      sourceBody.force.x += fx;
      sourceBody.force.y += fy;
    },

    insertBodies = function(bodies) {
      var x1 = Number.MAX_VALUE,
        y1 = Number.MAX_VALUE,
        x2 = Number.MIN_VALUE,
        y2 = Number.MIN_VALUE,
        i,
        max = bodies.length;

      // To reduce quad tree depth we are looking for exact bounding box of all particles.
      i = max;
      while (i--) {
        var x = bodies[i].pos.x;
        var y = bodies[i].pos.y;
        if (x < x1) {
          x1 = x;
        }
        if (x > x2) {
          x2 = x;
        }
        if (y < y1) {
          y1 = y;
        }
        if (y > y2) {
          y2 = y;
        }
      }

      // Squarify the bounds.
      var dx = x2 - x1,
        dy = y2 - y1;
      if (dx > dy) {
        y2 = y1 + dx;
      } else {
        x2 = x1 + dy;
      }

      currentInCache = 0;
      root = newNode();
      root.left = x1;
      root.right = x2;
      root.top = y1;
      root.bottom = y2;

      i = max - 1;
      if (i > 0) {
        root.body = bodies[i];
      }
      while (i--) {
        insert(bodies[i], root);
      }
    };

  return {
    insertBodies: insertBodies,
    updateBodyForce: update,
    options: function(newOptions) {
      if (newOptions) {
        if (typeof newOptions.gravity === 'number') {
          gravity = newOptions.gravity;
        }
        if (typeof newOptions.theta === 'number') {
          theta = newOptions.theta;
        }

        return this;
      }

      return {
        gravity: gravity,
        theta: theta
      };
    }
  };
};

function getChild(node, idx) {
  if (idx === 0) return node.quad0;
  if (idx === 1) return node.quad1;
  if (idx === 2) return node.quad2;
  if (idx === 3) return node.quad3;
  return null;
}

function setChild(node, idx, child) {
  if (idx === 0) node.quad0 = child;
  else if (idx === 1) node.quad1 = child;
  else if (idx === 2) node.quad2 = child;
  else if (idx === 3) node.quad3 = child;
}

},{"./insertStack":28,"./isSamePosition":29,"./node":30,"ngraph.random":35}],28:[function(_dereq_,module,exports){
module.exports = InsertStack;

/**
 * Our implmentation of QuadTree is non-recursive to avoid GC hit
 * This data structure represent stack of elements
 * which we are trying to insert into quad tree.
 */
function InsertStack () {
    this.stack = [];
    this.popIdx = 0;
}

InsertStack.prototype = {
    isEmpty: function() {
        return this.popIdx === 0;
    },
    push: function (node, body) {
        var item = this.stack[this.popIdx];
        if (!item) {
            // we are trying to avoid memory pressue: create new element
            // only when absolutely necessary
            this.stack[this.popIdx] = new InsertStackElement(node, body);
        } else {
            item.node = node;
            item.body = body;
        }
        ++this.popIdx;
    },
    pop: function () {
        if (this.popIdx > 0) {
            return this.stack[--this.popIdx];
        }
    },
    reset: function () {
        this.popIdx = 0;
    }
};

function InsertStackElement(node, body) {
    this.node = node; // QuadTree node
    this.body = body; // physical body which needs to be inserted to node
}

},{}],29:[function(_dereq_,module,exports){
module.exports = function isSamePosition(point1, point2) {
    var dx = Math.abs(point1.x - point2.x);
    var dy = Math.abs(point1.y - point2.y);

    return (dx < 1e-8 && dy < 1e-8);
};

},{}],30:[function(_dereq_,module,exports){
/**
 * Internal data structure to represent 2D QuadTree node
 */
module.exports = function Node() {
  // body stored inside this node. In quad tree only leaf nodes (by construction)
  // contain boides:
  this.body = null;

  // Child nodes are stored in quads. Each quad is presented by number:
  // 0 | 1
  // -----
  // 2 | 3
  this.quad0 = null;
  this.quad1 = null;
  this.quad2 = null;
  this.quad3 = null;

  // Total mass of current node
  this.mass = 0;

  // Center of mass coordinates
  this.massX = 0;
  this.massY = 0;

  // bounding box coordinates
  this.left = 0;
  this.top = 0;
  this.bottom = 0;
  this.right = 0;
};

},{}],31:[function(_dereq_,module,exports){
/**
 * This is Barnes Hut simulation algorithm for 3d case. Implementation
 * is highly optimized (avoids recusion and gc pressure)
 *
 * http://www.cs.princeton.edu/courses/archive/fall03/cs126/assignments/barnes-hut.html
 *
 * NOTE: This module duplicates a lot of code from 2d case. Primary reason for
 * this is performance. Every time I tried to abstract away vector operations
 * I had negative impact on performance. So in this case I'm scarifying code
 * reuse in favor of speed
 */

module.exports = function(options) {
  options = options || {};
  options.gravity = typeof options.gravity === 'number' ? options.gravity : -1;
  options.theta = typeof options.theta === 'number' ? options.theta : 0.8;

  // we require deterministic randomness here
  var random = _dereq_('ngraph.random').random(1984),
    Node = _dereq_('./node'),
    InsertStack = _dereq_('./insertStack'),
    isSamePosition = _dereq_('./isSamePosition');

  var gravity = options.gravity,
    updateQueue = [],
    insertStack = new InsertStack(),
    theta = options.theta,

    nodesCache = [],
    currentInCache = 0,
    newNode = function() {
      // To avoid pressure on GC we reuse nodes.
      var node = nodesCache[currentInCache];
      if (node) {
        node.quad0 = null;
        node.quad4 = null;
        node.quad1 = null;
        node.quad5 = null;
        node.quad2 = null;
        node.quad6 = null;
        node.quad3 = null;
        node.quad7 = null;
        node.body = null;
        node.mass = node.massX = node.massY = node.massZ = 0;
        node.left = node.right = node.top = node.bottom = node.front = node.back = 0;
      } else {
        node = new Node();
        nodesCache[currentInCache] = node;
      }

      ++currentInCache;
      return node;
    },

    root = newNode(),

    // Inserts body to the tree
    insert = function(newBody) {
      insertStack.reset();
      insertStack.push(root, newBody);

      while (!insertStack.isEmpty()) {
        var stackItem = insertStack.pop(),
          node = stackItem.node,
          body = stackItem.body;

        if (!node.body) {
          // This is internal node. Update the total mass of the node and center-of-mass.
          var x = body.pos.x;
          var y = body.pos.y;
          var z = body.pos.z;
          node.mass += body.mass;
          node.massX += body.mass * x;
          node.massY += body.mass * y;
          node.massZ += body.mass * z;

          // Recursively insert the body in the appropriate quadrant.
          // But first find the appropriate quadrant.
          var quadIdx = 0, // Assume we are in the 0's quad.
            left = node.left,
            right = (node.right + left) / 2,
            top = node.top,
            bottom = (node.bottom + top) / 2,
            back = node.back,
            front = (node.front + back) / 2;

          if (x > right) { // somewhere in the eastern part.
            quadIdx += 1;
            var oldLeft = left;
            left = right;
            right = right + (right - oldLeft);
          }
          if (y > bottom) { // and in south.
            quadIdx += 2;
            var oldTop = top;
            top = bottom;
            bottom = bottom + (bottom - oldTop);
          }
          if (z > front) { // and in frontal part
            quadIdx += 4;
            var oldBack = back;
            back = front;
            front = back + (back - oldBack);
          }

          var child = getChild(node, quadIdx);
          if (!child) {
            // The node is internal but this quadrant is not taken. Add subnode to it.
            child = newNode();
            child.left = left;
            child.top = top;
            child.right = right;
            child.bottom = bottom;
            child.back = back;
            child.front = front;
            child.body = body;

            setChild(node, quadIdx, child);
          } else {
            // continue searching in this quadrant.
            insertStack.push(child, body);
          }
        } else {
          // We are trying to add to the leaf node.
          // We have to convert current leaf into internal node
          // and continue adding two nodes.
          var oldBody = node.body;
          node.body = null; // internal nodes do not carry bodies

          if (isSamePosition(oldBody.pos, body.pos)) {
            // Prevent infinite subdivision by bumping one node
            // anywhere in this quadrant
            var retriesCount = 3;
            do {
              var offset = random.nextDouble();
              var dx = (node.right - node.left) * offset;
              var dy = (node.bottom - node.top) * offset;
              var dz = (node.front - node.back) * offset;

              oldBody.pos.x = node.left + dx;
              oldBody.pos.y = node.top + dy;
              oldBody.pos.z = node.back + dz;
              retriesCount -= 1;
              // Make sure we don't bump it out of the box. If we do, next iteration should fix it
            } while (retriesCount > 0 && isSamePosition(oldBody.pos, body.pos));

            if (retriesCount === 0 && isSamePosition(oldBody.pos, body.pos)) {
              // This is very bad, we ran out of precision.
              // if we do not return from the method we'll get into
              // infinite loop here. So we sacrifice correctness of layout, and keep the app running
              // Next layout iteration should get larger bounding box in the first step and fix this
              return;
            }
          }
          // Next iteration should subdivide node further.
          insertStack.push(node, oldBody);
          insertStack.push(node, body);
        }
      }
    },

    update = function(sourceBody) {
      var queue = updateQueue,
        v,
        dx, dy, dz,
        r, fx = 0,
        fy = 0,
        fz = 0,
        queueLength = 1,
        shiftIdx = 0,
        pushIdx = 1;

      queue[0] = root;

      while (queueLength) {
        var node = queue[shiftIdx],
          body = node.body;

        queueLength -= 1;
        shiftIdx += 1;
        var differentBody = (body !== sourceBody);
        if (body && differentBody) {
          // If the current node is a leaf node (and it is not source body),
          // calculate the force exerted by the current node on body, and add this
          // amount to body's net force.
          dx = body.pos.x - sourceBody.pos.x;
          dy = body.pos.y - sourceBody.pos.y;
          dz = body.pos.z - sourceBody.pos.z;
          r = Math.sqrt(dx * dx + dy * dy + dz * dz);

          if (r === 0) {
            // Poor man's protection against zero distance.
            dx = (random.nextDouble() - 0.5) / 50;
            dy = (random.nextDouble() - 0.5) / 50;
            dz = (random.nextDouble() - 0.5) / 50;
            r = Math.sqrt(dx * dx + dy * dy + dz * dz);
          }

          // This is standard gravitation force calculation but we divide
          // by r^3 to save two operations when normalizing force vector.
          v = gravity * body.mass * sourceBody.mass / (r * r * r);
          fx += v * dx;
          fy += v * dy;
          fz += v * dz;
        } else if (differentBody) {
          // Otherwise, calculate the ratio s / r,  where s is the width of the region
          // represented by the internal node, and r is the distance between the body
          // and the node's center-of-mass
          dx = node.massX / node.mass - sourceBody.pos.x;
          dy = node.massY / node.mass - sourceBody.pos.y;
          dz = node.massZ / node.mass - sourceBody.pos.z;

          r = Math.sqrt(dx * dx + dy * dy + dz * dz);

          if (r === 0) {
            // Sorry about code duplication. I don't want to create many functions
            // right away. Just want to see performance first.
            dx = (random.nextDouble() - 0.5) / 50;
            dy = (random.nextDouble() - 0.5) / 50;
            dz = (random.nextDouble() - 0.5) / 50;
            r = Math.sqrt(dx * dx + dy * dy + dz * dz);
          }

          // If s / r < θ, treat this internal node as a single body, and calculate the
          // force it exerts on sourceBody, and add this amount to sourceBody's net force.
          if ((node.right - node.left) / r < theta) {
            // in the if statement above we consider node's width only
            // because the region was squarified during tree creation.
            // Thus there is no difference between using width or height.
            v = gravity * node.mass * sourceBody.mass / (r * r * r);
            fx += v * dx;
            fy += v * dy;
            fz += v * dz;
          } else {
            // Otherwise, run the procedure recursively on each of the current node's children.

            // I intentionally unfolded this loop, to save several CPU cycles.
            if (node.quad0) {
              queue[pushIdx] = node.quad0;
              queueLength += 1;
              pushIdx += 1;
            }
            if (node.quad1) {
              queue[pushIdx] = node.quad1;
              queueLength += 1;
              pushIdx += 1;
            }
            if (node.quad2) {
              queue[pushIdx] = node.quad2;
              queueLength += 1;
              pushIdx += 1;
            }
            if (node.quad3) {
              queue[pushIdx] = node.quad3;
              queueLength += 1;
              pushIdx += 1;
            }
            if (node.quad4) {
              queue[pushIdx] = node.quad4;
              queueLength += 1;
              pushIdx += 1;
            }
            if (node.quad5) {
              queue[pushIdx] = node.quad5;
              queueLength += 1;
              pushIdx += 1;
            }
            if (node.quad6) {
              queue[pushIdx] = node.quad6;
              queueLength += 1;
              pushIdx += 1;
            }
            if (node.quad7) {
              queue[pushIdx] = node.quad7;
              queueLength += 1;
              pushIdx += 1;
            }
          }
        }
      }

      sourceBody.force.x += fx;
      sourceBody.force.y += fy;
      sourceBody.force.z += fz;
    },

    insertBodies = function(bodies) {
      var x1 = Number.MAX_VALUE,
        y1 = Number.MAX_VALUE,
        z1 = Number.MAX_VALUE,
        x2 = Number.MIN_VALUE,
        y2 = Number.MIN_VALUE,
        z2 = Number.MIN_VALUE,
        i,
        max = bodies.length;

      // To reduce quad tree depth we are looking for exact bounding box of all particles.
      i = max;
      while (i--) {
        var pos = bodies[i].pos;
        var x = pos.x;
        var y = pos.y;
        var z = pos.z;
        if (x < x1) {
          x1 = x;
        }
        if (x > x2) {
          x2 = x;
        }
        if (y < y1) {
          y1 = y;
        }
        if (y > y2) {
          y2 = y;
        }
        if (z < z1) {
          z1 = z;
        }
        if (z > z2) {
          z2 = z;
        }
      }

      // Squarify the bounds.
      var maxSide = Math.max(x2 - x1, Math.max(y2 - y1, z2 - z1));

      x2 = x1 + maxSide;
      y2 = y1 + maxSide;
      z2 = z1 + maxSide;

      currentInCache = 0;
      root = newNode();
      root.left = x1;
      root.right = x2;
      root.top = y1;
      root.bottom = y2;
      root.back = z1;
      root.front = z2;

      i = max - 1;
      if (i > 0) {
        root.body = bodies[i];
      }
      while (i--) {
        insert(bodies[i], root);
      }
    };

  return {
    insertBodies: insertBodies,
    updateBodyForce: update,
    options: function(newOptions) {
      if (newOptions) {
        if (typeof newOptions.gravity === 'number') {
          gravity = newOptions.gravity;
        }
        if (typeof newOptions.theta === 'number') {
          theta = newOptions.theta;
        }

        return this;
      }

      return {
        gravity: gravity,
        theta: theta
      };
    }
  };
};

function getChild(node, idx) {
  if (idx === 0) return node.quad0;
  if (idx === 1) return node.quad1;
  if (idx === 2) return node.quad2;
  if (idx === 3) return node.quad3;
  if (idx === 4) return node.quad4;
  if (idx === 5) return node.quad5;
  if (idx === 6) return node.quad6;
  if (idx === 7) return node.quad7;
  return null;
}

function setChild(node, idx, child) {
  if (idx === 0) node.quad0 = child;
  else if (idx === 1) node.quad1 = child;
  else if (idx === 2) node.quad2 = child;
  else if (idx === 3) node.quad3 = child;
  else if (idx === 4) node.quad4 = child;
  else if (idx === 5) node.quad5 = child;
  else if (idx === 6) node.quad6 = child;
  else if (idx === 7) node.quad7 = child;
}

},{"./insertStack":32,"./isSamePosition":33,"./node":34,"ngraph.random":35}],32:[function(_dereq_,module,exports){
module.exports = InsertStack;

/**
 * Our implementation of QuadTree is non-recursive to avoid GC hit
 * This data structure represent stack of elements
 * which we are trying to insert into quad tree.
 */
function InsertStack () {
    this.stack = [];
    this.popIdx = 0;
}

InsertStack.prototype = {
    isEmpty: function() {
        return this.popIdx === 0;
    },
    push: function (node, body) {
        var item = this.stack[this.popIdx];
        if (!item) {
            // we are trying to avoid memory pressure: create new element
            // only when absolutely necessary
            this.stack[this.popIdx] = new InsertStackElement(node, body);
        } else {
            item.node = node;
            item.body = body;
        }
        ++this.popIdx;
    },
    pop: function () {
        if (this.popIdx > 0) {
            return this.stack[--this.popIdx];
        }
    },
    reset: function () {
        this.popIdx = 0;
    }
};

function InsertStackElement(node, body) {
    this.node = node; // QuadTree node
    this.body = body; // physical body which needs to be inserted to node
}

},{}],33:[function(_dereq_,module,exports){
module.exports = function isSamePosition(point1, point2) {
    var dx = Math.abs(point1.x - point2.x);
    var dy = Math.abs(point1.y - point2.y);
    var dz = Math.abs(point1.z - point2.z);

    return (dx < 1e-8 && dy < 1e-8 && dz < 1e-8);
};

},{}],34:[function(_dereq_,module,exports){
/**
 * Internal data structure to represent 3D QuadTree node
 */
module.exports = function Node() {
  // body stored inside this node. In quad tree only leaf nodes (by construction)
  // contain boides:
  this.body = null;

  // Child nodes are stored in quads. Each quad is presented by number:
  // Behind Z median:
  // 0 | 1
  // -----
  // 2 | 3
  // In front of Z median:
  // 4 | 5
  // -----
  // 6 | 7
  this.quad0 = null;
  this.quad1 = null;
  this.quad2 = null;
  this.quad3 = null;
  this.quad4 = null;
  this.quad5 = null;
  this.quad6 = null;
  this.quad7 = null;

  // Total mass of current node
  this.mass = 0;

  // Center of mass coordinates
  this.massX = 0;
  this.massY = 0;
  this.massZ = 0;

  // bounding box coordinates
  this.left = 0;
  this.top = 0;
  this.bottom = 0;
  this.right = 0;
  this.front = 0;
  this.back = 0;
};

},{}],35:[function(_dereq_,module,exports){
module.exports = {
  random: random,
  randomIterator: randomIterator
};

/**
 * Creates seeded PRNG with two methods:
 *   next() and nextDouble()
 */
function random(inputSeed) {
  var seed = typeof inputSeed === 'number' ? inputSeed : (+ new Date());
  var randomFunc = function() {
      // Robert Jenkins' 32 bit integer hash function.
      seed = ((seed + 0x7ed55d16) + (seed << 12))  & 0xffffffff;
      seed = ((seed ^ 0xc761c23c) ^ (seed >>> 19)) & 0xffffffff;
      seed = ((seed + 0x165667b1) + (seed << 5))   & 0xffffffff;
      seed = ((seed + 0xd3a2646c) ^ (seed << 9))   & 0xffffffff;
      seed = ((seed + 0xfd7046c5) + (seed << 3))   & 0xffffffff;
      seed = ((seed ^ 0xb55a4f09) ^ (seed >>> 16)) & 0xffffffff;
      return (seed & 0xfffffff) / 0x10000000;
  };

  return {
      /**
       * Generates random integer number in the range from 0 (inclusive) to maxValue (exclusive)
       *
       * @param maxValue Number REQUIRED. Ommitting this number will result in NaN values from PRNG.
       */
      next : function (maxValue) {
          return Math.floor(randomFunc() * maxValue);
      },

      /**
       * Generates random double number in the range from 0 (inclusive) to 1 (exclusive)
       * This function is the same as Math.random() (except that it could be seeded)
       */
      nextDouble : function () {
          return randomFunc();
      }
  };
}

/*
 * Creates iterator over array, which returns items of array in random order
 * Time complexity is guaranteed to be O(n);
 */
function randomIterator(array, customRandom) {
    var localRandom = customRandom || random();
    if (typeof localRandom.next !== 'function') {
      throw new Error('customRandom does not match expected API: next() function is missing');
    }

    return {
        forEach : function (callback) {
            var i, j, t;
            for (i = array.length - 1; i > 0; --i) {
                j = localRandom.next(i + 1); // i inclusive
                t = array[j];
                array[j] = array[i];
                array[i] = t;

                callback(t);
            }

            if (array.length) {
                callback(array[0]);
            }
        },

        /**
         * Shuffles array randomly, in place.
         */
        shuffle : function () {
            var i, j, t;
            for (i = array.length - 1; i > 0; --i) {
                j = localRandom.next(i + 1); // i inclusive
                t = array[j];
                array[j] = array[i];
                array[i] = t;
            }

            return array;
        }
    };
}

},{}],36:[function(_dereq_,module,exports){
module.exports = removeOverlaps;

function removeOverlaps(layout, options) {
  if (!layout) throw new Error('layout argument is required');

  // This variable is used during iteration over quadTree
  var currentNode = {
    width: 0,
    height: 0,
    x: 0,
    y: 0,
    body: null
  };

  options = options || {};

  var defaultSize = options.defaultSize || {
    width: 20,
    height: 20
  };

  var active = options.active !== undefined ? options.active : false;

  // we store amount of node movement into this variable.
  var totalMovement = 1;

  var physicsSimulator = layout.simulator;
  var graph = layout.graph;

  if (active) {
    layout.on('step', step);
    layout.on('disposed', dispose);
    layout.on('stable', removeAll);
  } else {
    removeAll();
  }

  // We will autodispose when layout is disposed. Just in case, giving a
  // reference for disposal
  return dispose;

  function dispose() {
    layout.off('step', step);
    layout.off('stable', removeAll);
    layout.off('disposed', dispose);
  }

  function removeAll() {
    while (totalMovement > 0) {
      runRemoveOverlapsIfNeeded();
    }
  }

  function step() {
    runRemoveOverlapsIfNeeded();
  }

  function runRemoveOverlapsIfNeeded() {
    var tree = physicsSimulator.quadTree;
    var root = tree.getRoot();
    totalMovement = 0;

    layout.forEachBody(function(body, graphNodeId) {
      var graphNode = graph.getNode(graphNodeId);

      currentNode.width = getWidth(graphNode.data);
      currentNode.height = getHeight(graphNode.data);
      currentNode.x = body.pos.x;
      currentNode.y = body.pos.y;
      currentNode.body = body;

      traverse(root, visitQuad);
    });
  }

  function visitQuad(quad) {
    var body = quad.body;
    if (body === currentNode.body) return false;

    if (body) {
      // Check if body needs to be moved;
      totalMovement += moveIfNeeded(body);
    } else {
      // we only continue subdividing the tree if current node intersects the quad
      return intersectQuad(quad)
    }
  }

  function getWidth(nodeData) {
    return (nodeData && nodeData.width) || defaultSize.width;
  }

  function getHeight(nodeData) {
    return (nodeData && nodeData.height) || defaultSize.height;
  }

  function moveIfNeeded(body) {
    var a = currentNode;
    var node = graph.getNode(body.id);

    var b = {
      x: body.pos.x,
      y: body.pos.y,
      width: getWidth(node.data),
      height: getHeight(node.data)
    }

    var ox = Math.min(a.x + a.width / 2, b.x + b.width / 2) - Math.max(a.x - a.width / 2, b.x - b.width / 2);
    var oy = Math.min(a.y + a.height / 2, b.y + b.height / 2) - Math.max(a.y - a.height / 2, b.y - b.height / 2);

    if (ox > 0 && oy > 0) {
      var totalMovement = move(ox, oy, a, b);
      currentNode.body.pos.x = a.x;
      currentNode.body.pos.y = a.y;

      body.pos.x = b.x;
      body.pos.y = b.y;

      return totalMovement;
    }

    return 0;
  }

  function move(ox, oy, a, b) {
    // shift along the axis of ideal/target positions
    // so boxes can cross each other rather than collide
    // this makes the result more predictable

    var vx0 = (a.x + a.width / 2) - (b.x + b.width / 2);
    var vy0 = (a.y + a.height / 2) - (b.y + b.width / 2),
      v0 = Math.sqrt(vx0 * vx0 + vy0 * vy0),
      shift = Math.sqrt(ox * oy),
      shiftX,
      shiftY;

    if (v0 !== 0) {
      vx0 /= v0;
      vy0 /= v0;
    } else {
      var phi = Math.random() * 2 * Math.PI;
      vx0 = Math.cos(phi);
      vy0 = Math.sin(phi);
    }

    shiftX = shift * vx0;
    shiftY = shift * vy0;

    a.x += shiftX;
    b.x -= shiftX;
    a.y += shiftY;
    b.y -= shiftY;

    return Math.abs(shiftX) + Math.abs(shiftY);
  }

  function intersectQuad(quad) {
    var xHalf = currentNode.width / 2;
    var yHalf = currentNode.height / 2;
    var left = currentNode.x - xHalf;
    var top = currentNode.y - yHalf;
    var right = currentNode.x + xHalf;
    var bottom = currentNode.y + yHalf;

    // Continue subdivision only if current rectangle intersects our quad
    // http://stackoverflow.com/questions/306316/determine-if-two-rectangles-overlap-each-other
    return left < quad.right &&
      right > quad.left &&
      top < quad.bottom &&
      bottom > quad.top;
  }
}

function traverse(quad, visitor) {
  if (visitor(quad)) {
    if (quad.quad0) traverse(quad.quad0, visitor)
    if (quad.quad1) traverse(quad.quad1, visitor)
    if (quad.quad2) traverse(quad.quad2, visitor)
    if (quad.quad3) traverse(quad.quad3, visitor)
  }
}

},{}],37:[function(_dereq_,module,exports){
module.exports = save;

function save(graph, customNodeTransform, customLinkTransform) {
  // Object contains `nodes` and `links` arrays.
  var result = {
    nodes: [],
    links: []
  };

  var nodeTransform = customNodeTransform || defaultTransformForNode;
  var linkTransform = customLinkTransform || defaultTransformForLink;

  graph.forEachNode(saveNode);
  graph.forEachLink(saveLink);

  return JSON.stringify(result);

  function saveNode(node) {
    // Each node of the graph is processed to take only required fields
    // `id` and `data`
    result.nodes.push(nodeTransform(node));
  }

  function saveLink(link) {
    // Each link of the graph is also processed to take `fromId`, `toId` and
    // `data`
    result.links.push(linkTransform(link));
  }

  function defaultTransformForNode(node) {
    var result = {
      id: node.id
    };
    // We don't want to store undefined fields when it's not necessary:
    if (node.data !== undefined) {
      result.data = node.data;
    }

    return result;
  }

  function defaultTransformForLink(link) {
    var result = {
      fromId: link.fromId,
      toId: link.toId,
    };

    if (link.data !== undefined) {
      result.data = link.data;
    }

    return result;
  }
}

},{}],38:[function(_dereq_,module,exports){
// shim for using process in browser
var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
(function () {
    try {
        if (typeof setTimeout === 'function') {
            cachedSetTimeout = setTimeout;
        } else {
            cachedSetTimeout = defaultSetTimout;
        }
    } catch (e) {
        cachedSetTimeout = defaultSetTimout;
    }
    try {
        if (typeof clearTimeout === 'function') {
            cachedClearTimeout = clearTimeout;
        } else {
            cachedClearTimeout = defaultClearTimeout;
        }
    } catch (e) {
        cachedClearTimeout = defaultClearTimeout;
    }
} ())
function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch(e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch(e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }


}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }



}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

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
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],39:[function(_dereq_,module,exports){
//     Underscore.js 1.8.3
//     http://underscorejs.org
//     (c) 2009-2015 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
//     Underscore may be freely distributed under the MIT license.

(function() {

  // Baseline setup
  // --------------

  // Establish the root object, `window` in the browser, or `exports` on the server.
  var root = this;

  // Save the previous value of the `_` variable.
  var previousUnderscore = root._;

  // Save bytes in the minified (but not gzipped) version:
  var ArrayProto = Array.prototype, ObjProto = Object.prototype, FuncProto = Function.prototype;

  // Create quick reference variables for speed access to core prototypes.
  var
    push             = ArrayProto.push,
    slice            = ArrayProto.slice,
    toString         = ObjProto.toString,
    hasOwnProperty   = ObjProto.hasOwnProperty;

  // All **ECMAScript 5** native function implementations that we hope to use
  // are declared here.
  var
    nativeIsArray      = Array.isArray,
    nativeKeys         = Object.keys,
    nativeBind         = FuncProto.bind,
    nativeCreate       = Object.create;

  // Naked function reference for surrogate-prototype-swapping.
  var Ctor = function(){};

  // Create a safe reference to the Underscore object for use below.
  var _ = function(obj) {
    if (obj instanceof _) return obj;
    if (!(this instanceof _)) return new _(obj);
    this._wrapped = obj;
  };

  // Export the Underscore object for **Node.js**, with
  // backwards-compatibility for the old `require()` API. If we're in
  // the browser, add `_` as a global object.
  if (typeof exports !== 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      exports = module.exports = _;
    }
    exports._ = _;
  } else {
    root._ = _;
  }

  // Current version.
  _.VERSION = '1.8.3';

  // Internal function that returns an efficient (for current engines) version
  // of the passed-in callback, to be repeatedly applied in other Underscore
  // functions.
  var optimizeCb = function(func, context, argCount) {
    if (context === void 0) return func;
    switch (argCount == null ? 3 : argCount) {
      case 1: return function(value) {
        return func.call(context, value);
      };
      case 2: return function(value, other) {
        return func.call(context, value, other);
      };
      case 3: return function(value, index, collection) {
        return func.call(context, value, index, collection);
      };
      case 4: return function(accumulator, value, index, collection) {
        return func.call(context, accumulator, value, index, collection);
      };
    }
    return function() {
      return func.apply(context, arguments);
    };
  };

  // A mostly-internal function to generate callbacks that can be applied
  // to each element in a collection, returning the desired result — either
  // identity, an arbitrary callback, a property matcher, or a property accessor.
  var cb = function(value, context, argCount) {
    if (value == null) return _.identity;
    if (_.isFunction(value)) return optimizeCb(value, context, argCount);
    if (_.isObject(value)) return _.matcher(value);
    return _.property(value);
  };
  _.iteratee = function(value, context) {
    return cb(value, context, Infinity);
  };

  // An internal function for creating assigner functions.
  var createAssigner = function(keysFunc, undefinedOnly) {
    return function(obj) {
      var length = arguments.length;
      if (length < 2 || obj == null) return obj;
      for (var index = 1; index < length; index++) {
        var source = arguments[index],
            keys = keysFunc(source),
            l = keys.length;
        for (var i = 0; i < l; i++) {
          var key = keys[i];
          if (!undefinedOnly || obj[key] === void 0) obj[key] = source[key];
        }
      }
      return obj;
    };
  };

  // An internal function for creating a new object that inherits from another.
  var baseCreate = function(prototype) {
    if (!_.isObject(prototype)) return {};
    if (nativeCreate) return nativeCreate(prototype);
    Ctor.prototype = prototype;
    var result = new Ctor;
    Ctor.prototype = null;
    return result;
  };

  var property = function(key) {
    return function(obj) {
      return obj == null ? void 0 : obj[key];
    };
  };

  // Helper for collection methods to determine whether a collection
  // should be iterated as an array or as an object
  // Related: http://people.mozilla.org/~jorendorff/es6-draft.html#sec-tolength
  // Avoids a very nasty iOS 8 JIT bug on ARM-64. #2094
  var MAX_ARRAY_INDEX = Math.pow(2, 53) - 1;
  var getLength = property('length');
  var isArrayLike = function(collection) {
    var length = getLength(collection);
    return typeof length == 'number' && length >= 0 && length <= MAX_ARRAY_INDEX;
  };

  // Collection Functions
  // --------------------

  // The cornerstone, an `each` implementation, aka `forEach`.
  // Handles raw objects in addition to array-likes. Treats all
  // sparse array-likes as if they were dense.
  _.each = _.forEach = function(obj, iteratee, context) {
    iteratee = optimizeCb(iteratee, context);
    var i, length;
    if (isArrayLike(obj)) {
      for (i = 0, length = obj.length; i < length; i++) {
        iteratee(obj[i], i, obj);
      }
    } else {
      var keys = _.keys(obj);
      for (i = 0, length = keys.length; i < length; i++) {
        iteratee(obj[keys[i]], keys[i], obj);
      }
    }
    return obj;
  };

  // Return the results of applying the iteratee to each element.
  _.map = _.collect = function(obj, iteratee, context) {
    iteratee = cb(iteratee, context);
    var keys = !isArrayLike(obj) && _.keys(obj),
        length = (keys || obj).length,
        results = Array(length);
    for (var index = 0; index < length; index++) {
      var currentKey = keys ? keys[index] : index;
      results[index] = iteratee(obj[currentKey], currentKey, obj);
    }
    return results;
  };

  // Create a reducing function iterating left or right.
  function createReduce(dir) {
    // Optimized iterator function as using arguments.length
    // in the main function will deoptimize the, see #1991.
    function iterator(obj, iteratee, memo, keys, index, length) {
      for (; index >= 0 && index < length; index += dir) {
        var currentKey = keys ? keys[index] : index;
        memo = iteratee(memo, obj[currentKey], currentKey, obj);
      }
      return memo;
    }

    return function(obj, iteratee, memo, context) {
      iteratee = optimizeCb(iteratee, context, 4);
      var keys = !isArrayLike(obj) && _.keys(obj),
          length = (keys || obj).length,
          index = dir > 0 ? 0 : length - 1;
      // Determine the initial value if none is provided.
      if (arguments.length < 3) {
        memo = obj[keys ? keys[index] : index];
        index += dir;
      }
      return iterator(obj, iteratee, memo, keys, index, length);
    };
  }

  // **Reduce** builds up a single result from a list of values, aka `inject`,
  // or `foldl`.
  _.reduce = _.foldl = _.inject = createReduce(1);

  // The right-associative version of reduce, also known as `foldr`.
  _.reduceRight = _.foldr = createReduce(-1);

  // Return the first value which passes a truth test. Aliased as `detect`.
  _.find = _.detect = function(obj, predicate, context) {
    var key;
    if (isArrayLike(obj)) {
      key = _.findIndex(obj, predicate, context);
    } else {
      key = _.findKey(obj, predicate, context);
    }
    if (key !== void 0 && key !== -1) return obj[key];
  };

  // Return all the elements that pass a truth test.
  // Aliased as `select`.
  _.filter = _.select = function(obj, predicate, context) {
    var results = [];
    predicate = cb(predicate, context);
    _.each(obj, function(value, index, list) {
      if (predicate(value, index, list)) results.push(value);
    });
    return results;
  };

  // Return all the elements for which a truth test fails.
  _.reject = function(obj, predicate, context) {
    return _.filter(obj, _.negate(cb(predicate)), context);
  };

  // Determine whether all of the elements match a truth test.
  // Aliased as `all`.
  _.every = _.all = function(obj, predicate, context) {
    predicate = cb(predicate, context);
    var keys = !isArrayLike(obj) && _.keys(obj),
        length = (keys || obj).length;
    for (var index = 0; index < length; index++) {
      var currentKey = keys ? keys[index] : index;
      if (!predicate(obj[currentKey], currentKey, obj)) return false;
    }
    return true;
  };

  // Determine if at least one element in the object matches a truth test.
  // Aliased as `any`.
  _.some = _.any = function(obj, predicate, context) {
    predicate = cb(predicate, context);
    var keys = !isArrayLike(obj) && _.keys(obj),
        length = (keys || obj).length;
    for (var index = 0; index < length; index++) {
      var currentKey = keys ? keys[index] : index;
      if (predicate(obj[currentKey], currentKey, obj)) return true;
    }
    return false;
  };

  // Determine if the array or object contains a given item (using `===`).
  // Aliased as `includes` and `include`.
  _.contains = _.includes = _.include = function(obj, item, fromIndex, guard) {
    if (!isArrayLike(obj)) obj = _.values(obj);
    if (typeof fromIndex != 'number' || guard) fromIndex = 0;
    return _.indexOf(obj, item, fromIndex) >= 0;
  };

  // Invoke a method (with arguments) on every item in a collection.
  _.invoke = function(obj, method) {
    var args = slice.call(arguments, 2);
    var isFunc = _.isFunction(method);
    return _.map(obj, function(value) {
      var func = isFunc ? method : value[method];
      return func == null ? func : func.apply(value, args);
    });
  };

  // Convenience version of a common use case of `map`: fetching a property.
  _.pluck = function(obj, key) {
    return _.map(obj, _.property(key));
  };

  // Convenience version of a common use case of `filter`: selecting only objects
  // containing specific `key:value` pairs.
  _.where = function(obj, attrs) {
    return _.filter(obj, _.matcher(attrs));
  };

  // Convenience version of a common use case of `find`: getting the first object
  // containing specific `key:value` pairs.
  _.findWhere = function(obj, attrs) {
    return _.find(obj, _.matcher(attrs));
  };

  // Return the maximum element (or element-based computation).
  _.max = function(obj, iteratee, context) {
    var result = -Infinity, lastComputed = -Infinity,
        value, computed;
    if (iteratee == null && obj != null) {
      obj = isArrayLike(obj) ? obj : _.values(obj);
      for (var i = 0, length = obj.length; i < length; i++) {
        value = obj[i];
        if (value > result) {
          result = value;
        }
      }
    } else {
      iteratee = cb(iteratee, context);
      _.each(obj, function(value, index, list) {
        computed = iteratee(value, index, list);
        if (computed > lastComputed || computed === -Infinity && result === -Infinity) {
          result = value;
          lastComputed = computed;
        }
      });
    }
    return result;
  };

  // Return the minimum element (or element-based computation).
  _.min = function(obj, iteratee, context) {
    var result = Infinity, lastComputed = Infinity,
        value, computed;
    if (iteratee == null && obj != null) {
      obj = isArrayLike(obj) ? obj : _.values(obj);
      for (var i = 0, length = obj.length; i < length; i++) {
        value = obj[i];
        if (value < result) {
          result = value;
        }
      }
    } else {
      iteratee = cb(iteratee, context);
      _.each(obj, function(value, index, list) {
        computed = iteratee(value, index, list);
        if (computed < lastComputed || computed === Infinity && result === Infinity) {
          result = value;
          lastComputed = computed;
        }
      });
    }
    return result;
  };

  // Shuffle a collection, using the modern version of the
  // [Fisher-Yates shuffle](http://en.wikipedia.org/wiki/Fisher–Yates_shuffle).
  _.shuffle = function(obj) {
    var set = isArrayLike(obj) ? obj : _.values(obj);
    var length = set.length;
    var shuffled = Array(length);
    for (var index = 0, rand; index < length; index++) {
      rand = _.random(0, index);
      if (rand !== index) shuffled[index] = shuffled[rand];
      shuffled[rand] = set[index];
    }
    return shuffled;
  };

  // Sample **n** random values from a collection.
  // If **n** is not specified, returns a single random element.
  // The internal `guard` argument allows it to work with `map`.
  _.sample = function(obj, n, guard) {
    if (n == null || guard) {
      if (!isArrayLike(obj)) obj = _.values(obj);
      return obj[_.random(obj.length - 1)];
    }
    return _.shuffle(obj).slice(0, Math.max(0, n));
  };

  // Sort the object's values by a criterion produced by an iteratee.
  _.sortBy = function(obj, iteratee, context) {
    iteratee = cb(iteratee, context);
    return _.pluck(_.map(obj, function(value, index, list) {
      return {
        value: value,
        index: index,
        criteria: iteratee(value, index, list)
      };
    }).sort(function(left, right) {
      var a = left.criteria;
      var b = right.criteria;
      if (a !== b) {
        if (a > b || a === void 0) return 1;
        if (a < b || b === void 0) return -1;
      }
      return left.index - right.index;
    }), 'value');
  };

  // An internal function used for aggregate "group by" operations.
  var group = function(behavior) {
    return function(obj, iteratee, context) {
      var result = {};
      iteratee = cb(iteratee, context);
      _.each(obj, function(value, index) {
        var key = iteratee(value, index, obj);
        behavior(result, value, key);
      });
      return result;
    };
  };

  // Groups the object's values by a criterion. Pass either a string attribute
  // to group by, or a function that returns the criterion.
  _.groupBy = group(function(result, value, key) {
    if (_.has(result, key)) result[key].push(value); else result[key] = [value];
  });

  // Indexes the object's values by a criterion, similar to `groupBy`, but for
  // when you know that your index values will be unique.
  _.indexBy = group(function(result, value, key) {
    result[key] = value;
  });

  // Counts instances of an object that group by a certain criterion. Pass
  // either a string attribute to count by, or a function that returns the
  // criterion.
  _.countBy = group(function(result, value, key) {
    if (_.has(result, key)) result[key]++; else result[key] = 1;
  });

  // Safely create a real, live array from anything iterable.
  _.toArray = function(obj) {
    if (!obj) return [];
    if (_.isArray(obj)) return slice.call(obj);
    if (isArrayLike(obj)) return _.map(obj, _.identity);
    return _.values(obj);
  };

  // Return the number of elements in an object.
  _.size = function(obj) {
    if (obj == null) return 0;
    return isArrayLike(obj) ? obj.length : _.keys(obj).length;
  };

  // Split a collection into two arrays: one whose elements all satisfy the given
  // predicate, and one whose elements all do not satisfy the predicate.
  _.partition = function(obj, predicate, context) {
    predicate = cb(predicate, context);
    var pass = [], fail = [];
    _.each(obj, function(value, key, obj) {
      (predicate(value, key, obj) ? pass : fail).push(value);
    });
    return [pass, fail];
  };

  // Array Functions
  // ---------------

  // Get the first element of an array. Passing **n** will return the first N
  // values in the array. Aliased as `head` and `take`. The **guard** check
  // allows it to work with `_.map`.
  _.first = _.head = _.take = function(array, n, guard) {
    if (array == null) return void 0;
    if (n == null || guard) return array[0];
    return _.initial(array, array.length - n);
  };

  // Returns everything but the last entry of the array. Especially useful on
  // the arguments object. Passing **n** will return all the values in
  // the array, excluding the last N.
  _.initial = function(array, n, guard) {
    return slice.call(array, 0, Math.max(0, array.length - (n == null || guard ? 1 : n)));
  };

  // Get the last element of an array. Passing **n** will return the last N
  // values in the array.
  _.last = function(array, n, guard) {
    if (array == null) return void 0;
    if (n == null || guard) return array[array.length - 1];
    return _.rest(array, Math.max(0, array.length - n));
  };

  // Returns everything but the first entry of the array. Aliased as `tail` and `drop`.
  // Especially useful on the arguments object. Passing an **n** will return
  // the rest N values in the array.
  _.rest = _.tail = _.drop = function(array, n, guard) {
    return slice.call(array, n == null || guard ? 1 : n);
  };

  // Trim out all falsy values from an array.
  _.compact = function(array) {
    return _.filter(array, _.identity);
  };

  // Internal implementation of a recursive `flatten` function.
  var flatten = function(input, shallow, strict, startIndex) {
    var output = [], idx = 0;
    for (var i = startIndex || 0, length = getLength(input); i < length; i++) {
      var value = input[i];
      if (isArrayLike(value) && (_.isArray(value) || _.isArguments(value))) {
        //flatten current level of array or arguments object
        if (!shallow) value = flatten(value, shallow, strict);
        var j = 0, len = value.length;
        output.length += len;
        while (j < len) {
          output[idx++] = value[j++];
        }
      } else if (!strict) {
        output[idx++] = value;
      }
    }
    return output;
  };

  // Flatten out an array, either recursively (by default), or just one level.
  _.flatten = function(array, shallow) {
    return flatten(array, shallow, false);
  };

  // Return a version of the array that does not contain the specified value(s).
  _.without = function(array) {
    return _.difference(array, slice.call(arguments, 1));
  };

  // Produce a duplicate-free version of the array. If the array has already
  // been sorted, you have the option of using a faster algorithm.
  // Aliased as `unique`.
  _.uniq = _.unique = function(array, isSorted, iteratee, context) {
    if (!_.isBoolean(isSorted)) {
      context = iteratee;
      iteratee = isSorted;
      isSorted = false;
    }
    if (iteratee != null) iteratee = cb(iteratee, context);
    var result = [];
    var seen = [];
    for (var i = 0, length = getLength(array); i < length; i++) {
      var value = array[i],
          computed = iteratee ? iteratee(value, i, array) : value;
      if (isSorted) {
        if (!i || seen !== computed) result.push(value);
        seen = computed;
      } else if (iteratee) {
        if (!_.contains(seen, computed)) {
          seen.push(computed);
          result.push(value);
        }
      } else if (!_.contains(result, value)) {
        result.push(value);
      }
    }
    return result;
  };

  // Produce an array that contains the union: each distinct element from all of
  // the passed-in arrays.
  _.union = function() {
    return _.uniq(flatten(arguments, true, true));
  };

  // Produce an array that contains every item shared between all the
  // passed-in arrays.
  _.intersection = function(array) {
    var result = [];
    var argsLength = arguments.length;
    for (var i = 0, length = getLength(array); i < length; i++) {
      var item = array[i];
      if (_.contains(result, item)) continue;
      for (var j = 1; j < argsLength; j++) {
        if (!_.contains(arguments[j], item)) break;
      }
      if (j === argsLength) result.push(item);
    }
    return result;
  };

  // Take the difference between one array and a number of other arrays.
  // Only the elements present in just the first array will remain.
  _.difference = function(array) {
    var rest = flatten(arguments, true, true, 1);
    return _.filter(array, function(value){
      return !_.contains(rest, value);
    });
  };

  // Zip together multiple lists into a single array -- elements that share
  // an index go together.
  _.zip = function() {
    return _.unzip(arguments);
  };

  // Complement of _.zip. Unzip accepts an array of arrays and groups
  // each array's elements on shared indices
  _.unzip = function(array) {
    var length = array && _.max(array, getLength).length || 0;
    var result = Array(length);

    for (var index = 0; index < length; index++) {
      result[index] = _.pluck(array, index);
    }
    return result;
  };

  // Converts lists into objects. Pass either a single array of `[key, value]`
  // pairs, or two parallel arrays of the same length -- one of keys, and one of
  // the corresponding values.
  _.object = function(list, values) {
    var result = {};
    for (var i = 0, length = getLength(list); i < length; i++) {
      if (values) {
        result[list[i]] = values[i];
      } else {
        result[list[i][0]] = list[i][1];
      }
    }
    return result;
  };

  // Generator function to create the findIndex and findLastIndex functions
  function createPredicateIndexFinder(dir) {
    return function(array, predicate, context) {
      predicate = cb(predicate, context);
      var length = getLength(array);
      var index = dir > 0 ? 0 : length - 1;
      for (; index >= 0 && index < length; index += dir) {
        if (predicate(array[index], index, array)) return index;
      }
      return -1;
    };
  }

  // Returns the first index on an array-like that passes a predicate test
  _.findIndex = createPredicateIndexFinder(1);
  _.findLastIndex = createPredicateIndexFinder(-1);

  // Use a comparator function to figure out the smallest index at which
  // an object should be inserted so as to maintain order. Uses binary search.
  _.sortedIndex = function(array, obj, iteratee, context) {
    iteratee = cb(iteratee, context, 1);
    var value = iteratee(obj);
    var low = 0, high = getLength(array);
    while (low < high) {
      var mid = Math.floor((low + high) / 2);
      if (iteratee(array[mid]) < value) low = mid + 1; else high = mid;
    }
    return low;
  };

  // Generator function to create the indexOf and lastIndexOf functions
  function createIndexFinder(dir, predicateFind, sortedIndex) {
    return function(array, item, idx) {
      var i = 0, length = getLength(array);
      if (typeof idx == 'number') {
        if (dir > 0) {
            i = idx >= 0 ? idx : Math.max(idx + length, i);
        } else {
            length = idx >= 0 ? Math.min(idx + 1, length) : idx + length + 1;
        }
      } else if (sortedIndex && idx && length) {
        idx = sortedIndex(array, item);
        return array[idx] === item ? idx : -1;
      }
      if (item !== item) {
        idx = predicateFind(slice.call(array, i, length), _.isNaN);
        return idx >= 0 ? idx + i : -1;
      }
      for (idx = dir > 0 ? i : length - 1; idx >= 0 && idx < length; idx += dir) {
        if (array[idx] === item) return idx;
      }
      return -1;
    };
  }

  // Return the position of the first occurrence of an item in an array,
  // or -1 if the item is not included in the array.
  // If the array is large and already in sort order, pass `true`
  // for **isSorted** to use binary search.
  _.indexOf = createIndexFinder(1, _.findIndex, _.sortedIndex);
  _.lastIndexOf = createIndexFinder(-1, _.findLastIndex);

  // Generate an integer Array containing an arithmetic progression. A port of
  // the native Python `range()` function. See
  // [the Python documentation](http://docs.python.org/library/functions.html#range).
  _.range = function(start, stop, step) {
    if (stop == null) {
      stop = start || 0;
      start = 0;
    }
    step = step || 1;

    var length = Math.max(Math.ceil((stop - start) / step), 0);
    var range = Array(length);

    for (var idx = 0; idx < length; idx++, start += step) {
      range[idx] = start;
    }

    return range;
  };

  // Function (ahem) Functions
  // ------------------

  // Determines whether to execute a function as a constructor
  // or a normal function with the provided arguments
  var executeBound = function(sourceFunc, boundFunc, context, callingContext, args) {
    if (!(callingContext instanceof boundFunc)) return sourceFunc.apply(context, args);
    var self = baseCreate(sourceFunc.prototype);
    var result = sourceFunc.apply(self, args);
    if (_.isObject(result)) return result;
    return self;
  };

  // Create a function bound to a given object (assigning `this`, and arguments,
  // optionally). Delegates to **ECMAScript 5**'s native `Function.bind` if
  // available.
  _.bind = function(func, context) {
    if (nativeBind && func.bind === nativeBind) return nativeBind.apply(func, slice.call(arguments, 1));
    if (!_.isFunction(func)) throw new TypeError('Bind must be called on a function');
    var args = slice.call(arguments, 2);
    var bound = function() {
      return executeBound(func, bound, context, this, args.concat(slice.call(arguments)));
    };
    return bound;
  };

  // Partially apply a function by creating a version that has had some of its
  // arguments pre-filled, without changing its dynamic `this` context. _ acts
  // as a placeholder, allowing any combination of arguments to be pre-filled.
  _.partial = function(func) {
    var boundArgs = slice.call(arguments, 1);
    var bound = function() {
      var position = 0, length = boundArgs.length;
      var args = Array(length);
      for (var i = 0; i < length; i++) {
        args[i] = boundArgs[i] === _ ? arguments[position++] : boundArgs[i];
      }
      while (position < arguments.length) args.push(arguments[position++]);
      return executeBound(func, bound, this, this, args);
    };
    return bound;
  };

  // Bind a number of an object's methods to that object. Remaining arguments
  // are the method names to be bound. Useful for ensuring that all callbacks
  // defined on an object belong to it.
  _.bindAll = function(obj) {
    var i, length = arguments.length, key;
    if (length <= 1) throw new Error('bindAll must be passed function names');
    for (i = 1; i < length; i++) {
      key = arguments[i];
      obj[key] = _.bind(obj[key], obj);
    }
    return obj;
  };

  // Memoize an expensive function by storing its results.
  _.memoize = function(func, hasher) {
    var memoize = function(key) {
      var cache = memoize.cache;
      var address = '' + (hasher ? hasher.apply(this, arguments) : key);
      if (!_.has(cache, address)) cache[address] = func.apply(this, arguments);
      return cache[address];
    };
    memoize.cache = {};
    return memoize;
  };

  // Delays a function for the given number of milliseconds, and then calls
  // it with the arguments supplied.
  _.delay = function(func, wait) {
    var args = slice.call(arguments, 2);
    return setTimeout(function(){
      return func.apply(null, args);
    }, wait);
  };

  // Defers a function, scheduling it to run after the current call stack has
  // cleared.
  _.defer = _.partial(_.delay, _, 1);

  // Returns a function, that, when invoked, will only be triggered at most once
  // during a given window of time. Normally, the throttled function will run
  // as much as it can, without ever going more than once per `wait` duration;
  // but if you'd like to disable the execution on the leading edge, pass
  // `{leading: false}`. To disable execution on the trailing edge, ditto.
  _.throttle = function(func, wait, options) {
    var context, args, result;
    var timeout = null;
    var previous = 0;
    if (!options) options = {};
    var later = function() {
      previous = options.leading === false ? 0 : _.now();
      timeout = null;
      result = func.apply(context, args);
      if (!timeout) context = args = null;
    };
    return function() {
      var now = _.now();
      if (!previous && options.leading === false) previous = now;
      var remaining = wait - (now - previous);
      context = this;
      args = arguments;
      if (remaining <= 0 || remaining > wait) {
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
        previous = now;
        result = func.apply(context, args);
        if (!timeout) context = args = null;
      } else if (!timeout && options.trailing !== false) {
        timeout = setTimeout(later, remaining);
      }
      return result;
    };
  };

  // Returns a function, that, as long as it continues to be invoked, will not
  // be triggered. The function will be called after it stops being called for
  // N milliseconds. If `immediate` is passed, trigger the function on the
  // leading edge, instead of the trailing.
  _.debounce = function(func, wait, immediate) {
    var timeout, args, context, timestamp, result;

    var later = function() {
      var last = _.now() - timestamp;

      if (last < wait && last >= 0) {
        timeout = setTimeout(later, wait - last);
      } else {
        timeout = null;
        if (!immediate) {
          result = func.apply(context, args);
          if (!timeout) context = args = null;
        }
      }
    };

    return function() {
      context = this;
      args = arguments;
      timestamp = _.now();
      var callNow = immediate && !timeout;
      if (!timeout) timeout = setTimeout(later, wait);
      if (callNow) {
        result = func.apply(context, args);
        context = args = null;
      }

      return result;
    };
  };

  // Returns the first function passed as an argument to the second,
  // allowing you to adjust arguments, run code before and after, and
  // conditionally execute the original function.
  _.wrap = function(func, wrapper) {
    return _.partial(wrapper, func);
  };

  // Returns a negated version of the passed-in predicate.
  _.negate = function(predicate) {
    return function() {
      return !predicate.apply(this, arguments);
    };
  };

  // Returns a function that is the composition of a list of functions, each
  // consuming the return value of the function that follows.
  _.compose = function() {
    var args = arguments;
    var start = args.length - 1;
    return function() {
      var i = start;
      var result = args[start].apply(this, arguments);
      while (i--) result = args[i].call(this, result);
      return result;
    };
  };

  // Returns a function that will only be executed on and after the Nth call.
  _.after = function(times, func) {
    return function() {
      if (--times < 1) {
        return func.apply(this, arguments);
      }
    };
  };

  // Returns a function that will only be executed up to (but not including) the Nth call.
  _.before = function(times, func) {
    var memo;
    return function() {
      if (--times > 0) {
        memo = func.apply(this, arguments);
      }
      if (times <= 1) func = null;
      return memo;
    };
  };

  // Returns a function that will be executed at most one time, no matter how
  // often you call it. Useful for lazy initialization.
  _.once = _.partial(_.before, 2);

  // Object Functions
  // ----------------

  // Keys in IE < 9 that won't be iterated by `for key in ...` and thus missed.
  var hasEnumBug = !{toString: null}.propertyIsEnumerable('toString');
  var nonEnumerableProps = ['valueOf', 'isPrototypeOf', 'toString',
                      'propertyIsEnumerable', 'hasOwnProperty', 'toLocaleString'];

  function collectNonEnumProps(obj, keys) {
    var nonEnumIdx = nonEnumerableProps.length;
    var constructor = obj.constructor;
    var proto = (_.isFunction(constructor) && constructor.prototype) || ObjProto;

    // Constructor is a special case.
    var prop = 'constructor';
    if (_.has(obj, prop) && !_.contains(keys, prop)) keys.push(prop);

    while (nonEnumIdx--) {
      prop = nonEnumerableProps[nonEnumIdx];
      if (prop in obj && obj[prop] !== proto[prop] && !_.contains(keys, prop)) {
        keys.push(prop);
      }
    }
  }

  // Retrieve the names of an object's own properties.
  // Delegates to **ECMAScript 5**'s native `Object.keys`
  _.keys = function(obj) {
    if (!_.isObject(obj)) return [];
    if (nativeKeys) return nativeKeys(obj);
    var keys = [];
    for (var key in obj) if (_.has(obj, key)) keys.push(key);
    // Ahem, IE < 9.
    if (hasEnumBug) collectNonEnumProps(obj, keys);
    return keys;
  };

  // Retrieve all the property names of an object.
  _.allKeys = function(obj) {
    if (!_.isObject(obj)) return [];
    var keys = [];
    for (var key in obj) keys.push(key);
    // Ahem, IE < 9.
    if (hasEnumBug) collectNonEnumProps(obj, keys);
    return keys;
  };

  // Retrieve the values of an object's properties.
  _.values = function(obj) {
    var keys = _.keys(obj);
    var length = keys.length;
    var values = Array(length);
    for (var i = 0; i < length; i++) {
      values[i] = obj[keys[i]];
    }
    return values;
  };

  // Returns the results of applying the iteratee to each element of the object
  // In contrast to _.map it returns an object
  _.mapObject = function(obj, iteratee, context) {
    iteratee = cb(iteratee, context);
    var keys =  _.keys(obj),
          length = keys.length,
          results = {},
          currentKey;
      for (var index = 0; index < length; index++) {
        currentKey = keys[index];
        results[currentKey] = iteratee(obj[currentKey], currentKey, obj);
      }
      return results;
  };

  // Convert an object into a list of `[key, value]` pairs.
  _.pairs = function(obj) {
    var keys = _.keys(obj);
    var length = keys.length;
    var pairs = Array(length);
    for (var i = 0; i < length; i++) {
      pairs[i] = [keys[i], obj[keys[i]]];
    }
    return pairs;
  };

  // Invert the keys and values of an object. The values must be serializable.
  _.invert = function(obj) {
    var result = {};
    var keys = _.keys(obj);
    for (var i = 0, length = keys.length; i < length; i++) {
      result[obj[keys[i]]] = keys[i];
    }
    return result;
  };

  // Return a sorted list of the function names available on the object.
  // Aliased as `methods`
  _.functions = _.methods = function(obj) {
    var names = [];
    for (var key in obj) {
      if (_.isFunction(obj[key])) names.push(key);
    }
    return names.sort();
  };

  // Extend a given object with all the properties in passed-in object(s).
  _.extend = createAssigner(_.allKeys);

  // Assigns a given object with all the own properties in the passed-in object(s)
  // (https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Object/assign)
  _.extendOwn = _.assign = createAssigner(_.keys);

  // Returns the first key on an object that passes a predicate test
  _.findKey = function(obj, predicate, context) {
    predicate = cb(predicate, context);
    var keys = _.keys(obj), key;
    for (var i = 0, length = keys.length; i < length; i++) {
      key = keys[i];
      if (predicate(obj[key], key, obj)) return key;
    }
  };

  // Return a copy of the object only containing the whitelisted properties.
  _.pick = function(object, oiteratee, context) {
    var result = {}, obj = object, iteratee, keys;
    if (obj == null) return result;
    if (_.isFunction(oiteratee)) {
      keys = _.allKeys(obj);
      iteratee = optimizeCb(oiteratee, context);
    } else {
      keys = flatten(arguments, false, false, 1);
      iteratee = function(value, key, obj) { return key in obj; };
      obj = Object(obj);
    }
    for (var i = 0, length = keys.length; i < length; i++) {
      var key = keys[i];
      var value = obj[key];
      if (iteratee(value, key, obj)) result[key] = value;
    }
    return result;
  };

   // Return a copy of the object without the blacklisted properties.
  _.omit = function(obj, iteratee, context) {
    if (_.isFunction(iteratee)) {
      iteratee = _.negate(iteratee);
    } else {
      var keys = _.map(flatten(arguments, false, false, 1), String);
      iteratee = function(value, key) {
        return !_.contains(keys, key);
      };
    }
    return _.pick(obj, iteratee, context);
  };

  // Fill in a given object with default properties.
  _.defaults = createAssigner(_.allKeys, true);

  // Creates an object that inherits from the given prototype object.
  // If additional properties are provided then they will be added to the
  // created object.
  _.create = function(prototype, props) {
    var result = baseCreate(prototype);
    if (props) _.extendOwn(result, props);
    return result;
  };

  // Create a (shallow-cloned) duplicate of an object.
  _.clone = function(obj) {
    if (!_.isObject(obj)) return obj;
    return _.isArray(obj) ? obj.slice() : _.extend({}, obj);
  };

  // Invokes interceptor with the obj, and then returns obj.
  // The primary purpose of this method is to "tap into" a method chain, in
  // order to perform operations on intermediate results within the chain.
  _.tap = function(obj, interceptor) {
    interceptor(obj);
    return obj;
  };

  // Returns whether an object has a given set of `key:value` pairs.
  _.isMatch = function(object, attrs) {
    var keys = _.keys(attrs), length = keys.length;
    if (object == null) return !length;
    var obj = Object(object);
    for (var i = 0; i < length; i++) {
      var key = keys[i];
      if (attrs[key] !== obj[key] || !(key in obj)) return false;
    }
    return true;
  };


  // Internal recursive comparison function for `isEqual`.
  var eq = function(a, b, aStack, bStack) {
    // Identical objects are equal. `0 === -0`, but they aren't identical.
    // See the [Harmony `egal` proposal](http://wiki.ecmascript.org/doku.php?id=harmony:egal).
    if (a === b) return a !== 0 || 1 / a === 1 / b;
    // A strict comparison is necessary because `null == undefined`.
    if (a == null || b == null) return a === b;
    // Unwrap any wrapped objects.
    if (a instanceof _) a = a._wrapped;
    if (b instanceof _) b = b._wrapped;
    // Compare `[[Class]]` names.
    var className = toString.call(a);
    if (className !== toString.call(b)) return false;
    switch (className) {
      // Strings, numbers, regular expressions, dates, and booleans are compared by value.
      case '[object RegExp]':
      // RegExps are coerced to strings for comparison (Note: '' + /a/i === '/a/i')
      case '[object String]':
        // Primitives and their corresponding object wrappers are equivalent; thus, `"5"` is
        // equivalent to `new String("5")`.
        return '' + a === '' + b;
      case '[object Number]':
        // `NaN`s are equivalent, but non-reflexive.
        // Object(NaN) is equivalent to NaN
        if (+a !== +a) return +b !== +b;
        // An `egal` comparison is performed for other numeric values.
        return +a === 0 ? 1 / +a === 1 / b : +a === +b;
      case '[object Date]':
      case '[object Boolean]':
        // Coerce dates and booleans to numeric primitive values. Dates are compared by their
        // millisecond representations. Note that invalid dates with millisecond representations
        // of `NaN` are not equivalent.
        return +a === +b;
    }

    var areArrays = className === '[object Array]';
    if (!areArrays) {
      if (typeof a != 'object' || typeof b != 'object') return false;

      // Objects with different constructors are not equivalent, but `Object`s or `Array`s
      // from different frames are.
      var aCtor = a.constructor, bCtor = b.constructor;
      if (aCtor !== bCtor && !(_.isFunction(aCtor) && aCtor instanceof aCtor &&
                               _.isFunction(bCtor) && bCtor instanceof bCtor)
                          && ('constructor' in a && 'constructor' in b)) {
        return false;
      }
    }
    // Assume equality for cyclic structures. The algorithm for detecting cyclic
    // structures is adapted from ES 5.1 section 15.12.3, abstract operation `JO`.

    // Initializing stack of traversed objects.
    // It's done here since we only need them for objects and arrays comparison.
    aStack = aStack || [];
    bStack = bStack || [];
    var length = aStack.length;
    while (length--) {
      // Linear search. Performance is inversely proportional to the number of
      // unique nested structures.
      if (aStack[length] === a) return bStack[length] === b;
    }

    // Add the first object to the stack of traversed objects.
    aStack.push(a);
    bStack.push(b);

    // Recursively compare objects and arrays.
    if (areArrays) {
      // Compare array lengths to determine if a deep comparison is necessary.
      length = a.length;
      if (length !== b.length) return false;
      // Deep compare the contents, ignoring non-numeric properties.
      while (length--) {
        if (!eq(a[length], b[length], aStack, bStack)) return false;
      }
    } else {
      // Deep compare objects.
      var keys = _.keys(a), key;
      length = keys.length;
      // Ensure that both objects contain the same number of properties before comparing deep equality.
      if (_.keys(b).length !== length) return false;
      while (length--) {
        // Deep compare each member
        key = keys[length];
        if (!(_.has(b, key) && eq(a[key], b[key], aStack, bStack))) return false;
      }
    }
    // Remove the first object from the stack of traversed objects.
    aStack.pop();
    bStack.pop();
    return true;
  };

  // Perform a deep comparison to check if two objects are equal.
  _.isEqual = function(a, b) {
    return eq(a, b);
  };

  // Is a given array, string, or object empty?
  // An "empty" object has no enumerable own-properties.
  _.isEmpty = function(obj) {
    if (obj == null) return true;
    if (isArrayLike(obj) && (_.isArray(obj) || _.isString(obj) || _.isArguments(obj))) return obj.length === 0;
    return _.keys(obj).length === 0;
  };

  // Is a given value a DOM element?
  _.isElement = function(obj) {
    return !!(obj && obj.nodeType === 1);
  };

  // Is a given value an array?
  // Delegates to ECMA5's native Array.isArray
  _.isArray = nativeIsArray || function(obj) {
    return toString.call(obj) === '[object Array]';
  };

  // Is a given variable an object?
  _.isObject = function(obj) {
    var type = typeof obj;
    return type === 'function' || type === 'object' && !!obj;
  };

  // Add some isType methods: isArguments, isFunction, isString, isNumber, isDate, isRegExp, isError.
  _.each(['Arguments', 'Function', 'String', 'Number', 'Date', 'RegExp', 'Error'], function(name) {
    _['is' + name] = function(obj) {
      return toString.call(obj) === '[object ' + name + ']';
    };
  });

  // Define a fallback version of the method in browsers (ahem, IE < 9), where
  // there isn't any inspectable "Arguments" type.
  if (!_.isArguments(arguments)) {
    _.isArguments = function(obj) {
      return _.has(obj, 'callee');
    };
  }

  // Optimize `isFunction` if appropriate. Work around some typeof bugs in old v8,
  // IE 11 (#1621), and in Safari 8 (#1929).
  if (typeof /./ != 'function' && typeof Int8Array != 'object') {
    _.isFunction = function(obj) {
      return typeof obj == 'function' || false;
    };
  }

  // Is a given object a finite number?
  _.isFinite = function(obj) {
    return isFinite(obj) && !isNaN(parseFloat(obj));
  };

  // Is the given value `NaN`? (NaN is the only number which does not equal itself).
  _.isNaN = function(obj) {
    return _.isNumber(obj) && obj !== +obj;
  };

  // Is a given value a boolean?
  _.isBoolean = function(obj) {
    return obj === true || obj === false || toString.call(obj) === '[object Boolean]';
  };

  // Is a given value equal to null?
  _.isNull = function(obj) {
    return obj === null;
  };

  // Is a given variable undefined?
  _.isUndefined = function(obj) {
    return obj === void 0;
  };

  // Shortcut function for checking if an object has a given property directly
  // on itself (in other words, not on a prototype).
  _.has = function(obj, key) {
    return obj != null && hasOwnProperty.call(obj, key);
  };

  // Utility Functions
  // -----------------

  // Run Underscore.js in *noConflict* mode, returning the `_` variable to its
  // previous owner. Returns a reference to the Underscore object.
  _.noConflict = function() {
    root._ = previousUnderscore;
    return this;
  };

  // Keep the identity function around for default iteratees.
  _.identity = function(value) {
    return value;
  };

  // Predicate-generating functions. Often useful outside of Underscore.
  _.constant = function(value) {
    return function() {
      return value;
    };
  };

  _.noop = function(){};

  _.property = property;

  // Generates a function for a given object that returns a given property.
  _.propertyOf = function(obj) {
    return obj == null ? function(){} : function(key) {
      return obj[key];
    };
  };

  // Returns a predicate for checking whether an object has a given set of
  // `key:value` pairs.
  _.matcher = _.matches = function(attrs) {
    attrs = _.extendOwn({}, attrs);
    return function(obj) {
      return _.isMatch(obj, attrs);
    };
  };

  // Run a function **n** times.
  _.times = function(n, iteratee, context) {
    var accum = Array(Math.max(0, n));
    iteratee = optimizeCb(iteratee, context, 1);
    for (var i = 0; i < n; i++) accum[i] = iteratee(i);
    return accum;
  };

  // Return a random integer between min and max (inclusive).
  _.random = function(min, max) {
    if (max == null) {
      max = min;
      min = 0;
    }
    return min + Math.floor(Math.random() * (max - min + 1));
  };

  // A (possibly faster) way to get the current timestamp as an integer.
  _.now = Date.now || function() {
    return new Date().getTime();
  };

   // List of HTML entities for escaping.
  var escapeMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '`': '&#x60;'
  };
  var unescapeMap = _.invert(escapeMap);

  // Functions for escaping and unescaping strings to/from HTML interpolation.
  var createEscaper = function(map) {
    var escaper = function(match) {
      return map[match];
    };
    // Regexes for identifying a key that needs to be escaped
    var source = '(?:' + _.keys(map).join('|') + ')';
    var testRegexp = RegExp(source);
    var replaceRegexp = RegExp(source, 'g');
    return function(string) {
      string = string == null ? '' : '' + string;
      return testRegexp.test(string) ? string.replace(replaceRegexp, escaper) : string;
    };
  };
  _.escape = createEscaper(escapeMap);
  _.unescape = createEscaper(unescapeMap);

  // If the value of the named `property` is a function then invoke it with the
  // `object` as context; otherwise, return it.
  _.result = function(object, property, fallback) {
    var value = object == null ? void 0 : object[property];
    if (value === void 0) {
      value = fallback;
    }
    return _.isFunction(value) ? value.call(object) : value;
  };

  // Generate a unique integer id (unique within the entire client session).
  // Useful for temporary DOM ids.
  var idCounter = 0;
  _.uniqueId = function(prefix) {
    var id = ++idCounter + '';
    return prefix ? prefix + id : id;
  };

  // By default, Underscore uses ERB-style template delimiters, change the
  // following template settings to use alternative delimiters.
  _.templateSettings = {
    evaluate    : /<%([\s\S]+?)%>/g,
    interpolate : /<%=([\s\S]+?)%>/g,
    escape      : /<%-([\s\S]+?)%>/g
  };

  // When customizing `templateSettings`, if you don't want to define an
  // interpolation, evaluation or escaping regex, we need one that is
  // guaranteed not to match.
  var noMatch = /(.)^/;

  // Certain characters need to be escaped so that they can be put into a
  // string literal.
  var escapes = {
    "'":      "'",
    '\\':     '\\',
    '\r':     'r',
    '\n':     'n',
    '\u2028': 'u2028',
    '\u2029': 'u2029'
  };

  var escaper = /\\|'|\r|\n|\u2028|\u2029/g;

  var escapeChar = function(match) {
    return '\\' + escapes[match];
  };

  // JavaScript micro-templating, similar to John Resig's implementation.
  // Underscore templating handles arbitrary delimiters, preserves whitespace,
  // and correctly escapes quotes within interpolated code.
  // NB: `oldSettings` only exists for backwards compatibility.
  _.template = function(text, settings, oldSettings) {
    if (!settings && oldSettings) settings = oldSettings;
    settings = _.defaults({}, settings, _.templateSettings);

    // Combine delimiters into one regular expression via alternation.
    var matcher = RegExp([
      (settings.escape || noMatch).source,
      (settings.interpolate || noMatch).source,
      (settings.evaluate || noMatch).source
    ].join('|') + '|$', 'g');

    // Compile the template source, escaping string literals appropriately.
    var index = 0;
    var source = "__p+='";
    text.replace(matcher, function(match, escape, interpolate, evaluate, offset) {
      source += text.slice(index, offset).replace(escaper, escapeChar);
      index = offset + match.length;

      if (escape) {
        source += "'+\n((__t=(" + escape + "))==null?'':_.escape(__t))+\n'";
      } else if (interpolate) {
        source += "'+\n((__t=(" + interpolate + "))==null?'':__t)+\n'";
      } else if (evaluate) {
        source += "';\n" + evaluate + "\n__p+='";
      }

      // Adobe VMs need the match returned to produce the correct offest.
      return match;
    });
    source += "';\n";

    // If a variable is not specified, place data values in local scope.
    if (!settings.variable) source = 'with(obj||{}){\n' + source + '}\n';

    source = "var __t,__p='',__j=Array.prototype.join," +
      "print=function(){__p+=__j.call(arguments,'');};\n" +
      source + 'return __p;\n';

    try {
      var render = new Function(settings.variable || 'obj', '_', source);
    } catch (e) {
      e.source = source;
      throw e;
    }

    var template = function(data) {
      return render.call(this, data, _);
    };

    // Provide the compiled source as a convenience for precompilation.
    var argument = settings.variable || 'obj';
    template.source = 'function(' + argument + '){\n' + source + '}';

    return template;
  };

  // Add a "chain" function. Start chaining a wrapped Underscore object.
  _.chain = function(obj) {
    var instance = _(obj);
    instance._chain = true;
    return instance;
  };

  // OOP
  // ---------------
  // If Underscore is called as a function, it returns a wrapped object that
  // can be used OO-style. This wrapper holds altered versions of all the
  // underscore functions. Wrapped objects may be chained.

  // Helper function to continue chaining intermediate results.
  var result = function(instance, obj) {
    return instance._chain ? _(obj).chain() : obj;
  };

  // Add your own custom functions to the Underscore object.
  _.mixin = function(obj) {
    _.each(_.functions(obj), function(name) {
      var func = _[name] = obj[name];
      _.prototype[name] = function() {
        var args = [this._wrapped];
        push.apply(args, arguments);
        return result(this, func.apply(_, args));
      };
    });
  };

  // Add all of the Underscore functions to the wrapper object.
  _.mixin(_);

  // Add all mutator Array functions to the wrapper.
  _.each(['pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift'], function(name) {
    var method = ArrayProto[name];
    _.prototype[name] = function() {
      var obj = this._wrapped;
      method.apply(obj, arguments);
      if ((name === 'shift' || name === 'splice') && obj.length === 0) delete obj[0];
      return result(this, obj);
    };
  });

  // Add all accessor Array functions to the wrapper.
  _.each(['concat', 'join', 'slice'], function(name) {
    var method = ArrayProto[name];
    _.prototype[name] = function() {
      return result(this, method.apply(this._wrapped, arguments));
    };
  });

  // Extracts the result from a wrapped and chained object.
  _.prototype.value = function() {
    return this._wrapped;
  };

  // Provide unwrapping proxy for some methods used in engine operations
  // such as arithmetic and JSON stringification.
  _.prototype.valueOf = _.prototype.toJSON = _.prototype.value;

  _.prototype.toString = function() {
    return '' + this._wrapped;
  };

  // AMD registration happens at the end for compatibility with AMD loaders
  // that may not enforce next-turn semantics on modules. Even though general
  // practice for AMD registration is to be anonymous, underscore registers
  // as a named module because, like jQuery, it is a base library that is
  // popular enough to be bundled in a third party lib, but not be part of
  // an AMD load request. Those cases could generate an error when an
  // anonymous define() is called outside of a loader request.
  if (typeof define === 'function' && define.amd) {
    define('underscore', [], function() {
      return _;
    });
  }
}.call(this));

},{}],40:[function(_dereq_,module,exports){
var bundleFn = arguments[3];
var sources = arguments[4];
var cache = arguments[5];

var stringify = JSON.stringify;

module.exports = function (fn, options) {
    var wkey;
    var cacheKeys = Object.keys(cache);

    for (var i = 0, l = cacheKeys.length; i < l; i++) {
        var key = cacheKeys[i];
        var exp = cache[key].exports;
        // Using babel as a transpiler to use esmodule, the export will always
        // be an object with the default export as a property of it. To ensure
        // the existing api and babel esmodule exports are both supported we
        // check for both
        if (exp === fn || exp && exp.default === fn) {
            wkey = key;
            break;
        }
    }

    if (!wkey) {
        wkey = Math.floor(Math.pow(16, 8) * Math.random()).toString(16);
        var wcache = {};
        for (var i = 0, l = cacheKeys.length; i < l; i++) {
            var key = cacheKeys[i];
            wcache[key] = key;
        }
        sources[wkey] = [
            Function(['require','module','exports'], '(' + fn + ')(self)'),
            wcache
        ];
    }
    var skey = Math.floor(Math.pow(16, 8) * Math.random()).toString(16);

    var scache = {}; scache[wkey] = wkey;
    sources[skey] = [
        Function(['require'], (
            // try to call default if defined to also support babel esmodule
            // exports
            'var f = require(' + stringify(wkey) + ');' +
            '(f.default ? f.default : f)(self);'
        )),
        scache
    ];

    var workerSources = {};
    resolveSources(skey);

    function resolveSources(key) {
        workerSources[key] = true;

        for (var depPath in sources[key][1]) {
            var depKey = sources[key][1][depPath];
            if (!workerSources[depKey]) {
                resolveSources(depKey);
            }
        }
    }

    var src = '(' + bundleFn + ')({'
        + Object.keys(workerSources).map(function (key) {
            return stringify(key) + ':['
                + sources[key][0]
                + ',' + stringify(sources[key][1]) + ']'
            ;
        }).join(',')
        + '},{},[' + stringify(skey) + '])'
    ;

    var URL = window.URL || window.webkitURL || window.mozURL || window.msURL;

    var blob = new Blob([src], { type: 'text/javascript' });
    if (options && options.bare) { return blob; }
    var workerUrl = URL.createObjectURL(blob);
    var worker = new Worker(workerUrl);
    worker.objectURL = workerUrl;
    return worker;
};

},{}],41:[function(_dereq_,module,exports){
'use strict';

var Graph = _dereq_('ngraph.graph');
var _ = _dereq_('underscore');
var Q = _dereq_('Q');
var Nlayout = _dereq_('ngraph.asyncforce');
var removeOverlaps = _dereq_('ngraph.remove-overlaps');
// registers the extension on a cytoscape lib ref

var ngraph = function (cytoscape) {

        if (!cytoscape) {
            return;
        } // can't register if cytoscape unspecified

        var defaults = {
            async: {
                // tell layout that we want to compute all at once:
                maxIterations: 1000,
                stepsPerCycle: 30,

                // Run it till the end:
                waitForStep: false
            },
            physics: {
                /**
                 * Ideal length for links (springs in physical model).
                 */
                springLength: 100,

                /**
                 * Hook's law coefficient. 1 - solid spring.
                 */
                springCoeff: 0.0008,

                /**
                 * Coulomb's law coefficient. It's used to repel nodes thus should be negative
                 * if you make it positive nodes start attract each other :).
                 */
                gravity: -1.2,

                /**
                 * Theta coefficient from Barnes Hut simulation. Ranged between (0, 1).
                 * The closer it's to 1 the more nodes algorithm will have to go through.
                 * Setting it to one makes Barnes Hut simulation no different from
                 * brute-force forces calculation (each node is considered).
                 */
                theta: 0.8,

                /**
                 * Drag force coefficient. Used to slow down system, thus should be less than 1.
                 * The closer it is to 0 the less tight system will be.
                 */
                dragCoeff: 0.02,

                /**
                 * Default time step (dt) for forces integration
                 */
                timeStep: 20,
                iterations: 10000,
                fit: true,

                /**
                 * Maximum movement of the system which can be considered as stabilized
                 */
                stableThreshold: 0.000009
            },
            iterations: 10000,
            refreshInterval: 16, // in ms
            refreshIterations: 10, // iterations until thread sends an update
            stableThreshold: 2,
            animate: true,
            fit: true
        };

        var extend = Object.assign || function (tgt) {
                for (var i = 1; i < arguments.length; i++) {
                    var obj = arguments[i];

                    for (var k in obj) {
                        tgt[k] = obj[k];
                    }
                }
                return tgt;
            };

        function Layout(options) {
            this.options = extend({}, defaults, options);
            this.layoutOptions = extend({}, defaults, options);
            delete  this.layoutOptions.cy;
            delete  this.layoutOptions.eles;
        }

        Layout.prototype.l = Nlayout;
        Layout.prototype.g = Graph;

        Layout.prototype.run = function () {
            var layout = this;
            layout.trigger({type: 'layoutstart', layout: layout});
            var options = this.options;
            var layoutOptions = this.layoutOptions;
            var that = this;
            var graph = that.g();
            var cy = options.cy;
            var eles = options.eles;
            var nodes = eles.nodes();
            var parents = nodes.parents();

            // FILTER

            nodes = nodes.difference(parents);

            nodes = nodes.filterFn(function (ele) {
                return ele.connectedEdges().length > 0
            });

            var edges = eles.edges();
            var edgesHash = {};
            var L;


            var firstUpdate = true;

            /*        if (eles.length > 3000) {
             options.iterations = options.iterations - Math.abs(options.iterations / 3); // reduce iterations for big graph
             }*/

            var update = function (nodesJson) {
                /* cy.batch(function () {
                 nodesJson.forEach(function(e,k){
                 nodes.$('#'+ e.data.id).position(e.position);
                 })

                 });*/
                nodes.positions(function (i, node) {
                    if (!node.data('dragging'))
                        return L.getNodePosition(node.id())
                });

                if (layoutOptions.async) {
                    setTimeout(function () {
                        layout.trigger({type: 'layoutstop', layout: layout});
                        layout.trigger({type: 'layoutready', layout: layout});
                    }, 500);
                }

                /* nodes.forEach(function (node) {
                 L.getNodePosition(node.id())
                 });*/

                // maybe we fit each iteration
                if (layoutOptions.fit) {
                    cy.fit(layoutOptions.padding);
                }

                if (firstUpdate) {
                    // indicate the initial positions have been set
                    layout.trigger('layoutready');
                    firstUpdate = false;
                }

            };

            graph.on('changed', function (e) {
                //  console.dir(e);
            });

            _.each(nodes, function (e, k) {
                e.on('tapstart', function (e) {
                    e.cyTarget.data('dragging', true)
                });
                e.on('tapend', function (e) {
                    e.cyTarget.removeData('dragging');
                });
                e.on('position', 'node[dragging]', function (e) {
                    if (L.setNodePosition && e.cyTarget.data('dragging')) {
                        L.setNodePosition(e.cyTarget.data().id);
                    }
                });
                graph.addNode(e.data().id);
            });

            _.each(edges, function (e, k) {
                if (!edgesHash[e.data().source + ':' + e.data().target] && !edgesHash[e.data().target + ':' + e.data().source]) {
                    edgesHash[e.data().source + ':' + e.data().target] = e;
                    graph.addLink(e.data().source, e.data().target);
                }
            });

            L = that.l(graph, layoutOptions);

            _.each(nodes, function (e, k) {
                var data = e.data();
                //var pos = e.position();
                if (data.pin) {
                    L.pinNode(data.id, true);
                    e.removeData('pin');
                    e.data('unpin', true);
                } else if (data.unpin) {
                    L.pinNode(data.id, false);
                    e.removeData('unpin');
                }
                //if (pos.x && pos.y) {
                //  L.setNodePosition(data.id, pos);
                //}
            });

            var left = layoutOptions.iterations;

            this.on('layoutstop', function () {
                layoutOptions.iterations = 0;
            });

            L.on('stable', function () {
                console.log('got Stable event');
                left = 0;
            });

            if (!layoutOptions.animate) {
                layoutOptions.refreshInterval = 0;
            }
            var updateTimeout;
            L.on('cycle', function () {
                update();
            });

            if (layoutOptions.async) {
                return this;
            }

            var step = function () {
                if (layoutOptions.animate) {
                    if (left != 0  /*condition for stopping layout*/) {
                        if (!updateTimeout || left == 0) {
                            updateTimeout = setTimeout(function () {
                                left--;
                                //update();
                                updateTimeout = null;
                                L.step() ? left = 0 : false;
                                // update();
                                step();
                                //step();
                            }, layoutOptions.refreshInterval);
                        }
                    } else {
                        layout.trigger({type: 'layoutstop', layout: layout});
                        layout.trigger({type: 'layoutready', layout: layout});
                    }
                } else {

                    for (var i = 0; i < layoutOptions.iterations; i++) {
                        L.step()
                        removeOverlaps(L);
                    }
                    layout.trigger({type: 'layoutstop', layout: layout});
                    layout.trigger({type: 'layoutready', layout: layout});
                    //update();
                }

            };
            step();
            return this;
        };

        Layout.prototype.stop = function () {
            // TODO: thread actions
            // continuous/asynchronous layout may want to set a flag etc to let
            // run() know to stop


            if (this.thread) {
                this.thread.stop();
            }

            this.trigger('layoutstop');

            return this; // chaining
        };

        Layout.prototype.destroy = function () {
            // clean up here if you create threads etc
            // TODO: thread actions

            if (this.thread) {
                this.thread.stop();
            }

            return this; // chaining
        };

        return Layout;

    };

module.exports = function get(cytoscape) {
    return ngraph(cytoscape);
};

},{"Q":1,"ngraph.asyncforce":2,"ngraph.graph":24,"ngraph.remove-overlaps":36,"underscore":39}],42:[function(_dereq_,module,exports){
'use strict';

(function(){

    // registers the extension on a cytoscape lib ref
    var getLayout = _dereq_('./impl.js');
    var register = function( cytoscape ){
        var Layout = getLayout( cytoscape );
        cytoscape('layout', 'cytoscape-ngraph.forcelayout', Layout);
    };

    if( typeof module !== 'undefined' && module.exports ){ // expose as a commonjs module
        module.exports = register;
    }

    if( typeof define !== 'undefined' && define.amd ){ // expose as an amd/requirejs module
        define('cytoscape-ngraph.forcelayout', function(){
            return register;
        });
    }

    if( typeof cytoscape !== 'undefined' ){ // expose to global cytoscape (i.e. window.cytoscape)
        register( cytoscape );
    }

})();
},{"./impl.js":41}]},{},[42])(42)
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvUS9xLmpzIiwibm9kZV9tb2R1bGVzL25ncmFwaC5hc3luY2ZvcmNlL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL25ncmFwaC5hc3luY2ZvcmNlL2xpYi9jcmVhdGVMYXlvdXQuanMiLCJub2RlX21vZHVsZXMvbmdyYXBoLmFzeW5jZm9yY2UvbGliL2xheW91dFdvcmtlci5qcyIsIm5vZGVfbW9kdWxlcy9uZ3JhcGguYXN5bmNmb3JjZS9saWIvbWVzc2FnZXMuanMiLCJub2RlX21vZHVsZXMvbmdyYXBoLmFzeW5jZm9yY2Uvb3B0aW9ucy5qcyIsIm5vZGVfbW9kdWxlcy9uZ3JhcGguZXZlbnRzL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL25ncmFwaC5leHBvc2UvaW5kZXguanMiLCJub2RlX21vZHVsZXMvbmdyYXBoLmZvcmNlbGF5b3V0L2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL25ncmFwaC5mb3JjZWxheW91dC9ub2RlX21vZHVsZXMvbmdyYXBoLnBoeXNpY3Muc2ltdWxhdG9yL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL25ncmFwaC5mb3JjZWxheW91dC9ub2RlX21vZHVsZXMvbmdyYXBoLnBoeXNpY3Muc2ltdWxhdG9yL2xpYi9ib3VuZHMuanMiLCJub2RlX21vZHVsZXMvbmdyYXBoLmZvcmNlbGF5b3V0L25vZGVfbW9kdWxlcy9uZ3JhcGgucGh5c2ljcy5zaW11bGF0b3IvbGliL2NyZWF0ZUJvZHkuanMiLCJub2RlX21vZHVsZXMvbmdyYXBoLmZvcmNlbGF5b3V0L25vZGVfbW9kdWxlcy9uZ3JhcGgucGh5c2ljcy5zaW11bGF0b3IvbGliL2RyYWdGb3JjZS5qcyIsIm5vZGVfbW9kdWxlcy9uZ3JhcGguZm9yY2VsYXlvdXQvbm9kZV9tb2R1bGVzL25ncmFwaC5waHlzaWNzLnNpbXVsYXRvci9saWIvZXVsZXJJbnRlZ3JhdG9yLmpzIiwibm9kZV9tb2R1bGVzL25ncmFwaC5mb3JjZWxheW91dC9ub2RlX21vZHVsZXMvbmdyYXBoLnBoeXNpY3Muc2ltdWxhdG9yL2xpYi9zcHJpbmcuanMiLCJub2RlX21vZHVsZXMvbmdyYXBoLmZvcmNlbGF5b3V0L25vZGVfbW9kdWxlcy9uZ3JhcGgucGh5c2ljcy5zaW11bGF0b3IvbGliL3NwcmluZ0ZvcmNlLmpzIiwibm9kZV9tb2R1bGVzL25ncmFwaC5mb3JjZWxheW91dDNkL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL25ncmFwaC5mb3JjZWxheW91dDNkL2xpYi9ib3VuZHMuanMiLCJub2RlX21vZHVsZXMvbmdyYXBoLmZvcmNlbGF5b3V0M2QvbGliL2NyZWF0ZUJvZHkuanMiLCJub2RlX21vZHVsZXMvbmdyYXBoLmZvcmNlbGF5b3V0M2QvbGliL2RyYWdGb3JjZS5qcyIsIm5vZGVfbW9kdWxlcy9uZ3JhcGguZm9yY2VsYXlvdXQzZC9saWIvZXVsZXJJbnRlZ3JhdG9yLmpzIiwibm9kZV9tb2R1bGVzL25ncmFwaC5mb3JjZWxheW91dDNkL2xpYi9zcHJpbmdGb3JjZS5qcyIsIm5vZGVfbW9kdWxlcy9uZ3JhcGguZnJvbWpzb24vaW5kZXguanMiLCJub2RlX21vZHVsZXMvbmdyYXBoLmdyYXBoL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL25ncmFwaC5tZXJnZS9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9uZ3JhcGgucGh5c2ljcy5wcmltaXRpdmVzL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL25ncmFwaC5xdWFkdHJlZWJoL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL25ncmFwaC5xdWFkdHJlZWJoL2luc2VydFN0YWNrLmpzIiwibm9kZV9tb2R1bGVzL25ncmFwaC5xdWFkdHJlZWJoL2lzU2FtZVBvc2l0aW9uLmpzIiwibm9kZV9tb2R1bGVzL25ncmFwaC5xdWFkdHJlZWJoL25vZGUuanMiLCJub2RlX21vZHVsZXMvbmdyYXBoLnF1YWR0cmVlYmgzZC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9uZ3JhcGgucXVhZHRyZWViaDNkL2luc2VydFN0YWNrLmpzIiwibm9kZV9tb2R1bGVzL25ncmFwaC5xdWFkdHJlZWJoM2QvaXNTYW1lUG9zaXRpb24uanMiLCJub2RlX21vZHVsZXMvbmdyYXBoLnF1YWR0cmVlYmgzZC9ub2RlLmpzIiwibm9kZV9tb2R1bGVzL25ncmFwaC5yYW5kb20vaW5kZXguanMiLCJub2RlX21vZHVsZXMvbmdyYXBoLnJlbW92ZS1vdmVybGFwcy9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9uZ3JhcGgudG9qc29uL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3Byb2Nlc3MvYnJvd3Nlci5qcyIsIm5vZGVfbW9kdWxlcy91bmRlcnNjb3JlL3VuZGVyc2NvcmUuanMiLCJub2RlX21vZHVsZXMvd2Vid29ya2lmeS9pbmRleC5qcyIsInNyYy9pbXBsLmpzIiwic3JjL2luZGV4LmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOztBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQ2hnRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMU9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6SUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5U0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbFFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNkQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDamtCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BVQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pZQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1Z0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6U0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvLyB2aW06dHM9NDpzdHM9NDpzdz00OlxuLyohXG4gKlxuICogQ29weXJpZ2h0IDIwMDktMjAxMiBLcmlzIEtvd2FsIHVuZGVyIHRoZSB0ZXJtcyBvZiB0aGUgTUlUXG4gKiBsaWNlbnNlIGZvdW5kIGF0IGh0dHA6Ly9naXRodWIuY29tL2tyaXNrb3dhbC9xL3Jhdy9tYXN0ZXIvTElDRU5TRVxuICpcbiAqIFdpdGggcGFydHMgYnkgVHlsZXIgQ2xvc2VcbiAqIENvcHlyaWdodCAyMDA3LTIwMDkgVHlsZXIgQ2xvc2UgdW5kZXIgdGhlIHRlcm1zIG9mIHRoZSBNSVQgWCBsaWNlbnNlIGZvdW5kXG4gKiBhdCBodHRwOi8vd3d3Lm9wZW5zb3VyY2Uub3JnL2xpY2Vuc2VzL21pdC1saWNlbnNlLmh0bWxcbiAqIEZvcmtlZCBhdCByZWZfc2VuZC5qcyB2ZXJzaW9uOiAyMDA5LTA1LTExXG4gKlxuICogV2l0aCBwYXJ0cyBieSBNYXJrIE1pbGxlclxuICogQ29weXJpZ2h0IChDKSAyMDExIEdvb2dsZSBJbmMuXG4gKlxuICogTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbiAqIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbiAqIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuICpcbiAqIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuICpcbiAqIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbiAqIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbiAqIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuICogU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuICogbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG4gKlxuICovXG5cbihmdW5jdGlvbiAoZGVmaW5pdGlvbikge1xuICAgIFwidXNlIHN0cmljdFwiO1xuXG4gICAgLy8gVGhpcyBmaWxlIHdpbGwgZnVuY3Rpb24gcHJvcGVybHkgYXMgYSA8c2NyaXB0PiB0YWcsIG9yIGEgbW9kdWxlXG4gICAgLy8gdXNpbmcgQ29tbW9uSlMgYW5kIE5vZGVKUyBvciBSZXF1aXJlSlMgbW9kdWxlIGZvcm1hdHMuICBJblxuICAgIC8vIENvbW1vbi9Ob2RlL1JlcXVpcmVKUywgdGhlIG1vZHVsZSBleHBvcnRzIHRoZSBRIEFQSSBhbmQgd2hlblxuICAgIC8vIGV4ZWN1dGVkIGFzIGEgc2ltcGxlIDxzY3JpcHQ+LCBpdCBjcmVhdGVzIGEgUSBnbG9iYWwgaW5zdGVhZC5cblxuICAgIC8vIE1vbnRhZ2UgUmVxdWlyZVxuICAgIGlmICh0eXBlb2YgYm9vdHN0cmFwID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgYm9vdHN0cmFwKFwicHJvbWlzZVwiLCBkZWZpbml0aW9uKTtcblxuICAgIC8vIENvbW1vbkpTXG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZXhwb3J0cyA9PT0gXCJvYmplY3RcIiAmJiB0eXBlb2YgbW9kdWxlID09PSBcIm9iamVjdFwiKSB7XG4gICAgICAgIG1vZHVsZS5leHBvcnRzID0gZGVmaW5pdGlvbigpO1xuXG4gICAgLy8gUmVxdWlyZUpTXG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZGVmaW5lID09PSBcImZ1bmN0aW9uXCIgJiYgZGVmaW5lLmFtZCkge1xuICAgICAgICBkZWZpbmUoZGVmaW5pdGlvbik7XG5cbiAgICAvLyBTRVMgKFNlY3VyZSBFY21hU2NyaXB0KVxuICAgIH0gZWxzZSBpZiAodHlwZW9mIHNlcyAhPT0gXCJ1bmRlZmluZWRcIikge1xuICAgICAgICBpZiAoIXNlcy5vaygpKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzZXMubWFrZVEgPSBkZWZpbml0aW9uO1xuICAgICAgICB9XG5cbiAgICAvLyA8c2NyaXB0PlxuICAgIH0gZWxzZSBpZiAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiB8fCB0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIikge1xuICAgICAgICAvLyBQcmVmZXIgd2luZG93IG92ZXIgc2VsZiBmb3IgYWRkLW9uIHNjcmlwdHMuIFVzZSBzZWxmIGZvclxuICAgICAgICAvLyBub24td2luZG93ZWQgY29udGV4dHMuXG4gICAgICAgIHZhciBnbG9iYWwgPSB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDogc2VsZjtcblxuICAgICAgICAvLyBHZXQgdGhlIGB3aW5kb3dgIG9iamVjdCwgc2F2ZSB0aGUgcHJldmlvdXMgUSBnbG9iYWxcbiAgICAgICAgLy8gYW5kIGluaXRpYWxpemUgUSBhcyBhIGdsb2JhbC5cbiAgICAgICAgdmFyIHByZXZpb3VzUSA9IGdsb2JhbC5RO1xuICAgICAgICBnbG9iYWwuUSA9IGRlZmluaXRpb24oKTtcblxuICAgICAgICAvLyBBZGQgYSBub0NvbmZsaWN0IGZ1bmN0aW9uIHNvIFEgY2FuIGJlIHJlbW92ZWQgZnJvbSB0aGVcbiAgICAgICAgLy8gZ2xvYmFsIG5hbWVzcGFjZS5cbiAgICAgICAgZ2xvYmFsLlEubm9Db25mbGljdCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGdsb2JhbC5RID0gcHJldmlvdXNRO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH07XG5cbiAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJUaGlzIGVudmlyb25tZW50IHdhcyBub3QgYW50aWNpcGF0ZWQgYnkgUS4gUGxlYXNlIGZpbGUgYSBidWcuXCIpO1xuICAgIH1cblxufSkoZnVuY3Rpb24gKCkge1xuXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBoYXNTdGFja3MgPSBmYWxzZTtcbnRyeSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCk7XG59IGNhdGNoIChlKSB7XG4gICAgaGFzU3RhY2tzID0gISFlLnN0YWNrO1xufVxuXG4vLyBBbGwgY29kZSBhZnRlciB0aGlzIHBvaW50IHdpbGwgYmUgZmlsdGVyZWQgZnJvbSBzdGFjayB0cmFjZXMgcmVwb3J0ZWRcbi8vIGJ5IFEuXG52YXIgcVN0YXJ0aW5nTGluZSA9IGNhcHR1cmVMaW5lKCk7XG52YXIgcUZpbGVOYW1lO1xuXG4vLyBzaGltc1xuXG4vLyB1c2VkIGZvciBmYWxsYmFjayBpbiBcImFsbFJlc29sdmVkXCJcbnZhciBub29wID0gZnVuY3Rpb24gKCkge307XG5cbi8vIFVzZSB0aGUgZmFzdGVzdCBwb3NzaWJsZSBtZWFucyB0byBleGVjdXRlIGEgdGFzayBpbiBhIGZ1dHVyZSB0dXJuXG4vLyBvZiB0aGUgZXZlbnQgbG9vcC5cbnZhciBuZXh0VGljayA9KGZ1bmN0aW9uICgpIHtcbiAgICAvLyBsaW5rZWQgbGlzdCBvZiB0YXNrcyAoc2luZ2xlLCB3aXRoIGhlYWQgbm9kZSlcbiAgICB2YXIgaGVhZCA9IHt0YXNrOiB2b2lkIDAsIG5leHQ6IG51bGx9O1xuICAgIHZhciB0YWlsID0gaGVhZDtcbiAgICB2YXIgZmx1c2hpbmcgPSBmYWxzZTtcbiAgICB2YXIgcmVxdWVzdFRpY2sgPSB2b2lkIDA7XG4gICAgdmFyIGlzTm9kZUpTID0gZmFsc2U7XG4gICAgLy8gcXVldWUgZm9yIGxhdGUgdGFza3MsIHVzZWQgYnkgdW5oYW5kbGVkIHJlamVjdGlvbiB0cmFja2luZ1xuICAgIHZhciBsYXRlclF1ZXVlID0gW107XG5cbiAgICBmdW5jdGlvbiBmbHVzaCgpIHtcbiAgICAgICAgLyoganNoaW50IGxvb3BmdW5jOiB0cnVlICovXG4gICAgICAgIHZhciB0YXNrLCBkb21haW47XG5cbiAgICAgICAgd2hpbGUgKGhlYWQubmV4dCkge1xuICAgICAgICAgICAgaGVhZCA9IGhlYWQubmV4dDtcbiAgICAgICAgICAgIHRhc2sgPSBoZWFkLnRhc2s7XG4gICAgICAgICAgICBoZWFkLnRhc2sgPSB2b2lkIDA7XG4gICAgICAgICAgICBkb21haW4gPSBoZWFkLmRvbWFpbjtcblxuICAgICAgICAgICAgaWYgKGRvbWFpbikge1xuICAgICAgICAgICAgICAgIGhlYWQuZG9tYWluID0gdm9pZCAwO1xuICAgICAgICAgICAgICAgIGRvbWFpbi5lbnRlcigpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcnVuU2luZ2xlKHRhc2ssIGRvbWFpbik7XG5cbiAgICAgICAgfVxuICAgICAgICB3aGlsZSAobGF0ZXJRdWV1ZS5sZW5ndGgpIHtcbiAgICAgICAgICAgIHRhc2sgPSBsYXRlclF1ZXVlLnBvcCgpO1xuICAgICAgICAgICAgcnVuU2luZ2xlKHRhc2spO1xuICAgICAgICB9XG4gICAgICAgIGZsdXNoaW5nID0gZmFsc2U7XG4gICAgfVxuICAgIC8vIHJ1bnMgYSBzaW5nbGUgZnVuY3Rpb24gaW4gdGhlIGFzeW5jIHF1ZXVlXG4gICAgZnVuY3Rpb24gcnVuU2luZ2xlKHRhc2ssIGRvbWFpbikge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgdGFzaygpO1xuXG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGlmIChpc05vZGVKUykge1xuICAgICAgICAgICAgICAgIC8vIEluIG5vZGUsIHVuY2F1Z2h0IGV4Y2VwdGlvbnMgYXJlIGNvbnNpZGVyZWQgZmF0YWwgZXJyb3JzLlxuICAgICAgICAgICAgICAgIC8vIFJlLXRocm93IHRoZW0gc3luY2hyb25vdXNseSB0byBpbnRlcnJ1cHQgZmx1c2hpbmchXG5cbiAgICAgICAgICAgICAgICAvLyBFbnN1cmUgY29udGludWF0aW9uIGlmIHRoZSB1bmNhdWdodCBleGNlcHRpb24gaXMgc3VwcHJlc3NlZFxuICAgICAgICAgICAgICAgIC8vIGxpc3RlbmluZyBcInVuY2F1Z2h0RXhjZXB0aW9uXCIgZXZlbnRzIChhcyBkb21haW5zIGRvZXMpLlxuICAgICAgICAgICAgICAgIC8vIENvbnRpbnVlIGluIG5leHQgZXZlbnQgdG8gYXZvaWQgdGljayByZWN1cnNpb24uXG4gICAgICAgICAgICAgICAgaWYgKGRvbWFpbikge1xuICAgICAgICAgICAgICAgICAgICBkb21haW4uZXhpdCgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBzZXRUaW1lb3V0KGZsdXNoLCAwKTtcbiAgICAgICAgICAgICAgICBpZiAoZG9tYWluKSB7XG4gICAgICAgICAgICAgICAgICAgIGRvbWFpbi5lbnRlcigpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHRocm93IGU7XG5cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gSW4gYnJvd3NlcnMsIHVuY2F1Z2h0IGV4Y2VwdGlvbnMgYXJlIG5vdCBmYXRhbC5cbiAgICAgICAgICAgICAgICAvLyBSZS10aHJvdyB0aGVtIGFzeW5jaHJvbm91c2x5IHRvIGF2b2lkIHNsb3ctZG93bnMuXG4gICAgICAgICAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IGU7XG4gICAgICAgICAgICAgICAgfSwgMCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZG9tYWluKSB7XG4gICAgICAgICAgICBkb21haW4uZXhpdCgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgbmV4dFRpY2sgPSBmdW5jdGlvbiAodGFzaykge1xuICAgICAgICB0YWlsID0gdGFpbC5uZXh0ID0ge1xuICAgICAgICAgICAgdGFzazogdGFzayxcbiAgICAgICAgICAgIGRvbWFpbjogaXNOb2RlSlMgJiYgcHJvY2Vzcy5kb21haW4sXG4gICAgICAgICAgICBuZXh0OiBudWxsXG4gICAgICAgIH07XG5cbiAgICAgICAgaWYgKCFmbHVzaGluZykge1xuICAgICAgICAgICAgZmx1c2hpbmcgPSB0cnVlO1xuICAgICAgICAgICAgcmVxdWVzdFRpY2soKTtcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICBpZiAodHlwZW9mIHByb2Nlc3MgPT09IFwib2JqZWN0XCIgJiZcbiAgICAgICAgcHJvY2Vzcy50b1N0cmluZygpID09PSBcIltvYmplY3QgcHJvY2Vzc11cIiAmJiBwcm9jZXNzLm5leHRUaWNrKSB7XG4gICAgICAgIC8vIEVuc3VyZSBRIGlzIGluIGEgcmVhbCBOb2RlIGVudmlyb25tZW50LCB3aXRoIGEgYHByb2Nlc3MubmV4dFRpY2tgLlxuICAgICAgICAvLyBUbyBzZWUgdGhyb3VnaCBmYWtlIE5vZGUgZW52aXJvbm1lbnRzOlxuICAgICAgICAvLyAqIE1vY2hhIHRlc3QgcnVubmVyIC0gZXhwb3NlcyBhIGBwcm9jZXNzYCBnbG9iYWwgd2l0aG91dCBhIGBuZXh0VGlja2BcbiAgICAgICAgLy8gKiBCcm93c2VyaWZ5IC0gZXhwb3NlcyBhIGBwcm9jZXNzLm5leFRpY2tgIGZ1bmN0aW9uIHRoYXQgdXNlc1xuICAgICAgICAvLyAgIGBzZXRUaW1lb3V0YC4gSW4gdGhpcyBjYXNlIGBzZXRJbW1lZGlhdGVgIGlzIHByZWZlcnJlZCBiZWNhdXNlXG4gICAgICAgIC8vICAgIGl0IGlzIGZhc3Rlci4gQnJvd3NlcmlmeSdzIGBwcm9jZXNzLnRvU3RyaW5nKClgIHlpZWxkc1xuICAgICAgICAvLyAgIFwiW29iamVjdCBPYmplY3RdXCIsIHdoaWxlIGluIGEgcmVhbCBOb2RlIGVudmlyb25tZW50XG4gICAgICAgIC8vICAgYHByb2Nlc3MubmV4dFRpY2soKWAgeWllbGRzIFwiW29iamVjdCBwcm9jZXNzXVwiLlxuICAgICAgICBpc05vZGVKUyA9IHRydWU7XG5cbiAgICAgICAgcmVxdWVzdFRpY2sgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBwcm9jZXNzLm5leHRUaWNrKGZsdXNoKTtcbiAgICAgICAgfTtcblxuICAgIH0gZWxzZSBpZiAodHlwZW9mIHNldEltbWVkaWF0ZSA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgIC8vIEluIElFMTAsIE5vZGUuanMgMC45Kywgb3IgaHR0cHM6Ly9naXRodWIuY29tL05vYmxlSlMvc2V0SW1tZWRpYXRlXG4gICAgICAgIGlmICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICAgICAgICByZXF1ZXN0VGljayA9IHNldEltbWVkaWF0ZS5iaW5kKHdpbmRvdywgZmx1c2gpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmVxdWVzdFRpY2sgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgc2V0SW1tZWRpYXRlKGZsdXNoKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cblxuICAgIH0gZWxzZSBpZiAodHlwZW9mIE1lc3NhZ2VDaGFubmVsICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICAgIC8vIG1vZGVybiBicm93c2Vyc1xuICAgICAgICAvLyBodHRwOi8vd3d3Lm5vbmJsb2NraW5nLmlvLzIwMTEvMDYvd2luZG93bmV4dHRpY2suaHRtbFxuICAgICAgICB2YXIgY2hhbm5lbCA9IG5ldyBNZXNzYWdlQ2hhbm5lbCgpO1xuICAgICAgICAvLyBBdCBsZWFzdCBTYWZhcmkgVmVyc2lvbiA2LjAuNSAoODUzNi4zMC4xKSBpbnRlcm1pdHRlbnRseSBjYW5ub3QgY3JlYXRlXG4gICAgICAgIC8vIHdvcmtpbmcgbWVzc2FnZSBwb3J0cyB0aGUgZmlyc3QgdGltZSBhIHBhZ2UgbG9hZHMuXG4gICAgICAgIGNoYW5uZWwucG9ydDEub25tZXNzYWdlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmVxdWVzdFRpY2sgPSByZXF1ZXN0UG9ydFRpY2s7XG4gICAgICAgICAgICBjaGFubmVsLnBvcnQxLm9ubWVzc2FnZSA9IGZsdXNoO1xuICAgICAgICAgICAgZmx1c2goKTtcbiAgICAgICAgfTtcbiAgICAgICAgdmFyIHJlcXVlc3RQb3J0VGljayA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIC8vIE9wZXJhIHJlcXVpcmVzIHVzIHRvIHByb3ZpZGUgYSBtZXNzYWdlIHBheWxvYWQsIHJlZ2FyZGxlc3Mgb2ZcbiAgICAgICAgICAgIC8vIHdoZXRoZXIgd2UgdXNlIGl0LlxuICAgICAgICAgICAgY2hhbm5lbC5wb3J0Mi5wb3N0TWVzc2FnZSgwKTtcbiAgICAgICAgfTtcbiAgICAgICAgcmVxdWVzdFRpY2sgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBzZXRUaW1lb3V0KGZsdXNoLCAwKTtcbiAgICAgICAgICAgIHJlcXVlc3RQb3J0VGljaygpO1xuICAgICAgICB9O1xuXG4gICAgfSBlbHNlIHtcbiAgICAgICAgLy8gb2xkIGJyb3dzZXJzXG4gICAgICAgIHJlcXVlc3RUaWNrID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgc2V0VGltZW91dChmbHVzaCwgMCk7XG4gICAgICAgIH07XG4gICAgfVxuICAgIC8vIHJ1bnMgYSB0YXNrIGFmdGVyIGFsbCBvdGhlciB0YXNrcyBoYXZlIGJlZW4gcnVuXG4gICAgLy8gdGhpcyBpcyB1c2VmdWwgZm9yIHVuaGFuZGxlZCByZWplY3Rpb24gdHJhY2tpbmcgdGhhdCBuZWVkcyB0byBoYXBwZW5cbiAgICAvLyBhZnRlciBhbGwgYHRoZW5gZCB0YXNrcyBoYXZlIGJlZW4gcnVuLlxuICAgIG5leHRUaWNrLnJ1bkFmdGVyID0gZnVuY3Rpb24gKHRhc2spIHtcbiAgICAgICAgbGF0ZXJRdWV1ZS5wdXNoKHRhc2spO1xuICAgICAgICBpZiAoIWZsdXNoaW5nKSB7XG4gICAgICAgICAgICBmbHVzaGluZyA9IHRydWU7XG4gICAgICAgICAgICByZXF1ZXN0VGljaygpO1xuICAgICAgICB9XG4gICAgfTtcbiAgICByZXR1cm4gbmV4dFRpY2s7XG59KSgpO1xuXG4vLyBBdHRlbXB0IHRvIG1ha2UgZ2VuZXJpY3Mgc2FmZSBpbiB0aGUgZmFjZSBvZiBkb3duc3RyZWFtXG4vLyBtb2RpZmljYXRpb25zLlxuLy8gVGhlcmUgaXMgbm8gc2l0dWF0aW9uIHdoZXJlIHRoaXMgaXMgbmVjZXNzYXJ5LlxuLy8gSWYgeW91IG5lZWQgYSBzZWN1cml0eSBndWFyYW50ZWUsIHRoZXNlIHByaW1vcmRpYWxzIG5lZWQgdG8gYmVcbi8vIGRlZXBseSBmcm96ZW4gYW55d2F5LCBhbmQgaWYgeW91IGRvbuKAmXQgbmVlZCBhIHNlY3VyaXR5IGd1YXJhbnRlZSxcbi8vIHRoaXMgaXMganVzdCBwbGFpbiBwYXJhbm9pZC5cbi8vIEhvd2V2ZXIsIHRoaXMgKiptaWdodCoqIGhhdmUgdGhlIG5pY2Ugc2lkZS1lZmZlY3Qgb2YgcmVkdWNpbmcgdGhlIHNpemUgb2Zcbi8vIHRoZSBtaW5pZmllZCBjb2RlIGJ5IHJlZHVjaW5nIHguY2FsbCgpIHRvIG1lcmVseSB4KClcbi8vIFNlZSBNYXJrIE1pbGxlcuKAmXMgZXhwbGFuYXRpb24gb2Ygd2hhdCB0aGlzIGRvZXMuXG4vLyBodHRwOi8vd2lraS5lY21hc2NyaXB0Lm9yZy9kb2t1LnBocD9pZD1jb252ZW50aW9uczpzYWZlX21ldGFfcHJvZ3JhbW1pbmdcbnZhciBjYWxsID0gRnVuY3Rpb24uY2FsbDtcbmZ1bmN0aW9uIHVuY3VycnlUaGlzKGYpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gY2FsbC5hcHBseShmLCBhcmd1bWVudHMpO1xuICAgIH07XG59XG4vLyBUaGlzIGlzIGVxdWl2YWxlbnQsIGJ1dCBzbG93ZXI6XG4vLyB1bmN1cnJ5VGhpcyA9IEZ1bmN0aW9uX2JpbmQuYmluZChGdW5jdGlvbl9iaW5kLmNhbGwpO1xuLy8gaHR0cDovL2pzcGVyZi5jb20vdW5jdXJyeXRoaXNcblxudmFyIGFycmF5X3NsaWNlID0gdW5jdXJyeVRoaXMoQXJyYXkucHJvdG90eXBlLnNsaWNlKTtcblxudmFyIGFycmF5X3JlZHVjZSA9IHVuY3VycnlUaGlzKFxuICAgIEFycmF5LnByb3RvdHlwZS5yZWR1Y2UgfHwgZnVuY3Rpb24gKGNhbGxiYWNrLCBiYXNpcykge1xuICAgICAgICB2YXIgaW5kZXggPSAwLFxuICAgICAgICAgICAgbGVuZ3RoID0gdGhpcy5sZW5ndGg7XG4gICAgICAgIC8vIGNvbmNlcm5pbmcgdGhlIGluaXRpYWwgdmFsdWUsIGlmIG9uZSBpcyBub3QgcHJvdmlkZWRcbiAgICAgICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICAgIC8vIHNlZWsgdG8gdGhlIGZpcnN0IHZhbHVlIGluIHRoZSBhcnJheSwgYWNjb3VudGluZ1xuICAgICAgICAgICAgLy8gZm9yIHRoZSBwb3NzaWJpbGl0eSB0aGF0IGlzIGlzIGEgc3BhcnNlIGFycmF5XG4gICAgICAgICAgICBkbyB7XG4gICAgICAgICAgICAgICAgaWYgKGluZGV4IGluIHRoaXMpIHtcbiAgICAgICAgICAgICAgICAgICAgYmFzaXMgPSB0aGlzW2luZGV4KytdO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKCsraW5kZXggPj0gbGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IHdoaWxlICgxKTtcbiAgICAgICAgfVxuICAgICAgICAvLyByZWR1Y2VcbiAgICAgICAgZm9yICg7IGluZGV4IDwgbGVuZ3RoOyBpbmRleCsrKSB7XG4gICAgICAgICAgICAvLyBhY2NvdW50IGZvciB0aGUgcG9zc2liaWxpdHkgdGhhdCB0aGUgYXJyYXkgaXMgc3BhcnNlXG4gICAgICAgICAgICBpZiAoaW5kZXggaW4gdGhpcykge1xuICAgICAgICAgICAgICAgIGJhc2lzID0gY2FsbGJhY2soYmFzaXMsIHRoaXNbaW5kZXhdLCBpbmRleCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGJhc2lzO1xuICAgIH1cbik7XG5cbnZhciBhcnJheV9pbmRleE9mID0gdW5jdXJyeVRoaXMoXG4gICAgQXJyYXkucHJvdG90eXBlLmluZGV4T2YgfHwgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgIC8vIG5vdCBhIHZlcnkgZ29vZCBzaGltLCBidXQgZ29vZCBlbm91Z2ggZm9yIG91ciBvbmUgdXNlIG9mIGl0XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgaWYgKHRoaXNbaV0gPT09IHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIC0xO1xuICAgIH1cbik7XG5cbnZhciBhcnJheV9tYXAgPSB1bmN1cnJ5VGhpcyhcbiAgICBBcnJheS5wcm90b3R5cGUubWFwIHx8IGZ1bmN0aW9uIChjYWxsYmFjaywgdGhpc3ApIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgY29sbGVjdCA9IFtdO1xuICAgICAgICBhcnJheV9yZWR1Y2Uoc2VsZiwgZnVuY3Rpb24gKHVuZGVmaW5lZCwgdmFsdWUsIGluZGV4KSB7XG4gICAgICAgICAgICBjb2xsZWN0LnB1c2goY2FsbGJhY2suY2FsbCh0aGlzcCwgdmFsdWUsIGluZGV4LCBzZWxmKSk7XG4gICAgICAgIH0sIHZvaWQgMCk7XG4gICAgICAgIHJldHVybiBjb2xsZWN0O1xuICAgIH1cbik7XG5cbnZhciBvYmplY3RfY3JlYXRlID0gT2JqZWN0LmNyZWF0ZSB8fCBmdW5jdGlvbiAocHJvdG90eXBlKSB7XG4gICAgZnVuY3Rpb24gVHlwZSgpIHsgfVxuICAgIFR5cGUucHJvdG90eXBlID0gcHJvdG90eXBlO1xuICAgIHJldHVybiBuZXcgVHlwZSgpO1xufTtcblxudmFyIG9iamVjdF9oYXNPd25Qcm9wZXJ0eSA9IHVuY3VycnlUaGlzKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkpO1xuXG52YXIgb2JqZWN0X2tleXMgPSBPYmplY3Qua2V5cyB8fCBmdW5jdGlvbiAob2JqZWN0KSB7XG4gICAgdmFyIGtleXMgPSBbXTtcbiAgICBmb3IgKHZhciBrZXkgaW4gb2JqZWN0KSB7XG4gICAgICAgIGlmIChvYmplY3RfaGFzT3duUHJvcGVydHkob2JqZWN0LCBrZXkpKSB7XG4gICAgICAgICAgICBrZXlzLnB1c2goa2V5KTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4ga2V5cztcbn07XG5cbnZhciBvYmplY3RfdG9TdHJpbmcgPSB1bmN1cnJ5VGhpcyhPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nKTtcblxuZnVuY3Rpb24gaXNPYmplY3QodmFsdWUpIHtcbiAgICByZXR1cm4gdmFsdWUgPT09IE9iamVjdCh2YWx1ZSk7XG59XG5cbi8vIGdlbmVyYXRvciByZWxhdGVkIHNoaW1zXG5cbi8vIEZJWE1FOiBSZW1vdmUgdGhpcyBmdW5jdGlvbiBvbmNlIEVTNiBnZW5lcmF0b3JzIGFyZSBpbiBTcGlkZXJNb25rZXkuXG5mdW5jdGlvbiBpc1N0b3BJdGVyYXRpb24oZXhjZXB0aW9uKSB7XG4gICAgcmV0dXJuIChcbiAgICAgICAgb2JqZWN0X3RvU3RyaW5nKGV4Y2VwdGlvbikgPT09IFwiW29iamVjdCBTdG9wSXRlcmF0aW9uXVwiIHx8XG4gICAgICAgIGV4Y2VwdGlvbiBpbnN0YW5jZW9mIFFSZXR1cm5WYWx1ZVxuICAgICk7XG59XG5cbi8vIEZJWE1FOiBSZW1vdmUgdGhpcyBoZWxwZXIgYW5kIFEucmV0dXJuIG9uY2UgRVM2IGdlbmVyYXRvcnMgYXJlIGluXG4vLyBTcGlkZXJNb25rZXkuXG52YXIgUVJldHVyblZhbHVlO1xuaWYgKHR5cGVvZiBSZXR1cm5WYWx1ZSAhPT0gXCJ1bmRlZmluZWRcIikge1xuICAgIFFSZXR1cm5WYWx1ZSA9IFJldHVyblZhbHVlO1xufSBlbHNlIHtcbiAgICBRUmV0dXJuVmFsdWUgPSBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgdGhpcy52YWx1ZSA9IHZhbHVlO1xuICAgIH07XG59XG5cbi8vIGxvbmcgc3RhY2sgdHJhY2VzXG5cbnZhciBTVEFDS19KVU1QX1NFUEFSQVRPUiA9IFwiRnJvbSBwcmV2aW91cyBldmVudDpcIjtcblxuZnVuY3Rpb24gbWFrZVN0YWNrVHJhY2VMb25nKGVycm9yLCBwcm9taXNlKSB7XG4gICAgLy8gSWYgcG9zc2libGUsIHRyYW5zZm9ybSB0aGUgZXJyb3Igc3RhY2sgdHJhY2UgYnkgcmVtb3ZpbmcgTm9kZSBhbmQgUVxuICAgIC8vIGNydWZ0LCB0aGVuIGNvbmNhdGVuYXRpbmcgd2l0aCB0aGUgc3RhY2sgdHJhY2Ugb2YgYHByb21pc2VgLiBTZWUgIzU3LlxuICAgIGlmIChoYXNTdGFja3MgJiZcbiAgICAgICAgcHJvbWlzZS5zdGFjayAmJlxuICAgICAgICB0eXBlb2YgZXJyb3IgPT09IFwib2JqZWN0XCIgJiZcbiAgICAgICAgZXJyb3IgIT09IG51bGwgJiZcbiAgICAgICAgZXJyb3Iuc3RhY2sgJiZcbiAgICAgICAgZXJyb3Iuc3RhY2suaW5kZXhPZihTVEFDS19KVU1QX1NFUEFSQVRPUikgPT09IC0xXG4gICAgKSB7XG4gICAgICAgIHZhciBzdGFja3MgPSBbXTtcbiAgICAgICAgZm9yICh2YXIgcCA9IHByb21pc2U7ICEhcDsgcCA9IHAuc291cmNlKSB7XG4gICAgICAgICAgICBpZiAocC5zdGFjaykge1xuICAgICAgICAgICAgICAgIHN0YWNrcy51bnNoaWZ0KHAuc3RhY2spO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHN0YWNrcy51bnNoaWZ0KGVycm9yLnN0YWNrKTtcblxuICAgICAgICB2YXIgY29uY2F0ZWRTdGFja3MgPSBzdGFja3Muam9pbihcIlxcblwiICsgU1RBQ0tfSlVNUF9TRVBBUkFUT1IgKyBcIlxcblwiKTtcbiAgICAgICAgZXJyb3Iuc3RhY2sgPSBmaWx0ZXJTdGFja1N0cmluZyhjb25jYXRlZFN0YWNrcyk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBmaWx0ZXJTdGFja1N0cmluZyhzdGFja1N0cmluZykge1xuICAgIHZhciBsaW5lcyA9IHN0YWNrU3RyaW5nLnNwbGl0KFwiXFxuXCIpO1xuICAgIHZhciBkZXNpcmVkTGluZXMgPSBbXTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxpbmVzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgIHZhciBsaW5lID0gbGluZXNbaV07XG5cbiAgICAgICAgaWYgKCFpc0ludGVybmFsRnJhbWUobGluZSkgJiYgIWlzTm9kZUZyYW1lKGxpbmUpICYmIGxpbmUpIHtcbiAgICAgICAgICAgIGRlc2lyZWRMaW5lcy5wdXNoKGxpbmUpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBkZXNpcmVkTGluZXMuam9pbihcIlxcblwiKTtcbn1cblxuZnVuY3Rpb24gaXNOb2RlRnJhbWUoc3RhY2tMaW5lKSB7XG4gICAgcmV0dXJuIHN0YWNrTGluZS5pbmRleE9mKFwiKG1vZHVsZS5qczpcIikgIT09IC0xIHx8XG4gICAgICAgICAgIHN0YWNrTGluZS5pbmRleE9mKFwiKG5vZGUuanM6XCIpICE9PSAtMTtcbn1cblxuZnVuY3Rpb24gZ2V0RmlsZU5hbWVBbmRMaW5lTnVtYmVyKHN0YWNrTGluZSkge1xuICAgIC8vIE5hbWVkIGZ1bmN0aW9uczogXCJhdCBmdW5jdGlvbk5hbWUgKGZpbGVuYW1lOmxpbmVOdW1iZXI6Y29sdW1uTnVtYmVyKVwiXG4gICAgLy8gSW4gSUUxMCBmdW5jdGlvbiBuYW1lIGNhbiBoYXZlIHNwYWNlcyAoXCJBbm9ueW1vdXMgZnVuY3Rpb25cIikgT19vXG4gICAgdmFyIGF0dGVtcHQxID0gL2F0IC4rIFxcKCguKyk6KFxcZCspOig/OlxcZCspXFwpJC8uZXhlYyhzdGFja0xpbmUpO1xuICAgIGlmIChhdHRlbXB0MSkge1xuICAgICAgICByZXR1cm4gW2F0dGVtcHQxWzFdLCBOdW1iZXIoYXR0ZW1wdDFbMl0pXTtcbiAgICB9XG5cbiAgICAvLyBBbm9ueW1vdXMgZnVuY3Rpb25zOiBcImF0IGZpbGVuYW1lOmxpbmVOdW1iZXI6Y29sdW1uTnVtYmVyXCJcbiAgICB2YXIgYXR0ZW1wdDIgPSAvYXQgKFteIF0rKTooXFxkKyk6KD86XFxkKykkLy5leGVjKHN0YWNrTGluZSk7XG4gICAgaWYgKGF0dGVtcHQyKSB7XG4gICAgICAgIHJldHVybiBbYXR0ZW1wdDJbMV0sIE51bWJlcihhdHRlbXB0MlsyXSldO1xuICAgIH1cblxuICAgIC8vIEZpcmVmb3ggc3R5bGU6IFwiZnVuY3Rpb25AZmlsZW5hbWU6bGluZU51bWJlciBvciBAZmlsZW5hbWU6bGluZU51bWJlclwiXG4gICAgdmFyIGF0dGVtcHQzID0gLy4qQCguKyk6KFxcZCspJC8uZXhlYyhzdGFja0xpbmUpO1xuICAgIGlmIChhdHRlbXB0Mykge1xuICAgICAgICByZXR1cm4gW2F0dGVtcHQzWzFdLCBOdW1iZXIoYXR0ZW1wdDNbMl0pXTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGlzSW50ZXJuYWxGcmFtZShzdGFja0xpbmUpIHtcbiAgICB2YXIgZmlsZU5hbWVBbmRMaW5lTnVtYmVyID0gZ2V0RmlsZU5hbWVBbmRMaW5lTnVtYmVyKHN0YWNrTGluZSk7XG5cbiAgICBpZiAoIWZpbGVOYW1lQW5kTGluZU51bWJlcikge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgdmFyIGZpbGVOYW1lID0gZmlsZU5hbWVBbmRMaW5lTnVtYmVyWzBdO1xuICAgIHZhciBsaW5lTnVtYmVyID0gZmlsZU5hbWVBbmRMaW5lTnVtYmVyWzFdO1xuXG4gICAgcmV0dXJuIGZpbGVOYW1lID09PSBxRmlsZU5hbWUgJiZcbiAgICAgICAgbGluZU51bWJlciA+PSBxU3RhcnRpbmdMaW5lICYmXG4gICAgICAgIGxpbmVOdW1iZXIgPD0gcUVuZGluZ0xpbmU7XG59XG5cbi8vIGRpc2NvdmVyIG93biBmaWxlIG5hbWUgYW5kIGxpbmUgbnVtYmVyIHJhbmdlIGZvciBmaWx0ZXJpbmcgc3RhY2tcbi8vIHRyYWNlc1xuZnVuY3Rpb24gY2FwdHVyZUxpbmUoKSB7XG4gICAgaWYgKCFoYXNTdGFja3MpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRyeSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcigpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgdmFyIGxpbmVzID0gZS5zdGFjay5zcGxpdChcIlxcblwiKTtcbiAgICAgICAgdmFyIGZpcnN0TGluZSA9IGxpbmVzWzBdLmluZGV4T2YoXCJAXCIpID4gMCA/IGxpbmVzWzFdIDogbGluZXNbMl07XG4gICAgICAgIHZhciBmaWxlTmFtZUFuZExpbmVOdW1iZXIgPSBnZXRGaWxlTmFtZUFuZExpbmVOdW1iZXIoZmlyc3RMaW5lKTtcbiAgICAgICAgaWYgKCFmaWxlTmFtZUFuZExpbmVOdW1iZXIpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHFGaWxlTmFtZSA9IGZpbGVOYW1lQW5kTGluZU51bWJlclswXTtcbiAgICAgICAgcmV0dXJuIGZpbGVOYW1lQW5kTGluZU51bWJlclsxXTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGRlcHJlY2F0ZShjYWxsYmFjaywgbmFtZSwgYWx0ZXJuYXRpdmUpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAodHlwZW9mIGNvbnNvbGUgIT09IFwidW5kZWZpbmVkXCIgJiZcbiAgICAgICAgICAgIHR5cGVvZiBjb25zb2xlLndhcm4gPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICAgICAgY29uc29sZS53YXJuKG5hbWUgKyBcIiBpcyBkZXByZWNhdGVkLCB1c2UgXCIgKyBhbHRlcm5hdGl2ZSArXG4gICAgICAgICAgICAgICAgICAgICAgICAgXCIgaW5zdGVhZC5cIiwgbmV3IEVycm9yKFwiXCIpLnN0YWNrKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY2FsbGJhY2suYXBwbHkoY2FsbGJhY2ssIGFyZ3VtZW50cyk7XG4gICAgfTtcbn1cblxuLy8gZW5kIG9mIHNoaW1zXG4vLyBiZWdpbm5pbmcgb2YgcmVhbCB3b3JrXG5cbi8qKlxuICogQ29uc3RydWN0cyBhIHByb21pc2UgZm9yIGFuIGltbWVkaWF0ZSByZWZlcmVuY2UsIHBhc3NlcyBwcm9taXNlcyB0aHJvdWdoLCBvclxuICogY29lcmNlcyBwcm9taXNlcyBmcm9tIGRpZmZlcmVudCBzeXN0ZW1zLlxuICogQHBhcmFtIHZhbHVlIGltbWVkaWF0ZSByZWZlcmVuY2Ugb3IgcHJvbWlzZVxuICovXG5mdW5jdGlvbiBRKHZhbHVlKSB7XG4gICAgLy8gSWYgdGhlIG9iamVjdCBpcyBhbHJlYWR5IGEgUHJvbWlzZSwgcmV0dXJuIGl0IGRpcmVjdGx5LiAgVGhpcyBlbmFibGVzXG4gICAgLy8gdGhlIHJlc29sdmUgZnVuY3Rpb24gdG8gYm90aCBiZSB1c2VkIHRvIGNyZWF0ZWQgcmVmZXJlbmNlcyBmcm9tIG9iamVjdHMsXG4gICAgLy8gYnV0IHRvIHRvbGVyYWJseSBjb2VyY2Ugbm9uLXByb21pc2VzIHRvIHByb21pc2VzLlxuICAgIGlmICh2YWx1ZSBpbnN0YW5jZW9mIFByb21pc2UpIHtcbiAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH1cblxuICAgIC8vIGFzc2ltaWxhdGUgdGhlbmFibGVzXG4gICAgaWYgKGlzUHJvbWlzZUFsaWtlKHZhbHVlKSkge1xuICAgICAgICByZXR1cm4gY29lcmNlKHZhbHVlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gZnVsZmlsbCh2YWx1ZSk7XG4gICAgfVxufVxuUS5yZXNvbHZlID0gUTtcblxuLyoqXG4gKiBQZXJmb3JtcyBhIHRhc2sgaW4gYSBmdXR1cmUgdHVybiBvZiB0aGUgZXZlbnQgbG9vcC5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IHRhc2tcbiAqL1xuUS5uZXh0VGljayA9IG5leHRUaWNrO1xuXG4vKipcbiAqIENvbnRyb2xzIHdoZXRoZXIgb3Igbm90IGxvbmcgc3RhY2sgdHJhY2VzIHdpbGwgYmUgb25cbiAqL1xuUS5sb25nU3RhY2tTdXBwb3J0ID0gZmFsc2U7XG5cbi8vIGVuYWJsZSBsb25nIHN0YWNrcyBpZiBRX0RFQlVHIGlzIHNldFxuaWYgKHR5cGVvZiBwcm9jZXNzID09PSBcIm9iamVjdFwiICYmIHByb2Nlc3MgJiYgcHJvY2Vzcy5lbnYgJiYgcHJvY2Vzcy5lbnYuUV9ERUJVRykge1xuICAgIFEubG9uZ1N0YWNrU3VwcG9ydCA9IHRydWU7XG59XG5cbi8qKlxuICogQ29uc3RydWN0cyBhIHtwcm9taXNlLCByZXNvbHZlLCByZWplY3R9IG9iamVjdC5cbiAqXG4gKiBgcmVzb2x2ZWAgaXMgYSBjYWxsYmFjayB0byBpbnZva2Ugd2l0aCBhIG1vcmUgcmVzb2x2ZWQgdmFsdWUgZm9yIHRoZVxuICogcHJvbWlzZS4gVG8gZnVsZmlsbCB0aGUgcHJvbWlzZSwgaW52b2tlIGByZXNvbHZlYCB3aXRoIGFueSB2YWx1ZSB0aGF0IGlzXG4gKiBub3QgYSB0aGVuYWJsZS4gVG8gcmVqZWN0IHRoZSBwcm9taXNlLCBpbnZva2UgYHJlc29sdmVgIHdpdGggYSByZWplY3RlZFxuICogdGhlbmFibGUsIG9yIGludm9rZSBgcmVqZWN0YCB3aXRoIHRoZSByZWFzb24gZGlyZWN0bHkuIFRvIHJlc29sdmUgdGhlXG4gKiBwcm9taXNlIHRvIGFub3RoZXIgdGhlbmFibGUsIHRodXMgcHV0dGluZyBpdCBpbiB0aGUgc2FtZSBzdGF0ZSwgaW52b2tlXG4gKiBgcmVzb2x2ZWAgd2l0aCB0aGF0IG90aGVyIHRoZW5hYmxlLlxuICovXG5RLmRlZmVyID0gZGVmZXI7XG5mdW5jdGlvbiBkZWZlcigpIHtcbiAgICAvLyBpZiBcIm1lc3NhZ2VzXCIgaXMgYW4gXCJBcnJheVwiLCB0aGF0IGluZGljYXRlcyB0aGF0IHRoZSBwcm9taXNlIGhhcyBub3QgeWV0XG4gICAgLy8gYmVlbiByZXNvbHZlZC4gIElmIGl0IGlzIFwidW5kZWZpbmVkXCIsIGl0IGhhcyBiZWVuIHJlc29sdmVkLiAgRWFjaFxuICAgIC8vIGVsZW1lbnQgb2YgdGhlIG1lc3NhZ2VzIGFycmF5IGlzIGl0c2VsZiBhbiBhcnJheSBvZiBjb21wbGV0ZSBhcmd1bWVudHMgdG9cbiAgICAvLyBmb3J3YXJkIHRvIHRoZSByZXNvbHZlZCBwcm9taXNlLiAgV2UgY29lcmNlIHRoZSByZXNvbHV0aW9uIHZhbHVlIHRvIGFcbiAgICAvLyBwcm9taXNlIHVzaW5nIHRoZSBgcmVzb2x2ZWAgZnVuY3Rpb24gYmVjYXVzZSBpdCBoYW5kbGVzIGJvdGggZnVsbHlcbiAgICAvLyBub24tdGhlbmFibGUgdmFsdWVzIGFuZCBvdGhlciB0aGVuYWJsZXMgZ3JhY2VmdWxseS5cbiAgICB2YXIgbWVzc2FnZXMgPSBbXSwgcHJvZ3Jlc3NMaXN0ZW5lcnMgPSBbXSwgcmVzb2x2ZWRQcm9taXNlO1xuXG4gICAgdmFyIGRlZmVycmVkID0gb2JqZWN0X2NyZWF0ZShkZWZlci5wcm90b3R5cGUpO1xuICAgIHZhciBwcm9taXNlID0gb2JqZWN0X2NyZWF0ZShQcm9taXNlLnByb3RvdHlwZSk7XG5cbiAgICBwcm9taXNlLnByb21pc2VEaXNwYXRjaCA9IGZ1bmN0aW9uIChyZXNvbHZlLCBvcCwgb3BlcmFuZHMpIHtcbiAgICAgICAgdmFyIGFyZ3MgPSBhcnJheV9zbGljZShhcmd1bWVudHMpO1xuICAgICAgICBpZiAobWVzc2FnZXMpIHtcbiAgICAgICAgICAgIG1lc3NhZ2VzLnB1c2goYXJncyk7XG4gICAgICAgICAgICBpZiAob3AgPT09IFwid2hlblwiICYmIG9wZXJhbmRzWzFdKSB7IC8vIHByb2dyZXNzIG9wZXJhbmRcbiAgICAgICAgICAgICAgICBwcm9ncmVzc0xpc3RlbmVycy5wdXNoKG9wZXJhbmRzWzFdKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIFEubmV4dFRpY2soZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHJlc29sdmVkUHJvbWlzZS5wcm9taXNlRGlzcGF0Y2guYXBwbHkocmVzb2x2ZWRQcm9taXNlLCBhcmdzKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIC8vIFhYWCBkZXByZWNhdGVkXG4gICAgcHJvbWlzZS52YWx1ZU9mID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAobWVzc2FnZXMpIHtcbiAgICAgICAgICAgIHJldHVybiBwcm9taXNlO1xuICAgICAgICB9XG4gICAgICAgIHZhciBuZWFyZXJWYWx1ZSA9IG5lYXJlcihyZXNvbHZlZFByb21pc2UpO1xuICAgICAgICBpZiAoaXNQcm9taXNlKG5lYXJlclZhbHVlKSkge1xuICAgICAgICAgICAgcmVzb2x2ZWRQcm9taXNlID0gbmVhcmVyVmFsdWU7IC8vIHNob3J0ZW4gY2hhaW5cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmVhcmVyVmFsdWU7XG4gICAgfTtcblxuICAgIHByb21pc2UuaW5zcGVjdCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKCFyZXNvbHZlZFByb21pc2UpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN0YXRlOiBcInBlbmRpbmdcIiB9O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXNvbHZlZFByb21pc2UuaW5zcGVjdCgpO1xuICAgIH07XG5cbiAgICBpZiAoUS5sb25nU3RhY2tTdXBwb3J0ICYmIGhhc1N0YWNrcykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIC8vIE5PVEU6IGRvbid0IHRyeSB0byB1c2UgYEVycm9yLmNhcHR1cmVTdGFja1RyYWNlYCBvciB0cmFuc2ZlciB0aGVcbiAgICAgICAgICAgIC8vIGFjY2Vzc29yIGFyb3VuZDsgdGhhdCBjYXVzZXMgbWVtb3J5IGxlYWtzIGFzIHBlciBHSC0xMTEuIEp1c3RcbiAgICAgICAgICAgIC8vIHJlaWZ5IHRoZSBzdGFjayB0cmFjZSBhcyBhIHN0cmluZyBBU0FQLlxuICAgICAgICAgICAgLy9cbiAgICAgICAgICAgIC8vIEF0IHRoZSBzYW1lIHRpbWUsIGN1dCBvZmYgdGhlIGZpcnN0IGxpbmU7IGl0J3MgYWx3YXlzIGp1c3RcbiAgICAgICAgICAgIC8vIFwiW29iamVjdCBQcm9taXNlXVxcblwiLCBhcyBwZXIgdGhlIGB0b1N0cmluZ2AuXG4gICAgICAgICAgICBwcm9taXNlLnN0YWNrID0gZS5zdGFjay5zdWJzdHJpbmcoZS5zdGFjay5pbmRleE9mKFwiXFxuXCIpICsgMSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBOT1RFOiB3ZSBkbyB0aGUgY2hlY2tzIGZvciBgcmVzb2x2ZWRQcm9taXNlYCBpbiBlYWNoIG1ldGhvZCwgaW5zdGVhZCBvZlxuICAgIC8vIGNvbnNvbGlkYXRpbmcgdGhlbSBpbnRvIGBiZWNvbWVgLCBzaW5jZSBvdGhlcndpc2Ugd2UnZCBjcmVhdGUgbmV3XG4gICAgLy8gcHJvbWlzZXMgd2l0aCB0aGUgbGluZXMgYGJlY29tZSh3aGF0ZXZlcih2YWx1ZSkpYC4gU2VlIGUuZy4gR0gtMjUyLlxuXG4gICAgZnVuY3Rpb24gYmVjb21lKG5ld1Byb21pc2UpIHtcbiAgICAgICAgcmVzb2x2ZWRQcm9taXNlID0gbmV3UHJvbWlzZTtcbiAgICAgICAgcHJvbWlzZS5zb3VyY2UgPSBuZXdQcm9taXNlO1xuXG4gICAgICAgIGFycmF5X3JlZHVjZShtZXNzYWdlcywgZnVuY3Rpb24gKHVuZGVmaW5lZCwgbWVzc2FnZSkge1xuICAgICAgICAgICAgUS5uZXh0VGljayhmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgbmV3UHJvbWlzZS5wcm9taXNlRGlzcGF0Y2guYXBwbHkobmV3UHJvbWlzZSwgbWVzc2FnZSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSwgdm9pZCAwKTtcblxuICAgICAgICBtZXNzYWdlcyA9IHZvaWQgMDtcbiAgICAgICAgcHJvZ3Jlc3NMaXN0ZW5lcnMgPSB2b2lkIDA7XG4gICAgfVxuXG4gICAgZGVmZXJyZWQucHJvbWlzZSA9IHByb21pc2U7XG4gICAgZGVmZXJyZWQucmVzb2x2ZSA9IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICBpZiAocmVzb2x2ZWRQcm9taXNlKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBiZWNvbWUoUSh2YWx1ZSkpO1xuICAgIH07XG5cbiAgICBkZWZlcnJlZC5mdWxmaWxsID0gZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgIGlmIChyZXNvbHZlZFByb21pc2UpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGJlY29tZShmdWxmaWxsKHZhbHVlKSk7XG4gICAgfTtcbiAgICBkZWZlcnJlZC5yZWplY3QgPSBmdW5jdGlvbiAocmVhc29uKSB7XG4gICAgICAgIGlmIChyZXNvbHZlZFByb21pc2UpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGJlY29tZShyZWplY3QocmVhc29uKSk7XG4gICAgfTtcbiAgICBkZWZlcnJlZC5ub3RpZnkgPSBmdW5jdGlvbiAocHJvZ3Jlc3MpIHtcbiAgICAgICAgaWYgKHJlc29sdmVkUHJvbWlzZSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgYXJyYXlfcmVkdWNlKHByb2dyZXNzTGlzdGVuZXJzLCBmdW5jdGlvbiAodW5kZWZpbmVkLCBwcm9ncmVzc0xpc3RlbmVyKSB7XG4gICAgICAgICAgICBRLm5leHRUaWNrKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBwcm9ncmVzc0xpc3RlbmVyKHByb2dyZXNzKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9LCB2b2lkIDApO1xuICAgIH07XG5cbiAgICByZXR1cm4gZGVmZXJyZWQ7XG59XG5cbi8qKlxuICogQ3JlYXRlcyBhIE5vZGUtc3R5bGUgY2FsbGJhY2sgdGhhdCB3aWxsIHJlc29sdmUgb3IgcmVqZWN0IHRoZSBkZWZlcnJlZFxuICogcHJvbWlzZS5cbiAqIEByZXR1cm5zIGEgbm9kZWJhY2tcbiAqL1xuZGVmZXIucHJvdG90eXBlLm1ha2VOb2RlUmVzb2x2ZXIgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHJldHVybiBmdW5jdGlvbiAoZXJyb3IsIHZhbHVlKSB7XG4gICAgICAgIGlmIChlcnJvcikge1xuICAgICAgICAgICAgc2VsZi5yZWplY3QoZXJyb3IpO1xuICAgICAgICB9IGVsc2UgaWYgKGFyZ3VtZW50cy5sZW5ndGggPiAyKSB7XG4gICAgICAgICAgICBzZWxmLnJlc29sdmUoYXJyYXlfc2xpY2UoYXJndW1lbnRzLCAxKSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzZWxmLnJlc29sdmUodmFsdWUpO1xuICAgICAgICB9XG4gICAgfTtcbn07XG5cbi8qKlxuICogQHBhcmFtIHJlc29sdmVyIHtGdW5jdGlvbn0gYSBmdW5jdGlvbiB0aGF0IHJldHVybnMgbm90aGluZyBhbmQgYWNjZXB0c1xuICogdGhlIHJlc29sdmUsIHJlamVjdCwgYW5kIG5vdGlmeSBmdW5jdGlvbnMgZm9yIGEgZGVmZXJyZWQuXG4gKiBAcmV0dXJucyBhIHByb21pc2UgdGhhdCBtYXkgYmUgcmVzb2x2ZWQgd2l0aCB0aGUgZ2l2ZW4gcmVzb2x2ZSBhbmQgcmVqZWN0XG4gKiBmdW5jdGlvbnMsIG9yIHJlamVjdGVkIGJ5IGEgdGhyb3duIGV4Y2VwdGlvbiBpbiByZXNvbHZlclxuICovXG5RLlByb21pc2UgPSBwcm9taXNlOyAvLyBFUzZcblEucHJvbWlzZSA9IHByb21pc2U7XG5mdW5jdGlvbiBwcm9taXNlKHJlc29sdmVyKSB7XG4gICAgaWYgKHR5cGVvZiByZXNvbHZlciAhPT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJyZXNvbHZlciBtdXN0IGJlIGEgZnVuY3Rpb24uXCIpO1xuICAgIH1cbiAgICB2YXIgZGVmZXJyZWQgPSBkZWZlcigpO1xuICAgIHRyeSB7XG4gICAgICAgIHJlc29sdmVyKGRlZmVycmVkLnJlc29sdmUsIGRlZmVycmVkLnJlamVjdCwgZGVmZXJyZWQubm90aWZ5KTtcbiAgICB9IGNhdGNoIChyZWFzb24pIHtcbiAgICAgICAgZGVmZXJyZWQucmVqZWN0KHJlYXNvbik7XG4gICAgfVxuICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xufVxuXG5wcm9taXNlLnJhY2UgPSByYWNlOyAvLyBFUzZcbnByb21pc2UuYWxsID0gYWxsOyAvLyBFUzZcbnByb21pc2UucmVqZWN0ID0gcmVqZWN0OyAvLyBFUzZcbnByb21pc2UucmVzb2x2ZSA9IFE7IC8vIEVTNlxuXG4vLyBYWFggZXhwZXJpbWVudGFsLiAgVGhpcyBtZXRob2QgaXMgYSB3YXkgdG8gZGVub3RlIHRoYXQgYSBsb2NhbCB2YWx1ZSBpc1xuLy8gc2VyaWFsaXphYmxlIGFuZCBzaG91bGQgYmUgaW1tZWRpYXRlbHkgZGlzcGF0Y2hlZCB0byBhIHJlbW90ZSB1cG9uIHJlcXVlc3QsXG4vLyBpbnN0ZWFkIG9mIHBhc3NpbmcgYSByZWZlcmVuY2UuXG5RLnBhc3NCeUNvcHkgPSBmdW5jdGlvbiAob2JqZWN0KSB7XG4gICAgLy9mcmVlemUob2JqZWN0KTtcbiAgICAvL3Bhc3NCeUNvcGllcy5zZXQob2JqZWN0LCB0cnVlKTtcbiAgICByZXR1cm4gb2JqZWN0O1xufTtcblxuUHJvbWlzZS5wcm90b3R5cGUucGFzc0J5Q29weSA9IGZ1bmN0aW9uICgpIHtcbiAgICAvL2ZyZWV6ZShvYmplY3QpO1xuICAgIC8vcGFzc0J5Q29waWVzLnNldChvYmplY3QsIHRydWUpO1xuICAgIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBJZiB0d28gcHJvbWlzZXMgZXZlbnR1YWxseSBmdWxmaWxsIHRvIHRoZSBzYW1lIHZhbHVlLCBwcm9taXNlcyB0aGF0IHZhbHVlLFxuICogYnV0IG90aGVyd2lzZSByZWplY3RzLlxuICogQHBhcmFtIHgge0FueSp9XG4gKiBAcGFyYW0geSB7QW55Kn1cbiAqIEByZXR1cm5zIHtBbnkqfSBhIHByb21pc2UgZm9yIHggYW5kIHkgaWYgdGhleSBhcmUgdGhlIHNhbWUsIGJ1dCBhIHJlamVjdGlvblxuICogb3RoZXJ3aXNlLlxuICpcbiAqL1xuUS5qb2luID0gZnVuY3Rpb24gKHgsIHkpIHtcbiAgICByZXR1cm4gUSh4KS5qb2luKHkpO1xufTtcblxuUHJvbWlzZS5wcm90b3R5cGUuam9pbiA9IGZ1bmN0aW9uICh0aGF0KSB7XG4gICAgcmV0dXJuIFEoW3RoaXMsIHRoYXRdKS5zcHJlYWQoZnVuY3Rpb24gKHgsIHkpIHtcbiAgICAgICAgaWYgKHggPT09IHkpIHtcbiAgICAgICAgICAgIC8vIFRPRE86IFwiPT09XCIgc2hvdWxkIGJlIE9iamVjdC5pcyBvciBlcXVpdlxuICAgICAgICAgICAgcmV0dXJuIHg7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDYW4ndCBqb2luOiBub3QgdGhlIHNhbWU6IFwiICsgeCArIFwiIFwiICsgeSk7XG4gICAgICAgIH1cbiAgICB9KTtcbn07XG5cbi8qKlxuICogUmV0dXJucyBhIHByb21pc2UgZm9yIHRoZSBmaXJzdCBvZiBhbiBhcnJheSBvZiBwcm9taXNlcyB0byBiZWNvbWUgc2V0dGxlZC5cbiAqIEBwYXJhbSBhbnN3ZXJzIHtBcnJheVtBbnkqXX0gcHJvbWlzZXMgdG8gcmFjZVxuICogQHJldHVybnMge0FueSp9IHRoZSBmaXJzdCBwcm9taXNlIHRvIGJlIHNldHRsZWRcbiAqL1xuUS5yYWNlID0gcmFjZTtcbmZ1bmN0aW9uIHJhY2UoYW5zd2VyUHMpIHtcbiAgICByZXR1cm4gcHJvbWlzZShmdW5jdGlvbiAocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgICAgIC8vIFN3aXRjaCB0byB0aGlzIG9uY2Ugd2UgY2FuIGFzc3VtZSBhdCBsZWFzdCBFUzVcbiAgICAgICAgLy8gYW5zd2VyUHMuZm9yRWFjaChmdW5jdGlvbiAoYW5zd2VyUCkge1xuICAgICAgICAvLyAgICAgUShhbnN3ZXJQKS50aGVuKHJlc29sdmUsIHJlamVjdCk7XG4gICAgICAgIC8vIH0pO1xuICAgICAgICAvLyBVc2UgdGhpcyBpbiB0aGUgbWVhbnRpbWVcbiAgICAgICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IGFuc3dlclBzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgICBRKGFuc3dlclBzW2ldKS50aGVuKHJlc29sdmUsIHJlamVjdCk7XG4gICAgICAgIH1cbiAgICB9KTtcbn1cblxuUHJvbWlzZS5wcm90b3R5cGUucmFjZSA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy50aGVuKFEucmFjZSk7XG59O1xuXG4vKipcbiAqIENvbnN0cnVjdHMgYSBQcm9taXNlIHdpdGggYSBwcm9taXNlIGRlc2NyaXB0b3Igb2JqZWN0IGFuZCBvcHRpb25hbCBmYWxsYmFja1xuICogZnVuY3Rpb24uICBUaGUgZGVzY3JpcHRvciBjb250YWlucyBtZXRob2RzIGxpa2Ugd2hlbihyZWplY3RlZCksIGdldChuYW1lKSxcbiAqIHNldChuYW1lLCB2YWx1ZSksIHBvc3QobmFtZSwgYXJncyksIGFuZCBkZWxldGUobmFtZSksIHdoaWNoIGFsbFxuICogcmV0dXJuIGVpdGhlciBhIHZhbHVlLCBhIHByb21pc2UgZm9yIGEgdmFsdWUsIG9yIGEgcmVqZWN0aW9uLiAgVGhlIGZhbGxiYWNrXG4gKiBhY2NlcHRzIHRoZSBvcGVyYXRpb24gbmFtZSwgYSByZXNvbHZlciwgYW5kIGFueSBmdXJ0aGVyIGFyZ3VtZW50cyB0aGF0IHdvdWxkXG4gKiBoYXZlIGJlZW4gZm9yd2FyZGVkIHRvIHRoZSBhcHByb3ByaWF0ZSBtZXRob2QgYWJvdmUgaGFkIGEgbWV0aG9kIGJlZW5cbiAqIHByb3ZpZGVkIHdpdGggdGhlIHByb3BlciBuYW1lLiAgVGhlIEFQSSBtYWtlcyBubyBndWFyYW50ZWVzIGFib3V0IHRoZSBuYXR1cmVcbiAqIG9mIHRoZSByZXR1cm5lZCBvYmplY3QsIGFwYXJ0IGZyb20gdGhhdCBpdCBpcyB1c2FibGUgd2hlcmVldmVyIHByb21pc2VzIGFyZVxuICogYm91Z2h0IGFuZCBzb2xkLlxuICovXG5RLm1ha2VQcm9taXNlID0gUHJvbWlzZTtcbmZ1bmN0aW9uIFByb21pc2UoZGVzY3JpcHRvciwgZmFsbGJhY2ssIGluc3BlY3QpIHtcbiAgICBpZiAoZmFsbGJhY2sgPT09IHZvaWQgMCkge1xuICAgICAgICBmYWxsYmFjayA9IGZ1bmN0aW9uIChvcCkge1xuICAgICAgICAgICAgcmV0dXJuIHJlamVjdChuZXcgRXJyb3IoXG4gICAgICAgICAgICAgICAgXCJQcm9taXNlIGRvZXMgbm90IHN1cHBvcnQgb3BlcmF0aW9uOiBcIiArIG9wXG4gICAgICAgICAgICApKTtcbiAgICAgICAgfTtcbiAgICB9XG4gICAgaWYgKGluc3BlY3QgPT09IHZvaWQgMCkge1xuICAgICAgICBpbnNwZWN0ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHtzdGF0ZTogXCJ1bmtub3duXCJ9O1xuICAgICAgICB9O1xuICAgIH1cblxuICAgIHZhciBwcm9taXNlID0gb2JqZWN0X2NyZWF0ZShQcm9taXNlLnByb3RvdHlwZSk7XG5cbiAgICBwcm9taXNlLnByb21pc2VEaXNwYXRjaCA9IGZ1bmN0aW9uIChyZXNvbHZlLCBvcCwgYXJncykge1xuICAgICAgICB2YXIgcmVzdWx0O1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgaWYgKGRlc2NyaXB0b3Jbb3BdKSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0ID0gZGVzY3JpcHRvcltvcF0uYXBwbHkocHJvbWlzZSwgYXJncyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJlc3VsdCA9IGZhbGxiYWNrLmNhbGwocHJvbWlzZSwgb3AsIGFyZ3MpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChleGNlcHRpb24pIHtcbiAgICAgICAgICAgIHJlc3VsdCA9IHJlamVjdChleGNlcHRpb24pO1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXNvbHZlKSB7XG4gICAgICAgICAgICByZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgcHJvbWlzZS5pbnNwZWN0ID0gaW5zcGVjdDtcblxuICAgIC8vIFhYWCBkZXByZWNhdGVkIGB2YWx1ZU9mYCBhbmQgYGV4Y2VwdGlvbmAgc3VwcG9ydFxuICAgIGlmIChpbnNwZWN0KSB7XG4gICAgICAgIHZhciBpbnNwZWN0ZWQgPSBpbnNwZWN0KCk7XG4gICAgICAgIGlmIChpbnNwZWN0ZWQuc3RhdGUgPT09IFwicmVqZWN0ZWRcIikge1xuICAgICAgICAgICAgcHJvbWlzZS5leGNlcHRpb24gPSBpbnNwZWN0ZWQucmVhc29uO1xuICAgICAgICB9XG5cbiAgICAgICAgcHJvbWlzZS52YWx1ZU9mID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIGluc3BlY3RlZCA9IGluc3BlY3QoKTtcbiAgICAgICAgICAgIGlmIChpbnNwZWN0ZWQuc3RhdGUgPT09IFwicGVuZGluZ1wiIHx8XG4gICAgICAgICAgICAgICAgaW5zcGVjdGVkLnN0YXRlID09PSBcInJlamVjdGVkXCIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcHJvbWlzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBpbnNwZWN0ZWQudmFsdWU7XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgcmV0dXJuIHByb21pc2U7XG59XG5cblByb21pc2UucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiBcIltvYmplY3QgUHJvbWlzZV1cIjtcbn07XG5cblByb21pc2UucHJvdG90eXBlLnRoZW4gPSBmdW5jdGlvbiAoZnVsZmlsbGVkLCByZWplY3RlZCwgcHJvZ3Jlc3NlZCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICB2YXIgZGVmZXJyZWQgPSBkZWZlcigpO1xuICAgIHZhciBkb25lID0gZmFsc2U7ICAgLy8gZW5zdXJlIHRoZSB1bnRydXN0ZWQgcHJvbWlzZSBtYWtlcyBhdCBtb3N0IGFcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHNpbmdsZSBjYWxsIHRvIG9uZSBvZiB0aGUgY2FsbGJhY2tzXG5cbiAgICBmdW5jdGlvbiBfZnVsZmlsbGVkKHZhbHVlKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICByZXR1cm4gdHlwZW9mIGZ1bGZpbGxlZCA9PT0gXCJmdW5jdGlvblwiID8gZnVsZmlsbGVkKHZhbHVlKSA6IHZhbHVlO1xuICAgICAgICB9IGNhdGNoIChleGNlcHRpb24pIHtcbiAgICAgICAgICAgIHJldHVybiByZWplY3QoZXhjZXB0aW9uKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIF9yZWplY3RlZChleGNlcHRpb24pIHtcbiAgICAgICAgaWYgKHR5cGVvZiByZWplY3RlZCA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgICAgICBtYWtlU3RhY2tUcmFjZUxvbmcoZXhjZXB0aW9uLCBzZWxmKTtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdGVkKGV4Y2VwdGlvbik7XG4gICAgICAgICAgICB9IGNhdGNoIChuZXdFeGNlcHRpb24pIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KG5ld0V4Y2VwdGlvbik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlamVjdChleGNlcHRpb24pO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIF9wcm9ncmVzc2VkKHZhbHVlKSB7XG4gICAgICAgIHJldHVybiB0eXBlb2YgcHJvZ3Jlc3NlZCA9PT0gXCJmdW5jdGlvblwiID8gcHJvZ3Jlc3NlZCh2YWx1ZSkgOiB2YWx1ZTtcbiAgICB9XG5cbiAgICBRLm5leHRUaWNrKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgc2VsZi5wcm9taXNlRGlzcGF0Y2goZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICBpZiAoZG9uZSkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGRvbmUgPSB0cnVlO1xuXG4gICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKF9mdWxmaWxsZWQodmFsdWUpKTtcbiAgICAgICAgfSwgXCJ3aGVuXCIsIFtmdW5jdGlvbiAoZXhjZXB0aW9uKSB7XG4gICAgICAgICAgICBpZiAoZG9uZSkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGRvbmUgPSB0cnVlO1xuXG4gICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKF9yZWplY3RlZChleGNlcHRpb24pKTtcbiAgICAgICAgfV0pO1xuICAgIH0pO1xuXG4gICAgLy8gUHJvZ3Jlc3MgcHJvcGFnYXRvciBuZWVkIHRvIGJlIGF0dGFjaGVkIGluIHRoZSBjdXJyZW50IHRpY2suXG4gICAgc2VsZi5wcm9taXNlRGlzcGF0Y2godm9pZCAwLCBcIndoZW5cIiwgW3ZvaWQgMCwgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgIHZhciBuZXdWYWx1ZTtcbiAgICAgICAgdmFyIHRocmV3ID0gZmFsc2U7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBuZXdWYWx1ZSA9IF9wcm9ncmVzc2VkKHZhbHVlKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgdGhyZXcgPSB0cnVlO1xuICAgICAgICAgICAgaWYgKFEub25lcnJvcikge1xuICAgICAgICAgICAgICAgIFEub25lcnJvcihlKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghdGhyZXcpIHtcbiAgICAgICAgICAgIGRlZmVycmVkLm5vdGlmeShuZXdWYWx1ZSk7XG4gICAgICAgIH1cbiAgICB9XSk7XG5cbiAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbn07XG5cblEudGFwID0gZnVuY3Rpb24gKHByb21pc2UsIGNhbGxiYWNrKSB7XG4gICAgcmV0dXJuIFEocHJvbWlzZSkudGFwKGNhbGxiYWNrKTtcbn07XG5cbi8qKlxuICogV29ya3MgYWxtb3N0IGxpa2UgXCJmaW5hbGx5XCIsIGJ1dCBub3QgY2FsbGVkIGZvciByZWplY3Rpb25zLlxuICogT3JpZ2luYWwgcmVzb2x1dGlvbiB2YWx1ZSBpcyBwYXNzZWQgdGhyb3VnaCBjYWxsYmFjayB1bmFmZmVjdGVkLlxuICogQ2FsbGJhY2sgbWF5IHJldHVybiBhIHByb21pc2UgdGhhdCB3aWxsIGJlIGF3YWl0ZWQgZm9yLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2tcbiAqIEByZXR1cm5zIHtRLlByb21pc2V9XG4gKiBAZXhhbXBsZVxuICogZG9Tb21ldGhpbmcoKVxuICogICAudGhlbiguLi4pXG4gKiAgIC50YXAoY29uc29sZS5sb2cpXG4gKiAgIC50aGVuKC4uLik7XG4gKi9cblByb21pc2UucHJvdG90eXBlLnRhcCA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgIGNhbGxiYWNrID0gUShjYWxsYmFjayk7XG5cbiAgICByZXR1cm4gdGhpcy50aGVuKGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICByZXR1cm4gY2FsbGJhY2suZmNhbGwodmFsdWUpLnRoZW5SZXNvbHZlKHZhbHVlKTtcbiAgICB9KTtcbn07XG5cbi8qKlxuICogUmVnaXN0ZXJzIGFuIG9ic2VydmVyIG9uIGEgcHJvbWlzZS5cbiAqXG4gKiBHdWFyYW50ZWVzOlxuICpcbiAqIDEuIHRoYXQgZnVsZmlsbGVkIGFuZCByZWplY3RlZCB3aWxsIGJlIGNhbGxlZCBvbmx5IG9uY2UuXG4gKiAyLiB0aGF0IGVpdGhlciB0aGUgZnVsZmlsbGVkIGNhbGxiYWNrIG9yIHRoZSByZWplY3RlZCBjYWxsYmFjayB3aWxsIGJlXG4gKiAgICBjYWxsZWQsIGJ1dCBub3QgYm90aC5cbiAqIDMuIHRoYXQgZnVsZmlsbGVkIGFuZCByZWplY3RlZCB3aWxsIG5vdCBiZSBjYWxsZWQgaW4gdGhpcyB0dXJuLlxuICpcbiAqIEBwYXJhbSB2YWx1ZSAgICAgIHByb21pc2Ugb3IgaW1tZWRpYXRlIHJlZmVyZW5jZSB0byBvYnNlcnZlXG4gKiBAcGFyYW0gZnVsZmlsbGVkICBmdW5jdGlvbiB0byBiZSBjYWxsZWQgd2l0aCB0aGUgZnVsZmlsbGVkIHZhbHVlXG4gKiBAcGFyYW0gcmVqZWN0ZWQgICBmdW5jdGlvbiB0byBiZSBjYWxsZWQgd2l0aCB0aGUgcmVqZWN0aW9uIGV4Y2VwdGlvblxuICogQHBhcmFtIHByb2dyZXNzZWQgZnVuY3Rpb24gdG8gYmUgY2FsbGVkIG9uIGFueSBwcm9ncmVzcyBub3RpZmljYXRpb25zXG4gKiBAcmV0dXJuIHByb21pc2UgZm9yIHRoZSByZXR1cm4gdmFsdWUgZnJvbSB0aGUgaW52b2tlZCBjYWxsYmFja1xuICovXG5RLndoZW4gPSB3aGVuO1xuZnVuY3Rpb24gd2hlbih2YWx1ZSwgZnVsZmlsbGVkLCByZWplY3RlZCwgcHJvZ3Jlc3NlZCkge1xuICAgIHJldHVybiBRKHZhbHVlKS50aGVuKGZ1bGZpbGxlZCwgcmVqZWN0ZWQsIHByb2dyZXNzZWQpO1xufVxuXG5Qcm9taXNlLnByb3RvdHlwZS50aGVuUmVzb2x2ZSA9IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgIHJldHVybiB0aGlzLnRoZW4oZnVuY3Rpb24gKCkgeyByZXR1cm4gdmFsdWU7IH0pO1xufTtcblxuUS50aGVuUmVzb2x2ZSA9IGZ1bmN0aW9uIChwcm9taXNlLCB2YWx1ZSkge1xuICAgIHJldHVybiBRKHByb21pc2UpLnRoZW5SZXNvbHZlKHZhbHVlKTtcbn07XG5cblByb21pc2UucHJvdG90eXBlLnRoZW5SZWplY3QgPSBmdW5jdGlvbiAocmVhc29uKSB7XG4gICAgcmV0dXJuIHRoaXMudGhlbihmdW5jdGlvbiAoKSB7IHRocm93IHJlYXNvbjsgfSk7XG59O1xuXG5RLnRoZW5SZWplY3QgPSBmdW5jdGlvbiAocHJvbWlzZSwgcmVhc29uKSB7XG4gICAgcmV0dXJuIFEocHJvbWlzZSkudGhlblJlamVjdChyZWFzb24pO1xufTtcblxuLyoqXG4gKiBJZiBhbiBvYmplY3QgaXMgbm90IGEgcHJvbWlzZSwgaXQgaXMgYXMgXCJuZWFyXCIgYXMgcG9zc2libGUuXG4gKiBJZiBhIHByb21pc2UgaXMgcmVqZWN0ZWQsIGl0IGlzIGFzIFwibmVhclwiIGFzIHBvc3NpYmxlIHRvby5cbiAqIElmIGl04oCZcyBhIGZ1bGZpbGxlZCBwcm9taXNlLCB0aGUgZnVsZmlsbG1lbnQgdmFsdWUgaXMgbmVhcmVyLlxuICogSWYgaXTigJlzIGEgZGVmZXJyZWQgcHJvbWlzZSBhbmQgdGhlIGRlZmVycmVkIGhhcyBiZWVuIHJlc29sdmVkLCB0aGVcbiAqIHJlc29sdXRpb24gaXMgXCJuZWFyZXJcIi5cbiAqIEBwYXJhbSBvYmplY3RcbiAqIEByZXR1cm5zIG1vc3QgcmVzb2x2ZWQgKG5lYXJlc3QpIGZvcm0gb2YgdGhlIG9iamVjdFxuICovXG5cbi8vIFhYWCBzaG91bGQgd2UgcmUtZG8gdGhpcz9cblEubmVhcmVyID0gbmVhcmVyO1xuZnVuY3Rpb24gbmVhcmVyKHZhbHVlKSB7XG4gICAgaWYgKGlzUHJvbWlzZSh2YWx1ZSkpIHtcbiAgICAgICAgdmFyIGluc3BlY3RlZCA9IHZhbHVlLmluc3BlY3QoKTtcbiAgICAgICAgaWYgKGluc3BlY3RlZC5zdGF0ZSA9PT0gXCJmdWxmaWxsZWRcIikge1xuICAgICAgICAgICAgcmV0dXJuIGluc3BlY3RlZC52YWx1ZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdmFsdWU7XG59XG5cbi8qKlxuICogQHJldHVybnMgd2hldGhlciB0aGUgZ2l2ZW4gb2JqZWN0IGlzIGEgcHJvbWlzZS5cbiAqIE90aGVyd2lzZSBpdCBpcyBhIGZ1bGZpbGxlZCB2YWx1ZS5cbiAqL1xuUS5pc1Byb21pc2UgPSBpc1Byb21pc2U7XG5mdW5jdGlvbiBpc1Byb21pc2Uob2JqZWN0KSB7XG4gICAgcmV0dXJuIG9iamVjdCBpbnN0YW5jZW9mIFByb21pc2U7XG59XG5cblEuaXNQcm9taXNlQWxpa2UgPSBpc1Byb21pc2VBbGlrZTtcbmZ1bmN0aW9uIGlzUHJvbWlzZUFsaWtlKG9iamVjdCkge1xuICAgIHJldHVybiBpc09iamVjdChvYmplY3QpICYmIHR5cGVvZiBvYmplY3QudGhlbiA9PT0gXCJmdW5jdGlvblwiO1xufVxuXG4vKipcbiAqIEByZXR1cm5zIHdoZXRoZXIgdGhlIGdpdmVuIG9iamVjdCBpcyBhIHBlbmRpbmcgcHJvbWlzZSwgbWVhbmluZyBub3RcbiAqIGZ1bGZpbGxlZCBvciByZWplY3RlZC5cbiAqL1xuUS5pc1BlbmRpbmcgPSBpc1BlbmRpbmc7XG5mdW5jdGlvbiBpc1BlbmRpbmcob2JqZWN0KSB7XG4gICAgcmV0dXJuIGlzUHJvbWlzZShvYmplY3QpICYmIG9iamVjdC5pbnNwZWN0KCkuc3RhdGUgPT09IFwicGVuZGluZ1wiO1xufVxuXG5Qcm9taXNlLnByb3RvdHlwZS5pc1BlbmRpbmcgPSBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHRoaXMuaW5zcGVjdCgpLnN0YXRlID09PSBcInBlbmRpbmdcIjtcbn07XG5cbi8qKlxuICogQHJldHVybnMgd2hldGhlciB0aGUgZ2l2ZW4gb2JqZWN0IGlzIGEgdmFsdWUgb3IgZnVsZmlsbGVkXG4gKiBwcm9taXNlLlxuICovXG5RLmlzRnVsZmlsbGVkID0gaXNGdWxmaWxsZWQ7XG5mdW5jdGlvbiBpc0Z1bGZpbGxlZChvYmplY3QpIHtcbiAgICByZXR1cm4gIWlzUHJvbWlzZShvYmplY3QpIHx8IG9iamVjdC5pbnNwZWN0KCkuc3RhdGUgPT09IFwiZnVsZmlsbGVkXCI7XG59XG5cblByb21pc2UucHJvdG90eXBlLmlzRnVsZmlsbGVkID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB0aGlzLmluc3BlY3QoKS5zdGF0ZSA9PT0gXCJmdWxmaWxsZWRcIjtcbn07XG5cbi8qKlxuICogQHJldHVybnMgd2hldGhlciB0aGUgZ2l2ZW4gb2JqZWN0IGlzIGEgcmVqZWN0ZWQgcHJvbWlzZS5cbiAqL1xuUS5pc1JlamVjdGVkID0gaXNSZWplY3RlZDtcbmZ1bmN0aW9uIGlzUmVqZWN0ZWQob2JqZWN0KSB7XG4gICAgcmV0dXJuIGlzUHJvbWlzZShvYmplY3QpICYmIG9iamVjdC5pbnNwZWN0KCkuc3RhdGUgPT09IFwicmVqZWN0ZWRcIjtcbn1cblxuUHJvbWlzZS5wcm90b3R5cGUuaXNSZWplY3RlZCA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy5pbnNwZWN0KCkuc3RhdGUgPT09IFwicmVqZWN0ZWRcIjtcbn07XG5cbi8vLy8gQkVHSU4gVU5IQU5ETEVEIFJFSkVDVElPTiBUUkFDS0lOR1xuXG4vLyBUaGlzIHByb21pc2UgbGlicmFyeSBjb25zdW1lcyBleGNlcHRpb25zIHRocm93biBpbiBoYW5kbGVycyBzbyB0aGV5IGNhbiBiZVxuLy8gaGFuZGxlZCBieSBhIHN1YnNlcXVlbnQgcHJvbWlzZS4gIFRoZSBleGNlcHRpb25zIGdldCBhZGRlZCB0byB0aGlzIGFycmF5IHdoZW5cbi8vIHRoZXkgYXJlIGNyZWF0ZWQsIGFuZCByZW1vdmVkIHdoZW4gdGhleSBhcmUgaGFuZGxlZC4gIE5vdGUgdGhhdCBpbiBFUzYgb3Jcbi8vIHNoaW1tZWQgZW52aXJvbm1lbnRzLCB0aGlzIHdvdWxkIG5hdHVyYWxseSBiZSBhIGBTZXRgLlxudmFyIHVuaGFuZGxlZFJlYXNvbnMgPSBbXTtcbnZhciB1bmhhbmRsZWRSZWplY3Rpb25zID0gW107XG52YXIgcmVwb3J0ZWRVbmhhbmRsZWRSZWplY3Rpb25zID0gW107XG52YXIgdHJhY2tVbmhhbmRsZWRSZWplY3Rpb25zID0gdHJ1ZTtcblxuZnVuY3Rpb24gcmVzZXRVbmhhbmRsZWRSZWplY3Rpb25zKCkge1xuICAgIHVuaGFuZGxlZFJlYXNvbnMubGVuZ3RoID0gMDtcbiAgICB1bmhhbmRsZWRSZWplY3Rpb25zLmxlbmd0aCA9IDA7XG5cbiAgICBpZiAoIXRyYWNrVW5oYW5kbGVkUmVqZWN0aW9ucykge1xuICAgICAgICB0cmFja1VuaGFuZGxlZFJlamVjdGlvbnMgPSB0cnVlO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gdHJhY2tSZWplY3Rpb24ocHJvbWlzZSwgcmVhc29uKSB7XG4gICAgaWYgKCF0cmFja1VuaGFuZGxlZFJlamVjdGlvbnMpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIHByb2Nlc3MgPT09IFwib2JqZWN0XCIgJiYgdHlwZW9mIHByb2Nlc3MuZW1pdCA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgIFEubmV4dFRpY2sucnVuQWZ0ZXIoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKGFycmF5X2luZGV4T2YodW5oYW5kbGVkUmVqZWN0aW9ucywgcHJvbWlzZSkgIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgcHJvY2Vzcy5lbWl0KFwidW5oYW5kbGVkUmVqZWN0aW9uXCIsIHJlYXNvbiwgcHJvbWlzZSk7XG4gICAgICAgICAgICAgICAgcmVwb3J0ZWRVbmhhbmRsZWRSZWplY3Rpb25zLnB1c2gocHJvbWlzZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHVuaGFuZGxlZFJlamVjdGlvbnMucHVzaChwcm9taXNlKTtcbiAgICBpZiAocmVhc29uICYmIHR5cGVvZiByZWFzb24uc3RhY2sgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgICAgdW5oYW5kbGVkUmVhc29ucy5wdXNoKHJlYXNvbi5zdGFjayk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdW5oYW5kbGVkUmVhc29ucy5wdXNoKFwiKG5vIHN0YWNrKSBcIiArIHJlYXNvbik7XG4gICAgfVxufVxuXG5mdW5jdGlvbiB1bnRyYWNrUmVqZWN0aW9uKHByb21pc2UpIHtcbiAgICBpZiAoIXRyYWNrVW5oYW5kbGVkUmVqZWN0aW9ucykge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdmFyIGF0ID0gYXJyYXlfaW5kZXhPZih1bmhhbmRsZWRSZWplY3Rpb25zLCBwcm9taXNlKTtcbiAgICBpZiAoYXQgIT09IC0xKSB7XG4gICAgICAgIGlmICh0eXBlb2YgcHJvY2VzcyA9PT0gXCJvYmplY3RcIiAmJiB0eXBlb2YgcHJvY2Vzcy5lbWl0ID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICAgIFEubmV4dFRpY2sucnVuQWZ0ZXIoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHZhciBhdFJlcG9ydCA9IGFycmF5X2luZGV4T2YocmVwb3J0ZWRVbmhhbmRsZWRSZWplY3Rpb25zLCBwcm9taXNlKTtcbiAgICAgICAgICAgICAgICBpZiAoYXRSZXBvcnQgIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgIHByb2Nlc3MuZW1pdChcInJlamVjdGlvbkhhbmRsZWRcIiwgdW5oYW5kbGVkUmVhc29uc1thdF0sIHByb21pc2UpO1xuICAgICAgICAgICAgICAgICAgICByZXBvcnRlZFVuaGFuZGxlZFJlamVjdGlvbnMuc3BsaWNlKGF0UmVwb3J0LCAxKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICB1bmhhbmRsZWRSZWplY3Rpb25zLnNwbGljZShhdCwgMSk7XG4gICAgICAgIHVuaGFuZGxlZFJlYXNvbnMuc3BsaWNlKGF0LCAxKTtcbiAgICB9XG59XG5cblEucmVzZXRVbmhhbmRsZWRSZWplY3Rpb25zID0gcmVzZXRVbmhhbmRsZWRSZWplY3Rpb25zO1xuXG5RLmdldFVuaGFuZGxlZFJlYXNvbnMgPSBmdW5jdGlvbiAoKSB7XG4gICAgLy8gTWFrZSBhIGNvcHkgc28gdGhhdCBjb25zdW1lcnMgY2FuJ3QgaW50ZXJmZXJlIHdpdGggb3VyIGludGVybmFsIHN0YXRlLlxuICAgIHJldHVybiB1bmhhbmRsZWRSZWFzb25zLnNsaWNlKCk7XG59O1xuXG5RLnN0b3BVbmhhbmRsZWRSZWplY3Rpb25UcmFja2luZyA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXNldFVuaGFuZGxlZFJlamVjdGlvbnMoKTtcbiAgICB0cmFja1VuaGFuZGxlZFJlamVjdGlvbnMgPSBmYWxzZTtcbn07XG5cbnJlc2V0VW5oYW5kbGVkUmVqZWN0aW9ucygpO1xuXG4vLy8vIEVORCBVTkhBTkRMRUQgUkVKRUNUSU9OIFRSQUNLSU5HXG5cbi8qKlxuICogQ29uc3RydWN0cyBhIHJlamVjdGVkIHByb21pc2UuXG4gKiBAcGFyYW0gcmVhc29uIHZhbHVlIGRlc2NyaWJpbmcgdGhlIGZhaWx1cmVcbiAqL1xuUS5yZWplY3QgPSByZWplY3Q7XG5mdW5jdGlvbiByZWplY3QocmVhc29uKSB7XG4gICAgdmFyIHJlamVjdGlvbiA9IFByb21pc2Uoe1xuICAgICAgICBcIndoZW5cIjogZnVuY3Rpb24gKHJlamVjdGVkKSB7XG4gICAgICAgICAgICAvLyBub3RlIHRoYXQgdGhlIGVycm9yIGhhcyBiZWVuIGhhbmRsZWRcbiAgICAgICAgICAgIGlmIChyZWplY3RlZCkge1xuICAgICAgICAgICAgICAgIHVudHJhY2tSZWplY3Rpb24odGhpcyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gcmVqZWN0ZWQgPyByZWplY3RlZChyZWFzb24pIDogdGhpcztcbiAgICAgICAgfVxuICAgIH0sIGZ1bmN0aW9uIGZhbGxiYWNrKCkge1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9LCBmdW5jdGlvbiBpbnNwZWN0KCkge1xuICAgICAgICByZXR1cm4geyBzdGF0ZTogXCJyZWplY3RlZFwiLCByZWFzb246IHJlYXNvbiB9O1xuICAgIH0pO1xuXG4gICAgLy8gTm90ZSB0aGF0IHRoZSByZWFzb24gaGFzIG5vdCBiZWVuIGhhbmRsZWQuXG4gICAgdHJhY2tSZWplY3Rpb24ocmVqZWN0aW9uLCByZWFzb24pO1xuXG4gICAgcmV0dXJuIHJlamVjdGlvbjtcbn1cblxuLyoqXG4gKiBDb25zdHJ1Y3RzIGEgZnVsZmlsbGVkIHByb21pc2UgZm9yIGFuIGltbWVkaWF0ZSByZWZlcmVuY2UuXG4gKiBAcGFyYW0gdmFsdWUgaW1tZWRpYXRlIHJlZmVyZW5jZVxuICovXG5RLmZ1bGZpbGwgPSBmdWxmaWxsO1xuZnVuY3Rpb24gZnVsZmlsbCh2YWx1ZSkge1xuICAgIHJldHVybiBQcm9taXNlKHtcbiAgICAgICAgXCJ3aGVuXCI6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgfSxcbiAgICAgICAgXCJnZXRcIjogZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZVtuYW1lXTtcbiAgICAgICAgfSxcbiAgICAgICAgXCJzZXRcIjogZnVuY3Rpb24gKG5hbWUsIHJocykge1xuICAgICAgICAgICAgdmFsdWVbbmFtZV0gPSByaHM7XG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVsZXRlXCI6IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICAgICAgICBkZWxldGUgdmFsdWVbbmFtZV07XG4gICAgICAgIH0sXG4gICAgICAgIFwicG9zdFwiOiBmdW5jdGlvbiAobmFtZSwgYXJncykge1xuICAgICAgICAgICAgLy8gTWFyayBNaWxsZXIgcHJvcG9zZXMgdGhhdCBwb3N0IHdpdGggbm8gbmFtZSBzaG91bGQgYXBwbHkgYVxuICAgICAgICAgICAgLy8gcHJvbWlzZWQgZnVuY3Rpb24uXG4gICAgICAgICAgICBpZiAobmFtZSA9PT0gbnVsbCB8fCBuYW1lID09PSB2b2lkIDApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdmFsdWUuYXBwbHkodm9pZCAwLCBhcmdzKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlW25hbWVdLmFwcGx5KHZhbHVlLCBhcmdzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJhcHBseVwiOiBmdW5jdGlvbiAodGhpc3AsIGFyZ3MpIHtcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZS5hcHBseSh0aGlzcCwgYXJncyk7XG4gICAgICAgIH0sXG4gICAgICAgIFwia2V5c1wiOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gb2JqZWN0X2tleXModmFsdWUpO1xuICAgICAgICB9XG4gICAgfSwgdm9pZCAwLCBmdW5jdGlvbiBpbnNwZWN0KCkge1xuICAgICAgICByZXR1cm4geyBzdGF0ZTogXCJmdWxmaWxsZWRcIiwgdmFsdWU6IHZhbHVlIH07XG4gICAgfSk7XG59XG5cbi8qKlxuICogQ29udmVydHMgdGhlbmFibGVzIHRvIFEgcHJvbWlzZXMuXG4gKiBAcGFyYW0gcHJvbWlzZSB0aGVuYWJsZSBwcm9taXNlXG4gKiBAcmV0dXJucyBhIFEgcHJvbWlzZVxuICovXG5mdW5jdGlvbiBjb2VyY2UocHJvbWlzZSkge1xuICAgIHZhciBkZWZlcnJlZCA9IGRlZmVyKCk7XG4gICAgUS5uZXh0VGljayhmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBwcm9taXNlLnRoZW4oZGVmZXJyZWQucmVzb2x2ZSwgZGVmZXJyZWQucmVqZWN0LCBkZWZlcnJlZC5ub3RpZnkpO1xuICAgICAgICB9IGNhdGNoIChleGNlcHRpb24pIHtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChleGNlcHRpb24pO1xuICAgICAgICB9XG4gICAgfSk7XG4gICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG59XG5cbi8qKlxuICogQW5ub3RhdGVzIGFuIG9iamVjdCBzdWNoIHRoYXQgaXQgd2lsbCBuZXZlciBiZVxuICogdHJhbnNmZXJyZWQgYXdheSBmcm9tIHRoaXMgcHJvY2VzcyBvdmVyIGFueSBwcm9taXNlXG4gKiBjb21tdW5pY2F0aW9uIGNoYW5uZWwuXG4gKiBAcGFyYW0gb2JqZWN0XG4gKiBAcmV0dXJucyBwcm9taXNlIGEgd3JhcHBpbmcgb2YgdGhhdCBvYmplY3QgdGhhdFxuICogYWRkaXRpb25hbGx5IHJlc3BvbmRzIHRvIHRoZSBcImlzRGVmXCIgbWVzc2FnZVxuICogd2l0aG91dCBhIHJlamVjdGlvbi5cbiAqL1xuUS5tYXN0ZXIgPSBtYXN0ZXI7XG5mdW5jdGlvbiBtYXN0ZXIob2JqZWN0KSB7XG4gICAgcmV0dXJuIFByb21pc2Uoe1xuICAgICAgICBcImlzRGVmXCI6IGZ1bmN0aW9uICgpIHt9XG4gICAgfSwgZnVuY3Rpb24gZmFsbGJhY2sob3AsIGFyZ3MpIHtcbiAgICAgICAgcmV0dXJuIGRpc3BhdGNoKG9iamVjdCwgb3AsIGFyZ3MpO1xuICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIFEob2JqZWN0KS5pbnNwZWN0KCk7XG4gICAgfSk7XG59XG5cbi8qKlxuICogU3ByZWFkcyB0aGUgdmFsdWVzIG9mIGEgcHJvbWlzZWQgYXJyYXkgb2YgYXJndW1lbnRzIGludG8gdGhlXG4gKiBmdWxmaWxsbWVudCBjYWxsYmFjay5cbiAqIEBwYXJhbSBmdWxmaWxsZWQgY2FsbGJhY2sgdGhhdCByZWNlaXZlcyB2YXJpYWRpYyBhcmd1bWVudHMgZnJvbSB0aGVcbiAqIHByb21pc2VkIGFycmF5XG4gKiBAcGFyYW0gcmVqZWN0ZWQgY2FsbGJhY2sgdGhhdCByZWNlaXZlcyB0aGUgZXhjZXB0aW9uIGlmIHRoZSBwcm9taXNlXG4gKiBpcyByZWplY3RlZC5cbiAqIEByZXR1cm5zIGEgcHJvbWlzZSBmb3IgdGhlIHJldHVybiB2YWx1ZSBvciB0aHJvd24gZXhjZXB0aW9uIG9mXG4gKiBlaXRoZXIgY2FsbGJhY2suXG4gKi9cblEuc3ByZWFkID0gc3ByZWFkO1xuZnVuY3Rpb24gc3ByZWFkKHZhbHVlLCBmdWxmaWxsZWQsIHJlamVjdGVkKSB7XG4gICAgcmV0dXJuIFEodmFsdWUpLnNwcmVhZChmdWxmaWxsZWQsIHJlamVjdGVkKTtcbn1cblxuUHJvbWlzZS5wcm90b3R5cGUuc3ByZWFkID0gZnVuY3Rpb24gKGZ1bGZpbGxlZCwgcmVqZWN0ZWQpIHtcbiAgICByZXR1cm4gdGhpcy5hbGwoKS50aGVuKGZ1bmN0aW9uIChhcnJheSkge1xuICAgICAgICByZXR1cm4gZnVsZmlsbGVkLmFwcGx5KHZvaWQgMCwgYXJyYXkpO1xuICAgIH0sIHJlamVjdGVkKTtcbn07XG5cbi8qKlxuICogVGhlIGFzeW5jIGZ1bmN0aW9uIGlzIGEgZGVjb3JhdG9yIGZvciBnZW5lcmF0b3IgZnVuY3Rpb25zLCB0dXJuaW5nXG4gKiB0aGVtIGludG8gYXN5bmNocm9ub3VzIGdlbmVyYXRvcnMuICBBbHRob3VnaCBnZW5lcmF0b3JzIGFyZSBvbmx5IHBhcnRcbiAqIG9mIHRoZSBuZXdlc3QgRUNNQVNjcmlwdCA2IGRyYWZ0cywgdGhpcyBjb2RlIGRvZXMgbm90IGNhdXNlIHN5bnRheFxuICogZXJyb3JzIGluIG9sZGVyIGVuZ2luZXMuICBUaGlzIGNvZGUgc2hvdWxkIGNvbnRpbnVlIHRvIHdvcmsgYW5kIHdpbGxcbiAqIGluIGZhY3QgaW1wcm92ZSBvdmVyIHRpbWUgYXMgdGhlIGxhbmd1YWdlIGltcHJvdmVzLlxuICpcbiAqIEVTNiBnZW5lcmF0b3JzIGFyZSBjdXJyZW50bHkgcGFydCBvZiBWOCB2ZXJzaW9uIDMuMTkgd2l0aCB0aGVcbiAqIC0taGFybW9ueS1nZW5lcmF0b3JzIHJ1bnRpbWUgZmxhZyBlbmFibGVkLiAgU3BpZGVyTW9ua2V5IGhhcyBoYWQgdGhlbVxuICogZm9yIGxvbmdlciwgYnV0IHVuZGVyIGFuIG9sZGVyIFB5dGhvbi1pbnNwaXJlZCBmb3JtLiAgVGhpcyBmdW5jdGlvblxuICogd29ya3Mgb24gYm90aCBraW5kcyBvZiBnZW5lcmF0b3JzLlxuICpcbiAqIERlY29yYXRlcyBhIGdlbmVyYXRvciBmdW5jdGlvbiBzdWNoIHRoYXQ6XG4gKiAgLSBpdCBtYXkgeWllbGQgcHJvbWlzZXNcbiAqICAtIGV4ZWN1dGlvbiB3aWxsIGNvbnRpbnVlIHdoZW4gdGhhdCBwcm9taXNlIGlzIGZ1bGZpbGxlZFxuICogIC0gdGhlIHZhbHVlIG9mIHRoZSB5aWVsZCBleHByZXNzaW9uIHdpbGwgYmUgdGhlIGZ1bGZpbGxlZCB2YWx1ZVxuICogIC0gaXQgcmV0dXJucyBhIHByb21pc2UgZm9yIHRoZSByZXR1cm4gdmFsdWUgKHdoZW4gdGhlIGdlbmVyYXRvclxuICogICAgc3RvcHMgaXRlcmF0aW5nKVxuICogIC0gdGhlIGRlY29yYXRlZCBmdW5jdGlvbiByZXR1cm5zIGEgcHJvbWlzZSBmb3IgdGhlIHJldHVybiB2YWx1ZVxuICogICAgb2YgdGhlIGdlbmVyYXRvciBvciB0aGUgZmlyc3QgcmVqZWN0ZWQgcHJvbWlzZSBhbW9uZyB0aG9zZVxuICogICAgeWllbGRlZC5cbiAqICAtIGlmIGFuIGVycm9yIGlzIHRocm93biBpbiB0aGUgZ2VuZXJhdG9yLCBpdCBwcm9wYWdhdGVzIHRocm91Z2hcbiAqICAgIGV2ZXJ5IGZvbGxvd2luZyB5aWVsZCB1bnRpbCBpdCBpcyBjYXVnaHQsIG9yIHVudGlsIGl0IGVzY2FwZXNcbiAqICAgIHRoZSBnZW5lcmF0b3IgZnVuY3Rpb24gYWx0b2dldGhlciwgYW5kIGlzIHRyYW5zbGF0ZWQgaW50byBhXG4gKiAgICByZWplY3Rpb24gZm9yIHRoZSBwcm9taXNlIHJldHVybmVkIGJ5IHRoZSBkZWNvcmF0ZWQgZ2VuZXJhdG9yLlxuICovXG5RLmFzeW5jID0gYXN5bmM7XG5mdW5jdGlvbiBhc3luYyhtYWtlR2VuZXJhdG9yKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgLy8gd2hlbiB2ZXJiIGlzIFwic2VuZFwiLCBhcmcgaXMgYSB2YWx1ZVxuICAgICAgICAvLyB3aGVuIHZlcmIgaXMgXCJ0aHJvd1wiLCBhcmcgaXMgYW4gZXhjZXB0aW9uXG4gICAgICAgIGZ1bmN0aW9uIGNvbnRpbnVlcih2ZXJiLCBhcmcpIHtcbiAgICAgICAgICAgIHZhciByZXN1bHQ7XG5cbiAgICAgICAgICAgIC8vIFVudGlsIFY4IDMuMTkgLyBDaHJvbWl1bSAyOSBpcyByZWxlYXNlZCwgU3BpZGVyTW9ua2V5IGlzIHRoZSBvbmx5XG4gICAgICAgICAgICAvLyBlbmdpbmUgdGhhdCBoYXMgYSBkZXBsb3llZCBiYXNlIG9mIGJyb3dzZXJzIHRoYXQgc3VwcG9ydCBnZW5lcmF0b3JzLlxuICAgICAgICAgICAgLy8gSG93ZXZlciwgU00ncyBnZW5lcmF0b3JzIHVzZSB0aGUgUHl0aG9uLWluc3BpcmVkIHNlbWFudGljcyBvZlxuICAgICAgICAgICAgLy8gb3V0ZGF0ZWQgRVM2IGRyYWZ0cy4gIFdlIHdvdWxkIGxpa2UgdG8gc3VwcG9ydCBFUzYsIGJ1dCB3ZSdkIGFsc29cbiAgICAgICAgICAgIC8vIGxpa2UgdG8gbWFrZSBpdCBwb3NzaWJsZSB0byB1c2UgZ2VuZXJhdG9ycyBpbiBkZXBsb3llZCBicm93c2Vycywgc29cbiAgICAgICAgICAgIC8vIHdlIGFsc28gc3VwcG9ydCBQeXRob24tc3R5bGUgZ2VuZXJhdG9ycy4gIEF0IHNvbWUgcG9pbnQgd2UgY2FuIHJlbW92ZVxuICAgICAgICAgICAgLy8gdGhpcyBibG9jay5cblxuICAgICAgICAgICAgaWYgKHR5cGVvZiBTdG9wSXRlcmF0aW9uID09PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICAgICAgICAgICAgLy8gRVM2IEdlbmVyYXRvcnNcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICByZXN1bHQgPSBnZW5lcmF0b3JbdmVyYl0oYXJnKTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChleGNlcHRpb24pIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdChleGNlcHRpb24pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAocmVzdWx0LmRvbmUpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFEocmVzdWx0LnZhbHVlKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gd2hlbihyZXN1bHQudmFsdWUsIGNhbGxiYWNrLCBlcnJiYWNrKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIFNwaWRlck1vbmtleSBHZW5lcmF0b3JzXG4gICAgICAgICAgICAgICAgLy8gRklYTUU6IFJlbW92ZSB0aGlzIGNhc2Ugd2hlbiBTTSBkb2VzIEVTNiBnZW5lcmF0b3JzLlxuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdCA9IGdlbmVyYXRvclt2ZXJiXShhcmcpO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGV4Y2VwdGlvbikge1xuICAgICAgICAgICAgICAgICAgICBpZiAoaXNTdG9wSXRlcmF0aW9uKGV4Y2VwdGlvbikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBRKGV4Y2VwdGlvbi52YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KGV4Y2VwdGlvbik7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIHdoZW4ocmVzdWx0LCBjYWxsYmFjaywgZXJyYmFjayk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGdlbmVyYXRvciA9IG1ha2VHZW5lcmF0b3IuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgICAgdmFyIGNhbGxiYWNrID0gY29udGludWVyLmJpbmQoY29udGludWVyLCBcIm5leHRcIik7XG4gICAgICAgIHZhciBlcnJiYWNrID0gY29udGludWVyLmJpbmQoY29udGludWVyLCBcInRocm93XCIpO1xuICAgICAgICByZXR1cm4gY2FsbGJhY2soKTtcbiAgICB9O1xufVxuXG4vKipcbiAqIFRoZSBzcGF3biBmdW5jdGlvbiBpcyBhIHNtYWxsIHdyYXBwZXIgYXJvdW5kIGFzeW5jIHRoYXQgaW1tZWRpYXRlbHlcbiAqIGNhbGxzIHRoZSBnZW5lcmF0b3IgYW5kIGFsc28gZW5kcyB0aGUgcHJvbWlzZSBjaGFpbiwgc28gdGhhdCBhbnlcbiAqIHVuaGFuZGxlZCBlcnJvcnMgYXJlIHRocm93biBpbnN0ZWFkIG9mIGZvcndhcmRlZCB0byB0aGUgZXJyb3JcbiAqIGhhbmRsZXIuIFRoaXMgaXMgdXNlZnVsIGJlY2F1c2UgaXQncyBleHRyZW1lbHkgY29tbW9uIHRvIHJ1blxuICogZ2VuZXJhdG9ycyBhdCB0aGUgdG9wLWxldmVsIHRvIHdvcmsgd2l0aCBsaWJyYXJpZXMuXG4gKi9cblEuc3Bhd24gPSBzcGF3bjtcbmZ1bmN0aW9uIHNwYXduKG1ha2VHZW5lcmF0b3IpIHtcbiAgICBRLmRvbmUoUS5hc3luYyhtYWtlR2VuZXJhdG9yKSgpKTtcbn1cblxuLy8gRklYTUU6IFJlbW92ZSB0aGlzIGludGVyZmFjZSBvbmNlIEVTNiBnZW5lcmF0b3JzIGFyZSBpbiBTcGlkZXJNb25rZXkuXG4vKipcbiAqIFRocm93cyBhIFJldHVyblZhbHVlIGV4Y2VwdGlvbiB0byBzdG9wIGFuIGFzeW5jaHJvbm91cyBnZW5lcmF0b3IuXG4gKlxuICogVGhpcyBpbnRlcmZhY2UgaXMgYSBzdG9wLWdhcCBtZWFzdXJlIHRvIHN1cHBvcnQgZ2VuZXJhdG9yIHJldHVyblxuICogdmFsdWVzIGluIG9sZGVyIEZpcmVmb3gvU3BpZGVyTW9ua2V5LiAgSW4gYnJvd3NlcnMgdGhhdCBzdXBwb3J0IEVTNlxuICogZ2VuZXJhdG9ycyBsaWtlIENocm9taXVtIDI5LCBqdXN0IHVzZSBcInJldHVyblwiIGluIHlvdXIgZ2VuZXJhdG9yXG4gKiBmdW5jdGlvbnMuXG4gKlxuICogQHBhcmFtIHZhbHVlIHRoZSByZXR1cm4gdmFsdWUgZm9yIHRoZSBzdXJyb3VuZGluZyBnZW5lcmF0b3JcbiAqIEB0aHJvd3MgUmV0dXJuVmFsdWUgZXhjZXB0aW9uIHdpdGggdGhlIHZhbHVlLlxuICogQGV4YW1wbGVcbiAqIC8vIEVTNiBzdHlsZVxuICogUS5hc3luYyhmdW5jdGlvbiogKCkge1xuICogICAgICB2YXIgZm9vID0geWllbGQgZ2V0Rm9vUHJvbWlzZSgpO1xuICogICAgICB2YXIgYmFyID0geWllbGQgZ2V0QmFyUHJvbWlzZSgpO1xuICogICAgICByZXR1cm4gZm9vICsgYmFyO1xuICogfSlcbiAqIC8vIE9sZGVyIFNwaWRlck1vbmtleSBzdHlsZVxuICogUS5hc3luYyhmdW5jdGlvbiAoKSB7XG4gKiAgICAgIHZhciBmb28gPSB5aWVsZCBnZXRGb29Qcm9taXNlKCk7XG4gKiAgICAgIHZhciBiYXIgPSB5aWVsZCBnZXRCYXJQcm9taXNlKCk7XG4gKiAgICAgIFEucmV0dXJuKGZvbyArIGJhcik7XG4gKiB9KVxuICovXG5RW1wicmV0dXJuXCJdID0gX3JldHVybjtcbmZ1bmN0aW9uIF9yZXR1cm4odmFsdWUpIHtcbiAgICB0aHJvdyBuZXcgUVJldHVyblZhbHVlKHZhbHVlKTtcbn1cblxuLyoqXG4gKiBUaGUgcHJvbWlzZWQgZnVuY3Rpb24gZGVjb3JhdG9yIGVuc3VyZXMgdGhhdCBhbnkgcHJvbWlzZSBhcmd1bWVudHNcbiAqIGFyZSBzZXR0bGVkIGFuZCBwYXNzZWQgYXMgdmFsdWVzIChgdGhpc2AgaXMgYWxzbyBzZXR0bGVkIGFuZCBwYXNzZWRcbiAqIGFzIGEgdmFsdWUpLiAgSXQgd2lsbCBhbHNvIGVuc3VyZSB0aGF0IHRoZSByZXN1bHQgb2YgYSBmdW5jdGlvbiBpc1xuICogYWx3YXlzIGEgcHJvbWlzZS5cbiAqXG4gKiBAZXhhbXBsZVxuICogdmFyIGFkZCA9IFEucHJvbWlzZWQoZnVuY3Rpb24gKGEsIGIpIHtcbiAqICAgICByZXR1cm4gYSArIGI7XG4gKiB9KTtcbiAqIGFkZChRKGEpLCBRKEIpKTtcbiAqXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayBUaGUgZnVuY3Rpb24gdG8gZGVjb3JhdGVcbiAqIEByZXR1cm5zIHtmdW5jdGlvbn0gYSBmdW5jdGlvbiB0aGF0IGhhcyBiZWVuIGRlY29yYXRlZC5cbiAqL1xuUS5wcm9taXNlZCA9IHByb21pc2VkO1xuZnVuY3Rpb24gcHJvbWlzZWQoY2FsbGJhY2spIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gc3ByZWFkKFt0aGlzLCBhbGwoYXJndW1lbnRzKV0sIGZ1bmN0aW9uIChzZWxmLCBhcmdzKSB7XG4gICAgICAgICAgICByZXR1cm4gY2FsbGJhY2suYXBwbHkoc2VsZiwgYXJncyk7XG4gICAgICAgIH0pO1xuICAgIH07XG59XG5cbi8qKlxuICogc2VuZHMgYSBtZXNzYWdlIHRvIGEgdmFsdWUgaW4gYSBmdXR1cmUgdHVyblxuICogQHBhcmFtIG9iamVjdCogdGhlIHJlY2lwaWVudFxuICogQHBhcmFtIG9wIHRoZSBuYW1lIG9mIHRoZSBtZXNzYWdlIG9wZXJhdGlvbiwgZS5nLiwgXCJ3aGVuXCIsXG4gKiBAcGFyYW0gYXJncyBmdXJ0aGVyIGFyZ3VtZW50cyB0byBiZSBmb3J3YXJkZWQgdG8gdGhlIG9wZXJhdGlvblxuICogQHJldHVybnMgcmVzdWx0IHtQcm9taXNlfSBhIHByb21pc2UgZm9yIHRoZSByZXN1bHQgb2YgdGhlIG9wZXJhdGlvblxuICovXG5RLmRpc3BhdGNoID0gZGlzcGF0Y2g7XG5mdW5jdGlvbiBkaXNwYXRjaChvYmplY3QsIG9wLCBhcmdzKSB7XG4gICAgcmV0dXJuIFEob2JqZWN0KS5kaXNwYXRjaChvcCwgYXJncyk7XG59XG5cblByb21pc2UucHJvdG90eXBlLmRpc3BhdGNoID0gZnVuY3Rpb24gKG9wLCBhcmdzKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHZhciBkZWZlcnJlZCA9IGRlZmVyKCk7XG4gICAgUS5uZXh0VGljayhmdW5jdGlvbiAoKSB7XG4gICAgICAgIHNlbGYucHJvbWlzZURpc3BhdGNoKGRlZmVycmVkLnJlc29sdmUsIG9wLCBhcmdzKTtcbiAgICB9KTtcbiAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbn07XG5cbi8qKlxuICogR2V0cyB0aGUgdmFsdWUgb2YgYSBwcm9wZXJ0eSBpbiBhIGZ1dHVyZSB0dXJuLlxuICogQHBhcmFtIG9iamVjdCAgICBwcm9taXNlIG9yIGltbWVkaWF0ZSByZWZlcmVuY2UgZm9yIHRhcmdldCBvYmplY3RcbiAqIEBwYXJhbSBuYW1lICAgICAgbmFtZSBvZiBwcm9wZXJ0eSB0byBnZXRcbiAqIEByZXR1cm4gcHJvbWlzZSBmb3IgdGhlIHByb3BlcnR5IHZhbHVlXG4gKi9cblEuZ2V0ID0gZnVuY3Rpb24gKG9iamVjdCwga2V5KSB7XG4gICAgcmV0dXJuIFEob2JqZWN0KS5kaXNwYXRjaChcImdldFwiLCBba2V5XSk7XG59O1xuXG5Qcm9taXNlLnByb3RvdHlwZS5nZXQgPSBmdW5jdGlvbiAoa2V5KSB7XG4gICAgcmV0dXJuIHRoaXMuZGlzcGF0Y2goXCJnZXRcIiwgW2tleV0pO1xufTtcblxuLyoqXG4gKiBTZXRzIHRoZSB2YWx1ZSBvZiBhIHByb3BlcnR5IGluIGEgZnV0dXJlIHR1cm4uXG4gKiBAcGFyYW0gb2JqZWN0ICAgIHByb21pc2Ugb3IgaW1tZWRpYXRlIHJlZmVyZW5jZSBmb3Igb2JqZWN0IG9iamVjdFxuICogQHBhcmFtIG5hbWUgICAgICBuYW1lIG9mIHByb3BlcnR5IHRvIHNldFxuICogQHBhcmFtIHZhbHVlICAgICBuZXcgdmFsdWUgb2YgcHJvcGVydHlcbiAqIEByZXR1cm4gcHJvbWlzZSBmb3IgdGhlIHJldHVybiB2YWx1ZVxuICovXG5RLnNldCA9IGZ1bmN0aW9uIChvYmplY3QsIGtleSwgdmFsdWUpIHtcbiAgICByZXR1cm4gUShvYmplY3QpLmRpc3BhdGNoKFwic2V0XCIsIFtrZXksIHZhbHVlXSk7XG59O1xuXG5Qcm9taXNlLnByb3RvdHlwZS5zZXQgPSBmdW5jdGlvbiAoa2V5LCB2YWx1ZSkge1xuICAgIHJldHVybiB0aGlzLmRpc3BhdGNoKFwic2V0XCIsIFtrZXksIHZhbHVlXSk7XG59O1xuXG4vKipcbiAqIERlbGV0ZXMgYSBwcm9wZXJ0eSBpbiBhIGZ1dHVyZSB0dXJuLlxuICogQHBhcmFtIG9iamVjdCAgICBwcm9taXNlIG9yIGltbWVkaWF0ZSByZWZlcmVuY2UgZm9yIHRhcmdldCBvYmplY3RcbiAqIEBwYXJhbSBuYW1lICAgICAgbmFtZSBvZiBwcm9wZXJ0eSB0byBkZWxldGVcbiAqIEByZXR1cm4gcHJvbWlzZSBmb3IgdGhlIHJldHVybiB2YWx1ZVxuICovXG5RLmRlbCA9IC8vIFhYWCBsZWdhY3lcblFbXCJkZWxldGVcIl0gPSBmdW5jdGlvbiAob2JqZWN0LCBrZXkpIHtcbiAgICByZXR1cm4gUShvYmplY3QpLmRpc3BhdGNoKFwiZGVsZXRlXCIsIFtrZXldKTtcbn07XG5cblByb21pc2UucHJvdG90eXBlLmRlbCA9IC8vIFhYWCBsZWdhY3lcblByb21pc2UucHJvdG90eXBlW1wiZGVsZXRlXCJdID0gZnVuY3Rpb24gKGtleSkge1xuICAgIHJldHVybiB0aGlzLmRpc3BhdGNoKFwiZGVsZXRlXCIsIFtrZXldKTtcbn07XG5cbi8qKlxuICogSW52b2tlcyBhIG1ldGhvZCBpbiBhIGZ1dHVyZSB0dXJuLlxuICogQHBhcmFtIG9iamVjdCAgICBwcm9taXNlIG9yIGltbWVkaWF0ZSByZWZlcmVuY2UgZm9yIHRhcmdldCBvYmplY3RcbiAqIEBwYXJhbSBuYW1lICAgICAgbmFtZSBvZiBtZXRob2QgdG8gaW52b2tlXG4gKiBAcGFyYW0gdmFsdWUgICAgIGEgdmFsdWUgdG8gcG9zdCwgdHlwaWNhbGx5IGFuIGFycmF5IG9mXG4gKiAgICAgICAgICAgICAgICAgIGludm9jYXRpb24gYXJndW1lbnRzIGZvciBwcm9taXNlcyB0aGF0XG4gKiAgICAgICAgICAgICAgICAgIGFyZSB1bHRpbWF0ZWx5IGJhY2tlZCB3aXRoIGByZXNvbHZlYCB2YWx1ZXMsXG4gKiAgICAgICAgICAgICAgICAgIGFzIG9wcG9zZWQgdG8gdGhvc2UgYmFja2VkIHdpdGggVVJMc1xuICogICAgICAgICAgICAgICAgICB3aGVyZWluIHRoZSBwb3N0ZWQgdmFsdWUgY2FuIGJlIGFueVxuICogICAgICAgICAgICAgICAgICBKU09OIHNlcmlhbGl6YWJsZSBvYmplY3QuXG4gKiBAcmV0dXJuIHByb21pc2UgZm9yIHRoZSByZXR1cm4gdmFsdWVcbiAqL1xuLy8gYm91bmQgbG9jYWxseSBiZWNhdXNlIGl0IGlzIHVzZWQgYnkgb3RoZXIgbWV0aG9kc1xuUS5tYXBwbHkgPSAvLyBYWFggQXMgcHJvcG9zZWQgYnkgXCJSZWRzYW5kcm9cIlxuUS5wb3N0ID0gZnVuY3Rpb24gKG9iamVjdCwgbmFtZSwgYXJncykge1xuICAgIHJldHVybiBRKG9iamVjdCkuZGlzcGF0Y2goXCJwb3N0XCIsIFtuYW1lLCBhcmdzXSk7XG59O1xuXG5Qcm9taXNlLnByb3RvdHlwZS5tYXBwbHkgPSAvLyBYWFggQXMgcHJvcG9zZWQgYnkgXCJSZWRzYW5kcm9cIlxuUHJvbWlzZS5wcm90b3R5cGUucG9zdCA9IGZ1bmN0aW9uIChuYW1lLCBhcmdzKSB7XG4gICAgcmV0dXJuIHRoaXMuZGlzcGF0Y2goXCJwb3N0XCIsIFtuYW1lLCBhcmdzXSk7XG59O1xuXG4vKipcbiAqIEludm9rZXMgYSBtZXRob2QgaW4gYSBmdXR1cmUgdHVybi5cbiAqIEBwYXJhbSBvYmplY3QgICAgcHJvbWlzZSBvciBpbW1lZGlhdGUgcmVmZXJlbmNlIGZvciB0YXJnZXQgb2JqZWN0XG4gKiBAcGFyYW0gbmFtZSAgICAgIG5hbWUgb2YgbWV0aG9kIHRvIGludm9rZVxuICogQHBhcmFtIC4uLmFyZ3MgICBhcnJheSBvZiBpbnZvY2F0aW9uIGFyZ3VtZW50c1xuICogQHJldHVybiBwcm9taXNlIGZvciB0aGUgcmV0dXJuIHZhbHVlXG4gKi9cblEuc2VuZCA9IC8vIFhYWCBNYXJrIE1pbGxlcidzIHByb3Bvc2VkIHBhcmxhbmNlXG5RLm1jYWxsID0gLy8gWFhYIEFzIHByb3Bvc2VkIGJ5IFwiUmVkc2FuZHJvXCJcblEuaW52b2tlID0gZnVuY3Rpb24gKG9iamVjdCwgbmFtZSAvKi4uLmFyZ3MqLykge1xuICAgIHJldHVybiBRKG9iamVjdCkuZGlzcGF0Y2goXCJwb3N0XCIsIFtuYW1lLCBhcnJheV9zbGljZShhcmd1bWVudHMsIDIpXSk7XG59O1xuXG5Qcm9taXNlLnByb3RvdHlwZS5zZW5kID0gLy8gWFhYIE1hcmsgTWlsbGVyJ3MgcHJvcG9zZWQgcGFybGFuY2VcblByb21pc2UucHJvdG90eXBlLm1jYWxsID0gLy8gWFhYIEFzIHByb3Bvc2VkIGJ5IFwiUmVkc2FuZHJvXCJcblByb21pc2UucHJvdG90eXBlLmludm9rZSA9IGZ1bmN0aW9uIChuYW1lIC8qLi4uYXJncyovKSB7XG4gICAgcmV0dXJuIHRoaXMuZGlzcGF0Y2goXCJwb3N0XCIsIFtuYW1lLCBhcnJheV9zbGljZShhcmd1bWVudHMsIDEpXSk7XG59O1xuXG4vKipcbiAqIEFwcGxpZXMgdGhlIHByb21pc2VkIGZ1bmN0aW9uIGluIGEgZnV0dXJlIHR1cm4uXG4gKiBAcGFyYW0gb2JqZWN0ICAgIHByb21pc2Ugb3IgaW1tZWRpYXRlIHJlZmVyZW5jZSBmb3IgdGFyZ2V0IGZ1bmN0aW9uXG4gKiBAcGFyYW0gYXJncyAgICAgIGFycmF5IG9mIGFwcGxpY2F0aW9uIGFyZ3VtZW50c1xuICovXG5RLmZhcHBseSA9IGZ1bmN0aW9uIChvYmplY3QsIGFyZ3MpIHtcbiAgICByZXR1cm4gUShvYmplY3QpLmRpc3BhdGNoKFwiYXBwbHlcIiwgW3ZvaWQgMCwgYXJnc10pO1xufTtcblxuUHJvbWlzZS5wcm90b3R5cGUuZmFwcGx5ID0gZnVuY3Rpb24gKGFyZ3MpIHtcbiAgICByZXR1cm4gdGhpcy5kaXNwYXRjaChcImFwcGx5XCIsIFt2b2lkIDAsIGFyZ3NdKTtcbn07XG5cbi8qKlxuICogQ2FsbHMgdGhlIHByb21pc2VkIGZ1bmN0aW9uIGluIGEgZnV0dXJlIHR1cm4uXG4gKiBAcGFyYW0gb2JqZWN0ICAgIHByb21pc2Ugb3IgaW1tZWRpYXRlIHJlZmVyZW5jZSBmb3IgdGFyZ2V0IGZ1bmN0aW9uXG4gKiBAcGFyYW0gLi4uYXJncyAgIGFycmF5IG9mIGFwcGxpY2F0aW9uIGFyZ3VtZW50c1xuICovXG5RW1widHJ5XCJdID1cblEuZmNhbGwgPSBmdW5jdGlvbiAob2JqZWN0IC8qIC4uLmFyZ3MqLykge1xuICAgIHJldHVybiBRKG9iamVjdCkuZGlzcGF0Y2goXCJhcHBseVwiLCBbdm9pZCAwLCBhcnJheV9zbGljZShhcmd1bWVudHMsIDEpXSk7XG59O1xuXG5Qcm9taXNlLnByb3RvdHlwZS5mY2FsbCA9IGZ1bmN0aW9uICgvKi4uLmFyZ3MqLykge1xuICAgIHJldHVybiB0aGlzLmRpc3BhdGNoKFwiYXBwbHlcIiwgW3ZvaWQgMCwgYXJyYXlfc2xpY2UoYXJndW1lbnRzKV0pO1xufTtcblxuLyoqXG4gKiBCaW5kcyB0aGUgcHJvbWlzZWQgZnVuY3Rpb24sIHRyYW5zZm9ybWluZyByZXR1cm4gdmFsdWVzIGludG8gYSBmdWxmaWxsZWRcbiAqIHByb21pc2UgYW5kIHRocm93biBlcnJvcnMgaW50byBhIHJlamVjdGVkIG9uZS5cbiAqIEBwYXJhbSBvYmplY3QgICAgcHJvbWlzZSBvciBpbW1lZGlhdGUgcmVmZXJlbmNlIGZvciB0YXJnZXQgZnVuY3Rpb25cbiAqIEBwYXJhbSAuLi5hcmdzICAgYXJyYXkgb2YgYXBwbGljYXRpb24gYXJndW1lbnRzXG4gKi9cblEuZmJpbmQgPSBmdW5jdGlvbiAob2JqZWN0IC8qLi4uYXJncyovKSB7XG4gICAgdmFyIHByb21pc2UgPSBRKG9iamVjdCk7XG4gICAgdmFyIGFyZ3MgPSBhcnJheV9zbGljZShhcmd1bWVudHMsIDEpO1xuICAgIHJldHVybiBmdW5jdGlvbiBmYm91bmQoKSB7XG4gICAgICAgIHJldHVybiBwcm9taXNlLmRpc3BhdGNoKFwiYXBwbHlcIiwgW1xuICAgICAgICAgICAgdGhpcyxcbiAgICAgICAgICAgIGFyZ3MuY29uY2F0KGFycmF5X3NsaWNlKGFyZ3VtZW50cykpXG4gICAgICAgIF0pO1xuICAgIH07XG59O1xuUHJvbWlzZS5wcm90b3R5cGUuZmJpbmQgPSBmdW5jdGlvbiAoLyouLi5hcmdzKi8pIHtcbiAgICB2YXIgcHJvbWlzZSA9IHRoaXM7XG4gICAgdmFyIGFyZ3MgPSBhcnJheV9zbGljZShhcmd1bWVudHMpO1xuICAgIHJldHVybiBmdW5jdGlvbiBmYm91bmQoKSB7XG4gICAgICAgIHJldHVybiBwcm9taXNlLmRpc3BhdGNoKFwiYXBwbHlcIiwgW1xuICAgICAgICAgICAgdGhpcyxcbiAgICAgICAgICAgIGFyZ3MuY29uY2F0KGFycmF5X3NsaWNlKGFyZ3VtZW50cykpXG4gICAgICAgIF0pO1xuICAgIH07XG59O1xuXG4vKipcbiAqIFJlcXVlc3RzIHRoZSBuYW1lcyBvZiB0aGUgb3duZWQgcHJvcGVydGllcyBvZiBhIHByb21pc2VkXG4gKiBvYmplY3QgaW4gYSBmdXR1cmUgdHVybi5cbiAqIEBwYXJhbSBvYmplY3QgICAgcHJvbWlzZSBvciBpbW1lZGlhdGUgcmVmZXJlbmNlIGZvciB0YXJnZXQgb2JqZWN0XG4gKiBAcmV0dXJuIHByb21pc2UgZm9yIHRoZSBrZXlzIG9mIHRoZSBldmVudHVhbGx5IHNldHRsZWQgb2JqZWN0XG4gKi9cblEua2V5cyA9IGZ1bmN0aW9uIChvYmplY3QpIHtcbiAgICByZXR1cm4gUShvYmplY3QpLmRpc3BhdGNoKFwia2V5c1wiLCBbXSk7XG59O1xuXG5Qcm9taXNlLnByb3RvdHlwZS5rZXlzID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB0aGlzLmRpc3BhdGNoKFwia2V5c1wiLCBbXSk7XG59O1xuXG4vKipcbiAqIFR1cm5zIGFuIGFycmF5IG9mIHByb21pc2VzIGludG8gYSBwcm9taXNlIGZvciBhbiBhcnJheS4gIElmIGFueSBvZlxuICogdGhlIHByb21pc2VzIGdldHMgcmVqZWN0ZWQsIHRoZSB3aG9sZSBhcnJheSBpcyByZWplY3RlZCBpbW1lZGlhdGVseS5cbiAqIEBwYXJhbSB7QXJyYXkqfSBhbiBhcnJheSAob3IgcHJvbWlzZSBmb3IgYW4gYXJyYXkpIG9mIHZhbHVlcyAob3JcbiAqIHByb21pc2VzIGZvciB2YWx1ZXMpXG4gKiBAcmV0dXJucyBhIHByb21pc2UgZm9yIGFuIGFycmF5IG9mIHRoZSBjb3JyZXNwb25kaW5nIHZhbHVlc1xuICovXG4vLyBCeSBNYXJrIE1pbGxlclxuLy8gaHR0cDovL3dpa2kuZWNtYXNjcmlwdC5vcmcvZG9rdS5waHA/aWQ9c3RyYXdtYW46Y29uY3VycmVuY3kmcmV2PTEzMDg3NzY1MjEjYWxsZnVsZmlsbGVkXG5RLmFsbCA9IGFsbDtcbmZ1bmN0aW9uIGFsbChwcm9taXNlcykge1xuICAgIHJldHVybiB3aGVuKHByb21pc2VzLCBmdW5jdGlvbiAocHJvbWlzZXMpIHtcbiAgICAgICAgdmFyIHBlbmRpbmdDb3VudCA9IDA7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IGRlZmVyKCk7XG4gICAgICAgIGFycmF5X3JlZHVjZShwcm9taXNlcywgZnVuY3Rpb24gKHVuZGVmaW5lZCwgcHJvbWlzZSwgaW5kZXgpIHtcbiAgICAgICAgICAgIHZhciBzbmFwc2hvdDtcbiAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICBpc1Byb21pc2UocHJvbWlzZSkgJiZcbiAgICAgICAgICAgICAgICAoc25hcHNob3QgPSBwcm9taXNlLmluc3BlY3QoKSkuc3RhdGUgPT09IFwiZnVsZmlsbGVkXCJcbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgIHByb21pc2VzW2luZGV4XSA9IHNuYXBzaG90LnZhbHVlO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICArK3BlbmRpbmdDb3VudDtcbiAgICAgICAgICAgICAgICB3aGVuKFxuICAgICAgICAgICAgICAgICAgICBwcm9taXNlLFxuICAgICAgICAgICAgICAgICAgICBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHByb21pc2VzW2luZGV4XSA9IHZhbHVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKC0tcGVuZGluZ0NvdW50ID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZShwcm9taXNlcyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdCxcbiAgICAgICAgICAgICAgICAgICAgZnVuY3Rpb24gKHByb2dyZXNzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5ub3RpZnkoeyBpbmRleDogaW5kZXgsIHZhbHVlOiBwcm9ncmVzcyB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sIHZvaWQgMCk7XG4gICAgICAgIGlmIChwZW5kaW5nQ291bnQgPT09IDApIHtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUocHJvbWlzZXMpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH0pO1xufVxuXG5Qcm9taXNlLnByb3RvdHlwZS5hbGwgPSBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIGFsbCh0aGlzKTtcbn07XG5cbi8qKlxuICogUmV0dXJucyB0aGUgZmlyc3QgcmVzb2x2ZWQgcHJvbWlzZSBvZiBhbiBhcnJheS4gUHJpb3IgcmVqZWN0ZWQgcHJvbWlzZXMgYXJlXG4gKiBpZ25vcmVkLiAgUmVqZWN0cyBvbmx5IGlmIGFsbCBwcm9taXNlcyBhcmUgcmVqZWN0ZWQuXG4gKiBAcGFyYW0ge0FycmF5Kn0gYW4gYXJyYXkgY29udGFpbmluZyB2YWx1ZXMgb3IgcHJvbWlzZXMgZm9yIHZhbHVlc1xuICogQHJldHVybnMgYSBwcm9taXNlIGZ1bGZpbGxlZCB3aXRoIHRoZSB2YWx1ZSBvZiB0aGUgZmlyc3QgcmVzb2x2ZWQgcHJvbWlzZSxcbiAqIG9yIGEgcmVqZWN0ZWQgcHJvbWlzZSBpZiBhbGwgcHJvbWlzZXMgYXJlIHJlamVjdGVkLlxuICovXG5RLmFueSA9IGFueTtcblxuZnVuY3Rpb24gYW55KHByb21pc2VzKSB7XG4gICAgaWYgKHByb21pc2VzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICByZXR1cm4gUS5yZXNvbHZlKCk7XG4gICAgfVxuXG4gICAgdmFyIGRlZmVycmVkID0gUS5kZWZlcigpO1xuICAgIHZhciBwZW5kaW5nQ291bnQgPSAwO1xuICAgIGFycmF5X3JlZHVjZShwcm9taXNlcywgZnVuY3Rpb24gKHByZXYsIGN1cnJlbnQsIGluZGV4KSB7XG4gICAgICAgIHZhciBwcm9taXNlID0gcHJvbWlzZXNbaW5kZXhdO1xuXG4gICAgICAgIHBlbmRpbmdDb3VudCsrO1xuXG4gICAgICAgIHdoZW4ocHJvbWlzZSwgb25GdWxmaWxsZWQsIG9uUmVqZWN0ZWQsIG9uUHJvZ3Jlc3MpO1xuICAgICAgICBmdW5jdGlvbiBvbkZ1bGZpbGxlZChyZXN1bHQpIHtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUocmVzdWx0KTtcbiAgICAgICAgfVxuICAgICAgICBmdW5jdGlvbiBvblJlamVjdGVkKCkge1xuICAgICAgICAgICAgcGVuZGluZ0NvdW50LS07XG4gICAgICAgICAgICBpZiAocGVuZGluZ0NvdW50ID09PSAwKSB7XG4gICAgICAgICAgICAgICAgZGVmZXJyZWQucmVqZWN0KG5ldyBFcnJvcihcbiAgICAgICAgICAgICAgICAgICAgXCJDYW4ndCBnZXQgZnVsZmlsbG1lbnQgdmFsdWUgZnJvbSBhbnkgcHJvbWlzZSwgYWxsIFwiICtcbiAgICAgICAgICAgICAgICAgICAgXCJwcm9taXNlcyB3ZXJlIHJlamVjdGVkLlwiXG4gICAgICAgICAgICAgICAgKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZnVuY3Rpb24gb25Qcm9ncmVzcyhwcm9ncmVzcykge1xuICAgICAgICAgICAgZGVmZXJyZWQubm90aWZ5KHtcbiAgICAgICAgICAgICAgICBpbmRleDogaW5kZXgsXG4gICAgICAgICAgICAgICAgdmFsdWU6IHByb2dyZXNzXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH0sIHVuZGVmaW5lZCk7XG5cbiAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbn1cblxuUHJvbWlzZS5wcm90b3R5cGUuYW55ID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiBhbnkodGhpcyk7XG59O1xuXG4vKipcbiAqIFdhaXRzIGZvciBhbGwgcHJvbWlzZXMgdG8gYmUgc2V0dGxlZCwgZWl0aGVyIGZ1bGZpbGxlZCBvclxuICogcmVqZWN0ZWQuICBUaGlzIGlzIGRpc3RpbmN0IGZyb20gYGFsbGAgc2luY2UgdGhhdCB3b3VsZCBzdG9wXG4gKiB3YWl0aW5nIGF0IHRoZSBmaXJzdCByZWplY3Rpb24uICBUaGUgcHJvbWlzZSByZXR1cm5lZCBieVxuICogYGFsbFJlc29sdmVkYCB3aWxsIG5ldmVyIGJlIHJlamVjdGVkLlxuICogQHBhcmFtIHByb21pc2VzIGEgcHJvbWlzZSBmb3IgYW4gYXJyYXkgKG9yIGFuIGFycmF5KSBvZiBwcm9taXNlc1xuICogKG9yIHZhbHVlcylcbiAqIEByZXR1cm4gYSBwcm9taXNlIGZvciBhbiBhcnJheSBvZiBwcm9taXNlc1xuICovXG5RLmFsbFJlc29sdmVkID0gZGVwcmVjYXRlKGFsbFJlc29sdmVkLCBcImFsbFJlc29sdmVkXCIsIFwiYWxsU2V0dGxlZFwiKTtcbmZ1bmN0aW9uIGFsbFJlc29sdmVkKHByb21pc2VzKSB7XG4gICAgcmV0dXJuIHdoZW4ocHJvbWlzZXMsIGZ1bmN0aW9uIChwcm9taXNlcykge1xuICAgICAgICBwcm9taXNlcyA9IGFycmF5X21hcChwcm9taXNlcywgUSk7XG4gICAgICAgIHJldHVybiB3aGVuKGFsbChhcnJheV9tYXAocHJvbWlzZXMsIGZ1bmN0aW9uIChwcm9taXNlKSB7XG4gICAgICAgICAgICByZXR1cm4gd2hlbihwcm9taXNlLCBub29wLCBub29wKTtcbiAgICAgICAgfSkpLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gcHJvbWlzZXM7XG4gICAgICAgIH0pO1xuICAgIH0pO1xufVxuXG5Qcm9taXNlLnByb3RvdHlwZS5hbGxSZXNvbHZlZCA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gYWxsUmVzb2x2ZWQodGhpcyk7XG59O1xuXG4vKipcbiAqIEBzZWUgUHJvbWlzZSNhbGxTZXR0bGVkXG4gKi9cblEuYWxsU2V0dGxlZCA9IGFsbFNldHRsZWQ7XG5mdW5jdGlvbiBhbGxTZXR0bGVkKHByb21pc2VzKSB7XG4gICAgcmV0dXJuIFEocHJvbWlzZXMpLmFsbFNldHRsZWQoKTtcbn1cblxuLyoqXG4gKiBUdXJucyBhbiBhcnJheSBvZiBwcm9taXNlcyBpbnRvIGEgcHJvbWlzZSBmb3IgYW4gYXJyYXkgb2YgdGhlaXIgc3RhdGVzIChhc1xuICogcmV0dXJuZWQgYnkgYGluc3BlY3RgKSB3aGVuIHRoZXkgaGF2ZSBhbGwgc2V0dGxlZC5cbiAqIEBwYXJhbSB7QXJyYXlbQW55Kl19IHZhbHVlcyBhbiBhcnJheSAob3IgcHJvbWlzZSBmb3IgYW4gYXJyYXkpIG9mIHZhbHVlcyAob3JcbiAqIHByb21pc2VzIGZvciB2YWx1ZXMpXG4gKiBAcmV0dXJucyB7QXJyYXlbU3RhdGVdfSBhbiBhcnJheSBvZiBzdGF0ZXMgZm9yIHRoZSByZXNwZWN0aXZlIHZhbHVlcy5cbiAqL1xuUHJvbWlzZS5wcm90b3R5cGUuYWxsU2V0dGxlZCA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy50aGVuKGZ1bmN0aW9uIChwcm9taXNlcykge1xuICAgICAgICByZXR1cm4gYWxsKGFycmF5X21hcChwcm9taXNlcywgZnVuY3Rpb24gKHByb21pc2UpIHtcbiAgICAgICAgICAgIHByb21pc2UgPSBRKHByb21pc2UpO1xuICAgICAgICAgICAgZnVuY3Rpb24gcmVnYXJkbGVzcygpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcHJvbWlzZS5pbnNwZWN0KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gcHJvbWlzZS50aGVuKHJlZ2FyZGxlc3MsIHJlZ2FyZGxlc3MpO1xuICAgICAgICB9KSk7XG4gICAgfSk7XG59O1xuXG4vKipcbiAqIENhcHR1cmVzIHRoZSBmYWlsdXJlIG9mIGEgcHJvbWlzZSwgZ2l2aW5nIGFuIG9wb3J0dW5pdHkgdG8gcmVjb3ZlclxuICogd2l0aCBhIGNhbGxiYWNrLiAgSWYgdGhlIGdpdmVuIHByb21pc2UgaXMgZnVsZmlsbGVkLCB0aGUgcmV0dXJuZWRcbiAqIHByb21pc2UgaXMgZnVsZmlsbGVkLlxuICogQHBhcmFtIHtBbnkqfSBwcm9taXNlIGZvciBzb21ldGhpbmdcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIHRvIGZ1bGZpbGwgdGhlIHJldHVybmVkIHByb21pc2UgaWYgdGhlXG4gKiBnaXZlbiBwcm9taXNlIGlzIHJlamVjdGVkXG4gKiBAcmV0dXJucyBhIHByb21pc2UgZm9yIHRoZSByZXR1cm4gdmFsdWUgb2YgdGhlIGNhbGxiYWNrXG4gKi9cblEuZmFpbCA9IC8vIFhYWCBsZWdhY3lcblFbXCJjYXRjaFwiXSA9IGZ1bmN0aW9uIChvYmplY3QsIHJlamVjdGVkKSB7XG4gICAgcmV0dXJuIFEob2JqZWN0KS50aGVuKHZvaWQgMCwgcmVqZWN0ZWQpO1xufTtcblxuUHJvbWlzZS5wcm90b3R5cGUuZmFpbCA9IC8vIFhYWCBsZWdhY3lcblByb21pc2UucHJvdG90eXBlW1wiY2F0Y2hcIl0gPSBmdW5jdGlvbiAocmVqZWN0ZWQpIHtcbiAgICByZXR1cm4gdGhpcy50aGVuKHZvaWQgMCwgcmVqZWN0ZWQpO1xufTtcblxuLyoqXG4gKiBBdHRhY2hlcyBhIGxpc3RlbmVyIHRoYXQgY2FuIHJlc3BvbmQgdG8gcHJvZ3Jlc3Mgbm90aWZpY2F0aW9ucyBmcm9tIGFcbiAqIHByb21pc2UncyBvcmlnaW5hdGluZyBkZWZlcnJlZC4gVGhpcyBsaXN0ZW5lciByZWNlaXZlcyB0aGUgZXhhY3QgYXJndW1lbnRzXG4gKiBwYXNzZWQgdG8gYGBkZWZlcnJlZC5ub3RpZnlgYC5cbiAqIEBwYXJhbSB7QW55Kn0gcHJvbWlzZSBmb3Igc29tZXRoaW5nXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayB0byByZWNlaXZlIGFueSBwcm9ncmVzcyBub3RpZmljYXRpb25zXG4gKiBAcmV0dXJucyB0aGUgZ2l2ZW4gcHJvbWlzZSwgdW5jaGFuZ2VkXG4gKi9cblEucHJvZ3Jlc3MgPSBwcm9ncmVzcztcbmZ1bmN0aW9uIHByb2dyZXNzKG9iamVjdCwgcHJvZ3Jlc3NlZCkge1xuICAgIHJldHVybiBRKG9iamVjdCkudGhlbih2b2lkIDAsIHZvaWQgMCwgcHJvZ3Jlc3NlZCk7XG59XG5cblByb21pc2UucHJvdG90eXBlLnByb2dyZXNzID0gZnVuY3Rpb24gKHByb2dyZXNzZWQpIHtcbiAgICByZXR1cm4gdGhpcy50aGVuKHZvaWQgMCwgdm9pZCAwLCBwcm9ncmVzc2VkKTtcbn07XG5cbi8qKlxuICogUHJvdmlkZXMgYW4gb3Bwb3J0dW5pdHkgdG8gb2JzZXJ2ZSB0aGUgc2V0dGxpbmcgb2YgYSBwcm9taXNlLFxuICogcmVnYXJkbGVzcyBvZiB3aGV0aGVyIHRoZSBwcm9taXNlIGlzIGZ1bGZpbGxlZCBvciByZWplY3RlZC4gIEZvcndhcmRzXG4gKiB0aGUgcmVzb2x1dGlvbiB0byB0aGUgcmV0dXJuZWQgcHJvbWlzZSB3aGVuIHRoZSBjYWxsYmFjayBpcyBkb25lLlxuICogVGhlIGNhbGxiYWNrIGNhbiByZXR1cm4gYSBwcm9taXNlIHRvIGRlZmVyIGNvbXBsZXRpb24uXG4gKiBAcGFyYW0ge0FueSp9IHByb21pc2VcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIHRvIG9ic2VydmUgdGhlIHJlc29sdXRpb24gb2YgdGhlIGdpdmVuXG4gKiBwcm9taXNlLCB0YWtlcyBubyBhcmd1bWVudHMuXG4gKiBAcmV0dXJucyBhIHByb21pc2UgZm9yIHRoZSByZXNvbHV0aW9uIG9mIHRoZSBnaXZlbiBwcm9taXNlIHdoZW5cbiAqIGBgZmluYGAgaXMgZG9uZS5cbiAqL1xuUS5maW4gPSAvLyBYWFggbGVnYWN5XG5RW1wiZmluYWxseVwiXSA9IGZ1bmN0aW9uIChvYmplY3QsIGNhbGxiYWNrKSB7XG4gICAgcmV0dXJuIFEob2JqZWN0KVtcImZpbmFsbHlcIl0oY2FsbGJhY2spO1xufTtcblxuUHJvbWlzZS5wcm90b3R5cGUuZmluID0gLy8gWFhYIGxlZ2FjeVxuUHJvbWlzZS5wcm90b3R5cGVbXCJmaW5hbGx5XCJdID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgY2FsbGJhY2sgPSBRKGNhbGxiYWNrKTtcbiAgICByZXR1cm4gdGhpcy50aGVuKGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICByZXR1cm4gY2FsbGJhY2suZmNhbGwoKS50aGVuKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgfSk7XG4gICAgfSwgZnVuY3Rpb24gKHJlYXNvbikge1xuICAgICAgICAvLyBUT0RPIGF0dGVtcHQgdG8gcmVjeWNsZSB0aGUgcmVqZWN0aW9uIHdpdGggXCJ0aGlzXCIuXG4gICAgICAgIHJldHVybiBjYWxsYmFjay5mY2FsbCgpLnRoZW4oZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhyb3cgcmVhc29uO1xuICAgICAgICB9KTtcbiAgICB9KTtcbn07XG5cbi8qKlxuICogVGVybWluYXRlcyBhIGNoYWluIG9mIHByb21pc2VzLCBmb3JjaW5nIHJlamVjdGlvbnMgdG8gYmVcbiAqIHRocm93biBhcyBleGNlcHRpb25zLlxuICogQHBhcmFtIHtBbnkqfSBwcm9taXNlIGF0IHRoZSBlbmQgb2YgYSBjaGFpbiBvZiBwcm9taXNlc1xuICogQHJldHVybnMgbm90aGluZ1xuICovXG5RLmRvbmUgPSBmdW5jdGlvbiAob2JqZWN0LCBmdWxmaWxsZWQsIHJlamVjdGVkLCBwcm9ncmVzcykge1xuICAgIHJldHVybiBRKG9iamVjdCkuZG9uZShmdWxmaWxsZWQsIHJlamVjdGVkLCBwcm9ncmVzcyk7XG59O1xuXG5Qcm9taXNlLnByb3RvdHlwZS5kb25lID0gZnVuY3Rpb24gKGZ1bGZpbGxlZCwgcmVqZWN0ZWQsIHByb2dyZXNzKSB7XG4gICAgdmFyIG9uVW5oYW5kbGVkRXJyb3IgPSBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgLy8gZm9yd2FyZCB0byBhIGZ1dHVyZSB0dXJuIHNvIHRoYXQgYGB3aGVuYGBcbiAgICAgICAgLy8gZG9lcyBub3QgY2F0Y2ggaXQgYW5kIHR1cm4gaXQgaW50byBhIHJlamVjdGlvbi5cbiAgICAgICAgUS5uZXh0VGljayhmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBtYWtlU3RhY2tUcmFjZUxvbmcoZXJyb3IsIHByb21pc2UpO1xuICAgICAgICAgICAgaWYgKFEub25lcnJvcikge1xuICAgICAgICAgICAgICAgIFEub25lcnJvcihlcnJvcik7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgLy8gQXZvaWQgdW5uZWNlc3NhcnkgYG5leHRUaWNrYGluZyB2aWEgYW4gdW5uZWNlc3NhcnkgYHdoZW5gLlxuICAgIHZhciBwcm9taXNlID0gZnVsZmlsbGVkIHx8IHJlamVjdGVkIHx8IHByb2dyZXNzID9cbiAgICAgICAgdGhpcy50aGVuKGZ1bGZpbGxlZCwgcmVqZWN0ZWQsIHByb2dyZXNzKSA6XG4gICAgICAgIHRoaXM7XG5cbiAgICBpZiAodHlwZW9mIHByb2Nlc3MgPT09IFwib2JqZWN0XCIgJiYgcHJvY2VzcyAmJiBwcm9jZXNzLmRvbWFpbikge1xuICAgICAgICBvblVuaGFuZGxlZEVycm9yID0gcHJvY2Vzcy5kb21haW4uYmluZChvblVuaGFuZGxlZEVycm9yKTtcbiAgICB9XG5cbiAgICBwcm9taXNlLnRoZW4odm9pZCAwLCBvblVuaGFuZGxlZEVycm9yKTtcbn07XG5cbi8qKlxuICogQ2F1c2VzIGEgcHJvbWlzZSB0byBiZSByZWplY3RlZCBpZiBpdCBkb2VzIG5vdCBnZXQgZnVsZmlsbGVkIGJlZm9yZVxuICogc29tZSBtaWxsaXNlY29uZHMgdGltZSBvdXQuXG4gKiBAcGFyYW0ge0FueSp9IHByb21pc2VcbiAqIEBwYXJhbSB7TnVtYmVyfSBtaWxsaXNlY29uZHMgdGltZW91dFxuICogQHBhcmFtIHtBbnkqfSBjdXN0b20gZXJyb3IgbWVzc2FnZSBvciBFcnJvciBvYmplY3QgKG9wdGlvbmFsKVxuICogQHJldHVybnMgYSBwcm9taXNlIGZvciB0aGUgcmVzb2x1dGlvbiBvZiB0aGUgZ2l2ZW4gcHJvbWlzZSBpZiBpdCBpc1xuICogZnVsZmlsbGVkIGJlZm9yZSB0aGUgdGltZW91dCwgb3RoZXJ3aXNlIHJlamVjdGVkLlxuICovXG5RLnRpbWVvdXQgPSBmdW5jdGlvbiAob2JqZWN0LCBtcywgZXJyb3IpIHtcbiAgICByZXR1cm4gUShvYmplY3QpLnRpbWVvdXQobXMsIGVycm9yKTtcbn07XG5cblByb21pc2UucHJvdG90eXBlLnRpbWVvdXQgPSBmdW5jdGlvbiAobXMsIGVycm9yKSB7XG4gICAgdmFyIGRlZmVycmVkID0gZGVmZXIoKTtcbiAgICB2YXIgdGltZW91dElkID0gc2V0VGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICghZXJyb3IgfHwgXCJzdHJpbmdcIiA9PT0gdHlwZW9mIGVycm9yKSB7XG4gICAgICAgICAgICBlcnJvciA9IG5ldyBFcnJvcihlcnJvciB8fCBcIlRpbWVkIG91dCBhZnRlciBcIiArIG1zICsgXCIgbXNcIik7XG4gICAgICAgICAgICBlcnJvci5jb2RlID0gXCJFVElNRURPVVRcIjtcbiAgICAgICAgfVxuICAgICAgICBkZWZlcnJlZC5yZWplY3QoZXJyb3IpO1xuICAgIH0sIG1zKTtcblxuICAgIHRoaXMudGhlbihmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXRJZCk7XG4gICAgICAgIGRlZmVycmVkLnJlc29sdmUodmFsdWUpO1xuICAgIH0sIGZ1bmN0aW9uIChleGNlcHRpb24pIHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXRJZCk7XG4gICAgICAgIGRlZmVycmVkLnJlamVjdChleGNlcHRpb24pO1xuICAgIH0sIGRlZmVycmVkLm5vdGlmeSk7XG5cbiAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbn07XG5cbi8qKlxuICogUmV0dXJucyBhIHByb21pc2UgZm9yIHRoZSBnaXZlbiB2YWx1ZSAob3IgcHJvbWlzZWQgdmFsdWUpLCBzb21lXG4gKiBtaWxsaXNlY29uZHMgYWZ0ZXIgaXQgcmVzb2x2ZWQuIFBhc3NlcyByZWplY3Rpb25zIGltbWVkaWF0ZWx5LlxuICogQHBhcmFtIHtBbnkqfSBwcm9taXNlXG4gKiBAcGFyYW0ge051bWJlcn0gbWlsbGlzZWNvbmRzXG4gKiBAcmV0dXJucyBhIHByb21pc2UgZm9yIHRoZSByZXNvbHV0aW9uIG9mIHRoZSBnaXZlbiBwcm9taXNlIGFmdGVyIG1pbGxpc2Vjb25kc1xuICogdGltZSBoYXMgZWxhcHNlZCBzaW5jZSB0aGUgcmVzb2x1dGlvbiBvZiB0aGUgZ2l2ZW4gcHJvbWlzZS5cbiAqIElmIHRoZSBnaXZlbiBwcm9taXNlIHJlamVjdHMsIHRoYXQgaXMgcGFzc2VkIGltbWVkaWF0ZWx5LlxuICovXG5RLmRlbGF5ID0gZnVuY3Rpb24gKG9iamVjdCwgdGltZW91dCkge1xuICAgIGlmICh0aW1lb3V0ID09PSB2b2lkIDApIHtcbiAgICAgICAgdGltZW91dCA9IG9iamVjdDtcbiAgICAgICAgb2JqZWN0ID0gdm9pZCAwO1xuICAgIH1cbiAgICByZXR1cm4gUShvYmplY3QpLmRlbGF5KHRpbWVvdXQpO1xufTtcblxuUHJvbWlzZS5wcm90b3R5cGUuZGVsYXkgPSBmdW5jdGlvbiAodGltZW91dCkge1xuICAgIHJldHVybiB0aGlzLnRoZW4oZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IGRlZmVyKCk7XG4gICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZSh2YWx1ZSk7XG4gICAgICAgIH0sIHRpbWVvdXQpO1xuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9KTtcbn07XG5cbi8qKlxuICogUGFzc2VzIGEgY29udGludWF0aW9uIHRvIGEgTm9kZSBmdW5jdGlvbiwgd2hpY2ggaXMgY2FsbGVkIHdpdGggdGhlIGdpdmVuXG4gKiBhcmd1bWVudHMgcHJvdmlkZWQgYXMgYW4gYXJyYXksIGFuZCByZXR1cm5zIGEgcHJvbWlzZS5cbiAqXG4gKiAgICAgIFEubmZhcHBseShGUy5yZWFkRmlsZSwgW19fZmlsZW5hbWVdKVxuICogICAgICAudGhlbihmdW5jdGlvbiAoY29udGVudCkge1xuICogICAgICB9KVxuICpcbiAqL1xuUS5uZmFwcGx5ID0gZnVuY3Rpb24gKGNhbGxiYWNrLCBhcmdzKSB7XG4gICAgcmV0dXJuIFEoY2FsbGJhY2spLm5mYXBwbHkoYXJncyk7XG59O1xuXG5Qcm9taXNlLnByb3RvdHlwZS5uZmFwcGx5ID0gZnVuY3Rpb24gKGFyZ3MpIHtcbiAgICB2YXIgZGVmZXJyZWQgPSBkZWZlcigpO1xuICAgIHZhciBub2RlQXJncyA9IGFycmF5X3NsaWNlKGFyZ3MpO1xuICAgIG5vZGVBcmdzLnB1c2goZGVmZXJyZWQubWFrZU5vZGVSZXNvbHZlcigpKTtcbiAgICB0aGlzLmZhcHBseShub2RlQXJncykuZmFpbChkZWZlcnJlZC5yZWplY3QpO1xuICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xufTtcblxuLyoqXG4gKiBQYXNzZXMgYSBjb250aW51YXRpb24gdG8gYSBOb2RlIGZ1bmN0aW9uLCB3aGljaCBpcyBjYWxsZWQgd2l0aCB0aGUgZ2l2ZW5cbiAqIGFyZ3VtZW50cyBwcm92aWRlZCBpbmRpdmlkdWFsbHksIGFuZCByZXR1cm5zIGEgcHJvbWlzZS5cbiAqIEBleGFtcGxlXG4gKiBRLm5mY2FsbChGUy5yZWFkRmlsZSwgX19maWxlbmFtZSlcbiAqIC50aGVuKGZ1bmN0aW9uIChjb250ZW50KSB7XG4gKiB9KVxuICpcbiAqL1xuUS5uZmNhbGwgPSBmdW5jdGlvbiAoY2FsbGJhY2sgLyouLi5hcmdzKi8pIHtcbiAgICB2YXIgYXJncyA9IGFycmF5X3NsaWNlKGFyZ3VtZW50cywgMSk7XG4gICAgcmV0dXJuIFEoY2FsbGJhY2spLm5mYXBwbHkoYXJncyk7XG59O1xuXG5Qcm9taXNlLnByb3RvdHlwZS5uZmNhbGwgPSBmdW5jdGlvbiAoLyouLi5hcmdzKi8pIHtcbiAgICB2YXIgbm9kZUFyZ3MgPSBhcnJheV9zbGljZShhcmd1bWVudHMpO1xuICAgIHZhciBkZWZlcnJlZCA9IGRlZmVyKCk7XG4gICAgbm9kZUFyZ3MucHVzaChkZWZlcnJlZC5tYWtlTm9kZVJlc29sdmVyKCkpO1xuICAgIHRoaXMuZmFwcGx5KG5vZGVBcmdzKS5mYWlsKGRlZmVycmVkLnJlamVjdCk7XG4gICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG59O1xuXG4vKipcbiAqIFdyYXBzIGEgTm9kZUpTIGNvbnRpbnVhdGlvbiBwYXNzaW5nIGZ1bmN0aW9uIGFuZCByZXR1cm5zIGFuIGVxdWl2YWxlbnRcbiAqIHZlcnNpb24gdGhhdCByZXR1cm5zIGEgcHJvbWlzZS5cbiAqIEBleGFtcGxlXG4gKiBRLm5mYmluZChGUy5yZWFkRmlsZSwgX19maWxlbmFtZSkoXCJ1dGYtOFwiKVxuICogLnRoZW4oY29uc29sZS5sb2cpXG4gKiAuZG9uZSgpXG4gKi9cblEubmZiaW5kID1cblEuZGVub2RlaWZ5ID0gZnVuY3Rpb24gKGNhbGxiYWNrIC8qLi4uYXJncyovKSB7XG4gICAgdmFyIGJhc2VBcmdzID0gYXJyYXlfc2xpY2UoYXJndW1lbnRzLCAxKTtcbiAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgbm9kZUFyZ3MgPSBiYXNlQXJncy5jb25jYXQoYXJyYXlfc2xpY2UoYXJndW1lbnRzKSk7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IGRlZmVyKCk7XG4gICAgICAgIG5vZGVBcmdzLnB1c2goZGVmZXJyZWQubWFrZU5vZGVSZXNvbHZlcigpKTtcbiAgICAgICAgUShjYWxsYmFjaykuZmFwcGx5KG5vZGVBcmdzKS5mYWlsKGRlZmVycmVkLnJlamVjdCk7XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH07XG59O1xuXG5Qcm9taXNlLnByb3RvdHlwZS5uZmJpbmQgPVxuUHJvbWlzZS5wcm90b3R5cGUuZGVub2RlaWZ5ID0gZnVuY3Rpb24gKC8qLi4uYXJncyovKSB7XG4gICAgdmFyIGFyZ3MgPSBhcnJheV9zbGljZShhcmd1bWVudHMpO1xuICAgIGFyZ3MudW5zaGlmdCh0aGlzKTtcbiAgICByZXR1cm4gUS5kZW5vZGVpZnkuYXBwbHkodm9pZCAwLCBhcmdzKTtcbn07XG5cblEubmJpbmQgPSBmdW5jdGlvbiAoY2FsbGJhY2ssIHRoaXNwIC8qLi4uYXJncyovKSB7XG4gICAgdmFyIGJhc2VBcmdzID0gYXJyYXlfc2xpY2UoYXJndW1lbnRzLCAyKTtcbiAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgbm9kZUFyZ3MgPSBiYXNlQXJncy5jb25jYXQoYXJyYXlfc2xpY2UoYXJndW1lbnRzKSk7XG4gICAgICAgIHZhciBkZWZlcnJlZCA9IGRlZmVyKCk7XG4gICAgICAgIG5vZGVBcmdzLnB1c2goZGVmZXJyZWQubWFrZU5vZGVSZXNvbHZlcigpKTtcbiAgICAgICAgZnVuY3Rpb24gYm91bmQoKSB7XG4gICAgICAgICAgICByZXR1cm4gY2FsbGJhY2suYXBwbHkodGhpc3AsIGFyZ3VtZW50cyk7XG4gICAgICAgIH1cbiAgICAgICAgUShib3VuZCkuZmFwcGx5KG5vZGVBcmdzKS5mYWlsKGRlZmVycmVkLnJlamVjdCk7XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH07XG59O1xuXG5Qcm9taXNlLnByb3RvdHlwZS5uYmluZCA9IGZ1bmN0aW9uICgvKnRoaXNwLCAuLi5hcmdzKi8pIHtcbiAgICB2YXIgYXJncyA9IGFycmF5X3NsaWNlKGFyZ3VtZW50cywgMCk7XG4gICAgYXJncy51bnNoaWZ0KHRoaXMpO1xuICAgIHJldHVybiBRLm5iaW5kLmFwcGx5KHZvaWQgMCwgYXJncyk7XG59O1xuXG4vKipcbiAqIENhbGxzIGEgbWV0aG9kIG9mIGEgTm9kZS1zdHlsZSBvYmplY3QgdGhhdCBhY2NlcHRzIGEgTm9kZS1zdHlsZVxuICogY2FsbGJhY2sgd2l0aCBhIGdpdmVuIGFycmF5IG9mIGFyZ3VtZW50cywgcGx1cyBhIHByb3ZpZGVkIGNhbGxiYWNrLlxuICogQHBhcmFtIG9iamVjdCBhbiBvYmplY3QgdGhhdCBoYXMgdGhlIG5hbWVkIG1ldGhvZFxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWUgbmFtZSBvZiB0aGUgbWV0aG9kIG9mIG9iamVjdFxuICogQHBhcmFtIHtBcnJheX0gYXJncyBhcmd1bWVudHMgdG8gcGFzcyB0byB0aGUgbWV0aG9kOyB0aGUgY2FsbGJhY2tcbiAqIHdpbGwgYmUgcHJvdmlkZWQgYnkgUSBhbmQgYXBwZW5kZWQgdG8gdGhlc2UgYXJndW1lbnRzLlxuICogQHJldHVybnMgYSBwcm9taXNlIGZvciB0aGUgdmFsdWUgb3IgZXJyb3JcbiAqL1xuUS5ubWFwcGx5ID0gLy8gWFhYIEFzIHByb3Bvc2VkIGJ5IFwiUmVkc2FuZHJvXCJcblEubnBvc3QgPSBmdW5jdGlvbiAob2JqZWN0LCBuYW1lLCBhcmdzKSB7XG4gICAgcmV0dXJuIFEob2JqZWN0KS5ucG9zdChuYW1lLCBhcmdzKTtcbn07XG5cblByb21pc2UucHJvdG90eXBlLm5tYXBwbHkgPSAvLyBYWFggQXMgcHJvcG9zZWQgYnkgXCJSZWRzYW5kcm9cIlxuUHJvbWlzZS5wcm90b3R5cGUubnBvc3QgPSBmdW5jdGlvbiAobmFtZSwgYXJncykge1xuICAgIHZhciBub2RlQXJncyA9IGFycmF5X3NsaWNlKGFyZ3MgfHwgW10pO1xuICAgIHZhciBkZWZlcnJlZCA9IGRlZmVyKCk7XG4gICAgbm9kZUFyZ3MucHVzaChkZWZlcnJlZC5tYWtlTm9kZVJlc29sdmVyKCkpO1xuICAgIHRoaXMuZGlzcGF0Y2goXCJwb3N0XCIsIFtuYW1lLCBub2RlQXJnc10pLmZhaWwoZGVmZXJyZWQucmVqZWN0KTtcbiAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbn07XG5cbi8qKlxuICogQ2FsbHMgYSBtZXRob2Qgb2YgYSBOb2RlLXN0eWxlIG9iamVjdCB0aGF0IGFjY2VwdHMgYSBOb2RlLXN0eWxlXG4gKiBjYWxsYmFjaywgZm9yd2FyZGluZyB0aGUgZ2l2ZW4gdmFyaWFkaWMgYXJndW1lbnRzLCBwbHVzIGEgcHJvdmlkZWRcbiAqIGNhbGxiYWNrIGFyZ3VtZW50LlxuICogQHBhcmFtIG9iamVjdCBhbiBvYmplY3QgdGhhdCBoYXMgdGhlIG5hbWVkIG1ldGhvZFxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWUgbmFtZSBvZiB0aGUgbWV0aG9kIG9mIG9iamVjdFxuICogQHBhcmFtIC4uLmFyZ3MgYXJndW1lbnRzIHRvIHBhc3MgdG8gdGhlIG1ldGhvZDsgdGhlIGNhbGxiYWNrIHdpbGxcbiAqIGJlIHByb3ZpZGVkIGJ5IFEgYW5kIGFwcGVuZGVkIHRvIHRoZXNlIGFyZ3VtZW50cy5cbiAqIEByZXR1cm5zIGEgcHJvbWlzZSBmb3IgdGhlIHZhbHVlIG9yIGVycm9yXG4gKi9cblEubnNlbmQgPSAvLyBYWFggQmFzZWQgb24gTWFyayBNaWxsZXIncyBwcm9wb3NlZCBcInNlbmRcIlxuUS5ubWNhbGwgPSAvLyBYWFggQmFzZWQgb24gXCJSZWRzYW5kcm8nc1wiIHByb3Bvc2FsXG5RLm5pbnZva2UgPSBmdW5jdGlvbiAob2JqZWN0LCBuYW1lIC8qLi4uYXJncyovKSB7XG4gICAgdmFyIG5vZGVBcmdzID0gYXJyYXlfc2xpY2UoYXJndW1lbnRzLCAyKTtcbiAgICB2YXIgZGVmZXJyZWQgPSBkZWZlcigpO1xuICAgIG5vZGVBcmdzLnB1c2goZGVmZXJyZWQubWFrZU5vZGVSZXNvbHZlcigpKTtcbiAgICBRKG9iamVjdCkuZGlzcGF0Y2goXCJwb3N0XCIsIFtuYW1lLCBub2RlQXJnc10pLmZhaWwoZGVmZXJyZWQucmVqZWN0KTtcbiAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbn07XG5cblByb21pc2UucHJvdG90eXBlLm5zZW5kID0gLy8gWFhYIEJhc2VkIG9uIE1hcmsgTWlsbGVyJ3MgcHJvcG9zZWQgXCJzZW5kXCJcblByb21pc2UucHJvdG90eXBlLm5tY2FsbCA9IC8vIFhYWCBCYXNlZCBvbiBcIlJlZHNhbmRybydzXCIgcHJvcG9zYWxcblByb21pc2UucHJvdG90eXBlLm5pbnZva2UgPSBmdW5jdGlvbiAobmFtZSAvKi4uLmFyZ3MqLykge1xuICAgIHZhciBub2RlQXJncyA9IGFycmF5X3NsaWNlKGFyZ3VtZW50cywgMSk7XG4gICAgdmFyIGRlZmVycmVkID0gZGVmZXIoKTtcbiAgICBub2RlQXJncy5wdXNoKGRlZmVycmVkLm1ha2VOb2RlUmVzb2x2ZXIoKSk7XG4gICAgdGhpcy5kaXNwYXRjaChcInBvc3RcIiwgW25hbWUsIG5vZGVBcmdzXSkuZmFpbChkZWZlcnJlZC5yZWplY3QpO1xuICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xufTtcblxuLyoqXG4gKiBJZiBhIGZ1bmN0aW9uIHdvdWxkIGxpa2UgdG8gc3VwcG9ydCBib3RoIE5vZGUgY29udGludWF0aW9uLXBhc3Npbmctc3R5bGUgYW5kXG4gKiBwcm9taXNlLXJldHVybmluZy1zdHlsZSwgaXQgY2FuIGVuZCBpdHMgaW50ZXJuYWwgcHJvbWlzZSBjaGFpbiB3aXRoXG4gKiBgbm9kZWlmeShub2RlYmFjaylgLCBmb3J3YXJkaW5nIHRoZSBvcHRpb25hbCBub2RlYmFjayBhcmd1bWVudC4gIElmIHRoZSB1c2VyXG4gKiBlbGVjdHMgdG8gdXNlIGEgbm9kZWJhY2ssIHRoZSByZXN1bHQgd2lsbCBiZSBzZW50IHRoZXJlLiAgSWYgdGhleSBkbyBub3RcbiAqIHBhc3MgYSBub2RlYmFjaywgdGhleSB3aWxsIHJlY2VpdmUgdGhlIHJlc3VsdCBwcm9taXNlLlxuICogQHBhcmFtIG9iamVjdCBhIHJlc3VsdCAob3IgYSBwcm9taXNlIGZvciBhIHJlc3VsdClcbiAqIEBwYXJhbSB7RnVuY3Rpb259IG5vZGViYWNrIGEgTm9kZS5qcy1zdHlsZSBjYWxsYmFja1xuICogQHJldHVybnMgZWl0aGVyIHRoZSBwcm9taXNlIG9yIG5vdGhpbmdcbiAqL1xuUS5ub2RlaWZ5ID0gbm9kZWlmeTtcbmZ1bmN0aW9uIG5vZGVpZnkob2JqZWN0LCBub2RlYmFjaykge1xuICAgIHJldHVybiBRKG9iamVjdCkubm9kZWlmeShub2RlYmFjayk7XG59XG5cblByb21pc2UucHJvdG90eXBlLm5vZGVpZnkgPSBmdW5jdGlvbiAobm9kZWJhY2spIHtcbiAgICBpZiAobm9kZWJhY2spIHtcbiAgICAgICAgdGhpcy50aGVuKGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgUS5uZXh0VGljayhmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgbm9kZWJhY2sobnVsbCwgdmFsdWUpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgUS5uZXh0VGljayhmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgbm9kZWJhY2soZXJyb3IpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbn07XG5cblEubm9Db25mbGljdCA9IGZ1bmN0aW9uKCkge1xuICAgIHRocm93IG5ldyBFcnJvcihcIlEubm9Db25mbGljdCBvbmx5IHdvcmtzIHdoZW4gUSBpcyB1c2VkIGFzIGEgZ2xvYmFsXCIpO1xufTtcblxuLy8gQWxsIGNvZGUgYmVmb3JlIHRoaXMgcG9pbnQgd2lsbCBiZSBmaWx0ZXJlZCBmcm9tIHN0YWNrIHRyYWNlcy5cbnZhciBxRW5kaW5nTGluZSA9IGNhcHR1cmVMaW5lKCk7XG5cbnJldHVybiBRO1xuXG59KTtcbiIsInZhciB3b3JrID0gcmVxdWlyZSgnd2Vid29ya2lmeScpO1xudmFyIHRvanNvbiA9IHJlcXVpcmUoJ25ncmFwaC50b2pzb24nKTtcbnZhciBldmVudGlmeSA9IHJlcXVpcmUoJ25ncmFwaC5ldmVudHMnKTtcblxudmFyIGNyZWF0ZUxheW91dCA9IHJlcXVpcmUoJy4vbGliL2NyZWF0ZUxheW91dC5qcycpO1xudmFyIHZhbGlkYXRlT3B0aW9ucyA9IHJlcXVpcmUoJy4vb3B0aW9ucy5qcycpO1xudmFyIG1lc3NhZ2VLaW5kID0gcmVxdWlyZSgnLi9saWIvbWVzc2FnZXMuanMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBjcmVhdGVBc3luY0xheW91dDtcblxuZnVuY3Rpb24gY3JlYXRlQXN5bmNMYXlvdXQoZ3JhcGgsIG9wdGlvbnMpIHtcbiAgb3B0aW9ucyA9IHZhbGlkYXRlT3B0aW9ucyhvcHRpb25zKTtcblxuICB2YXIgYXNzaWduUG9zaXRpb24gPSBvcHRpb25zLmlzM2QgPyBhc3NpZ25Qb3NpdGlvbjNkIDogYXNzaWduUG9zaXRpb24yZDtcblxuICB2YXIgcGVuZGluZ0luaXRpYWxpemF0aW9uID0gZmFsc2U7XG4gIHZhciBpbml0UmVxdWVzdFNlbnQgPSBmYWxzZTtcbiAgdmFyIHN5c3RlbVN0YWJsZSA9IGZhbHNlO1xuICB2YXIgZ3JhcGhSZWN0O1xuICB2YXIgcGluU3RhdHVzID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcbiAgdmFyIGxpbmtQb3NpdGlvbnM7XG5cbiAgLy8gU2luY2UgdGhpcyBpcyBmYWlybHkgY29tbW9uIG1lc3NhZ2UsIHRoZXJlIGlzIG5vIG5lZWQgdG8gcmVjcmVhdGUgaXQgZXZlcnkgdGltZTpcbiAgdmFyIHN0ZXBNZXNzYWdlID0geyBraW5kOiBtZXNzYWdlS2luZC5zdGVwIH07XG5cbiAgdmFyIHBvc2l0aW9ucyA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cbiAgdmFyIGxheW91dFdvcmtlciA9IHdvcmsocmVxdWlyZSgnLi9saWIvbGF5b3V0V29ya2VyLmpzJykpO1xuICBsYXlvdXRXb3JrZXIuYWRkRXZlbnRMaXN0ZW5lcignbWVzc2FnZScsIGhhbmRsZU1lc3NhZ2VGcm9tV29ya2VyKTtcblxuICBpbml0V29ya2VyKCk7XG4gIGluaXRQb3NpdGlvbnMoKTtcblxuICB2YXIgYXBpID0ge1xuICAgIC8qKlxuICAgICAqIFJlcXVlc3QgdG8gcGVyZm9ybSBvbmUgaXRlcmF0aW9uIG9mIGZvcmNlIGxheW91dC4gVGhlIHJlcXVlc3QgaXNcbiAgICAgKiBmb3J3YXJkZWQgdG8gd2ViIHdvcmtlclxuICAgICAqXG4gICAgICogQHJldHVybnMge2Jvb2xlYW59IHRydWUgaWYgc3lzdGVtIGlzIGNvbnNpZGVyZWQgc3RhYmxlOyBmYWxzZSBvdGhlcndpc2UuXG4gICAgICovXG4gICAgc3RlcDogYXN5bmNTdGVwLFxuXG4gICAgLyoqXG4gICAgICogR2V0cyB0aGUgbGFzdCBrbm93biBwb3NpdGlvbiBvZiBhIGdpdmVuIG5vZGUgYnkgaXRzIGlkZW50aWZpZXIuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbm9kZUlkIGlkZW50aWZpZXIgb2YgYSBub2RlIGluIHF1ZXN0aW9uLlxuICAgICAqIEByZXR1cm5zIHtvYmplY3R9IHt4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyfSBjb29yZGluYXRlcyBvZiBhIG5vZGUuXG4gICAgICovXG4gICAgZ2V0Tm9kZVBvc2l0aW9uOiBnZXROb2RlUG9zaXRpb24sXG5cbiAgICAvKipcbiAgICAgKiBHZXRzIHRoZSBsYXN0IGtub3duIHBvc2l0aW9uIG9mIGEgZ2l2ZW4gbGluayBieSBpdHMgaWRlbnRpZmllci5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBsaW5rSWQgaWRlbnRpZmllciBvZiBhIGxpbmsgaW4gcXVlc3Rpb24uXG4gICAgICogQHJldHVybnMge09iamVjdH0gTGluayBwb3NpdGlvbiBieSBsaW5rIGlkXG4gICAgICogQHJldHVybnMge09iamVjdC5mcm9tfSB7eCwgeX0gY29vcmRpbmF0ZXMgb2YgbGluayBzdGFydFxuICAgICAqIEByZXR1cm5zIHtPYmplY3QudG99IHt4LCB5fSBjb29yZGluYXRlcyBvZiBsaW5rIGVuZFxuICAgICAqL1xuICAgIGdldExpbmtQb3NpdGlvbjogZ2V0TGlua1Bvc2l0aW9uLFxuXG4gICAgLyoqXG4gICAgICogUmVxdWVzdHMgbGF5b3V0IGFsZ29yaXRobSB0byBwaW4vdW5waW4gbm9kZSB0byBpdHMgY3VycmVudCBwb3NpdGlvblxuICAgICAqIFBpbm5lZCBub2RlcyBzaG91bGQgbm90IGJlIGFmZmVjdGVkIGJ5IGxheW91dCBhbGdvcml0aG0gYW5kIGFsd2F5c1xuICAgICAqIHJlbWFpbiBhdCB0aGVpciBwb3NpdGlvblxuICAgICAqXG4gICAgICogQHBhcmFtIHtvYmplY3R9IG5vZGUgZ3JhcGggbm9kZSB0aGF0IG5lZWRzIHRvIGJlIHBpbm5lZFxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gaXNQaW5uZWQgc3RhdHVzIG9mIHRoZSBub2RlLlxuICAgICAqL1xuICAgIHBpbk5vZGU6IGFzeW5jUGluTm9kZSxcblxuICAgIC8qKlxuICAgICAqIFNldHMgcG9zaXRpb24gb2YgYSBub2RlIHRvIGEgZ2l2ZW4gY29vcmRpbmF0ZXNcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbm9kZUlkIG5vZGUgaWRlbnRpZmllclxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSB4IHBvc2l0aW9uIG9mIGEgbm9kZVxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSB5IHBvc2l0aW9uIG9mIGEgbm9kZVxuICAgICAqIEBwYXJhbSB7bnVtYmVyPX0geiBwb3NpdGlvbiBvZiBub2RlIChvbmx5IGlmIDNkIGxheW91dClcbiAgICAgKi9cbiAgICBzZXROb2RlUG9zaXRpb246IGFzeW5jTm9kZVBvc2l0aW9uLFxuXG4gICAgLyoqXG4gICAgICogR2V0cyByZWN0YW5nbGUgKG9yIGEgYm94KSB0aGF0IGJvdW5kcyB0aGUgZ3JhcGhcbiAgICAgKi9cbiAgICBnZXRHcmFwaFJlY3Q6IGdldEdyYXBoUmVjdCxcblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdHJ1ZSBpZiBub2RlIGlzIGN1cnJlbnRseSBwaW5uZWQgKGkuZS4gbm90IG1vdmVkIGJ5IGxheW91dCk7XG4gICAgICogRmFsc2Ugb3RoZXJ3aXNlLlxuICAgICAqL1xuICAgIGlzTm9kZVBpbm5lZDogaXNOb2RlUGlubmVkXG4gIH07XG5cbiAgZXZlbnRpZnkoYXBpKTtcblxuICByZXR1cm4gYXBpO1xuXG4gIGZ1bmN0aW9uIGFzeW5jU3RlcCgpIHtcbiAgICAvLyB3ZSBjYW5ub3QgZG8gYW55dGhpbmcgdW50aWwgd2UgcmVjZWl2ZSAnaW5pdERvbmUnIG1lc3NhZ2UgZnJvbSB3b3JrZXJcbiAgICAvLyB0byBjb25maXJtIHRoYXQgaXQncyByZWFkeSB0byBwcm9jZXNzIGxheW91dCByZXF1ZXN0cy5cbiAgICBpZiAocGVuZGluZ0luaXRpYWxpemF0aW9uKSByZXR1cm47XG5cbiAgICBsYXlvdXRXb3JrZXIucG9zdE1lc3NhZ2Uoc3RlcE1lc3NhZ2UpO1xuXG4gICAgLy8gVE9ETzogSSBuZWVkIHRvIHJld3JpdGUgbmdyYXBoLmZvcmNlbGF5b3V0IHRvIGJlIGV2ZW4tZHJpdmVuLFxuICAgIC8vIHNvIHRoYXQgaXQgY2FuIG5vdGlmeSBjYWxsZXIgYWJvdXQgc3RhYmxlL3Vuc3RhYmxlIGNoYW5nZSBhc3luY2hyb25vdXNseVxuICAgIHJldHVybiBzeXN0ZW1TdGFibGU7XG4gIH1cblxuICBmdW5jdGlvbiBhc3luY05vZGVQb3NpdGlvbihub2RlSWQsIHgsIHksIHopIHtcbiAgICAvLyBsZXQgbGF5b3V0IGtub3cgdGhhdCB3ZSBjaGFuZ2VkIHRoZSBwb3NpdGlvblxuICAgIGxheW91dFdvcmtlci5wb3N0TWVzc2FnZSh7XG4gICAgICBraW5kOiBtZXNzYWdlS2luZC5zZXROb2RlUG9zaXRpb24sXG4gICAgICBwYXlsb2FkOiB7XG4gICAgICAgIG5vZGVJZDogbm9kZUlkLFxuICAgICAgICB4OiB4LFxuICAgICAgICB5OiB5LFxuICAgICAgICB6OiB6XG4gICAgICB9XG4gICAgfSk7XG4gICAgLy8gYWxzbyB1cGRhdGUgc3luY2hyb25vdXNseSBvdXIgbGFzdCByZW1lbWJlciBwb3NpdGlvbjpcbiAgICBhc3NpZ25Qb3NpdGlvbihwb3NpdGlvbnNbbm9kZUlkXSwgeyB4OiB4LCB5OiB5LCB6OiB6IH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gZ2V0R3JhcGhSZWN0KCkge1xuICAgIHJldHVybiBncmFwaFJlY3Q7XG4gIH1cblxuICBmdW5jdGlvbiBhc3luY1Bpbk5vZGUobm9kZSwgaXNQaW5uZWQpIHtcbiAgICBsYXlvdXRXb3JrZXIucG9zdE1lc3NhZ2Uoe1xuICAgICAga2luZDogbWVzc2FnZUtpbmQucGluTm9kZSxcbiAgICAgIHBheWxvYWQ6IHtcbiAgICAgICAgbm9kZUlkOiBub2RlLmlkLFxuICAgICAgICBpc1Bpbm5lZDogaXNQaW5uZWRcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIHdlIG5lZWQgdG8gaGF2ZSBzeW5jIHdheSBvZiBhbnN3ZXJpbmcgdG8gaXNOb2RlUGlubmVkIHJlcXVlc3QuXG4gICAgLy8gVGhpcyBpcyBub3QgcGVyZmVjdCwgc2luY2Ugb3JpZ2luYWwgZ3JhcGggY29uZmlndXJhdGlvbiBtYXlcbiAgICAvLyBpbmNsdWRlIHBpbm5lZCBub2Rlcy4gV2UgY3VycmVudGx5IGRvIG5vdCB0YWtlIHRoYXQgaW50byBhY2NvdW50LlxuICAgIHBpblN0YXR1c1tub2RlLmlkXSA9IGlzUGlubmVkO1xuICB9XG5cbiAgZnVuY3Rpb24gaXNOb2RlUGlubmVkKG5vZGUpIHtcbiAgICByZXR1cm4gcGluU3RhdHVzW25vZGUuaWRdO1xuICB9XG5cbiAgZnVuY3Rpb24gaW5pdFdvcmtlcigpIHtcbiAgICBpZiAoaW5pdFJlcXVlc3RTZW50KSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0luaXQgcmVxdWVzdCBpcyBhbHJlYWR5IHNlbnQgdG8gdGhlIHdvcmtlcicpO1xuICAgIH1cblxuICAgIGxheW91dFdvcmtlci5wb3N0TWVzc2FnZSh7XG4gICAgICBraW5kOiBtZXNzYWdlS2luZC5pbml0LFxuICAgICAgcGF5bG9hZDoge1xuICAgICAgICBncmFwaDogdG9qc29uKGdyYXBoKSxcbiAgICAgICAgb3B0aW9uczogSlNPTi5zdHJpbmdpZnkob3B0aW9ucylcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGluaXRSZXF1ZXN0U2VudCA9IHRydWU7XG4gIH1cblxuICBmdW5jdGlvbiBpbml0UG9zaXRpb25zKCkge1xuICAgIC8vIHdlIG5lZWQgdG8gaW5pdGlhbGl6ZSBwb3NpdGlvbnMganVzdCBvbmNlXG4gICAgdmFyIGxheW91dCA9IGNyZWF0ZUxheW91dChncmFwaCwgb3B0aW9ucyk7XG4gICAgZ3JhcGguZm9yRWFjaE5vZGUoaW5pdFBvc2l0aW9uKTtcbiAgICBncmFwaFJlY3QgPSBsYXlvdXQuZ2V0R3JhcGhSZWN0KCk7XG5cbiAgICBmdW5jdGlvbiBpbml0UG9zaXRpb24obm9kZSkge1xuICAgICAgcG9zaXRpb25zW25vZGUuaWRdID0gbGF5b3V0LmdldE5vZGVQb3NpdGlvbihub2RlLmlkKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBnZXROb2RlUG9zaXRpb24obm9kZUlkKSB7XG4gICAgcmV0dXJuIHBvc2l0aW9uc1tub2RlSWRdO1xuICB9XG5cbiAgZnVuY3Rpb24gZ2V0TGlua1Bvc2l0aW9uKGxpbmtJZCkge1xuICAgIGlmICghbGlua1Bvc2l0aW9ucykge1xuICAgICAgaW5pdGlhbGl6ZUxpbmtQb3NpdGlvbnMoKTtcbiAgICB9XG4gICAgcmV0dXJuIGxpbmtQb3NpdGlvbnNbbGlua0lkXTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGluaXRpYWxpemVMaW5rUG9zaXRpb25zKCkge1xuICAgIGxpbmtQb3NpdGlvbnMgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuICAgIGdyYXBoLmZvckVhY2hMaW5rKGZ1bmN0aW9uKGxpbmspIHtcbiAgICAgIGxpbmtQb3NpdGlvbnNbbGluay5pZF0gPSB7XG4gICAgICAgIGZyb206IGdldE5vZGVQb3NpdGlvbihsaW5rLmZyb21JZCksXG4gICAgICAgIHRvOiBnZXROb2RlUG9zaXRpb24obGluay50b0lkKVxuICAgICAgfTtcbiAgICB9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGhhbmRsZU1lc3NhZ2VGcm9tV29ya2VyKG1lc3NhZ2UpIHtcbiAgICB2YXIga2luZCA9IG1lc3NhZ2UuZGF0YS5raW5kO1xuICAgIHZhciBwYXlsb2FkID0gbWVzc2FnZS5kYXRhLnBheWxvYWRcblxuICAgIGlmIChraW5kID09PSBtZXNzYWdlS2luZC5jeWNsZUNvbXBsZXRlKSB7XG4gICAgICBzZXRQb3NpdGlvbnMocGF5bG9hZC5wb3NpdGlvbnMsIHBheWxvYWQuc3lzdGVtU3RhYmxlKTtcbiAgICAgIGdyYXBoUmVjdCA9IHBheWxvYWQuYmJveDtcbiAgICAgIGFwaS5maXJlKCdjeWNsZScsIHBheWxvYWQuaXRlcmF0aW9ucywgcGF5bG9hZC5zeXN0ZW1TdGFibGUpO1xuICAgIH0gaWYgKGtpbmQgPT09IG1lc3NhZ2VLaW5kLmluaXREb25lKSB7XG4gICAgICBwZW5kaW5nSW5pdGlhbGl6YXRpb24gPSBmYWxzZTtcbiAgICAgIGFzeW5jU3RlcCgpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHNldFBvc2l0aW9ucyhuZXdQb3NpdGlvbnMsIG5ld1N5c3RlbVN0YWJsZSkge1xuICAgIHN5c3RlbVN0YWJsZSA9IG5ld1N5c3RlbVN0YWJsZTtcbiAgICBPYmplY3Qua2V5cyhuZXdQb3NpdGlvbnMpLmZvckVhY2godXBkYXRlUG9zaXRpb24pO1xuICAgIHJldHVybjtcblxuICAgIGZ1bmN0aW9uIHVwZGF0ZVBvc2l0aW9uKG5vZGVJZCkge1xuICAgICAgdmFyIG5ld1Bvc2l0aW9uID0gbmV3UG9zaXRpb25zW25vZGVJZF07XG4gICAgICB2YXIgb2xkUG9zaXRpb24gPSBwb3NpdGlvbnNbbm9kZUlkXTtcbiAgICAgIGlmICghb2xkUG9zaXRpb24pIHtcbiAgICAgICAgcG9zaXRpb25zW25vZGVJZF0gPSBuZXdQb3NpdGlvbjtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGFzc2lnblBvc2l0aW9uKG9sZFBvc2l0aW9uLCBuZXdQb3NpdGlvbik7XG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGFzc2lnblBvc2l0aW9uM2Qob2xkUG9zLCBuZXdQb3MpIHtcbiAgb2xkUG9zLnggPSBuZXdQb3MueDtcbiAgb2xkUG9zLnkgPSBuZXdQb3MueTtcbiAgb2xkUG9zLnogPSBuZXdQb3Muejtcbn1cblxuZnVuY3Rpb24gYXNzaWduUG9zaXRpb24yZChvbGRQb3MsIG5ld1Bvcykge1xuICBvbGRQb3MueCA9IG5ld1Bvcy54O1xuICBvbGRQb3MueSA9IG5ld1Bvcy55O1xufVxuIiwidmFyIGxheW91dDNkID0gcmVxdWlyZSgnbmdyYXBoLmZvcmNlbGF5b3V0M2QnKTtcbnZhciBsYXlvdXQyZCA9IGxheW91dDNkLmdldDJkTGF5b3V0O1xuXG5tb2R1bGUuZXhwb3J0cyA9IGNyZWF0ZUxheW91dDtcblxuZnVuY3Rpb24gY3JlYXRlTGF5b3V0KGdyYXBoLCBvcHRpb25zKSB7XG4gIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG4gIHJldHVybiBvcHRpb25zLmlzM2QgP1xuICAgIGxheW91dDNkKGdyYXBoLCBvcHRpb25zLnBoeXNpY3MpIDpcbiAgICBsYXlvdXQyZChncmFwaCwgb3B0aW9ucy5waHlzaWNzKTtcbn1cbiIsInZhciBjcmVhdGVMYXlvdXQgPSByZXF1aXJlKCcuL2NyZWF0ZUxheW91dC5qcycpO1xudmFyIGZyb21qc29uID0gcmVxdWlyZSgnbmdyYXBoLmZyb21qc29uJyk7XG52YXIgdmFsaWRhdGVPcHRpb25zID0gcmVxdWlyZSgnLi4vb3B0aW9ucy5qcycpO1xudmFyIG1lc3NhZ2VLaW5kID0gcmVxdWlyZSgnLi9tZXNzYWdlcy5qcycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGxheW91dFdvcmtlcjtcblxuLyoqXG4gKiBUaGlzIG1ldGhvZCBpcyBleGVjdXRlZCBhcyBhIHdlYndvcmtlciB0aHJlYWQuIEl0IGV4cGVjdHMgJ2luaXQnIHNpZ25hbFxuICogZnJvbSB0aGUgbWFpbiB0aHJlYWQgdG8gc3RhcnQgbGF5b3V0LlxuICovXG5mdW5jdGlvbiBsYXlvdXRXb3JrZXIoc2VsZikge1xuICB2YXIgbGF5b3V0OyAvLyBtYWluIHRocmVhZCB3aWxsIHNlbmQgYSBtZXNzYWdlIHRvIGluaXRpYWxpemUgdGhpc1xuICB2YXIgYXN5bmNPcHRpb25zO1xuICB2YXIgY29tcGxldGVkSXRlcmF0aW9ucyA9IDA7XG4gIHZhciBzdGVwQ2FsbGVkID0gZmFsc2U7XG4gIHZhciB0aW1lb3V0SWQgPSAwO1xuICB2YXIgc3lzdGVtU3RhYmxlID0gZmFsc2U7XG4gIHZhciBncmFwaDtcblxuICB2YXIgcG9zaXRpb25zID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcbiAgc2VsZi5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgaGFuZGxlTWVzc2FnZUZyb21NYWluVGhyZWFkKTtcblxuICByZXR1cm47IC8vIHB1YmxpYyBBUEkgaXMgb3Zlci4gQmVsb3cgYXJlIHByaXZhdGUgbWV0aG9kcyBvbmx5LlxuXG4gIGZ1bmN0aW9uIGhhbmRsZU1lc3NhZ2VGcm9tTWFpblRocmVhZChtZXNzYWdlKSB7XG4gICAgdmFyIGtpbmQgPSBtZXNzYWdlLmRhdGEua2luZDtcbiAgICB2YXIgcGF5bG9hZCA9IG1lc3NhZ2UuZGF0YS5wYXlsb2FkO1xuXG4gICAgaWYgKGtpbmQgPT09IG1lc3NhZ2VLaW5kLmluaXQpIHtcbiAgICAgIGdyYXBoID0gZnJvbWpzb24ocGF5bG9hZC5ncmFwaCk7XG4gICAgICB2YXIgb3B0aW9ucyA9IEpTT04ucGFyc2UocGF5bG9hZC5vcHRpb25zKTtcblxuICAgICAgaW5pdChncmFwaCwgb3B0aW9ucyk7XG4gICAgfSBlbHNlIGlmIChraW5kID09PSBtZXNzYWdlS2luZC5zdGVwKSB7XG4gICAgICBzdGVwKCk7XG4gICAgfSBlbHNlIGlmIChraW5kID09PSBtZXNzYWdlS2luZC5waW5Ob2RlKSB7XG4gICAgICBwaW5Ob2RlKHBheWxvYWQubm9kZUlkLCBwYXlsb2FkLmlzUGlubmVkKTtcbiAgICB9IGVsc2UgaWYgKGtpbmQgPT09IG1lc3NhZ2VLaW5kLnNldE5vZGVQb3NpdGlvbikge1xuICAgICAgc2V0Tm9kZVBvc2l0aW9uKHBheWxvYWQubm9kZUlkLCBwYXlsb2FkLngsIHBheWxvYWQueSwgcGF5bG9hZC56KTtcbiAgICB9XG4gICAgLy8gVE9ETzogbGlzdGVuIGZvciBncmFwaCBjaGFuZ2VzIGZyb20gbWFpbiB0aHJlYWQgYW5kIHVwZGF0ZSBsYXlvdXQgaGVyZS5cbiAgfVxuXG4gIGZ1bmN0aW9uIHNldE5vZGVQb3NpdGlvbihub2RlSWQsIHgsIHksIHopIHtcbiAgICBhc3NlcnRJbml0aWFsaXplZCgpO1xuXG4gICAgbGF5b3V0LnNldE5vZGVQb3NpdGlvbi5hcHBseShsYXlvdXQsIGFyZ3VtZW50cyk7XG4gICAgc3lzdGVtU3RhYmxlID0gZmFsc2U7XG4gICAgc3RlcCgpO1xuICB9XG5cbiAgZnVuY3Rpb24gcGluTm9kZShub2RlSWQsIGlzUGlubmVkKSB7XG4gICAgYXNzZXJ0SW5pdGlhbGl6ZWQoKTtcblxuICAgIHZhciBub2RlID0gZ3JhcGguZ2V0Tm9kZShub2RlSWQpO1xuICAgIGlmICghbm9kZSkgcmV0dXJuOyAvLyBpZ25vcmluZyByaWdodCBub3cuIHNob3VsZCBpdCB0aHJvdz9cblxuICAgIGxheW91dC5waW5Ob2RlKG5vZGUsIGlzUGlubmVkKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGFzc2VydEluaXRpYWxpemVkKCkge1xuICAgIGlmICghZ3JhcGgpIHRocm93IG5ldyBFcnJvcignUGluIG5vZGUgcmVxdWVzdGVkIHdpdGhvdXQgaW5pdGlhbGllZCBncmFwaCcpO1xuICAgIGlmICghbGF5b3V0KSB0aHJvdyBuZXcgRXJyb3IoJ0xheW91dCB3YXMgbm90IGNyZWF0ZWQuIFNvbWV0aGluZyBpcyByZWFsbHkgd3JvbmcgaGVyZScpO1xuICB9XG5cbiAgZnVuY3Rpb24gaW5pdChncmFwaCwgb3B0aW9ucykge1xuICAgIC8vIHVuZm9ydHVuYXRlbHkgd2UgbmVlZCB0byByZXZhbGlkYXRlIGhlcmUsIHNpbmNlIFBPU0lUSVZFX0lORklOSVRZIGNvdWxkXG4gICAgLy8gYmUgbG9zdCBkdXJpbmcgdGhyZWFkcyB0cmFuc2l0aW9uXG4gICAgb3B0aW9ucyA9IHZhbGlkYXRlT3B0aW9ucyhvcHRpb25zKTtcbiAgICBhc3luY09wdGlvbnMgPSBvcHRpb25zLmFzeW5jO1xuXG4gICAgbGF5b3V0ID0gY3JlYXRlTGF5b3V0KGdyYXBoLCBvcHRpb25zKTtcbiAgICBncmFwaC5mb3JFYWNoTm9kZShpbml0UG9zaXRpb24pO1xuXG4gICAgLy8gbGV0IG1haW4gdGhyZWFkIGtub3cgdGhhdCB3ZSBjYW4gcHJvY2VzcyBsYXlvdXRcbiAgICBzZWxmLnBvc3RNZXNzYWdlKHsga2luZDogbWVzc2FnZUtpbmQuaW5pdERvbmUgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBpbml0UG9zaXRpb24obm9kZSkge1xuICAgIHBvc2l0aW9uc1tub2RlLmlkXSA9IGxheW91dC5nZXROb2RlUG9zaXRpb24obm9kZS5pZCk7XG4gIH1cblxuICBmdW5jdGlvbiBzdGVwKCkge1xuICAgIGFzc2VydEluaXRpYWxpemVkKCk7XG5cbiAgICBzdGVwQ2FsbGVkID0gdHJ1ZTtcblxuICAgIGlmICghdGltZW91dElkKSB7XG4gICAgICBydW5MYXlvdXRDeWNsZUFzeW5jKCk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcnVuTGF5b3V0Q3ljbGVBc3luYygpIHtcbiAgICBpZiAoc3lzdGVtU3RhYmxlKSB7XG4gICAgICB0aW1lb3V0SWQgPSAwO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIHdlIGhhdmUgdG8gdW5ibG9jayB0aGlzIHRocmVhZCB0byByZWNlaXZlIG1lc3NhZ2VzIGZyb20gdGhlIG1haW4gdGhyZWFkLlxuICAgIHRpbWVvdXRJZCA9IHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICBydW5MYXlvdXRDeWNsZSgpO1xuXG4gICAgICAvLyBXZSBlaXRoZXIgd2FpdCB1bnRpbCBuZXh0IGBzdGVwYCBldmVudCBmcm9tIFJBRiwgb3IgcnVuIG5vdyBpZiBhc2tlZCB0b1xuICAgICAgLy8gbm90IHdhaXQgZm9yIGBzdGVwYC5cbiAgICAgIGlmIChzdGVwQ2FsbGVkIHx8ICFhc3luY09wdGlvbnMud2FpdEZvclN0ZXApIHtcbiAgICAgICAgc3RlcENhbGxlZCA9IGZhbHNlO1xuICAgICAgICBydW5MYXlvdXRDeWNsZUFzeW5jKCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyB3YWl0IGZvciB0aGUgbmV4dCBldmVudCBmcm9tIHRoZSBtYWluIHRocmVhZCB0byBjb250aW51ZTtcbiAgICAgICAgdGltZW91dElkID0gMDtcbiAgICAgIH1cbiAgICB9LCAwKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHJ1bkxheW91dEN5Y2xlKCkge1xuICAgIHZhciB3YXNTdGFibGUgPSBzeXN0ZW1TdGFibGU7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhc3luY09wdGlvbnMuc3RlcHNQZXJDeWNsZTsgKytpKSB7XG4gICAgICBzeXN0ZW1TdGFibGUgPSBsYXlvdXQuc3RlcCgpO1xuICAgICAgY29tcGxldGVkSXRlcmF0aW9ucyArPSAxO1xuICAgIH1cblxuICAgIGlmIChjb21wbGV0ZWRJdGVyYXRpb25zID49IGFzeW5jT3B0aW9ucy5tYXhJdGVyYXRpb25zKSB7XG4gICAgICBzeXN0ZW1TdGFibGUgPSB0cnVlO1xuICAgIH1cblxuICAgIHNlbGYucG9zdE1lc3NhZ2Uoe1xuICAgICAga2luZDogbWVzc2FnZUtpbmQuY3ljbGVDb21wbGV0ZSxcbiAgICAgIHBheWxvYWQ6IHtcbiAgICAgICAgcG9zaXRpb25zOiBwb3NpdGlvbnMsXG4gICAgICAgIHN5c3RlbVN0YWJsZTogc3lzdGVtU3RhYmxlLFxuICAgICAgICBiYm94OiBsYXlvdXQuZ2V0R3JhcGhSZWN0KCksXG4gICAgICAgIGl0ZXJhdGlvbnM6IGNvbXBsZXRlZEl0ZXJhdGlvbnNcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxufTtcbiIsIi8qKlxuICogVGhpcyBmaWxlIGRlZmluZXMgYWxsIHBvc3NpYmxlIG1lc3NhZ2VzIGJldHdlZW4gbWFpbiB0aHJlYWQgYW5kXG4gKiB3ZWIgd29ya2VyLiBUaGUga2V5IGlzIGh1bWFuIHJlYWRhYmxlIG1lc3NhZ2UgdHlwZSwgYW5kIHRoZSB2YWx1ZSBpcyBhXG4gKiBudW1lcmljIGF0dHJpYnV0ZSBmb3IgcXVpY2sgbWF0Y2hpbmdcbiAqL1xubW9kdWxlLmV4cG9ydHMgPSB7XG4gIC8qKlxuICAgKiBTZW50IGZyb20gbWFpbiB0aHJlYWQgdG8gd2ViIHdvcmtlciB0byBpbml0aWFsaXplIGZvcmNlIGxheW91dFxuICAgKlxuICAgKiBwYXlsb2FkOlxuICAgKiAge3N0cmluZ30gZ3JhcGggLSByZXN1bHQgb2YgbmdyYXBoLnRvanNvbihncmFwaCkgb3BlcmF0aW9uLlxuICAgKiAge3N0cmluZ30gb3B0aW9ucyAtIHN0cmluZ2lmaWVkIG9wdGlub25zIHJlY2VpdmVkIGJ5IG5ncmFwaC5hc3luY2ZvcmNlKCkuXG4gICAqL1xuICBpbml0OiAxMCxcblxuICAvKipcbiAgICogU2VudCBmcm9tIHdlYiB3b3JrZXIgdG8gbWFpbiB0aHJlYWQgdG8gY29uZmlybSB0aGF0IHdvcmtlciBoYXMgZG9uZVxuICAgKiBpbml0aWFsaXphdGlubyBhbmQgY2FuIHByb2Nlc3MgaW5jb21pbmcgbGF5b3V0IHJlcXVlc3RzXG4gICAqXG4gICAqIHBheWxvYWQ6IHVuZGVmaW5lZC5cbiAgICovXG4gIGluaXREb25lOiAxMSxcblxuICAvKipcbiAgICogU2VudCBmcm9tIG1haW4gdGhyZWFkIHRvIHdlYiB3b3JrZXIgdG8gbm90aWZ5IHRoYXQgcmVuZGVyaW5nIGxvb3AgaXMgY3VycmVudGx5XG4gICAqIGFjdGl2ZSBhbmQgd29ya2VyIHNob3VsZCBwZXJmb3JtIGxheW91dCAoaWYgcmVxdWlyZWQpLiBXb3JrZXIgY2FuIGRlY2lkZVxuICAgKiB0byBpZ25vcmUgdGhpcyByZXF1ZXN0IGlmLCBmb3IgZXhhbXBsZSwgbGF5b3V0IGlzIGFscmVhZHkgY29tcHV0ZWQsIG9yXG4gICAqIHdvcmtlciBoYXMgcGVyZm9ybWVkIG1vcmUgdGhhbiBvcHRpb25zLmFzeW5jLm1heEl0ZXJhdGlvbnMgaXRlcmF0aW9ucy5cbiAgICpcbiAgICogcGF5bG9hZDogdW5kZWZpbmVkLlxuICAgKi9cbiAgc3RlcDogMTIsXG5cbiAgLyoqXG4gICAqIFNlbnQgZnJvbSB3ZWJ3b3JrZXIgdG8gbWFpbiB0aHJlYWQgdG8gaW5kaWNhdGUgdGhhdCB3b3JrZXIgaGFzIGZpbmlzaGVkXG4gICAqIG9uZSBjeWNsZSBvZiBsYXlvdXQgaXRlcmF0aW9ucy4gRWFjaCBjeWNsZSBjYW4gcGVyZm9ybSB1cCB0b1xuICAgKiBvcHRpb25zLmFzbmMuc3RlcHNQZXJDeWNsZSBpdGVyYXRpb25zIG9mIGxheW91dC5cbiAgICpcbiAgICogcGF5bG9hZDpcbiAgICogIHtvYmplY3R9IHBvc2l0aW9ucyAtIGtleXMgYXJlIG5vZGUgaWRzLCB2YWx1ZXMgYXJlIHt4LCB5LCB6fSBjb29yZGluYXRlc1xuICAgKiAge2Jvb2xlYW59IHN5c3RlbVN0YWJsZSAtIGluZGljYXRlcyB0aGF0IHN5c3RlbSBpcyBzdGFibGUuIE5PVEU6IHRoaXMgd2lsbFxuICAgKiAgYmUgcmVtb3ZlZCBmcm9tIGZ1dHVyZSB2ZXJzaW9uLlxuICAgKi9cbiAgY3ljbGVDb21wbGV0ZTogMTMsXG5cbiAgLyoqXG4gICAqIFNlbnQgZnJvbSBtYWluIHRocmVhZCB0byB3ZWIgd29ya2VyIHRvIHBpbiBub2RlXG4gICAqXG4gICAqIHBheWxvYWQ6XG4gICAqICAge3N0cmluZ30gbm9kZUlkIC0gaWRlbnRpZmllciBvZiB0aGUgbm9kZSB0aGF0IG5lZWRzIHRvIGJlIHBpbm5lZFxuICAgKiAgIHtib29sZWFufSBpc1Bpbm5lZCBzdGF0dXMgb2YgdGhlIG5vZGVcbiAgICovXG4gIHBpbk5vZGU6IDQxLFxuXG4gIC8qKlxuICAgKiBTZW50IGZyb20gbWFpbiB0aHJlYWQgdG8gd2ViIHdvcmtlciB0byBzZXQgcG9zaXRpb24gb2YgdGhlIG5vZGVcbiAgICpcbiAgICogcGF5bG9hZDpcbiAgICogIHtzdHJpbmd9IG5vZGVJZCAtIGlkZW50aWZpZXIgb2YgdGhlIG5vZGUgdGhhdCBuZWVkcyBwb3NpdGlvbiB1cGRhdGUuXG4gICAqICB7bnVtYmVyfSB4IC0geCBjb29yZGluYXRlXG4gICAqICB7bnVtYmVyfSB5IC0geSBjb29yZGluYXRlXG4gICAqICB7bnVtYmVyK30geiAtIHogY29vcmRpbmF0ZSAtIG9ubHkgYXBwbGljYWJsZSBmb3IgM2QgbGF5b3V0XG4gICAqL1xuICBzZXROb2RlUG9zaXRpb246IDQzXG59O1xuIiwiLyoqXG4gKiBUaGlzIGZpbGUgZGVmaW5lcyBjb25maWd1cmF0aW9uIG9wdGlvbnMgZm9yIHRoZSBhc3luY2ZvcmNlIG1vZHVsZS4gRXZlcnlcbiAqIGNvbmZpZ3VyYXRpb24gaXMgb3B0aW9uYWwuIFlvdSBjYW4gZmluZCBpdHMgZGVzY3JpcHRpb24gYW5kIGRlZmF1bHQgdmFsdWUgYmVsb3cuXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gdmFsaWRhdGVPcHRpb25zO1xuXG5mdW5jdGlvbiB2YWxpZGF0ZU9wdGlvbnMob3B0aW9ucykge1xuICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcblxuICAvKipcbiAgICogRG8gd2UgbmVlZCB0byBydW4gM0QgbGF5b3V0IG9yIDJEP1xuICAgKi9cbiAgb3B0aW9ucy5pczNkID0gdHlwZW9mIG9wdGlvbnMuaXMzZCA9PT0gJ2Jvb2xlYW4nID8gb3B0aW9ucy5pczNkIDogZmFsc2U7XG5cbiAgLy8gVGhlc2Ugb3B0aW9ucyBhcmUgaW4gc2VwYXJhdGUgb2JqZWN0IHNpbmNlIHRoZXkgY29uZmlndXJlIHdlYiB3b3JrZXIgYmVoYXZpb3JcbiAgLy8gbm90IGxheW91dC5cbiAgdmFyIGFzeW5jID0gKG9wdGlvbnMuYXN5bmMgPSBvcHRpb25zLmFzeW5jIHx8IHt9KTtcblxuICAvKipcbiAgICogV2ViIHdvcmtlciBjb21wdXRlcyBsYXlvdXQgaW4gY3ljbGVzLiBBZnRlciBlYWNoIGN5Y2xlIGlzIGRvbmUgd2ViIHdvcmtlclxuICAgKiBub3RpZmllcyB0aGUgbWFpbiB0aHJlYWQgd2l0aCB1cGRhdGVkIHBvc2l0aW9ucy4gVGhpcyBvcHRpb25zIGRlZmluZXNcbiAgICogaG93IG1hbnkgbGF5b3V0IHN0ZXBzIHNob3VsZCB3ZWIgd29ya2VyIGNvbXBsZXRlIHdpdGhpbiBvbmUgY3ljbGUuXG4gICAqL1xuICBhc3luYy5zdGVwc1BlckN5Y2xlID0gdHlwZW9mIGFzeW5jLnN0ZXBzUGVyQ3ljbGUgPT09ICdudW1iZXInID8gYXN5bmMuc3RlcHNQZXJDeWNsZSA6IDU7XG5cbiAgLyoqXG4gICAqIEJ5IGRlZmF1bHQgbGF5b3V0IHdpbGwgYmUgY29tcHV0ZWQgYXMgbG9uZyBhcyBlYWNoIGl0ZXJhdGlvbiBicmluZ3MgdG9vXG4gICAqIG11Y2ggbW92ZW1lbnQgdG8gdGhlIHN5c3RlbS4gSG93ZXZlciBpZiB5b3UnZCBsaWtlIHRvIGNvbXB1dGUgb25seSBOIGl0ZXJhdGlvbnNcbiAgICogb2YgbGF5b3V0LCB5b3UgY2FuIHNldCB0aGlzIG9wdGlvbiB0byBOLiBPbmNlIGxheW91dCByZWFjaGVzIE4gaXQgd2lsbCBjb25zaWRlclxuICAgKiBzeXN0ZW0gc3RhYmxlIGFuZCB3aWxsIG5vdCBjb21wdXRlIG1vcmUgaXRlcmF0aW9ucy5cbiAgICovXG4gIGFzeW5jLm1heEl0ZXJhdGlvbnMgPSB0eXBlb2YgYXN5bmMubWF4SXRlcmF0aW9ucyA9PT0gJ251bWJlcicgPyBhc3luYy5tYXhJdGVyYXRpb25zIDogTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZO1xuXG4gIC8qKlxuICAgKiBVbmxpa2UgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCkgd2ViIHdvcmtlcnMgYXJlIGV4ZWN1dGVkIGV2ZW4gd2hlbiBwYWdlIGlzXG4gICAqIG5vdCBhY3RpdmUgKGUuZy4gdXNlciBzd2l0Y2hlZCB0byBhIGRpZmZlcmVudCBicm93c2VyIHRhYikuIFRoaXMgY2FuIHJlc3VsdFxuICAgKiBpbiB1bm5lY2Vzc2FyeSBDUFUgY29uc3VtcHRpb24gYW5kIGJhdHRlcnkgZHJhaW4uXG4gICAqXG4gICAqIEJ5IGRlZmF1bHQgYXN5bmNmb3JjZSB3aWxsIGNhbGN1bGF0ZSBsYXlvdXQgYXMgbG9uZyBhcyB5b3UgY2FsbFxuICAgKiBgYXNuY2ZvcmNlLnN0ZXAoKWAuIE5vcm1hbGx5IHlvdSB3aWxsIGNhbGwgdGhpcyBtZXRob2QgZnJvbVxuICAgKiByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKSBoYW5kbGVyIHRvIG1hbmFnZSBDUFUgcmVzb3VyY2VzLlxuICAgKlxuICAgKiBIb3dldmVyLCBpZiB5b3UgcHJlZmVyIHRvIGtlZXAgY29tcHV0aW5nIGxheW91dCBpbiBiYWNrZ3JvdW5kIHNldCB0aGlzXG4gICAqIG9wdGlvbnMgdG8gdHJ1ZS4gTGF5b3V0IHdpbGwgYmUgY29tcHV0ZWQgdW50aWwgc3lzdGVtIGlzIGNvbnNpZGVyZWQgc3RhYmxlXG4gICAqIChzZWUgYG1heEl0ZXJhdGlvbnNgIGFib3ZlKS5cbiAgICovXG4gIGFzeW5jLndhaXRGb3JTdGVwID0gdHlwZW9mIGFzeW5jLndhaXRGb3JTdGVwID09PSAnYm9vbGVhbicgPyBhc3luYy53YWl0Rm9yU3RlcCA6IHRydWU7XG4gIHJldHVybiBvcHRpb25zO1xufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihzdWJqZWN0KSB7XG4gIHZhbGlkYXRlU3ViamVjdChzdWJqZWN0KTtcblxuICB2YXIgZXZlbnRzU3RvcmFnZSA9IGNyZWF0ZUV2ZW50c1N0b3JhZ2Uoc3ViamVjdCk7XG4gIHN1YmplY3Qub24gPSBldmVudHNTdG9yYWdlLm9uO1xuICBzdWJqZWN0Lm9mZiA9IGV2ZW50c1N0b3JhZ2Uub2ZmO1xuICBzdWJqZWN0LmZpcmUgPSBldmVudHNTdG9yYWdlLmZpcmU7XG4gIHJldHVybiBzdWJqZWN0O1xufTtcblxuZnVuY3Rpb24gY3JlYXRlRXZlbnRzU3RvcmFnZShzdWJqZWN0KSB7XG4gIC8vIFN0b3JlIGFsbCBldmVudCBsaXN0ZW5lcnMgdG8gdGhpcyBoYXNoLiBLZXkgaXMgZXZlbnQgbmFtZSwgdmFsdWUgaXMgYXJyYXlcbiAgLy8gb2YgY2FsbGJhY2sgcmVjb3Jkcy5cbiAgLy9cbiAgLy8gQSBjYWxsYmFjayByZWNvcmQgY29uc2lzdHMgb2YgY2FsbGJhY2sgZnVuY3Rpb24gYW5kIGl0cyBvcHRpb25hbCBjb250ZXh0OlxuICAvLyB7ICdldmVudE5hbWUnID0+IFt7Y2FsbGJhY2s6IGZ1bmN0aW9uLCBjdHg6IG9iamVjdH1dIH1cbiAgdmFyIHJlZ2lzdGVyZWRFdmVudHMgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXG4gIHJldHVybiB7XG4gICAgb246IGZ1bmN0aW9uIChldmVudE5hbWUsIGNhbGxiYWNrLCBjdHgpIHtcbiAgICAgIGlmICh0eXBlb2YgY2FsbGJhY2sgIT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdjYWxsYmFjayBpcyBleHBlY3RlZCB0byBiZSBhIGZ1bmN0aW9uJyk7XG4gICAgICB9XG4gICAgICB2YXIgaGFuZGxlcnMgPSByZWdpc3RlcmVkRXZlbnRzW2V2ZW50TmFtZV07XG4gICAgICBpZiAoIWhhbmRsZXJzKSB7XG4gICAgICAgIGhhbmRsZXJzID0gcmVnaXN0ZXJlZEV2ZW50c1tldmVudE5hbWVdID0gW107XG4gICAgICB9XG4gICAgICBoYW5kbGVycy5wdXNoKHtjYWxsYmFjazogY2FsbGJhY2ssIGN0eDogY3R4fSk7XG5cbiAgICAgIHJldHVybiBzdWJqZWN0O1xuICAgIH0sXG5cbiAgICBvZmY6IGZ1bmN0aW9uIChldmVudE5hbWUsIGNhbGxiYWNrKSB7XG4gICAgICB2YXIgd2FudFRvUmVtb3ZlQWxsID0gKHR5cGVvZiBldmVudE5hbWUgPT09ICd1bmRlZmluZWQnKTtcbiAgICAgIGlmICh3YW50VG9SZW1vdmVBbGwpIHtcbiAgICAgICAgLy8gS2lsbGluZyBvbGQgZXZlbnRzIHN0b3JhZ2Ugc2hvdWxkIGJlIGVub3VnaCBpbiB0aGlzIGNhc2U6XG4gICAgICAgIHJlZ2lzdGVyZWRFdmVudHMgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuICAgICAgICByZXR1cm4gc3ViamVjdDtcbiAgICAgIH1cblxuICAgICAgaWYgKHJlZ2lzdGVyZWRFdmVudHNbZXZlbnROYW1lXSkge1xuICAgICAgICB2YXIgZGVsZXRlQWxsQ2FsbGJhY2tzRm9yRXZlbnQgPSAodHlwZW9mIGNhbGxiYWNrICE9PSAnZnVuY3Rpb24nKTtcbiAgICAgICAgaWYgKGRlbGV0ZUFsbENhbGxiYWNrc0ZvckV2ZW50KSB7XG4gICAgICAgICAgZGVsZXRlIHJlZ2lzdGVyZWRFdmVudHNbZXZlbnROYW1lXTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB2YXIgY2FsbGJhY2tzID0gcmVnaXN0ZXJlZEV2ZW50c1tldmVudE5hbWVdO1xuICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY2FsbGJhY2tzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgICBpZiAoY2FsbGJhY2tzW2ldLmNhbGxiYWNrID09PSBjYWxsYmFjaykge1xuICAgICAgICAgICAgICBjYWxsYmFja3Muc3BsaWNlKGksIDEpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gc3ViamVjdDtcbiAgICB9LFxuXG4gICAgZmlyZTogZnVuY3Rpb24gKGV2ZW50TmFtZSkge1xuICAgICAgdmFyIGNhbGxiYWNrcyA9IHJlZ2lzdGVyZWRFdmVudHNbZXZlbnROYW1lXTtcbiAgICAgIGlmICghY2FsbGJhY2tzKSB7XG4gICAgICAgIHJldHVybiBzdWJqZWN0O1xuICAgICAgfVxuXG4gICAgICB2YXIgZmlyZUFyZ3VtZW50cztcbiAgICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMSkge1xuICAgICAgICBmaXJlQXJndW1lbnRzID0gQXJyYXkucHJvdG90eXBlLnNwbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG4gICAgICB9XG4gICAgICBmb3IodmFyIGkgPSAwOyBpIDwgY2FsbGJhY2tzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgIHZhciBjYWxsYmFja0luZm8gPSBjYWxsYmFja3NbaV07XG4gICAgICAgIGNhbGxiYWNrSW5mby5jYWxsYmFjay5hcHBseShjYWxsYmFja0luZm8uY3R4LCBmaXJlQXJndW1lbnRzKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHN1YmplY3Q7XG4gICAgfVxuICB9O1xufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZVN1YmplY3Qoc3ViamVjdCkge1xuICBpZiAoIXN1YmplY3QpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0V2ZW50aWZ5IGNhbm5vdCB1c2UgZmFsc3kgb2JqZWN0IGFzIGV2ZW50cyBzdWJqZWN0Jyk7XG4gIH1cbiAgdmFyIHJlc2VydmVkV29yZHMgPSBbJ29uJywgJ2ZpcmUnLCAnb2ZmJ107XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgcmVzZXJ2ZWRXb3Jkcy5sZW5ndGg7ICsraSkge1xuICAgIGlmIChzdWJqZWN0Lmhhc093blByb3BlcnR5KHJlc2VydmVkV29yZHNbaV0pKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJTdWJqZWN0IGNhbm5vdCBiZSBldmVudGlmaWVkLCBzaW5jZSBpdCBhbHJlYWR5IGhhcyBwcm9wZXJ0eSAnXCIgKyByZXNlcnZlZFdvcmRzW2ldICsgXCInXCIpO1xuICAgIH1cbiAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBleHBvc2VQcm9wZXJ0aWVzO1xuXG4vKipcbiAqIEF1Z21lbnRzIGB0YXJnZXRgIG9iamVjdCB3aXRoIGdldHRlci9zZXR0ZXIgZnVuY3Rpb25zLCB3aGljaCBtb2RpZnkgc2V0dGluZ3NcbiAqXG4gKiBAZXhhbXBsZVxuICogIHZhciB0YXJnZXQgPSB7fTtcbiAqICBleHBvc2VQcm9wZXJ0aWVzKHsgYWdlOiA0Mn0sIHRhcmdldCk7XG4gKiAgdGFyZ2V0LmFnZSgpOyAvLyByZXR1cm5zIDQyXG4gKiAgdGFyZ2V0LmFnZSgyNCk7IC8vIG1ha2UgYWdlIDI0O1xuICpcbiAqICB2YXIgZmlsdGVyZWRUYXJnZXQgPSB7fTtcbiAqICBleHBvc2VQcm9wZXJ0aWVzKHsgYWdlOiA0MiwgbmFtZTogJ0pvaG4nfSwgZmlsdGVyZWRUYXJnZXQsIFsnbmFtZSddKTtcbiAqICBmaWx0ZXJlZFRhcmdldC5uYW1lKCk7IC8vIHJldHVybnMgJ0pvaG4nXG4gKiAgZmlsdGVyZWRUYXJnZXQuYWdlID09PSB1bmRlZmluZWQ7IC8vIHRydWVcbiAqL1xuZnVuY3Rpb24gZXhwb3NlUHJvcGVydGllcyhzZXR0aW5ncywgdGFyZ2V0LCBmaWx0ZXIpIHtcbiAgdmFyIG5lZWRzRmlsdGVyID0gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGZpbHRlcikgPT09ICdbb2JqZWN0IEFycmF5XSc7XG4gIGlmIChuZWVkc0ZpbHRlcikge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZmlsdGVyLmxlbmd0aDsgKytpKSB7XG4gICAgICBhdWdtZW50KHNldHRpbmdzLCB0YXJnZXQsIGZpbHRlcltpXSk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGZvciAodmFyIGtleSBpbiBzZXR0aW5ncykge1xuICAgICAgYXVnbWVudChzZXR0aW5ncywgdGFyZ2V0LCBrZXkpO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBhdWdtZW50KHNvdXJjZSwgdGFyZ2V0LCBrZXkpIHtcbiAgaWYgKHNvdXJjZS5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgaWYgKHR5cGVvZiB0YXJnZXRba2V5XSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgLy8gdGhpcyBhY2Nlc3NvciBpcyBhbHJlYWR5IGRlZmluZWQuIElnbm9yZSBpdFxuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB0YXJnZXRba2V5XSA9IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgaWYgKHZhbHVlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgc291cmNlW2tleV0gPSB2YWx1ZTtcbiAgICAgICAgcmV0dXJuIHRhcmdldDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBzb3VyY2Vba2V5XTtcbiAgICB9XG4gIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gY3JlYXRlTGF5b3V0O1xubW9kdWxlLmV4cG9ydHMuc2ltdWxhdG9yID0gcmVxdWlyZSgnbmdyYXBoLnBoeXNpY3Muc2ltdWxhdG9yJyk7XG5cbi8qKlxuICogQ3JlYXRlcyBmb3JjZSBiYXNlZCBsYXlvdXQgZm9yIGEgZ2l2ZW4gZ3JhcGguXG4gKiBAcGFyYW0ge25ncmFwaC5ncmFwaH0gZ3JhcGggd2hpY2ggbmVlZHMgdG8gYmUgbGFpZCBvdXRcbiAqIEBwYXJhbSB7b2JqZWN0fSBwaHlzaWNzU2V0dGluZ3MgaWYgeW91IG5lZWQgY3VzdG9tIHNldHRpbmdzXG4gKiBmb3IgcGh5c2ljcyBzaW11bGF0b3IgeW91IGNhbiBwYXNzIHlvdXIgb3duIHNldHRpbmdzIGhlcmUuIElmIGl0J3Mgbm90IHBhc3NlZFxuICogYSBkZWZhdWx0IG9uZSB3aWxsIGJlIGNyZWF0ZWQuXG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZUxheW91dChncmFwaCwgcGh5c2ljc1NldHRpbmdzKSB7XG4gIGlmICghZ3JhcGgpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0dyYXBoIHN0cnVjdHVyZSBjYW5ub3QgYmUgdW5kZWZpbmVkJyk7XG4gIH1cblxuICB2YXIgY3JlYXRlU2ltdWxhdG9yID0gcmVxdWlyZSgnbmdyYXBoLnBoeXNpY3Muc2ltdWxhdG9yJyk7XG4gIHZhciBwaHlzaWNzU2ltdWxhdG9yID0gY3JlYXRlU2ltdWxhdG9yKHBoeXNpY3NTZXR0aW5ncyk7XG5cbiAgdmFyIG5vZGVCb2RpZXMgPSB0eXBlb2YgT2JqZWN0LmNyZWF0ZSA9PT0gJ2Z1bmN0aW9uJyA/IE9iamVjdC5jcmVhdGUobnVsbCkgOiB7fTtcbiAgdmFyIHNwcmluZ3MgPSB7fTtcblxuICB2YXIgc3ByaW5nVHJhbnNmb3JtID0gcGh5c2ljc1NpbXVsYXRvci5zZXR0aW5ncy5zcHJpbmdUcmFuc2Zvcm0gfHwgbm9vcDtcblxuICAvLyBJbml0aWFsaXplIHBoeXNpY2FsIG9iamVjdHMgYWNjb3JkaW5nIHRvIHdoYXQgd2UgaGF2ZSBpbiB0aGUgZ3JhcGg6XG4gIGluaXRQaHlzaWNzKCk7XG4gIGxpc3RlblRvR3JhcGhFdmVudHMoKTtcblxuICB2YXIgYXBpID0ge1xuICAgIC8qKlxuICAgICAqIFBlcmZvcm1zIG9uZSBzdGVwIG9mIGl0ZXJhdGl2ZSBsYXlvdXQgYWxnb3JpdGhtXG4gICAgICovXG4gICAgc3RlcDogZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gcGh5c2ljc1NpbXVsYXRvci5zdGVwKCk7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEZvciBhIGdpdmVuIGBub2RlSWRgIHJldHVybnMgcG9zaXRpb25cbiAgICAgKi9cbiAgICBnZXROb2RlUG9zaXRpb246IGZ1bmN0aW9uIChub2RlSWQpIHtcbiAgICAgIHJldHVybiBnZXRJbml0aWFsaXplZEJvZHkobm9kZUlkKS5wb3M7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFNldHMgcG9zaXRpb24gb2YgYSBub2RlIHRvIGEgZ2l2ZW4gY29vcmRpbmF0ZXNcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbm9kZUlkIG5vZGUgaWRlbnRpZmllclxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSB4IHBvc2l0aW9uIG9mIGEgbm9kZVxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSB5IHBvc2l0aW9uIG9mIGEgbm9kZVxuICAgICAqIEBwYXJhbSB7bnVtYmVyPX0geiBwb3NpdGlvbiBvZiBub2RlIChvbmx5IGlmIGFwcGxpY2FibGUgdG8gYm9keSlcbiAgICAgKi9cbiAgICBzZXROb2RlUG9zaXRpb246IGZ1bmN0aW9uIChub2RlSWQpIHtcbiAgICAgIHZhciBib2R5ID0gZ2V0SW5pdGlhbGl6ZWRCb2R5KG5vZGVJZCk7XG4gICAgICBib2R5LnNldFBvc2l0aW9uLmFwcGx5KGJvZHksIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSkpO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBAcmV0dXJucyB7T2JqZWN0fSBMaW5rIHBvc2l0aW9uIGJ5IGxpbmsgaWRcbiAgICAgKiBAcmV0dXJucyB7T2JqZWN0LmZyb219IHt4LCB5fSBjb29yZGluYXRlcyBvZiBsaW5rIHN0YXJ0XG4gICAgICogQHJldHVybnMge09iamVjdC50b30ge3gsIHl9IGNvb3JkaW5hdGVzIG9mIGxpbmsgZW5kXG4gICAgICovXG4gICAgZ2V0TGlua1Bvc2l0aW9uOiBmdW5jdGlvbiAobGlua0lkKSB7XG4gICAgICB2YXIgc3ByaW5nID0gc3ByaW5nc1tsaW5rSWRdO1xuICAgICAgaWYgKHNwcmluZykge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGZyb206IHNwcmluZy5mcm9tLnBvcyxcbiAgICAgICAgICB0bzogc3ByaW5nLnRvLnBvc1xuICAgICAgICB9O1xuICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBAcmV0dXJucyB7T2JqZWN0fSBhcmVhIHJlcXVpcmVkIHRvIGZpdCBpbiB0aGUgZ3JhcGguIE9iamVjdCBjb250YWluc1xuICAgICAqIGB4MWAsIGB5MWAgLSB0b3AgbGVmdCBjb29yZGluYXRlc1xuICAgICAqIGB4MmAsIGB5MmAgLSBib3R0b20gcmlnaHQgY29vcmRpbmF0ZXNcbiAgICAgKi9cbiAgICBnZXRHcmFwaFJlY3Q6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiBwaHlzaWNzU2ltdWxhdG9yLmdldEJCb3goKTtcbiAgICB9LFxuXG4gICAgLypcbiAgICAgKiBSZXF1ZXN0cyBsYXlvdXQgYWxnb3JpdGhtIHRvIHBpbi91bnBpbiBub2RlIHRvIGl0cyBjdXJyZW50IHBvc2l0aW9uXG4gICAgICogUGlubmVkIG5vZGVzIHNob3VsZCBub3QgYmUgYWZmZWN0ZWQgYnkgbGF5b3V0IGFsZ29yaXRobSBhbmQgYWx3YXlzXG4gICAgICogcmVtYWluIGF0IHRoZWlyIHBvc2l0aW9uXG4gICAgICovXG4gICAgcGluTm9kZTogZnVuY3Rpb24gKG5vZGUsIGlzUGlubmVkKSB7XG4gICAgICB2YXIgYm9keSA9IGdldEluaXRpYWxpemVkQm9keShub2RlLmlkKTtcbiAgICAgICBib2R5LmlzUGlubmVkID0gISFpc1Bpbm5lZDtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQ2hlY2tzIHdoZXRoZXIgZ2l2ZW4gZ3JhcGgncyBub2RlIGlzIGN1cnJlbnRseSBwaW5uZWRcbiAgICAgKi9cbiAgICBpc05vZGVQaW5uZWQ6IGZ1bmN0aW9uIChub2RlKSB7XG4gICAgICByZXR1cm4gZ2V0SW5pdGlhbGl6ZWRCb2R5KG5vZGUuaWQpLmlzUGlubmVkO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBSZXF1ZXN0IHRvIHJlbGVhc2UgYWxsIHJlc291cmNlc1xuICAgICAqL1xuICAgIGRpc3Bvc2U6IGZ1bmN0aW9uKCkge1xuICAgICAgZ3JhcGgub2ZmKCdjaGFuZ2VkJywgb25HcmFwaENoYW5nZWQpO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBHZXRzIHBoeXNpY2FsIGJvZHkgZm9yIGEgZ2l2ZW4gbm9kZSBpZC4gSWYgbm9kZSBpcyBub3QgZm91bmQgdW5kZWZpbmVkXG4gICAgICogdmFsdWUgaXMgcmV0dXJuZWQuXG4gICAgICovXG4gICAgZ2V0Qm9keTogZ2V0Qm9keSxcblxuICAgIC8qKlxuICAgICAqIEdldHMgc3ByaW5nIGZvciBhIGdpdmVuIGVkZ2UuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbGlua0lkIGxpbmsgaWRlbnRpZmVyLiBJZiB0d28gYXJndW1lbnRzIGFyZSBwYXNzZWQgdGhlblxuICAgICAqIHRoaXMgYXJndW1lbnQgaXMgdHJlYXRlZCBhcyBmb3JtTm9kZUlkXG4gICAgICogQHBhcmFtIHtzdHJpbmc9fSB0b0lkIHdoZW4gZGVmaW5lZCB0aGlzIHBhcmFtZXRlciBkZW5vdGVzIGhlYWQgb2YgdGhlIGxpbmtcbiAgICAgKiBhbmQgZmlyc3QgYXJndW1lbnQgaXMgdHJhdGVkIGFzIHRhaWwgb2YgdGhlIGxpbmsgKGZyb21JZClcbiAgICAgKi9cbiAgICBnZXRTcHJpbmc6IGdldFNwcmluZyxcblxuICAgIC8qKlxuICAgICAqIFtSZWFkIG9ubHldIEdldHMgY3VycmVudCBwaHlzaWNzIHNpbXVsYXRvclxuICAgICAqL1xuICAgIHNpbXVsYXRvcjogcGh5c2ljc1NpbXVsYXRvclxuICB9O1xuXG4gIHJldHVybiBhcGk7XG5cbiAgZnVuY3Rpb24gZ2V0U3ByaW5nKGZyb21JZCwgdG9JZCkge1xuICAgIHZhciBsaW5rSWQ7XG4gICAgaWYgKHRvSWQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgaWYgKHR5cGVvZiBmcm9tSWQgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIC8vIGFzc3VtZSBmcm9tSWQgYXMgYSBsaW5rSWQ6XG4gICAgICAgIGxpbmtJZCA9IGZyb21JZDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIGFzc3VtZSBmcm9tSWQgdG8gYmUgYSBsaW5rIG9iamVjdDpcbiAgICAgICAgbGlua0lkID0gZnJvbUlkLmlkO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyB0b0lkIGlzIGRlZmluZWQsIHNob3VsZCBncmFiIGxpbms6XG4gICAgICB2YXIgbGluayA9IGdyYXBoLmhhc0xpbmsoZnJvbUlkLCB0b0lkKTtcbiAgICAgIGlmICghbGluaykgcmV0dXJuO1xuICAgICAgbGlua0lkID0gbGluay5pZDtcbiAgICB9XG5cbiAgICByZXR1cm4gc3ByaW5nc1tsaW5rSWRdO1xuICB9XG5cbiAgZnVuY3Rpb24gZ2V0Qm9keShub2RlSWQpIHtcbiAgICByZXR1cm4gbm9kZUJvZGllc1tub2RlSWRdO1xuICB9XG5cbiAgZnVuY3Rpb24gbGlzdGVuVG9HcmFwaEV2ZW50cygpIHtcbiAgICBncmFwaC5vbignY2hhbmdlZCcsIG9uR3JhcGhDaGFuZ2VkKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIG9uR3JhcGhDaGFuZ2VkKGNoYW5nZXMpIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNoYW5nZXMubGVuZ3RoOyArK2kpIHtcbiAgICAgIHZhciBjaGFuZ2UgPSBjaGFuZ2VzW2ldO1xuICAgICAgaWYgKGNoYW5nZS5jaGFuZ2VUeXBlID09PSAnYWRkJykge1xuICAgICAgICBpZiAoY2hhbmdlLm5vZGUpIHtcbiAgICAgICAgICBpbml0Qm9keShjaGFuZ2Uubm9kZS5pZCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGNoYW5nZS5saW5rKSB7XG4gICAgICAgICAgaW5pdExpbmsoY2hhbmdlLmxpbmspO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGNoYW5nZS5jaGFuZ2VUeXBlID09PSAncmVtb3ZlJykge1xuICAgICAgICBpZiAoY2hhbmdlLm5vZGUpIHtcbiAgICAgICAgICByZWxlYXNlTm9kZShjaGFuZ2Uubm9kZSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGNoYW5nZS5saW5rKSB7XG4gICAgICAgICAgcmVsZWFzZUxpbmsoY2hhbmdlLmxpbmspO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gaW5pdFBoeXNpY3MoKSB7XG4gICAgZ3JhcGguZm9yRWFjaE5vZGUoZnVuY3Rpb24gKG5vZGUpIHtcbiAgICAgIGluaXRCb2R5KG5vZGUuaWQpO1xuICAgIH0pO1xuICAgIGdyYXBoLmZvckVhY2hMaW5rKGluaXRMaW5rKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGluaXRCb2R5KG5vZGVJZCkge1xuICAgIHZhciBib2R5ID0gbm9kZUJvZGllc1tub2RlSWRdO1xuICAgIGlmICghYm9keSkge1xuICAgICAgdmFyIG5vZGUgPSBncmFwaC5nZXROb2RlKG5vZGVJZCk7XG4gICAgICBpZiAoIW5vZGUpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdpbml0Qm9keSgpIHdhcyBjYWxsZWQgd2l0aCB1bmtub3duIG5vZGUgaWQnKTtcbiAgICAgIH1cblxuICAgICAgdmFyIHBvcyA9IG5vZGUucG9zaXRpb247XG4gICAgICBpZiAoIXBvcykge1xuICAgICAgICB2YXIgbmVpZ2hib3JzID0gZ2V0TmVpZ2hib3JCb2RpZXMobm9kZSk7XG4gICAgICAgIHBvcyA9IHBoeXNpY3NTaW11bGF0b3IuZ2V0QmVzdE5ld0JvZHlQb3NpdGlvbihuZWlnaGJvcnMpO1xuICAgICAgfVxuXG4gICAgICBib2R5ID0gcGh5c2ljc1NpbXVsYXRvci5hZGRCb2R5QXQocG9zKTtcblxuICAgICAgbm9kZUJvZGllc1tub2RlSWRdID0gYm9keTtcbiAgICAgIHVwZGF0ZUJvZHlNYXNzKG5vZGVJZCk7XG5cbiAgICAgIGlmIChpc05vZGVPcmlnaW5hbGx5UGlubmVkKG5vZGUpKSB7XG4gICAgICAgIGJvZHkuaXNQaW5uZWQgPSB0cnVlO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHJlbGVhc2VOb2RlKG5vZGUpIHtcbiAgICB2YXIgbm9kZUlkID0gbm9kZS5pZDtcbiAgICB2YXIgYm9keSA9IG5vZGVCb2RpZXNbbm9kZUlkXTtcbiAgICBpZiAoYm9keSkge1xuICAgICAgbm9kZUJvZGllc1tub2RlSWRdID0gbnVsbDtcbiAgICAgIGRlbGV0ZSBub2RlQm9kaWVzW25vZGVJZF07XG5cbiAgICAgIHBoeXNpY3NTaW11bGF0b3IucmVtb3ZlQm9keShib2R5KTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBpbml0TGluayhsaW5rKSB7XG4gICAgdXBkYXRlQm9keU1hc3MobGluay5mcm9tSWQpO1xuICAgIHVwZGF0ZUJvZHlNYXNzKGxpbmsudG9JZCk7XG5cbiAgICB2YXIgZnJvbUJvZHkgPSBub2RlQm9kaWVzW2xpbmsuZnJvbUlkXSxcbiAgICAgICAgdG9Cb2R5ICA9IG5vZGVCb2RpZXNbbGluay50b0lkXSxcbiAgICAgICAgc3ByaW5nID0gcGh5c2ljc1NpbXVsYXRvci5hZGRTcHJpbmcoZnJvbUJvZHksIHRvQm9keSwgbGluay5sZW5ndGgpO1xuXG4gICAgc3ByaW5nVHJhbnNmb3JtKGxpbmssIHNwcmluZyk7XG5cbiAgICBzcHJpbmdzW2xpbmsuaWRdID0gc3ByaW5nO1xuICB9XG5cbiAgZnVuY3Rpb24gcmVsZWFzZUxpbmsobGluaykge1xuICAgIHZhciBzcHJpbmcgPSBzcHJpbmdzW2xpbmsuaWRdO1xuICAgIGlmIChzcHJpbmcpIHtcbiAgICAgIHZhciBmcm9tID0gZ3JhcGguZ2V0Tm9kZShsaW5rLmZyb21JZCksXG4gICAgICAgICAgdG8gPSBncmFwaC5nZXROb2RlKGxpbmsudG9JZCk7XG5cbiAgICAgIGlmIChmcm9tKSB1cGRhdGVCb2R5TWFzcyhmcm9tLmlkKTtcbiAgICAgIGlmICh0bykgdXBkYXRlQm9keU1hc3ModG8uaWQpO1xuXG4gICAgICBkZWxldGUgc3ByaW5nc1tsaW5rLmlkXTtcblxuICAgICAgcGh5c2ljc1NpbXVsYXRvci5yZW1vdmVTcHJpbmcoc3ByaW5nKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBnZXROZWlnaGJvckJvZGllcyhub2RlKSB7XG4gICAgLy8gVE9ETzogQ291bGQgcHJvYmFibHkgYmUgZG9uZSBiZXR0ZXIgb24gbWVtb3J5XG4gICAgdmFyIG5laWdoYm9ycyA9IFtdO1xuICAgIGlmICghbm9kZS5saW5rcykge1xuICAgICAgcmV0dXJuIG5laWdoYm9ycztcbiAgICB9XG4gICAgdmFyIG1heE5laWdoYm9ycyA9IE1hdGgubWluKG5vZGUubGlua3MubGVuZ3RoLCAyKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG1heE5laWdoYm9yczsgKytpKSB7XG4gICAgICB2YXIgbGluayA9IG5vZGUubGlua3NbaV07XG4gICAgICB2YXIgb3RoZXJCb2R5ID0gbGluay5mcm9tSWQgIT09IG5vZGUuaWQgPyBub2RlQm9kaWVzW2xpbmsuZnJvbUlkXSA6IG5vZGVCb2RpZXNbbGluay50b0lkXTtcbiAgICAgIGlmIChvdGhlckJvZHkgJiYgb3RoZXJCb2R5LnBvcykge1xuICAgICAgICBuZWlnaGJvcnMucHVzaChvdGhlckJvZHkpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBuZWlnaGJvcnM7XG4gIH1cblxuICBmdW5jdGlvbiB1cGRhdGVCb2R5TWFzcyhub2RlSWQpIHtcbiAgICB2YXIgYm9keSA9IG5vZGVCb2RpZXNbbm9kZUlkXTtcbiAgICBib2R5Lm1hc3MgPSBub2RlTWFzcyhub2RlSWQpO1xuICB9XG5cbiAgLyoqXG4gICAqIENoZWNrcyB3aGV0aGVyIGdyYXBoIG5vZGUgaGFzIGluIGl0cyBzZXR0aW5ncyBwaW5uZWQgYXR0cmlidXRlLFxuICAgKiB3aGljaCBtZWFucyBsYXlvdXQgYWxnb3JpdGhtIGNhbm5vdCBtb3ZlIGl0LiBOb2RlIGNhbiBiZSBwcmVjb25maWd1cmVkXG4gICAqIGFzIHBpbm5lZCwgaWYgaXQgaGFzIFwiaXNQaW5uZWRcIiBhdHRyaWJ1dGUsIG9yIHdoZW4gbm9kZS5kYXRhIGhhcyBpdC5cbiAgICpcbiAgICogQHBhcmFtIHtPYmplY3R9IG5vZGUgYSBncmFwaCBub2RlIHRvIGNoZWNrXG4gICAqIEByZXR1cm4ge0Jvb2xlYW59IHRydWUgaWYgbm9kZSBzaG91bGQgYmUgdHJlYXRlZCBhcyBwaW5uZWQ7IGZhbHNlIG90aGVyd2lzZS5cbiAgICovXG4gIGZ1bmN0aW9uIGlzTm9kZU9yaWdpbmFsbHlQaW5uZWQobm9kZSkge1xuICAgIHJldHVybiAobm9kZSAmJiAobm9kZS5pc1Bpbm5lZCB8fCAobm9kZS5kYXRhICYmIG5vZGUuZGF0YS5pc1Bpbm5lZCkpKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGdldEluaXRpYWxpemVkQm9keShub2RlSWQpIHtcbiAgICB2YXIgYm9keSA9IG5vZGVCb2RpZXNbbm9kZUlkXTtcbiAgICBpZiAoIWJvZHkpIHtcbiAgICAgIGluaXRCb2R5KG5vZGVJZCk7XG4gICAgICBib2R5ID0gbm9kZUJvZGllc1tub2RlSWRdO1xuICAgIH1cbiAgICByZXR1cm4gYm9keTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDYWxjdWxhdGVzIG1hc3Mgb2YgYSBib2R5LCB3aGljaCBjb3JyZXNwb25kcyB0byBub2RlIHdpdGggZ2l2ZW4gaWQuXG4gICAqXG4gICAqIEBwYXJhbSB7U3RyaW5nfE51bWJlcn0gbm9kZUlkIGlkZW50aWZpZXIgb2YgYSBub2RlLCBmb3Igd2hpY2ggYm9keSBtYXNzIG5lZWRzIHRvIGJlIGNhbGN1bGF0ZWRcbiAgICogQHJldHVybnMge051bWJlcn0gcmVjb21tZW5kZWQgbWFzcyBvZiB0aGUgYm9keTtcbiAgICovXG4gIGZ1bmN0aW9uIG5vZGVNYXNzKG5vZGVJZCkge1xuICAgIHJldHVybiAxICsgZ3JhcGguZ2V0TGlua3Mobm9kZUlkKS5sZW5ndGggLyAzLjA7XG4gIH1cbn1cblxuZnVuY3Rpb24gbm9vcCgpIHsgfVxuIiwiLyoqXG4gKiBNYW5hZ2VzIGEgc2ltdWxhdGlvbiBvZiBwaHlzaWNhbCBmb3JjZXMgYWN0aW5nIG9uIGJvZGllcyBhbmQgc3ByaW5ncy5cbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBwaHlzaWNzU2ltdWxhdG9yO1xuXG5mdW5jdGlvbiBwaHlzaWNzU2ltdWxhdG9yKHNldHRpbmdzKSB7XG4gIHZhciBTcHJpbmcgPSByZXF1aXJlKCcuL2xpYi9zcHJpbmcnKTtcbiAgdmFyIGV4cG9zZSA9IHJlcXVpcmUoJ25ncmFwaC5leHBvc2UnKTtcbiAgdmFyIG1lcmdlID0gcmVxdWlyZSgnbmdyYXBoLm1lcmdlJyk7XG5cbiAgc2V0dGluZ3MgPSBtZXJnZShzZXR0aW5ncywge1xuICAgICAgLyoqXG4gICAgICAgKiBJZGVhbCBsZW5ndGggZm9yIGxpbmtzIChzcHJpbmdzIGluIHBoeXNpY2FsIG1vZGVsKS5cbiAgICAgICAqL1xuICAgICAgc3ByaW5nTGVuZ3RoOiAzMCxcblxuICAgICAgLyoqXG4gICAgICAgKiBIb29rJ3MgbGF3IGNvZWZmaWNpZW50LiAxIC0gc29saWQgc3ByaW5nLlxuICAgICAgICovXG4gICAgICBzcHJpbmdDb2VmZjogMC4wMDA4LFxuXG4gICAgICAvKipcbiAgICAgICAqIENvdWxvbWIncyBsYXcgY29lZmZpY2llbnQuIEl0J3MgdXNlZCB0byByZXBlbCBub2RlcyB0aHVzIHNob3VsZCBiZSBuZWdhdGl2ZVxuICAgICAgICogaWYgeW91IG1ha2UgaXQgcG9zaXRpdmUgbm9kZXMgc3RhcnQgYXR0cmFjdCBlYWNoIG90aGVyIDopLlxuICAgICAgICovXG4gICAgICBncmF2aXR5OiAtMS4yLFxuXG4gICAgICAvKipcbiAgICAgICAqIFRoZXRhIGNvZWZmaWNpZW50IGZyb20gQmFybmVzIEh1dCBzaW11bGF0aW9uLiBSYW5nZWQgYmV0d2VlbiAoMCwgMSkuXG4gICAgICAgKiBUaGUgY2xvc2VyIGl0J3MgdG8gMSB0aGUgbW9yZSBub2RlcyBhbGdvcml0aG0gd2lsbCBoYXZlIHRvIGdvIHRocm91Z2guXG4gICAgICAgKiBTZXR0aW5nIGl0IHRvIG9uZSBtYWtlcyBCYXJuZXMgSHV0IHNpbXVsYXRpb24gbm8gZGlmZmVyZW50IGZyb21cbiAgICAgICAqIGJydXRlLWZvcmNlIGZvcmNlcyBjYWxjdWxhdGlvbiAoZWFjaCBub2RlIGlzIGNvbnNpZGVyZWQpLlxuICAgICAgICovXG4gICAgICB0aGV0YTogMC44LFxuXG4gICAgICAvKipcbiAgICAgICAqIERyYWcgZm9yY2UgY29lZmZpY2llbnQuIFVzZWQgdG8gc2xvdyBkb3duIHN5c3RlbSwgdGh1cyBzaG91bGQgYmUgbGVzcyB0aGFuIDEuXG4gICAgICAgKiBUaGUgY2xvc2VyIGl0IGlzIHRvIDAgdGhlIGxlc3MgdGlnaHQgc3lzdGVtIHdpbGwgYmUuXG4gICAgICAgKi9cbiAgICAgIGRyYWdDb2VmZjogMC4wMixcblxuICAgICAgLyoqXG4gICAgICAgKiBEZWZhdWx0IHRpbWUgc3RlcCAoZHQpIGZvciBmb3JjZXMgaW50ZWdyYXRpb25cbiAgICAgICAqL1xuICAgICAgdGltZVN0ZXAgOiAyMCxcblxuICAgICAgLyoqXG4gICAgICAgICogTWF4aW11bSBtb3ZlbWVudCBvZiB0aGUgc3lzdGVtIHdoaWNoIGNhbiBiZSBjb25zaWRlcmVkIGFzIHN0YWJpbGl6ZWRcbiAgICAgICAgKi9cbiAgICAgIHN0YWJsZVRocmVzaG9sZDogMC4wMDlcbiAgfSk7XG5cbiAgLy8gV2UgYWxsb3cgY2xpZW50cyB0byBvdmVycmlkZSBiYXNpYyBmYWN0b3J5IG1ldGhvZHM6XG4gIHZhciBjcmVhdGVRdWFkVHJlZSA9IHNldHRpbmdzLmNyZWF0ZVF1YWRUcmVlIHx8IHJlcXVpcmUoJ25ncmFwaC5xdWFkdHJlZWJoJyk7XG4gIHZhciBjcmVhdGVCb3VuZHMgPSBzZXR0aW5ncy5jcmVhdGVCb3VuZHMgfHwgcmVxdWlyZSgnLi9saWIvYm91bmRzJyk7XG4gIHZhciBjcmVhdGVEcmFnRm9yY2UgPSBzZXR0aW5ncy5jcmVhdGVEcmFnRm9yY2UgfHwgcmVxdWlyZSgnLi9saWIvZHJhZ0ZvcmNlJyk7XG4gIHZhciBjcmVhdGVTcHJpbmdGb3JjZSA9IHNldHRpbmdzLmNyZWF0ZVNwcmluZ0ZvcmNlIHx8IHJlcXVpcmUoJy4vbGliL3NwcmluZ0ZvcmNlJyk7XG4gIHZhciBpbnRlZ3JhdGUgPSBzZXR0aW5ncy5pbnRlZ3JhdG9yIHx8IHJlcXVpcmUoJy4vbGliL2V1bGVySW50ZWdyYXRvcicpO1xuICB2YXIgY3JlYXRlQm9keSA9IHNldHRpbmdzLmNyZWF0ZUJvZHkgfHwgcmVxdWlyZSgnLi9saWIvY3JlYXRlQm9keScpO1xuXG4gIHZhciBib2RpZXMgPSBbXSwgLy8gQm9kaWVzIGluIHRoaXMgc2ltdWxhdGlvbi5cbiAgICAgIHNwcmluZ3MgPSBbXSwgLy8gU3ByaW5ncyBpbiB0aGlzIHNpbXVsYXRpb24uXG4gICAgICBxdWFkVHJlZSA9ICBjcmVhdGVRdWFkVHJlZShzZXR0aW5ncyksXG4gICAgICBib3VuZHMgPSBjcmVhdGVCb3VuZHMoYm9kaWVzLCBzZXR0aW5ncyksXG4gICAgICBzcHJpbmdGb3JjZSA9IGNyZWF0ZVNwcmluZ0ZvcmNlKHNldHRpbmdzKSxcbiAgICAgIGRyYWdGb3JjZSA9IGNyZWF0ZURyYWdGb3JjZShzZXR0aW5ncyk7XG5cbiAgdmFyIHB1YmxpY0FwaSA9IHtcbiAgICAvKipcbiAgICAgKiBBcnJheSBvZiBib2RpZXMsIHJlZ2lzdGVyZWQgd2l0aCBjdXJyZW50IHNpbXVsYXRvclxuICAgICAqXG4gICAgICogTm90ZTogVG8gYWRkIG5ldyBib2R5LCB1c2UgYWRkQm9keSgpIG1ldGhvZC4gVGhpcyBwcm9wZXJ0eSBpcyBvbmx5XG4gICAgICogZXhwb3NlZCBmb3IgdGVzdGluZy9wZXJmb3JtYW5jZSBwdXJwb3Nlcy5cbiAgICAgKi9cbiAgICBib2RpZXM6IGJvZGllcyxcblxuICAgIC8qKlxuICAgICAqIEFycmF5IG9mIHNwcmluZ3MsIHJlZ2lzdGVyZWQgd2l0aCBjdXJyZW50IHNpbXVsYXRvclxuICAgICAqXG4gICAgICogTm90ZTogVG8gYWRkIG5ldyBzcHJpbmcsIHVzZSBhZGRTcHJpbmcoKSBtZXRob2QuIFRoaXMgcHJvcGVydHkgaXMgb25seVxuICAgICAqIGV4cG9zZWQgZm9yIHRlc3RpbmcvcGVyZm9ybWFuY2UgcHVycG9zZXMuXG4gICAgICovXG4gICAgc3ByaW5nczogc3ByaW5ncyxcblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgc2V0dGluZ3Mgd2l0aCB3aGljaCBjdXJyZW50IHNpbXVsYXRvciB3YXMgaW5pdGlhbGl6ZWRcbiAgICAgKi9cbiAgICBzZXR0aW5nczogc2V0dGluZ3MsXG5cbiAgICAvKipcbiAgICAgKiBQZXJmb3JtcyBvbmUgc3RlcCBvZiBmb3JjZSBzaW11bGF0aW9uLlxuICAgICAqXG4gICAgICogQHJldHVybnMge2Jvb2xlYW59IHRydWUgaWYgc3lzdGVtIGlzIGNvbnNpZGVyZWQgc3RhYmxlOyBGYWxzZSBvdGhlcndpc2UuXG4gICAgICovXG4gICAgc3RlcDogZnVuY3Rpb24gKCkge1xuICAgICAgYWNjdW11bGF0ZUZvcmNlcygpO1xuICAgICAgdmFyIHRvdGFsTW92ZW1lbnQgPSBpbnRlZ3JhdGUoYm9kaWVzLCBzZXR0aW5ncy50aW1lU3RlcCk7XG5cbiAgICAgIGJvdW5kcy51cGRhdGUoKTtcblxuICAgICAgcmV0dXJuIHRvdGFsTW92ZW1lbnQgPCBzZXR0aW5ncy5zdGFibGVUaHJlc2hvbGQ7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEFkZHMgYm9keSB0byB0aGUgc3lzdGVtXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge25ncmFwaC5waHlzaWNzLnByaW1pdGl2ZXMuQm9keX0gYm9keSBwaHlzaWNhbCBib2R5XG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7bmdyYXBoLnBoeXNpY3MucHJpbWl0aXZlcy5Cb2R5fSBhZGRlZCBib2R5XG4gICAgICovXG4gICAgYWRkQm9keTogZnVuY3Rpb24gKGJvZHkpIHtcbiAgICAgIGlmICghYm9keSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0JvZHkgaXMgcmVxdWlyZWQnKTtcbiAgICAgIH1cbiAgICAgIGJvZGllcy5wdXNoKGJvZHkpO1xuXG4gICAgICByZXR1cm4gYm9keTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQWRkcyBib2R5IHRvIHRoZSBzeXN0ZW0gYXQgZ2l2ZW4gcG9zaXRpb25cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBwb3MgcG9zaXRpb24gb2YgYSBib2R5XG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7bmdyYXBoLnBoeXNpY3MucHJpbWl0aXZlcy5Cb2R5fSBhZGRlZCBib2R5XG4gICAgICovXG4gICAgYWRkQm9keUF0OiBmdW5jdGlvbiAocG9zKSB7XG4gICAgICBpZiAoIXBvcykge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0JvZHkgcG9zaXRpb24gaXMgcmVxdWlyZWQnKTtcbiAgICAgIH1cbiAgICAgIHZhciBib2R5ID0gY3JlYXRlQm9keShwb3MpO1xuICAgICAgYm9kaWVzLnB1c2goYm9keSk7XG5cbiAgICAgIHJldHVybiBib2R5O1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBSZW1vdmVzIGJvZHkgZnJvbSB0aGUgc3lzdGVtXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge25ncmFwaC5waHlzaWNzLnByaW1pdGl2ZXMuQm9keX0gYm9keSB0byByZW1vdmVcbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtCb29sZWFufSB0cnVlIGlmIGJvZHkgZm91bmQgYW5kIHJlbW92ZWQuIGZhbHN5IG90aGVyd2lzZTtcbiAgICAgKi9cbiAgICByZW1vdmVCb2R5OiBmdW5jdGlvbiAoYm9keSkge1xuICAgICAgaWYgKCFib2R5KSB7IHJldHVybjsgfVxuXG4gICAgICB2YXIgaWR4ID0gYm9kaWVzLmluZGV4T2YoYm9keSk7XG4gICAgICBpZiAoaWR4IDwgMCkgeyByZXR1cm47IH1cblxuICAgICAgYm9kaWVzLnNwbGljZShpZHgsIDEpO1xuICAgICAgaWYgKGJvZGllcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgYm91bmRzLnJlc2V0KCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQWRkcyBhIHNwcmluZyB0byB0aGlzIHNpbXVsYXRpb24uXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7T2JqZWN0fSAtIGEgaGFuZGxlIGZvciBhIHNwcmluZy4gSWYgeW91IHdhbnQgdG8gbGF0ZXIgcmVtb3ZlXG4gICAgICogc3ByaW5nIHBhc3MgaXQgdG8gcmVtb3ZlU3ByaW5nKCkgbWV0aG9kLlxuICAgICAqL1xuICAgIGFkZFNwcmluZzogZnVuY3Rpb24gKGJvZHkxLCBib2R5Miwgc3ByaW5nTGVuZ3RoLCBzcHJpbmdXZWlnaHQsIHNwcmluZ0NvZWZmaWNpZW50KSB7XG4gICAgICBpZiAoIWJvZHkxIHx8ICFib2R5Mikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCBhZGQgbnVsbCBzcHJpbmcgdG8gZm9yY2Ugc2ltdWxhdG9yJyk7XG4gICAgICB9XG5cbiAgICAgIGlmICh0eXBlb2Ygc3ByaW5nTGVuZ3RoICE9PSAnbnVtYmVyJykge1xuICAgICAgICBzcHJpbmdMZW5ndGggPSAtMTsgLy8gYXNzdW1lIGdsb2JhbCBjb25maWd1cmF0aW9uXG4gICAgICB9XG5cbiAgICAgIHZhciBzcHJpbmcgPSBuZXcgU3ByaW5nKGJvZHkxLCBib2R5Miwgc3ByaW5nTGVuZ3RoLCBzcHJpbmdDb2VmZmljaWVudCA+PSAwID8gc3ByaW5nQ29lZmZpY2llbnQgOiAtMSwgc3ByaW5nV2VpZ2h0KTtcbiAgICAgIHNwcmluZ3MucHVzaChzcHJpbmcpO1xuXG4gICAgICAvLyBUT0RPOiBjb3VsZCBtYXJrIHNpbXVsYXRvciBhcyBkaXJ0eS5cbiAgICAgIHJldHVybiBzcHJpbmc7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFJlbW92ZXMgc3ByaW5nIGZyb20gdGhlIHN5c3RlbVxuICAgICAqXG4gICAgICogQHBhcmFtIHtPYmplY3R9IHNwcmluZyB0byByZW1vdmUuIFNwcmluZyBpcyBhbiBvYmplY3QgcmV0dXJuZWQgYnkgYWRkU3ByaW5nXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7Qm9vbGVhbn0gdHJ1ZSBpZiBzcHJpbmcgZm91bmQgYW5kIHJlbW92ZWQuIGZhbHN5IG90aGVyd2lzZTtcbiAgICAgKi9cbiAgICByZW1vdmVTcHJpbmc6IGZ1bmN0aW9uIChzcHJpbmcpIHtcbiAgICAgIGlmICghc3ByaW5nKSB7IHJldHVybjsgfVxuICAgICAgdmFyIGlkeCA9IHNwcmluZ3MuaW5kZXhPZihzcHJpbmcpO1xuICAgICAgaWYgKGlkeCA+IC0xKSB7XG4gICAgICAgIHNwcmluZ3Muc3BsaWNlKGlkeCwgMSk7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuICAgIH0sXG5cbiAgICBnZXRCZXN0TmV3Qm9keVBvc2l0aW9uOiBmdW5jdGlvbiAobmVpZ2hib3JzKSB7XG4gICAgICByZXR1cm4gYm91bmRzLmdldEJlc3ROZXdQb3NpdGlvbihuZWlnaGJvcnMpO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGJvdW5kaW5nIGJveCB3aGljaCBjb3ZlcnMgYWxsIGJvZGllc1xuICAgICAqL1xuICAgIGdldEJCb3g6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiBib3VuZHMuYm94O1xuICAgIH0sXG5cbiAgICBncmF2aXR5OiBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgIGlmICh2YWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIHNldHRpbmdzLmdyYXZpdHkgPSB2YWx1ZTtcbiAgICAgICAgcXVhZFRyZWUub3B0aW9ucyh7Z3Jhdml0eTogdmFsdWV9KTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gc2V0dGluZ3MuZ3Jhdml0eTtcbiAgICAgIH1cbiAgICB9LFxuXG4gICAgdGhldGE6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgaWYgKHZhbHVlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgc2V0dGluZ3MudGhldGEgPSB2YWx1ZTtcbiAgICAgICAgcXVhZFRyZWUub3B0aW9ucyh7dGhldGE6IHZhbHVlfSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHNldHRpbmdzLnRoZXRhO1xuICAgICAgfVxuICAgIH1cbiAgfTtcblxuICAvLyBhbGxvdyBzZXR0aW5ncyBtb2RpZmljYXRpb24gdmlhIHB1YmxpYyBBUEk6XG4gIGV4cG9zZShzZXR0aW5ncywgcHVibGljQXBpKTtcblxuICByZXR1cm4gcHVibGljQXBpO1xuXG4gIGZ1bmN0aW9uIGFjY3VtdWxhdGVGb3JjZXMoKSB7XG4gICAgLy8gQWNjdW11bGF0ZSBmb3JjZXMgYWN0aW5nIG9uIGJvZGllcy5cbiAgICB2YXIgYm9keSxcbiAgICAgICAgaSA9IGJvZGllcy5sZW5ndGg7XG5cbiAgICBpZiAoaSkge1xuICAgICAgLy8gb25seSBhZGQgYm9kaWVzIGlmIHRoZXJlIHRoZSBhcnJheSBpcyBub3QgZW1wdHk6XG4gICAgICBxdWFkVHJlZS5pbnNlcnRCb2RpZXMoYm9kaWVzKTsgLy8gcGVyZm9ybWFuY2U6IE8obiAqIGxvZyBuKVxuICAgICAgd2hpbGUgKGktLSkge1xuICAgICAgICBib2R5ID0gYm9kaWVzW2ldO1xuICAgICAgICAvLyBJZiBib2R5IGlzIHBpbm5lZCB0aGVyZSBpcyBubyBwb2ludCB1cGRhdGluZyBpdHMgZm9yY2VzIC0gaXQgc2hvdWxkXG4gICAgICAgIC8vIG5ldmVyIG1vdmU6XG4gICAgICAgIGlmICghYm9keS5pc1Bpbm5lZCkge1xuICAgICAgICAgIGJvZHkuZm9yY2UucmVzZXQoKTtcblxuICAgICAgICAgIHF1YWRUcmVlLnVwZGF0ZUJvZHlGb3JjZShib2R5KTtcbiAgICAgICAgICBkcmFnRm9yY2UudXBkYXRlKGJvZHkpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgaSA9IHNwcmluZ3MubGVuZ3RoO1xuICAgIHdoaWxlKGktLSkge1xuICAgICAgc3ByaW5nRm9yY2UudXBkYXRlKHNwcmluZ3NbaV0pO1xuICAgIH1cbiAgfVxufTtcbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGJvZGllcywgc2V0dGluZ3MpIHtcbiAgdmFyIHJhbmRvbSA9IHJlcXVpcmUoJ25ncmFwaC5yYW5kb20nKS5yYW5kb20oNDIpO1xuICB2YXIgYm91bmRpbmdCb3ggPSAgeyB4MTogMCwgeTE6IDAsIHgyOiAwLCB5MjogMCB9O1xuXG4gIHJldHVybiB7XG4gICAgYm94OiBib3VuZGluZ0JveCxcblxuICAgIHVwZGF0ZTogdXBkYXRlQm91bmRpbmdCb3gsXG5cbiAgICByZXNldCA6IGZ1bmN0aW9uICgpIHtcbiAgICAgIGJvdW5kaW5nQm94LngxID0gYm91bmRpbmdCb3gueTEgPSAwO1xuICAgICAgYm91bmRpbmdCb3gueDIgPSBib3VuZGluZ0JveC55MiA9IDA7XG4gICAgfSxcblxuICAgIGdldEJlc3ROZXdQb3NpdGlvbjogZnVuY3Rpb24gKG5laWdoYm9ycykge1xuICAgICAgdmFyIGdyYXBoUmVjdCA9IGJvdW5kaW5nQm94O1xuXG4gICAgICB2YXIgYmFzZVggPSAwLCBiYXNlWSA9IDA7XG5cbiAgICAgIGlmIChuZWlnaGJvcnMubGVuZ3RoKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbmVpZ2hib3JzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAgYmFzZVggKz0gbmVpZ2hib3JzW2ldLnBvcy54O1xuICAgICAgICAgIGJhc2VZICs9IG5laWdoYm9yc1tpXS5wb3MueTtcbiAgICAgICAgfVxuXG4gICAgICAgIGJhc2VYIC89IG5laWdoYm9ycy5sZW5ndGg7XG4gICAgICAgIGJhc2VZIC89IG5laWdoYm9ycy5sZW5ndGg7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBiYXNlWCA9IChncmFwaFJlY3QueDEgKyBncmFwaFJlY3QueDIpIC8gMjtcbiAgICAgICAgYmFzZVkgPSAoZ3JhcGhSZWN0LnkxICsgZ3JhcGhSZWN0LnkyKSAvIDI7XG4gICAgICB9XG5cbiAgICAgIHZhciBzcHJpbmdMZW5ndGggPSBzZXR0aW5ncy5zcHJpbmdMZW5ndGg7XG4gICAgICByZXR1cm4ge1xuICAgICAgICB4OiBiYXNlWCArIHJhbmRvbS5uZXh0KHNwcmluZ0xlbmd0aCkgLSBzcHJpbmdMZW5ndGggLyAyLFxuICAgICAgICB5OiBiYXNlWSArIHJhbmRvbS5uZXh0KHNwcmluZ0xlbmd0aCkgLSBzcHJpbmdMZW5ndGggLyAyXG4gICAgICB9O1xuICAgIH1cbiAgfTtcblxuICBmdW5jdGlvbiB1cGRhdGVCb3VuZGluZ0JveCgpIHtcbiAgICB2YXIgaSA9IGJvZGllcy5sZW5ndGg7XG4gICAgaWYgKGkgPT09IDApIHsgcmV0dXJuOyB9IC8vIGRvbid0IGhhdmUgdG8gd29yeSBoZXJlLlxuXG4gICAgdmFyIHgxID0gTnVtYmVyLk1BWF9WQUxVRSxcbiAgICAgICAgeTEgPSBOdW1iZXIuTUFYX1ZBTFVFLFxuICAgICAgICB4MiA9IE51bWJlci5NSU5fVkFMVUUsXG4gICAgICAgIHkyID0gTnVtYmVyLk1JTl9WQUxVRTtcblxuICAgIHdoaWxlKGktLSkge1xuICAgICAgLy8gdGhpcyBpcyBPKG4pLCBjb3VsZCBpdCBiZSBkb25lIGZhc3RlciB3aXRoIHF1YWR0cmVlP1xuICAgICAgLy8gaG93IGFib3V0IHBpbm5lZCBub2Rlcz9cbiAgICAgIHZhciBib2R5ID0gYm9kaWVzW2ldO1xuICAgICAgaWYgKGJvZHkuaXNQaW5uZWQpIHtcbiAgICAgICAgYm9keS5wb3MueCA9IGJvZHkucHJldlBvcy54O1xuICAgICAgICBib2R5LnBvcy55ID0gYm9keS5wcmV2UG9zLnk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBib2R5LnByZXZQb3MueCA9IGJvZHkucG9zLng7XG4gICAgICAgIGJvZHkucHJldlBvcy55ID0gYm9keS5wb3MueTtcbiAgICAgIH1cbiAgICAgIGlmIChib2R5LnBvcy54IDwgeDEpIHtcbiAgICAgICAgeDEgPSBib2R5LnBvcy54O1xuICAgICAgfVxuICAgICAgaWYgKGJvZHkucG9zLnggPiB4Mikge1xuICAgICAgICB4MiA9IGJvZHkucG9zLng7XG4gICAgICB9XG4gICAgICBpZiAoYm9keS5wb3MueSA8IHkxKSB7XG4gICAgICAgIHkxID0gYm9keS5wb3MueTtcbiAgICAgIH1cbiAgICAgIGlmIChib2R5LnBvcy55ID4geTIpIHtcbiAgICAgICAgeTIgPSBib2R5LnBvcy55O1xuICAgICAgfVxuICAgIH1cblxuICAgIGJvdW5kaW5nQm94LngxID0geDE7XG4gICAgYm91bmRpbmdCb3gueDIgPSB4MjtcbiAgICBib3VuZGluZ0JveC55MSA9IHkxO1xuICAgIGJvdW5kaW5nQm94LnkyID0geTI7XG4gIH1cbn1cbiIsInZhciBwaHlzaWNzID0gcmVxdWlyZSgnbmdyYXBoLnBoeXNpY3MucHJpbWl0aXZlcycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHBvcykge1xuICByZXR1cm4gbmV3IHBoeXNpY3MuQm9keShwb3MpO1xufVxuIiwiLyoqXG4gKiBSZXByZXNlbnRzIGRyYWcgZm9yY2UsIHdoaWNoIHJlZHVjZXMgZm9yY2UgdmFsdWUgb24gZWFjaCBzdGVwIGJ5IGdpdmVuXG4gKiBjb2VmZmljaWVudC5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBmb3IgdGhlIGRyYWcgZm9yY2VcbiAqIEBwYXJhbSB7TnVtYmVyPX0gb3B0aW9ucy5kcmFnQ29lZmYgZHJhZyBmb3JjZSBjb2VmZmljaWVudC4gMC4xIGJ5IGRlZmF1bHRcbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAob3B0aW9ucykge1xuICB2YXIgbWVyZ2UgPSByZXF1aXJlKCduZ3JhcGgubWVyZ2UnKSxcbiAgICAgIGV4cG9zZSA9IHJlcXVpcmUoJ25ncmFwaC5leHBvc2UnKTtcblxuICBvcHRpb25zID0gbWVyZ2Uob3B0aW9ucywge1xuICAgIGRyYWdDb2VmZjogMC4wMlxuICB9KTtcblxuICB2YXIgYXBpID0ge1xuICAgIHVwZGF0ZSA6IGZ1bmN0aW9uIChib2R5KSB7XG4gICAgICBib2R5LmZvcmNlLnggLT0gb3B0aW9ucy5kcmFnQ29lZmYgKiBib2R5LnZlbG9jaXR5Lng7XG4gICAgICBib2R5LmZvcmNlLnkgLT0gb3B0aW9ucy5kcmFnQ29lZmYgKiBib2R5LnZlbG9jaXR5Lnk7XG4gICAgfVxuICB9O1xuXG4gIC8vIGxldCBlYXN5IGFjY2VzcyB0byBkcmFnQ29lZmY6XG4gIGV4cG9zZShvcHRpb25zLCBhcGksIFsnZHJhZ0NvZWZmJ10pO1xuXG4gIHJldHVybiBhcGk7XG59O1xuIiwiLyoqXG4gKiBQZXJmb3JtcyBmb3JjZXMgaW50ZWdyYXRpb24sIHVzaW5nIGdpdmVuIHRpbWVzdGVwLiBVc2VzIEV1bGVyIG1ldGhvZCB0byBzb2x2ZVxuICogZGlmZmVyZW50aWFsIGVxdWF0aW9uIChodHRwOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL0V1bGVyX21ldGhvZCApLlxuICpcbiAqIEByZXR1cm5zIHtOdW1iZXJ9IHNxdWFyZWQgZGlzdGFuY2Ugb2YgdG90YWwgcG9zaXRpb24gdXBkYXRlcy5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGludGVncmF0ZTtcblxuZnVuY3Rpb24gaW50ZWdyYXRlKGJvZGllcywgdGltZVN0ZXApIHtcbiAgdmFyIGR4ID0gMCwgdHggPSAwLFxuICAgICAgZHkgPSAwLCB0eSA9IDAsXG4gICAgICBpLFxuICAgICAgbWF4ID0gYm9kaWVzLmxlbmd0aDtcblxuICBmb3IgKGkgPSAwOyBpIDwgbWF4OyArK2kpIHtcbiAgICB2YXIgYm9keSA9IGJvZGllc1tpXSxcbiAgICAgICAgY29lZmYgPSB0aW1lU3RlcCAvIGJvZHkubWFzcztcblxuICAgIGJvZHkudmVsb2NpdHkueCArPSBjb2VmZiAqIGJvZHkuZm9yY2UueDtcbiAgICBib2R5LnZlbG9jaXR5LnkgKz0gY29lZmYgKiBib2R5LmZvcmNlLnk7XG4gICAgdmFyIHZ4ID0gYm9keS52ZWxvY2l0eS54LFxuICAgICAgICB2eSA9IGJvZHkudmVsb2NpdHkueSxcbiAgICAgICAgdiA9IE1hdGguc3FydCh2eCAqIHZ4ICsgdnkgKiB2eSk7XG5cbiAgICBpZiAodiA+IDEpIHtcbiAgICAgIGJvZHkudmVsb2NpdHkueCA9IHZ4IC8gdjtcbiAgICAgIGJvZHkudmVsb2NpdHkueSA9IHZ5IC8gdjtcbiAgICB9XG5cbiAgICBkeCA9IHRpbWVTdGVwICogYm9keS52ZWxvY2l0eS54O1xuICAgIGR5ID0gdGltZVN0ZXAgKiBib2R5LnZlbG9jaXR5Lnk7XG5cbiAgICBib2R5LnBvcy54ICs9IGR4O1xuICAgIGJvZHkucG9zLnkgKz0gZHk7XG5cbiAgICB0eCArPSBNYXRoLmFicyhkeCk7IHR5ICs9IE1hdGguYWJzKGR5KTtcbiAgfVxuXG4gIHJldHVybiAodHggKiB0eCArIHR5ICogdHkpL2JvZGllcy5sZW5ndGg7XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IFNwcmluZztcblxuLyoqXG4gKiBSZXByZXNlbnRzIGEgcGh5c2ljYWwgc3ByaW5nLiBTcHJpbmcgY29ubmVjdHMgdHdvIGJvZGllcywgaGFzIHJlc3QgbGVuZ3RoXG4gKiBzdGlmZm5lc3MgY29lZmZpY2llbnQgYW5kIG9wdGlvbmFsIHdlaWdodFxuICovXG5mdW5jdGlvbiBTcHJpbmcoZnJvbUJvZHksIHRvQm9keSwgbGVuZ3RoLCBjb2VmZiwgd2VpZ2h0KSB7XG4gICAgdGhpcy5mcm9tID0gZnJvbUJvZHk7XG4gICAgdGhpcy50byA9IHRvQm9keTtcbiAgICB0aGlzLmxlbmd0aCA9IGxlbmd0aDtcbiAgICB0aGlzLmNvZWZmID0gY29lZmY7XG5cbiAgICB0aGlzLndlaWdodCA9IHR5cGVvZiB3ZWlnaHQgPT09ICdudW1iZXInID8gd2VpZ2h0IDogMTtcbn07XG4iLCIvKipcbiAqIFJlcHJlc2VudHMgc3ByaW5nIGZvcmNlLCB3aGljaCB1cGRhdGVzIGZvcmNlcyBhY3Rpbmcgb24gdHdvIGJvZGllcywgY29ubnRlY3RlZFxuICogYnkgYSBzcHJpbmcuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgZm9yIHRoZSBzcHJpbmcgZm9yY2VcbiAqIEBwYXJhbSB7TnVtYmVyPX0gb3B0aW9ucy5zcHJpbmdDb2VmZiBzcHJpbmcgZm9yY2UgY29lZmZpY2llbnQuXG4gKiBAcGFyYW0ge051bWJlcj19IG9wdGlvbnMuc3ByaW5nTGVuZ3RoIGRlc2lyZWQgbGVuZ3RoIG9mIGEgc3ByaW5nIGF0IHJlc3QuXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgdmFyIG1lcmdlID0gcmVxdWlyZSgnbmdyYXBoLm1lcmdlJyk7XG4gIHZhciByYW5kb20gPSByZXF1aXJlKCduZ3JhcGgucmFuZG9tJykucmFuZG9tKDQyKTtcbiAgdmFyIGV4cG9zZSA9IHJlcXVpcmUoJ25ncmFwaC5leHBvc2UnKTtcblxuICBvcHRpb25zID0gbWVyZ2Uob3B0aW9ucywge1xuICAgIHNwcmluZ0NvZWZmOiAwLjAwMDIsXG4gICAgc3ByaW5nTGVuZ3RoOiA4MFxuICB9KTtcblxuICB2YXIgYXBpID0ge1xuICAgIC8qKlxuICAgICAqIFVwc2F0ZXMgZm9yY2VzIGFjdGluZyBvbiBhIHNwcmluZ1xuICAgICAqL1xuICAgIHVwZGF0ZSA6IGZ1bmN0aW9uIChzcHJpbmcpIHtcbiAgICAgIHZhciBib2R5MSA9IHNwcmluZy5mcm9tLFxuICAgICAgICAgIGJvZHkyID0gc3ByaW5nLnRvLFxuICAgICAgICAgIGxlbmd0aCA9IHNwcmluZy5sZW5ndGggPCAwID8gb3B0aW9ucy5zcHJpbmdMZW5ndGggOiBzcHJpbmcubGVuZ3RoLFxuICAgICAgICAgIGR4ID0gYm9keTIucG9zLnggLSBib2R5MS5wb3MueCxcbiAgICAgICAgICBkeSA9IGJvZHkyLnBvcy55IC0gYm9keTEucG9zLnksXG4gICAgICAgICAgciA9IE1hdGguc3FydChkeCAqIGR4ICsgZHkgKiBkeSk7XG5cbiAgICAgIGlmIChyID09PSAwKSB7XG4gICAgICAgICAgZHggPSAocmFuZG9tLm5leHREb3VibGUoKSAtIDAuNSkgLyA1MDtcbiAgICAgICAgICBkeSA9IChyYW5kb20ubmV4dERvdWJsZSgpIC0gMC41KSAvIDUwO1xuICAgICAgICAgIHIgPSBNYXRoLnNxcnQoZHggKiBkeCArIGR5ICogZHkpO1xuICAgICAgfVxuXG4gICAgICB2YXIgZCA9IHIgLSBsZW5ndGg7XG4gICAgICB2YXIgY29lZmYgPSAoKCFzcHJpbmcuY29lZmYgfHwgc3ByaW5nLmNvZWZmIDwgMCkgPyBvcHRpb25zLnNwcmluZ0NvZWZmIDogc3ByaW5nLmNvZWZmKSAqIGQgLyByICogc3ByaW5nLndlaWdodDtcblxuICAgICAgYm9keTEuZm9yY2UueCArPSBjb2VmZiAqIGR4O1xuICAgICAgYm9keTEuZm9yY2UueSArPSBjb2VmZiAqIGR5O1xuXG4gICAgICBib2R5Mi5mb3JjZS54IC09IGNvZWZmICogZHg7XG4gICAgICBib2R5Mi5mb3JjZS55IC09IGNvZWZmICogZHk7XG4gICAgfVxuICB9O1xuXG4gIGV4cG9zZShvcHRpb25zLCBhcGksIFsnc3ByaW5nQ29lZmYnLCAnc3ByaW5nTGVuZ3RoJ10pO1xuICByZXR1cm4gYXBpO1xufVxuIiwiLyoqXG4gKiBUaGlzIG1vZHVsZSBwcm92aWRlcyBhbGwgcmVxdWlyZWQgZm9yY2VzIHRvIHJlZ3VsYXIgbmdyYXBoLnBoeXNpY3Muc2ltdWxhdG9yXG4gKiB0byBtYWtlIGl0IDNEIHNpbXVsYXRvci4gSWRlYWxseSBuZ3JhcGgucGh5c2ljcy5zaW11bGF0b3Igc2hvdWxkIG9wZXJhdGVcbiAqIHdpdGggdmVjdG9ycywgYnV0IG9uIHByYWN0aWNlcyB0aGF0IHNob3dlZCBwZXJmb3JtYW5jZSBkZWNyZWFzZS4uLiBNYXliZVxuICogSSB3YXMgZG9pbmcgaXQgd3JvbmcsIHdpbGwgc2VlIGlmIEkgY2FuIHJlZmFjdG9yL3Rocm93IGF3YXkgdGhpcyBtb2R1bGUuXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gY3JlYXRlTGF5b3V0O1xuY3JlYXRlTGF5b3V0LmdldDJkTGF5b3V0ID0gcmVxdWlyZSgnbmdyYXBoLmZvcmNlbGF5b3V0Jyk7XG5cbmZ1bmN0aW9uIGNyZWF0ZUxheW91dChncmFwaCwgcGh5c2ljc1NldHRpbmdzKSB7XG4gIHZhciBtZXJnZSA9IHJlcXVpcmUoJ25ncmFwaC5tZXJnZScpO1xuICBwaHlzaWNzU2V0dGluZ3MgPSBtZXJnZShwaHlzaWNzU2V0dGluZ3MsIHtcbiAgICAgICAgY3JlYXRlUXVhZFRyZWU6IHJlcXVpcmUoJ25ncmFwaC5xdWFkdHJlZWJoM2QnKSxcbiAgICAgICAgY3JlYXRlQm91bmRzOiByZXF1aXJlKCcuL2xpYi9ib3VuZHMnKSxcbiAgICAgICAgY3JlYXRlRHJhZ0ZvcmNlOiByZXF1aXJlKCcuL2xpYi9kcmFnRm9yY2UnKSxcbiAgICAgICAgY3JlYXRlU3ByaW5nRm9yY2U6IHJlcXVpcmUoJy4vbGliL3NwcmluZ0ZvcmNlJyksXG4gICAgICAgIGludGVncmF0b3I6IHJlcXVpcmUoJy4vbGliL2V1bGVySW50ZWdyYXRvcicpLFxuICAgICAgICBjcmVhdGVCb2R5OiByZXF1aXJlKCcuL2xpYi9jcmVhdGVCb2R5JylcbiAgICAgIH0pO1xuXG4gIHJldHVybiBjcmVhdGVMYXlvdXQuZ2V0MmRMYXlvdXQoZ3JhcGgsIHBoeXNpY3NTZXR0aW5ncyk7XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChib2RpZXMsIHNldHRpbmdzKSB7XG4gIHZhciByYW5kb20gPSByZXF1aXJlKCduZ3JhcGgucmFuZG9tJykucmFuZG9tKDQyKTtcbiAgdmFyIGJvdW5kaW5nQm94ID0gIHsgeDE6IDAsIHkxOiAwLCB6MTogMCwgeDI6IDAsIHkyOiAwLCB6MjogMCB9O1xuXG4gIHJldHVybiB7XG4gICAgYm94OiBib3VuZGluZ0JveCxcblxuICAgIHVwZGF0ZTogdXBkYXRlQm91bmRpbmdCb3gsXG5cbiAgICByZXNldCA6IGZ1bmN0aW9uICgpIHtcbiAgICAgIGJvdW5kaW5nQm94LngxID0gYm91bmRpbmdCb3gueTEgPSAwO1xuICAgICAgYm91bmRpbmdCb3gueDIgPSBib3VuZGluZ0JveC55MiA9IDA7XG4gICAgICBib3VuZGluZ0JveC56MSA9IGJvdW5kaW5nQm94LnoyID0gMDtcbiAgICB9LFxuXG4gICAgZ2V0QmVzdE5ld1Bvc2l0aW9uOiBmdW5jdGlvbiAobmVpZ2hib3JzKSB7XG4gICAgICB2YXIgZ3JhcGhSZWN0ID0gYm91bmRpbmdCb3g7XG5cbiAgICAgIHZhciBiYXNlWCA9IDAsIGJhc2VZID0gMCwgYmFzZVogPSAwO1xuXG4gICAgICBpZiAobmVpZ2hib3JzLmxlbmd0aCkge1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG5laWdoYm9ycy5sZW5ndGg7ICsraSkge1xuICAgICAgICAgIGJhc2VYICs9IG5laWdoYm9yc1tpXS5wb3MueDtcbiAgICAgICAgICBiYXNlWSArPSBuZWlnaGJvcnNbaV0ucG9zLnk7XG4gICAgICAgICAgYmFzZVogKz0gbmVpZ2hib3JzW2ldLnBvcy56O1xuICAgICAgICB9XG5cbiAgICAgICAgYmFzZVggLz0gbmVpZ2hib3JzLmxlbmd0aDtcbiAgICAgICAgYmFzZVkgLz0gbmVpZ2hib3JzLmxlbmd0aDtcbiAgICAgICAgYmFzZVogLz0gbmVpZ2hib3JzLmxlbmd0aDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGJhc2VYID0gKGdyYXBoUmVjdC54MSArIGdyYXBoUmVjdC54MikgLyAyO1xuICAgICAgICBiYXNlWSA9IChncmFwaFJlY3QueTEgKyBncmFwaFJlY3QueTIpIC8gMjtcbiAgICAgICAgYmFzZVogPSAoZ3JhcGhSZWN0LnoxICsgZ3JhcGhSZWN0LnoyKSAvIDI7XG4gICAgICB9XG5cbiAgICAgIHZhciBzcHJpbmdMZW5ndGggPSBzZXR0aW5ncy5zcHJpbmdMZW5ndGg7XG4gICAgICByZXR1cm4ge1xuICAgICAgICB4OiBiYXNlWCArIHJhbmRvbS5uZXh0KHNwcmluZ0xlbmd0aCkgLSBzcHJpbmdMZW5ndGggLyAyLFxuICAgICAgICB5OiBiYXNlWSArIHJhbmRvbS5uZXh0KHNwcmluZ0xlbmd0aCkgLSBzcHJpbmdMZW5ndGggLyAyLFxuICAgICAgICB6OiBiYXNlWiArIHJhbmRvbS5uZXh0KHNwcmluZ0xlbmd0aCkgLSBzcHJpbmdMZW5ndGggLyAyXG4gICAgICB9O1xuICAgIH1cbiAgfTtcblxuICBmdW5jdGlvbiB1cGRhdGVCb3VuZGluZ0JveCgpIHtcbiAgICB2YXIgaSA9IGJvZGllcy5sZW5ndGg7XG4gICAgaWYgKGkgPT09IDApIHsgcmV0dXJuOyB9IC8vIGRvbid0IGhhdmUgdG8gd29yeSBoZXJlLlxuXG4gICAgdmFyIHgxID0gTnVtYmVyLk1BWF9WQUxVRSxcbiAgICAgICAgeTEgPSBOdW1iZXIuTUFYX1ZBTFVFLFxuICAgICAgICB6MSA9IE51bWJlci5NQVhfVkFMVUUsXG4gICAgICAgIHgyID0gTnVtYmVyLk1JTl9WQUxVRSxcbiAgICAgICAgeTIgPSBOdW1iZXIuTUlOX1ZBTFVFLFxuICAgICAgICB6MiA9IE51bWJlci5NSU5fVkFMVUU7XG5cbiAgICB3aGlsZShpLS0pIHtcbiAgICAgIC8vIHRoaXMgaXMgTyhuKSwgY291bGQgaXQgYmUgZG9uZSBmYXN0ZXIgd2l0aCBxdWFkdHJlZT9cbiAgICAgIC8vIGhvdyBhYm91dCBwaW5uZWQgbm9kZXM/XG4gICAgICB2YXIgYm9keSA9IGJvZGllc1tpXTtcbiAgICAgIGlmIChib2R5LmlzUGlubmVkKSB7XG4gICAgICAgIGJvZHkucG9zLnggPSBib2R5LnByZXZQb3MueDtcbiAgICAgICAgYm9keS5wb3MueSA9IGJvZHkucHJldlBvcy55O1xuICAgICAgICBib2R5LnBvcy56ID0gYm9keS5wcmV2UG9zLno7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBib2R5LnByZXZQb3MueCA9IGJvZHkucG9zLng7XG4gICAgICAgIGJvZHkucHJldlBvcy55ID0gYm9keS5wb3MueTtcbiAgICAgICAgYm9keS5wcmV2UG9zLnogPSBib2R5LnBvcy56O1xuICAgICAgfVxuICAgICAgaWYgKGJvZHkucG9zLnggPCB4MSkge1xuICAgICAgICB4MSA9IGJvZHkucG9zLng7XG4gICAgICB9XG4gICAgICBpZiAoYm9keS5wb3MueCA+IHgyKSB7XG4gICAgICAgIHgyID0gYm9keS5wb3MueDtcbiAgICAgIH1cbiAgICAgIGlmIChib2R5LnBvcy55IDwgeTEpIHtcbiAgICAgICAgeTEgPSBib2R5LnBvcy55O1xuICAgICAgfVxuICAgICAgaWYgKGJvZHkucG9zLnkgPiB5Mikge1xuICAgICAgICB5MiA9IGJvZHkucG9zLnk7XG4gICAgICB9XG4gICAgICBpZiAoYm9keS5wb3MueiA8IHoxKSB7XG4gICAgICAgIHoxID0gYm9keS5wb3MuejtcbiAgICAgIH1cbiAgICAgIGlmIChib2R5LnBvcy56ID4gejIpIHtcbiAgICAgICAgejIgPSBib2R5LnBvcy56O1xuICAgICAgfVxuICAgIH1cblxuICAgIGJvdW5kaW5nQm94LngxID0geDE7XG4gICAgYm91bmRpbmdCb3gueDIgPSB4MjtcbiAgICBib3VuZGluZ0JveC55MSA9IHkxO1xuICAgIGJvdW5kaW5nQm94LnkyID0geTI7XG4gICAgYm91bmRpbmdCb3guejEgPSB6MTtcbiAgICBib3VuZGluZ0JveC56MiA9IHoyO1xuICB9XG59O1xuIiwidmFyIHBoeXNpY3MgPSByZXF1aXJlKCduZ3JhcGgucGh5c2ljcy5wcmltaXRpdmVzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ocG9zKSB7XG4gIHJldHVybiBuZXcgcGh5c2ljcy5Cb2R5M2QocG9zKTtcbn1cbiIsIi8qKlxuICogUmVwcmVzZW50cyAzZCBkcmFnIGZvcmNlLCB3aGljaCByZWR1Y2VzIGZvcmNlIHZhbHVlIG9uIGVhY2ggc3RlcCBieSBnaXZlblxuICogY29lZmZpY2llbnQuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgZm9yIHRoZSBkcmFnIGZvcmNlXG4gKiBAcGFyYW0ge051bWJlcj19IG9wdGlvbnMuZHJhZ0NvZWZmIGRyYWcgZm9yY2UgY29lZmZpY2llbnQuIDAuMSBieSBkZWZhdWx0XG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgdmFyIG1lcmdlID0gcmVxdWlyZSgnbmdyYXBoLm1lcmdlJyksXG4gICAgICBleHBvc2UgPSByZXF1aXJlKCduZ3JhcGguZXhwb3NlJyk7XG5cbiAgb3B0aW9ucyA9IG1lcmdlKG9wdGlvbnMsIHtcbiAgICBkcmFnQ29lZmY6IDAuMDJcbiAgfSk7XG5cbiAgdmFyIGFwaSA9IHtcbiAgICB1cGRhdGUgOiBmdW5jdGlvbiAoYm9keSkge1xuICAgICAgYm9keS5mb3JjZS54IC09IG9wdGlvbnMuZHJhZ0NvZWZmICogYm9keS52ZWxvY2l0eS54O1xuICAgICAgYm9keS5mb3JjZS55IC09IG9wdGlvbnMuZHJhZ0NvZWZmICogYm9keS52ZWxvY2l0eS55O1xuICAgICAgYm9keS5mb3JjZS56IC09IG9wdGlvbnMuZHJhZ0NvZWZmICogYm9keS52ZWxvY2l0eS56O1xuICAgIH1cbiAgfTtcblxuICAvLyBsZXQgZWFzeSBhY2Nlc3MgdG8gZHJhZ0NvZWZmOlxuICBleHBvc2Uob3B0aW9ucywgYXBpLCBbJ2RyYWdDb2VmZiddKTtcblxuICByZXR1cm4gYXBpO1xufTtcbiIsIi8qKlxuICogUGVyZm9ybXMgM2QgZm9yY2VzIGludGVncmF0aW9uLCB1c2luZyBnaXZlbiB0aW1lc3RlcC4gVXNlcyBFdWxlciBtZXRob2QgdG8gc29sdmVcbiAqIGRpZmZlcmVudGlhbCBlcXVhdGlvbiAoaHR0cDovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9FdWxlcl9tZXRob2QgKS5cbiAqXG4gKiBAcmV0dXJucyB7TnVtYmVyfSBzcXVhcmVkIGRpc3RhbmNlIG9mIHRvdGFsIHBvc2l0aW9uIHVwZGF0ZXMuXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBpbnRlZ3JhdGU7XG5cbmZ1bmN0aW9uIGludGVncmF0ZShib2RpZXMsIHRpbWVTdGVwKSB7XG4gIHZhciBkeCA9IDAsIHR4ID0gMCxcbiAgICAgIGR5ID0gMCwgdHkgPSAwLFxuICAgICAgZHogPSAwLCB0eiA9IDAsXG4gICAgICBpLFxuICAgICAgbWF4ID0gYm9kaWVzLmxlbmd0aDtcblxuICBmb3IgKGkgPSAwOyBpIDwgbWF4OyArK2kpIHtcbiAgICB2YXIgYm9keSA9IGJvZGllc1tpXSxcbiAgICAgICAgY29lZmYgPSB0aW1lU3RlcCAvIGJvZHkubWFzcztcblxuICAgIGJvZHkudmVsb2NpdHkueCArPSBjb2VmZiAqIGJvZHkuZm9yY2UueDtcbiAgICBib2R5LnZlbG9jaXR5LnkgKz0gY29lZmYgKiBib2R5LmZvcmNlLnk7XG4gICAgYm9keS52ZWxvY2l0eS56ICs9IGNvZWZmICogYm9keS5mb3JjZS56O1xuXG4gICAgdmFyIHZ4ID0gYm9keS52ZWxvY2l0eS54LFxuICAgICAgICB2eSA9IGJvZHkudmVsb2NpdHkueSxcbiAgICAgICAgdnogPSBib2R5LnZlbG9jaXR5LnosXG4gICAgICAgIHYgPSBNYXRoLnNxcnQodnggKiB2eCArIHZ5ICogdnkgKyB2eiAqIHZ6KTtcblxuICAgIGlmICh2ID4gMSkge1xuICAgICAgYm9keS52ZWxvY2l0eS54ID0gdnggLyB2O1xuICAgICAgYm9keS52ZWxvY2l0eS55ID0gdnkgLyB2O1xuICAgICAgYm9keS52ZWxvY2l0eS56ID0gdnogLyB2O1xuICAgIH1cblxuICAgIGR4ID0gdGltZVN0ZXAgKiBib2R5LnZlbG9jaXR5Lng7XG4gICAgZHkgPSB0aW1lU3RlcCAqIGJvZHkudmVsb2NpdHkueTtcbiAgICBkeiA9IHRpbWVTdGVwICogYm9keS52ZWxvY2l0eS56O1xuXG4gICAgYm9keS5wb3MueCArPSBkeDtcbiAgICBib2R5LnBvcy55ICs9IGR5O1xuICAgIGJvZHkucG9zLnogKz0gZHo7XG5cbiAgICB0eCArPSBNYXRoLmFicyhkeCk7IHR5ICs9IE1hdGguYWJzKGR5KTsgdHogKz0gTWF0aC5hYnMoZHopO1xuICB9XG5cbiAgcmV0dXJuICh0eCAqIHR4ICsgdHkgKiB0eSArIHR6ICogdHopL2JvZGllcy5sZW5ndGg7XG59XG4iLCIvKipcbiAqIFJlcHJlc2VudHMgM2Qgc3ByaW5nIGZvcmNlLCB3aGljaCB1cGRhdGVzIGZvcmNlcyBhY3Rpbmcgb24gdHdvIGJvZGllcywgY29ubnRlY3RlZFxuICogYnkgYSBzcHJpbmcuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgZm9yIHRoZSBzcHJpbmcgZm9yY2VcbiAqIEBwYXJhbSB7TnVtYmVyPX0gb3B0aW9ucy5zcHJpbmdDb2VmZiBzcHJpbmcgZm9yY2UgY29lZmZpY2llbnQuXG4gKiBAcGFyYW0ge051bWJlcj19IG9wdGlvbnMuc3ByaW5nTGVuZ3RoIGRlc2lyZWQgbGVuZ3RoIG9mIGEgc3ByaW5nIGF0IHJlc3QuXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgdmFyIG1lcmdlID0gcmVxdWlyZSgnbmdyYXBoLm1lcmdlJyk7XG4gIHZhciByYW5kb20gPSByZXF1aXJlKCduZ3JhcGgucmFuZG9tJykucmFuZG9tKDQyKTtcbiAgdmFyIGV4cG9zZSA9IHJlcXVpcmUoJ25ncmFwaC5leHBvc2UnKTtcblxuICBvcHRpb25zID0gbWVyZ2Uob3B0aW9ucywge1xuICAgIHNwcmluZ0NvZWZmOiAwLjAwMDIsXG4gICAgc3ByaW5nTGVuZ3RoOiA4MFxuICB9KTtcblxuICB2YXIgYXBpID0ge1xuICAgIC8qKlxuICAgICAqIFVwc2F0ZXMgZm9yY2VzIGFjdGluZyBvbiBhIHNwcmluZ1xuICAgICAqL1xuICAgIHVwZGF0ZSA6IGZ1bmN0aW9uIChzcHJpbmcpIHtcbiAgICAgIHZhciBib2R5MSA9IHNwcmluZy5mcm9tLFxuICAgICAgICAgIGJvZHkyID0gc3ByaW5nLnRvLFxuICAgICAgICAgIGxlbmd0aCA9IHNwcmluZy5sZW5ndGggPCAwID8gb3B0aW9ucy5zcHJpbmdMZW5ndGggOiBzcHJpbmcubGVuZ3RoLFxuICAgICAgICAgIGR4ID0gYm9keTIucG9zLnggLSBib2R5MS5wb3MueCxcbiAgICAgICAgICBkeSA9IGJvZHkyLnBvcy55IC0gYm9keTEucG9zLnksXG4gICAgICAgICAgZHogPSBib2R5Mi5wb3MueiAtIGJvZHkxLnBvcy56LFxuICAgICAgICAgIHIgPSBNYXRoLnNxcnQoZHggKiBkeCArIGR5ICogZHkgKyBkeiAqIGR6KTtcblxuICAgICAgaWYgKHIgPT09IDApIHtcbiAgICAgICAgICBkeCA9IChyYW5kb20ubmV4dERvdWJsZSgpIC0gMC41KSAvIDUwO1xuICAgICAgICAgIGR5ID0gKHJhbmRvbS5uZXh0RG91YmxlKCkgLSAwLjUpIC8gNTA7XG4gICAgICAgICAgZHogPSAocmFuZG9tLm5leHREb3VibGUoKSAtIDAuNSkgLyA1MDtcbiAgICAgICAgICByID0gTWF0aC5zcXJ0KGR4ICogZHggKyBkeSAqIGR5ICsgZHogKiBkeik7XG4gICAgICB9XG5cbiAgICAgIHZhciBkID0gciAtIGxlbmd0aDtcbiAgICAgIHZhciBjb2VmZiA9ICgoIXNwcmluZy5jb2VmZiB8fCBzcHJpbmcuY29lZmYgPCAwKSA/IG9wdGlvbnMuc3ByaW5nQ29lZmYgOiBzcHJpbmcuY29lZmYpICogZCAvIHIgKiBzcHJpbmcud2VpZ2h0O1xuXG4gICAgICBib2R5MS5mb3JjZS54ICs9IGNvZWZmICogZHg7XG4gICAgICBib2R5MS5mb3JjZS55ICs9IGNvZWZmICogZHk7XG4gICAgICBib2R5MS5mb3JjZS56ICs9IGNvZWZmICogZHo7XG5cbiAgICAgIGJvZHkyLmZvcmNlLnggLT0gY29lZmYgKiBkeDtcbiAgICAgIGJvZHkyLmZvcmNlLnkgLT0gY29lZmYgKiBkeTtcbiAgICAgIGJvZHkyLmZvcmNlLnogLT0gY29lZmYgKiBkejtcbiAgICB9XG4gIH07XG5cbiAgZXhwb3NlKG9wdGlvbnMsIGFwaSwgWydzcHJpbmdDb2VmZicsICdzcHJpbmdMZW5ndGgnXSk7XG4gIHJldHVybiBhcGk7XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGxvYWQ7XG5cbnZhciBjcmVhdGVHcmFwaCA9IHJlcXVpcmUoJ25ncmFwaC5ncmFwaCcpO1xuXG5mdW5jdGlvbiBsb2FkKGpzb25HcmFwaCwgbm9kZVRyYW5zZm9ybSwgbGlua1RyYW5zZm9ybSkge1xuICB2YXIgc3RvcmVkO1xuICBub2RlVHJhbnNmb3JtID0gbm9kZVRyYW5zZm9ybSB8fCBpZDtcbiAgbGlua1RyYW5zZm9ybSA9IGxpbmtUcmFuc2Zvcm0gfHwgaWQ7XG4gIGlmICh0eXBlb2YganNvbkdyYXBoID09PSAnc3RyaW5nJykge1xuICAgIHN0b3JlZCA9IEpTT04ucGFyc2UoanNvbkdyYXBoKTtcbiAgfSBlbHNlIHtcbiAgICBzdG9yZWQgPSBqc29uR3JhcGg7XG4gIH1cblxuICB2YXIgZ3JhcGggPSBjcmVhdGVHcmFwaCgpLFxuICAgICAgaTtcblxuICBpZiAoc3RvcmVkLmxpbmtzID09PSB1bmRlZmluZWQgfHwgc3RvcmVkLm5vZGVzID09PSB1bmRlZmluZWQpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCBsb2FkIGdyYXBoIHdpdGhvdXQgbGlua3MgYW5kIG5vZGVzJyk7XG4gIH1cblxuICBmb3IgKGkgPSAwOyBpIDwgc3RvcmVkLm5vZGVzLmxlbmd0aDsgKytpKSB7XG4gICAgdmFyIHBhcnNlZE5vZGUgPSBub2RlVHJhbnNmb3JtKHN0b3JlZC5ub2Rlc1tpXSk7XG4gICAgaWYgKCFwYXJzZWROb2RlLmhhc093blByb3BlcnR5KCdpZCcpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0dyYXBoIG5vZGUgZm9ybWF0IGlzIGludmFsaWQ6IE5vZGUgaWQgaXMgbWlzc2luZycpO1xuICAgIH1cblxuICAgIGdyYXBoLmFkZE5vZGUocGFyc2VkTm9kZS5pZCwgcGFyc2VkTm9kZS5kYXRhKTtcbiAgfVxuXG4gIGZvciAoaSA9IDA7IGkgPCBzdG9yZWQubGlua3MubGVuZ3RoOyArK2kpIHtcbiAgICB2YXIgbGluayA9IGxpbmtUcmFuc2Zvcm0oc3RvcmVkLmxpbmtzW2ldKTtcbiAgICBpZiAoIWxpbmsuaGFzT3duUHJvcGVydHkoJ2Zyb21JZCcpIHx8ICFsaW5rLmhhc093blByb3BlcnR5KCd0b0lkJykpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignR3JhcGggbGluayBmb3JtYXQgaXMgaW52YWxpZC4gQm90aCBmcm9tSWQgYW5kIHRvSWQgYXJlIHJlcXVpcmVkJyk7XG4gICAgfVxuXG4gICAgZ3JhcGguYWRkTGluayhsaW5rLmZyb21JZCwgbGluay50b0lkLCBsaW5rLmRhdGEpO1xuICB9XG5cbiAgcmV0dXJuIGdyYXBoO1xufVxuXG5mdW5jdGlvbiBpZCh4KSB7IHJldHVybiB4OyB9XG4iLCIvKipcbiAqIEBmaWxlT3ZlcnZpZXcgQ29udGFpbnMgZGVmaW5pdGlvbiBvZiB0aGUgY29yZSBncmFwaCBvYmplY3QuXG4gKi9cblxuLyoqXG4gKiBAZXhhbXBsZVxuICogIHZhciBncmFwaCA9IHJlcXVpcmUoJ25ncmFwaC5ncmFwaCcpKCk7XG4gKiAgZ3JhcGguYWRkTm9kZSgxKTsgICAgIC8vIGdyYXBoIGhhcyBvbmUgbm9kZS5cbiAqICBncmFwaC5hZGRMaW5rKDIsIDMpOyAgLy8gbm93IGdyYXBoIGNvbnRhaW5zIHRocmVlIG5vZGVzIGFuZCBvbmUgbGluay5cbiAqXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gY3JlYXRlR3JhcGg7XG5cbnZhciBldmVudGlmeSA9IHJlcXVpcmUoJ25ncmFwaC5ldmVudHMnKTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IGdyYXBoXG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZUdyYXBoKG9wdGlvbnMpIHtcbiAgLy8gR3JhcGggc3RydWN0dXJlIGlzIG1haW50YWluZWQgYXMgZGljdGlvbmFyeSBvZiBub2Rlc1xuICAvLyBhbmQgYXJyYXkgb2YgbGlua3MuIEVhY2ggbm9kZSBoYXMgJ2xpbmtzJyBwcm9wZXJ0eSB3aGljaFxuICAvLyBob2xkIGFsbCBsaW5rcyByZWxhdGVkIHRvIHRoYXQgbm9kZS4gQW5kIGdlbmVyYWwgbGlua3NcbiAgLy8gYXJyYXkgaXMgdXNlZCB0byBzcGVlZCB1cCBhbGwgbGlua3MgZW51bWVyYXRpb24uIFRoaXMgaXMgaW5lZmZpY2llbnRcbiAgLy8gaW4gdGVybXMgb2YgbWVtb3J5LCBidXQgc2ltcGxpZmllcyBjb2RpbmcuXG4gIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICBpZiAob3B0aW9ucy51bmlxdWVMaW5rSWQgPT09IHVuZGVmaW5lZCkge1xuICAgIC8vIFJlcXVlc3QgZWFjaCBsaW5rIGlkIHRvIGJlIHVuaXF1ZSBiZXR3ZWVuIHNhbWUgbm9kZXMuIFRoaXMgbmVnYXRpdmVseVxuICAgIC8vIGltcGFjdHMgYGFkZExpbmsoKWAgcGVyZm9ybWFuY2UgKE8obiksIHdoZXJlIG4gLSBudW1iZXIgb2YgZWRnZXMgb2YgZWFjaFxuICAgIC8vIHZlcnRleCksIGJ1dCBtYWtlcyBvcGVyYXRpb25zIHdpdGggbXVsdGlncmFwaHMgbW9yZSBhY2Nlc3NpYmxlLlxuICAgIG9wdGlvbnMudW5pcXVlTGlua0lkID0gdHJ1ZTtcbiAgfVxuXG4gIHZhciBub2RlcyA9IHR5cGVvZiBPYmplY3QuY3JlYXRlID09PSAnZnVuY3Rpb24nID8gT2JqZWN0LmNyZWF0ZShudWxsKSA6IHt9LFxuICAgIGxpbmtzID0gW10sXG4gICAgLy8gSGFzaCBvZiBtdWx0aS1lZGdlcy4gVXNlZCB0byB0cmFjayBpZHMgb2YgZWRnZXMgYmV0d2VlbiBzYW1lIG5vZGVzXG4gICAgbXVsdGlFZGdlcyA9IHt9LFxuICAgIG5vZGVzQ291bnQgPSAwLFxuICAgIHN1c3BlbmRFdmVudHMgPSAwLFxuXG4gICAgZm9yRWFjaE5vZGUgPSBjcmVhdGVOb2RlSXRlcmF0b3IoKSxcbiAgICBjcmVhdGVMaW5rID0gb3B0aW9ucy51bmlxdWVMaW5rSWQgPyBjcmVhdGVVbmlxdWVMaW5rIDogY3JlYXRlU2luZ2xlTGluayxcblxuICAgIC8vIE91ciBncmFwaCBBUEkgcHJvdmlkZXMgbWVhbnMgdG8gbGlzdGVuIHRvIGdyYXBoIGNoYW5nZXMuIFVzZXJzIGNhbiBzdWJzY3JpYmVcbiAgICAvLyB0byBiZSBub3RpZmllZCBhYm91dCBjaGFuZ2VzIGluIHRoZSBncmFwaCBieSB1c2luZyBgb25gIG1ldGhvZC4gSG93ZXZlclxuICAgIC8vIGluIHNvbWUgY2FzZXMgdGhleSBkb24ndCB1c2UgaXQuIFRvIGF2b2lkIHVubmVjZXNzYXJ5IG1lbW9yeSBjb25zdW1wdGlvblxuICAgIC8vIHdlIHdpbGwgbm90IHJlY29yZCBncmFwaCBjaGFuZ2VzIHVudGlsIHdlIGhhdmUgYXQgbGVhc3Qgb25lIHN1YnNjcmliZXIuXG4gICAgLy8gQ29kZSBiZWxvdyBzdXBwb3J0cyB0aGlzIG9wdGltaXphdGlvbi5cbiAgICAvL1xuICAgIC8vIEFjY3VtdWxhdGVzIGFsbCBjaGFuZ2VzIG1hZGUgZHVyaW5nIGdyYXBoIHVwZGF0ZXMuXG4gICAgLy8gRWFjaCBjaGFuZ2UgZWxlbWVudCBjb250YWluczpcbiAgICAvLyAgY2hhbmdlVHlwZSAtIG9uZSBvZiB0aGUgc3RyaW5nczogJ2FkZCcsICdyZW1vdmUnIG9yICd1cGRhdGUnO1xuICAgIC8vICBub2RlIC0gaWYgY2hhbmdlIGlzIHJlbGF0ZWQgdG8gbm9kZSB0aGlzIHByb3BlcnR5IGlzIHNldCB0byBjaGFuZ2VkIGdyYXBoJ3Mgbm9kZTtcbiAgICAvLyAgbGluayAtIGlmIGNoYW5nZSBpcyByZWxhdGVkIHRvIGxpbmsgdGhpcyBwcm9wZXJ0eSBpcyBzZXQgdG8gY2hhbmdlZCBncmFwaCdzIGxpbms7XG4gICAgY2hhbmdlcyA9IFtdLFxuICAgIHJlY29yZExpbmtDaGFuZ2UgPSBub29wLFxuICAgIHJlY29yZE5vZGVDaGFuZ2UgPSBub29wLFxuICAgIGVudGVyTW9kaWZpY2F0aW9uID0gbm9vcCxcbiAgICBleGl0TW9kaWZpY2F0aW9uID0gbm9vcDtcblxuICAvLyB0aGlzIGlzIG91ciBwdWJsaWMgQVBJOlxuICB2YXIgZ3JhcGhQYXJ0ID0ge1xuICAgIC8qKlxuICAgICAqIEFkZHMgbm9kZSB0byB0aGUgZ3JhcGguIElmIG5vZGUgd2l0aCBnaXZlbiBpZCBhbHJlYWR5IGV4aXN0cyBpbiB0aGUgZ3JhcGhcbiAgICAgKiBpdHMgZGF0YSBpcyBleHRlbmRlZCB3aXRoIHdoYXRldmVyIGNvbWVzIGluICdkYXRhJyBhcmd1bWVudC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSBub2RlSWQgdGhlIG5vZGUncyBpZGVudGlmaWVyLiBBIHN0cmluZyBvciBudW1iZXIgaXMgcHJlZmVycmVkLlxuICAgICAqIEBwYXJhbSBbZGF0YV0gYWRkaXRpb25hbCBkYXRhIGZvciB0aGUgbm9kZSBiZWluZyBhZGRlZC4gSWYgbm9kZSBhbHJlYWR5XG4gICAgICogICBleGlzdHMgaXRzIGRhdGEgb2JqZWN0IGlzIGF1Z21lbnRlZCB3aXRoIHRoZSBuZXcgb25lLlxuICAgICAqXG4gICAgICogQHJldHVybiB7bm9kZX0gVGhlIG5ld2x5IGFkZGVkIG5vZGUgb3Igbm9kZSB3aXRoIGdpdmVuIGlkIGlmIGl0IGFscmVhZHkgZXhpc3RzLlxuICAgICAqL1xuICAgIGFkZE5vZGU6IGFkZE5vZGUsXG5cbiAgICAvKipcbiAgICAgKiBBZGRzIGEgbGluayB0byB0aGUgZ3JhcGguIFRoZSBmdW5jdGlvbiBhbHdheXMgY3JlYXRlIGEgbmV3XG4gICAgICogbGluayBiZXR3ZWVuIHR3byBub2Rlcy4gSWYgb25lIG9mIHRoZSBub2RlcyBkb2VzIG5vdCBleGlzdHNcbiAgICAgKiBhIG5ldyBub2RlIGlzIGNyZWF0ZWQuXG4gICAgICpcbiAgICAgKiBAcGFyYW0gZnJvbUlkIGxpbmsgc3RhcnQgbm9kZSBpZDtcbiAgICAgKiBAcGFyYW0gdG9JZCBsaW5rIGVuZCBub2RlIGlkO1xuICAgICAqIEBwYXJhbSBbZGF0YV0gYWRkaXRpb25hbCBkYXRhIHRvIGJlIHNldCBvbiB0aGUgbmV3IGxpbms7XG4gICAgICpcbiAgICAgKiBAcmV0dXJuIHtsaW5rfSBUaGUgbmV3bHkgY3JlYXRlZCBsaW5rXG4gICAgICovXG4gICAgYWRkTGluazogYWRkTGluayxcblxuICAgIC8qKlxuICAgICAqIFJlbW92ZXMgbGluayBmcm9tIHRoZSBncmFwaC4gSWYgbGluayBkb2VzIG5vdCBleGlzdCBkb2VzIG5vdGhpbmcuXG4gICAgICpcbiAgICAgKiBAcGFyYW0gbGluayAtIG9iamVjdCByZXR1cm5lZCBieSBhZGRMaW5rKCkgb3IgZ2V0TGlua3MoKSBtZXRob2RzLlxuICAgICAqXG4gICAgICogQHJldHVybnMgdHJ1ZSBpZiBsaW5rIHdhcyByZW1vdmVkOyBmYWxzZSBvdGhlcndpc2UuXG4gICAgICovXG4gICAgcmVtb3ZlTGluazogcmVtb3ZlTGluayxcblxuICAgIC8qKlxuICAgICAqIFJlbW92ZXMgbm9kZSB3aXRoIGdpdmVuIGlkIGZyb20gdGhlIGdyYXBoLiBJZiBub2RlIGRvZXMgbm90IGV4aXN0IGluIHRoZSBncmFwaFxuICAgICAqIGRvZXMgbm90aGluZy5cbiAgICAgKlxuICAgICAqIEBwYXJhbSBub2RlSWQgbm9kZSdzIGlkZW50aWZpZXIgcGFzc2VkIHRvIGFkZE5vZGUoKSBmdW5jdGlvbi5cbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHRydWUgaWYgbm9kZSB3YXMgcmVtb3ZlZDsgZmFsc2Ugb3RoZXJ3aXNlLlxuICAgICAqL1xuICAgIHJlbW92ZU5vZGU6IHJlbW92ZU5vZGUsXG5cbiAgICAvKipcbiAgICAgKiBHZXRzIG5vZGUgd2l0aCBnaXZlbiBpZGVudGlmaWVyLiBJZiBub2RlIGRvZXMgbm90IGV4aXN0IHVuZGVmaW5lZCB2YWx1ZSBpcyByZXR1cm5lZC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSBub2RlSWQgcmVxdWVzdGVkIG5vZGUgaWRlbnRpZmllcjtcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge25vZGV9IGluIHdpdGggcmVxdWVzdGVkIGlkZW50aWZpZXIgb3IgdW5kZWZpbmVkIGlmIG5vIHN1Y2ggbm9kZSBleGlzdHMuXG4gICAgICovXG4gICAgZ2V0Tm9kZTogZ2V0Tm9kZSxcblxuICAgIC8qKlxuICAgICAqIEdldHMgbnVtYmVyIG9mIG5vZGVzIGluIHRoaXMgZ3JhcGguXG4gICAgICpcbiAgICAgKiBAcmV0dXJuIG51bWJlciBvZiBub2RlcyBpbiB0aGUgZ3JhcGguXG4gICAgICovXG4gICAgZ2V0Tm9kZXNDb3VudDogZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gbm9kZXNDb3VudDtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogR2V0cyB0b3RhbCBudW1iZXIgb2YgbGlua3MgaW4gdGhlIGdyYXBoLlxuICAgICAqL1xuICAgIGdldExpbmtzQ291bnQ6IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIGxpbmtzLmxlbmd0aDtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogR2V0cyBhbGwgbGlua3MgKGluYm91bmQgYW5kIG91dGJvdW5kKSBmcm9tIHRoZSBub2RlIHdpdGggZ2l2ZW4gaWQuXG4gICAgICogSWYgbm9kZSB3aXRoIGdpdmVuIGlkIGlzIG5vdCBmb3VuZCBudWxsIGlzIHJldHVybmVkLlxuICAgICAqXG4gICAgICogQHBhcmFtIG5vZGVJZCByZXF1ZXN0ZWQgbm9kZSBpZGVudGlmaWVyLlxuICAgICAqXG4gICAgICogQHJldHVybiBBcnJheSBvZiBsaW5rcyBmcm9tIGFuZCB0byByZXF1ZXN0ZWQgbm9kZSBpZiBzdWNoIG5vZGUgZXhpc3RzO1xuICAgICAqICAgb3RoZXJ3aXNlIG51bGwgaXMgcmV0dXJuZWQuXG4gICAgICovXG4gICAgZ2V0TGlua3M6IGdldExpbmtzLFxuXG4gICAgLyoqXG4gICAgICogSW52b2tlcyBjYWxsYmFjayBvbiBlYWNoIG5vZGUgb2YgdGhlIGdyYXBoLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbihub2RlKX0gY2FsbGJhY2sgRnVuY3Rpb24gdG8gYmUgaW52b2tlZC4gVGhlIGZ1bmN0aW9uXG4gICAgICogICBpcyBwYXNzZWQgb25lIGFyZ3VtZW50OiB2aXNpdGVkIG5vZGUuXG4gICAgICovXG4gICAgZm9yRWFjaE5vZGU6IGZvckVhY2hOb2RlLFxuXG4gICAgLyoqXG4gICAgICogSW52b2tlcyBjYWxsYmFjayBvbiBldmVyeSBsaW5rZWQgKGFkamFjZW50KSBub2RlIHRvIHRoZSBnaXZlbiBvbmUuXG4gICAgICpcbiAgICAgKiBAcGFyYW0gbm9kZUlkIElkZW50aWZpZXIgb2YgdGhlIHJlcXVlc3RlZCBub2RlLlxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb24obm9kZSwgbGluayl9IGNhbGxiYWNrIEZ1bmN0aW9uIHRvIGJlIGNhbGxlZCBvbiBhbGwgbGlua2VkIG5vZGVzLlxuICAgICAqICAgVGhlIGZ1bmN0aW9uIGlzIHBhc3NlZCB0d28gcGFyYW1ldGVyczogYWRqYWNlbnQgbm9kZSBhbmQgbGluayBvYmplY3QgaXRzZWxmLlxuICAgICAqIEBwYXJhbSBvcmllbnRlZCBpZiB0cnVlIGdyYXBoIHRyZWF0ZWQgYXMgb3JpZW50ZWQuXG4gICAgICovXG4gICAgZm9yRWFjaExpbmtlZE5vZGU6IGZvckVhY2hMaW5rZWROb2RlLFxuXG4gICAgLyoqXG4gICAgICogRW51bWVyYXRlcyBhbGwgbGlua3MgaW4gdGhlIGdyYXBoXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9uKGxpbmspfSBjYWxsYmFjayBGdW5jdGlvbiB0byBiZSBjYWxsZWQgb24gYWxsIGxpbmtzIGluIHRoZSBncmFwaC5cbiAgICAgKiAgIFRoZSBmdW5jdGlvbiBpcyBwYXNzZWQgb25lIHBhcmFtZXRlcjogZ3JhcGgncyBsaW5rIG9iamVjdC5cbiAgICAgKlxuICAgICAqIExpbmsgb2JqZWN0IGNvbnRhaW5zIGF0IGxlYXN0IHRoZSBmb2xsb3dpbmcgZmllbGRzOlxuICAgICAqICBmcm9tSWQgLSBub2RlIGlkIHdoZXJlIGxpbmsgc3RhcnRzO1xuICAgICAqICB0b0lkIC0gbm9kZSBpZCB3aGVyZSBsaW5rIGVuZHMsXG4gICAgICogIGRhdGEgLSBhZGRpdGlvbmFsIGRhdGEgcGFzc2VkIHRvIGdyYXBoLmFkZExpbmsoKSBtZXRob2QuXG4gICAgICovXG4gICAgZm9yRWFjaExpbms6IGZvckVhY2hMaW5rLFxuXG4gICAgLyoqXG4gICAgICogU3VzcGVuZCBhbGwgbm90aWZpY2F0aW9ucyBhYm91dCBncmFwaCBjaGFuZ2VzIHVudGlsXG4gICAgICogZW5kVXBkYXRlIGlzIGNhbGxlZC5cbiAgICAgKi9cbiAgICBiZWdpblVwZGF0ZTogZW50ZXJNb2RpZmljYXRpb24sXG5cbiAgICAvKipcbiAgICAgKiBSZXN1bWVzIGFsbCBub3RpZmljYXRpb25zIGFib3V0IGdyYXBoIGNoYW5nZXMgYW5kIGZpcmVzXG4gICAgICogZ3JhcGggJ2NoYW5nZWQnIGV2ZW50IGluIGNhc2UgdGhlcmUgYXJlIGFueSBwZW5kaW5nIGNoYW5nZXMuXG4gICAgICovXG4gICAgZW5kVXBkYXRlOiBleGl0TW9kaWZpY2F0aW9uLFxuXG4gICAgLyoqXG4gICAgICogUmVtb3ZlcyBhbGwgbm9kZXMgYW5kIGxpbmtzIGZyb20gdGhlIGdyYXBoLlxuICAgICAqL1xuICAgIGNsZWFyOiBjbGVhcixcblxuICAgIC8qKlxuICAgICAqIERldGVjdHMgd2hldGhlciB0aGVyZSBpcyBhIGxpbmsgYmV0d2VlbiB0d28gbm9kZXMuXG4gICAgICogT3BlcmF0aW9uIGNvbXBsZXhpdHkgaXMgTyhuKSB3aGVyZSBuIC0gbnVtYmVyIG9mIGxpbmtzIG9mIGEgbm9kZS5cbiAgICAgKiBOT1RFOiB0aGlzIGZ1bmN0aW9uIGlzIHN5bm9uaW0gZm9yIGdldExpbmsoKVxuICAgICAqXG4gICAgICogQHJldHVybnMgbGluayBpZiB0aGVyZSBpcyBvbmUuIG51bGwgb3RoZXJ3aXNlLlxuICAgICAqL1xuICAgIGhhc0xpbms6IGdldExpbmssXG5cbiAgICAvKipcbiAgICAgKiBHZXRzIGFuIGVkZ2UgYmV0d2VlbiB0d28gbm9kZXMuXG4gICAgICogT3BlcmF0aW9uIGNvbXBsZXhpdHkgaXMgTyhuKSB3aGVyZSBuIC0gbnVtYmVyIG9mIGxpbmtzIG9mIGEgbm9kZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBmcm9tSWQgbGluayBzdGFydCBpZGVudGlmaWVyXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHRvSWQgbGluayBlbmQgaWRlbnRpZmllclxuICAgICAqXG4gICAgICogQHJldHVybnMgbGluayBpZiB0aGVyZSBpcyBvbmUuIG51bGwgb3RoZXJ3aXNlLlxuICAgICAqL1xuICAgIGdldExpbms6IGdldExpbmtcbiAgfTtcblxuICAvLyB0aGlzIHdpbGwgYWRkIGBvbigpYCBhbmQgYGZpcmUoKWAgbWV0aG9kcy5cbiAgZXZlbnRpZnkoZ3JhcGhQYXJ0KTtcblxuICBtb25pdG9yU3Vic2NyaWJlcnMoKTtcblxuICByZXR1cm4gZ3JhcGhQYXJ0O1xuXG4gIGZ1bmN0aW9uIG1vbml0b3JTdWJzY3JpYmVycygpIHtcbiAgICB2YXIgcmVhbE9uID0gZ3JhcGhQYXJ0Lm9uO1xuXG4gICAgLy8gcmVwbGFjZSByZWFsIGBvbmAgd2l0aCBvdXIgdGVtcG9yYXJ5IG9uLCB3aGljaCB3aWxsIHRyaWdnZXIgY2hhbmdlXG4gICAgLy8gbW9kaWZpY2F0aW9uIG1vbml0b3Jpbmc6XG4gICAgZ3JhcGhQYXJ0Lm9uID0gb247XG5cbiAgICBmdW5jdGlvbiBvbigpIHtcbiAgICAgIC8vIG5vdyBpdCdzIHRpbWUgdG8gc3RhcnQgdHJhY2tpbmcgc3R1ZmY6XG4gICAgICBncmFwaFBhcnQuYmVnaW5VcGRhdGUgPSBlbnRlck1vZGlmaWNhdGlvbiA9IGVudGVyTW9kaWZpY2F0aW9uUmVhbDtcbiAgICAgIGdyYXBoUGFydC5lbmRVcGRhdGUgPSBleGl0TW9kaWZpY2F0aW9uID0gZXhpdE1vZGlmaWNhdGlvblJlYWw7XG4gICAgICByZWNvcmRMaW5rQ2hhbmdlID0gcmVjb3JkTGlua0NoYW5nZVJlYWw7XG4gICAgICByZWNvcmROb2RlQ2hhbmdlID0gcmVjb3JkTm9kZUNoYW5nZVJlYWw7XG5cbiAgICAgIC8vIHRoaXMgd2lsbCByZXBsYWNlIGN1cnJlbnQgYG9uYCBtZXRob2Qgd2l0aCByZWFsIHB1Yi9zdWIgZnJvbSBgZXZlbnRpZnlgLlxuICAgICAgZ3JhcGhQYXJ0Lm9uID0gcmVhbE9uO1xuICAgICAgLy8gZGVsZWdhdGUgdG8gcmVhbCBgb25gIGhhbmRsZXI6XG4gICAgICByZXR1cm4gcmVhbE9uLmFwcGx5KGdyYXBoUGFydCwgYXJndW1lbnRzKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiByZWNvcmRMaW5rQ2hhbmdlUmVhbChsaW5rLCBjaGFuZ2VUeXBlKSB7XG4gICAgY2hhbmdlcy5wdXNoKHtcbiAgICAgIGxpbms6IGxpbmssXG4gICAgICBjaGFuZ2VUeXBlOiBjaGFuZ2VUeXBlXG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiByZWNvcmROb2RlQ2hhbmdlUmVhbChub2RlLCBjaGFuZ2VUeXBlKSB7XG4gICAgY2hhbmdlcy5wdXNoKHtcbiAgICAgIG5vZGU6IG5vZGUsXG4gICAgICBjaGFuZ2VUeXBlOiBjaGFuZ2VUeXBlXG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiBhZGROb2RlKG5vZGVJZCwgZGF0YSkge1xuICAgIGlmIChub2RlSWQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIG5vZGUgaWRlbnRpZmllcicpO1xuICAgIH1cblxuICAgIGVudGVyTW9kaWZpY2F0aW9uKCk7XG5cbiAgICB2YXIgbm9kZSA9IGdldE5vZGUobm9kZUlkKTtcbiAgICBpZiAoIW5vZGUpIHtcbiAgICAgIG5vZGUgPSBuZXcgTm9kZShub2RlSWQpO1xuICAgICAgbm9kZXNDb3VudCsrO1xuICAgICAgcmVjb3JkTm9kZUNoYW5nZShub2RlLCAnYWRkJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJlY29yZE5vZGVDaGFuZ2Uobm9kZSwgJ3VwZGF0ZScpO1xuICAgIH1cblxuICAgIG5vZGUuZGF0YSA9IGRhdGE7XG5cbiAgICBub2Rlc1tub2RlSWRdID0gbm9kZTtcblxuICAgIGV4aXRNb2RpZmljYXRpb24oKTtcbiAgICByZXR1cm4gbm9kZTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGdldE5vZGUobm9kZUlkKSB7XG4gICAgcmV0dXJuIG5vZGVzW25vZGVJZF07XG4gIH1cblxuICBmdW5jdGlvbiByZW1vdmVOb2RlKG5vZGVJZCkge1xuICAgIHZhciBub2RlID0gZ2V0Tm9kZShub2RlSWQpO1xuICAgIGlmICghbm9kZSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGVudGVyTW9kaWZpY2F0aW9uKCk7XG5cbiAgICBpZiAobm9kZS5saW5rcykge1xuICAgICAgd2hpbGUgKG5vZGUubGlua3MubGVuZ3RoKSB7XG4gICAgICAgIHZhciBsaW5rID0gbm9kZS5saW5rc1swXTtcbiAgICAgICAgcmVtb3ZlTGluayhsaW5rKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBkZWxldGUgbm9kZXNbbm9kZUlkXTtcbiAgICBub2Rlc0NvdW50LS07XG5cbiAgICByZWNvcmROb2RlQ2hhbmdlKG5vZGUsICdyZW1vdmUnKTtcblxuICAgIGV4aXRNb2RpZmljYXRpb24oKTtcblxuICAgIHJldHVybiB0cnVlO1xuICB9XG5cblxuICBmdW5jdGlvbiBhZGRMaW5rKGZyb21JZCwgdG9JZCwgZGF0YSkge1xuICAgIGVudGVyTW9kaWZpY2F0aW9uKCk7XG5cbiAgICB2YXIgZnJvbU5vZGUgPSBnZXROb2RlKGZyb21JZCkgfHwgYWRkTm9kZShmcm9tSWQpO1xuICAgIHZhciB0b05vZGUgPSBnZXROb2RlKHRvSWQpIHx8IGFkZE5vZGUodG9JZCk7XG5cbiAgICB2YXIgbGluayA9IGNyZWF0ZUxpbmsoZnJvbUlkLCB0b0lkLCBkYXRhKTtcblxuICAgIGxpbmtzLnB1c2gobGluayk7XG5cbiAgICAvLyBUT0RPOiB0aGlzIGlzIG5vdCBjb29sLiBPbiBsYXJnZSBncmFwaHMgcG90ZW50aWFsbHkgd291bGQgY29uc3VtZSBtb3JlIG1lbW9yeS5cbiAgICBhZGRMaW5rVG9Ob2RlKGZyb21Ob2RlLCBsaW5rKTtcbiAgICBpZiAoZnJvbUlkICE9PSB0b0lkKSB7XG4gICAgICAvLyBtYWtlIHN1cmUgd2UgYXJlIG5vdCBkdXBsaWNhdGluZyBsaW5rcyBmb3Igc2VsZi1sb29wc1xuICAgICAgYWRkTGlua1RvTm9kZSh0b05vZGUsIGxpbmspO1xuICAgIH1cblxuICAgIHJlY29yZExpbmtDaGFuZ2UobGluaywgJ2FkZCcpO1xuXG4gICAgZXhpdE1vZGlmaWNhdGlvbigpO1xuXG4gICAgcmV0dXJuIGxpbms7XG4gIH1cblxuICBmdW5jdGlvbiBjcmVhdGVTaW5nbGVMaW5rKGZyb21JZCwgdG9JZCwgZGF0YSkge1xuICAgIHZhciBsaW5rSWQgPSBtYWtlTGlua0lkKGZyb21JZCwgdG9JZCk7XG4gICAgcmV0dXJuIG5ldyBMaW5rKGZyb21JZCwgdG9JZCwgZGF0YSwgbGlua0lkKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZVVuaXF1ZUxpbmsoZnJvbUlkLCB0b0lkLCBkYXRhKSB7XG4gICAgLy8gVE9ETzogR2V0IHJpZCBvZiB0aGlzIG1ldGhvZC5cbiAgICB2YXIgbGlua0lkID0gbWFrZUxpbmtJZChmcm9tSWQsIHRvSWQpO1xuICAgIHZhciBpc011bHRpRWRnZSA9IG11bHRpRWRnZXMuaGFzT3duUHJvcGVydHkobGlua0lkKTtcbiAgICBpZiAoaXNNdWx0aUVkZ2UgfHwgZ2V0TGluayhmcm9tSWQsIHRvSWQpKSB7XG4gICAgICBpZiAoIWlzTXVsdGlFZGdlKSB7XG4gICAgICAgIG11bHRpRWRnZXNbbGlua0lkXSA9IDA7XG4gICAgICB9XG4gICAgICB2YXIgc3VmZml4ID0gJ0AnICsgKCsrbXVsdGlFZGdlc1tsaW5rSWRdKTtcbiAgICAgIGxpbmtJZCA9IG1ha2VMaW5rSWQoZnJvbUlkICsgc3VmZml4LCB0b0lkICsgc3VmZml4KTtcbiAgICB9XG5cbiAgICByZXR1cm4gbmV3IExpbmsoZnJvbUlkLCB0b0lkLCBkYXRhLCBsaW5rSWQpO1xuICB9XG5cbiAgZnVuY3Rpb24gZ2V0TGlua3Mobm9kZUlkKSB7XG4gICAgdmFyIG5vZGUgPSBnZXROb2RlKG5vZGVJZCk7XG4gICAgcmV0dXJuIG5vZGUgPyBub2RlLmxpbmtzIDogbnVsbDtcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlbW92ZUxpbmsobGluaykge1xuICAgIGlmICghbGluaykge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICB2YXIgaWR4ID0gaW5kZXhPZkVsZW1lbnRJbkFycmF5KGxpbmssIGxpbmtzKTtcbiAgICBpZiAoaWR4IDwgMCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGVudGVyTW9kaWZpY2F0aW9uKCk7XG5cbiAgICBsaW5rcy5zcGxpY2UoaWR4LCAxKTtcblxuICAgIHZhciBmcm9tTm9kZSA9IGdldE5vZGUobGluay5mcm9tSWQpO1xuICAgIHZhciB0b05vZGUgPSBnZXROb2RlKGxpbmsudG9JZCk7XG5cbiAgICBpZiAoZnJvbU5vZGUpIHtcbiAgICAgIGlkeCA9IGluZGV4T2ZFbGVtZW50SW5BcnJheShsaW5rLCBmcm9tTm9kZS5saW5rcyk7XG4gICAgICBpZiAoaWR4ID49IDApIHtcbiAgICAgICAgZnJvbU5vZGUubGlua3Muc3BsaWNlKGlkeCwgMSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHRvTm9kZSkge1xuICAgICAgaWR4ID0gaW5kZXhPZkVsZW1lbnRJbkFycmF5KGxpbmssIHRvTm9kZS5saW5rcyk7XG4gICAgICBpZiAoaWR4ID49IDApIHtcbiAgICAgICAgdG9Ob2RlLmxpbmtzLnNwbGljZShpZHgsIDEpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJlY29yZExpbmtDaGFuZ2UobGluaywgJ3JlbW92ZScpO1xuXG4gICAgZXhpdE1vZGlmaWNhdGlvbigpO1xuXG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBmdW5jdGlvbiBnZXRMaW5rKGZyb21Ob2RlSWQsIHRvTm9kZUlkKSB7XG4gICAgLy8gVE9ETzogVXNlIHNvcnRlZCBsaW5rcyB0byBzcGVlZCB0aGlzIHVwXG4gICAgdmFyIG5vZGUgPSBnZXROb2RlKGZyb21Ob2RlSWQpLFxuICAgICAgaTtcbiAgICBpZiAoIW5vZGUgfHwgIW5vZGUubGlua3MpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGZvciAoaSA9IDA7IGkgPCBub2RlLmxpbmtzLmxlbmd0aDsgKytpKSB7XG4gICAgICB2YXIgbGluayA9IG5vZGUubGlua3NbaV07XG4gICAgICBpZiAobGluay5mcm9tSWQgPT09IGZyb21Ob2RlSWQgJiYgbGluay50b0lkID09PSB0b05vZGVJZCkge1xuICAgICAgICByZXR1cm4gbGluaztcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gbnVsbDsgLy8gbm8gbGluay5cbiAgfVxuXG4gIGZ1bmN0aW9uIGNsZWFyKCkge1xuICAgIGVudGVyTW9kaWZpY2F0aW9uKCk7XG4gICAgZm9yRWFjaE5vZGUoZnVuY3Rpb24obm9kZSkge1xuICAgICAgcmVtb3ZlTm9kZShub2RlLmlkKTtcbiAgICB9KTtcbiAgICBleGl0TW9kaWZpY2F0aW9uKCk7XG4gIH1cblxuICBmdW5jdGlvbiBmb3JFYWNoTGluayhjYWxsYmFjaykge1xuICAgIHZhciBpLCBsZW5ndGg7XG4gICAgaWYgKHR5cGVvZiBjYWxsYmFjayA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgZm9yIChpID0gMCwgbGVuZ3RoID0gbGlua3MubGVuZ3RoOyBpIDwgbGVuZ3RoOyArK2kpIHtcbiAgICAgICAgY2FsbGJhY2sobGlua3NbaV0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGZvckVhY2hMaW5rZWROb2RlKG5vZGVJZCwgY2FsbGJhY2ssIG9yaWVudGVkKSB7XG4gICAgdmFyIG5vZGUgPSBnZXROb2RlKG5vZGVJZCk7XG5cbiAgICBpZiAobm9kZSAmJiBub2RlLmxpbmtzICYmIHR5cGVvZiBjYWxsYmFjayA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgaWYgKG9yaWVudGVkKSB7XG4gICAgICAgIHJldHVybiBmb3JFYWNoT3JpZW50ZWRMaW5rKG5vZGUubGlua3MsIG5vZGVJZCwgY2FsbGJhY2spO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGZvckVhY2hOb25PcmllbnRlZExpbmsobm9kZS5saW5rcywgbm9kZUlkLCBjYWxsYmFjayk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZm9yRWFjaE5vbk9yaWVudGVkTGluayhsaW5rcywgbm9kZUlkLCBjYWxsYmFjaykge1xuICAgIHZhciBxdWl0RmFzdDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxpbmtzLmxlbmd0aDsgKytpKSB7XG4gICAgICB2YXIgbGluayA9IGxpbmtzW2ldO1xuICAgICAgdmFyIGxpbmtlZE5vZGVJZCA9IGxpbmsuZnJvbUlkID09PSBub2RlSWQgPyBsaW5rLnRvSWQgOiBsaW5rLmZyb21JZDtcblxuICAgICAgcXVpdEZhc3QgPSBjYWxsYmFjayhub2Rlc1tsaW5rZWROb2RlSWRdLCBsaW5rKTtcbiAgICAgIGlmIChxdWl0RmFzdCkge1xuICAgICAgICByZXR1cm4gdHJ1ZTsgLy8gQ2xpZW50IGRvZXMgbm90IG5lZWQgbW9yZSBpdGVyYXRpb25zLiBCcmVhayBub3cuXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZm9yRWFjaE9yaWVudGVkTGluayhsaW5rcywgbm9kZUlkLCBjYWxsYmFjaykge1xuICAgIHZhciBxdWl0RmFzdDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxpbmtzLmxlbmd0aDsgKytpKSB7XG4gICAgICB2YXIgbGluayA9IGxpbmtzW2ldO1xuICAgICAgaWYgKGxpbmsuZnJvbUlkID09PSBub2RlSWQpIHtcbiAgICAgICAgcXVpdEZhc3QgPSBjYWxsYmFjayhub2Rlc1tsaW5rLnRvSWRdLCBsaW5rKTtcbiAgICAgICAgaWYgKHF1aXRGYXN0KSB7XG4gICAgICAgICAgcmV0dXJuIHRydWU7IC8vIENsaWVudCBkb2VzIG5vdCBuZWVkIG1vcmUgaXRlcmF0aW9ucy4gQnJlYWsgbm93LlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gd2Ugd2lsbCBub3QgZmlyZSBhbnl0aGluZyB1bnRpbCB1c2VycyBvZiB0aGlzIGxpYnJhcnkgZXhwbGljaXRseSBjYWxsIGBvbigpYFxuICAvLyBtZXRob2QuXG4gIGZ1bmN0aW9uIG5vb3AoKSB7fVxuXG4gIC8vIEVudGVyLCBFeGl0IG1vZGlmaWNhdGlvbiBhbGxvd3MgYnVsayBncmFwaCB1cGRhdGVzIHdpdGhvdXQgZmlyaW5nIGV2ZW50cy5cbiAgZnVuY3Rpb24gZW50ZXJNb2RpZmljYXRpb25SZWFsKCkge1xuICAgIHN1c3BlbmRFdmVudHMgKz0gMTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGV4aXRNb2RpZmljYXRpb25SZWFsKCkge1xuICAgIHN1c3BlbmRFdmVudHMgLT0gMTtcbiAgICBpZiAoc3VzcGVuZEV2ZW50cyA9PT0gMCAmJiBjaGFuZ2VzLmxlbmd0aCA+IDApIHtcbiAgICAgIGdyYXBoUGFydC5maXJlKCdjaGFuZ2VkJywgY2hhbmdlcyk7XG4gICAgICBjaGFuZ2VzLmxlbmd0aCA9IDA7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlTm9kZUl0ZXJhdG9yKCkge1xuICAgIC8vIE9iamVjdC5rZXlzIGl0ZXJhdG9yIGlzIDEuM3ggZmFzdGVyIHRoYW4gYGZvciBpbmAgbG9vcC5cbiAgICAvLyBTZWUgYGh0dHBzOi8vZ2l0aHViLmNvbS9hbnZha2EvbmdyYXBoLmdyYXBoL3RyZWUvYmVuY2gtZm9yLWluLXZzLW9iai1rZXlzYFxuICAgIC8vIGJyYW5jaCBmb3IgcGVyZiB0ZXN0XG4gICAgcmV0dXJuIE9iamVjdC5rZXlzID8gb2JqZWN0S2V5c0l0ZXJhdG9yIDogZm9ySW5JdGVyYXRvcjtcbiAgfVxuXG4gIGZ1bmN0aW9uIG9iamVjdEtleXNJdGVyYXRvcihjYWxsYmFjaykge1xuICAgIGlmICh0eXBlb2YgY2FsbGJhY2sgIT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKG5vZGVzKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGtleXMubGVuZ3RoOyArK2kpIHtcbiAgICAgIGlmIChjYWxsYmFjayhub2Rlc1trZXlzW2ldXSkpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7IC8vIGNsaWVudCBkb2Vzbid0IHdhbnQgdG8gcHJvY2VlZC4gUmV0dXJuLlxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGZvckluSXRlcmF0b3IoY2FsbGJhY2spIHtcbiAgICBpZiAodHlwZW9mIGNhbGxiYWNrICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHZhciBub2RlO1xuXG4gICAgZm9yIChub2RlIGluIG5vZGVzKSB7XG4gICAgICBpZiAoY2FsbGJhY2sobm9kZXNbbm9kZV0pKSB7XG4gICAgICAgIHJldHVybiB0cnVlOyAvLyBjbGllbnQgZG9lc24ndCB3YW50IHRvIHByb2NlZWQuIFJldHVybi5cbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxuLy8gbmVlZCB0aGlzIGZvciBvbGQgYnJvd3NlcnMuIFNob3VsZCB0aGlzIGJlIGEgc2VwYXJhdGUgbW9kdWxlP1xuZnVuY3Rpb24gaW5kZXhPZkVsZW1lbnRJbkFycmF5KGVsZW1lbnQsIGFycmF5KSB7XG4gIGlmICghYXJyYXkpIHJldHVybiAtMTtcblxuICBpZiAoYXJyYXkuaW5kZXhPZikge1xuICAgIHJldHVybiBhcnJheS5pbmRleE9mKGVsZW1lbnQpO1xuICB9XG5cbiAgdmFyIGxlbiA9IGFycmF5Lmxlbmd0aCxcbiAgICBpO1xuXG4gIGZvciAoaSA9IDA7IGkgPCBsZW47IGkgKz0gMSkge1xuICAgIGlmIChhcnJheVtpXSA9PT0gZWxlbWVudCkge1xuICAgICAgcmV0dXJuIGk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIC0xO1xufVxuXG4vKipcbiAqIEludGVybmFsIHN0cnVjdHVyZSB0byByZXByZXNlbnQgbm9kZTtcbiAqL1xuZnVuY3Rpb24gTm9kZShpZCkge1xuICB0aGlzLmlkID0gaWQ7XG4gIHRoaXMubGlua3MgPSBudWxsO1xuICB0aGlzLmRhdGEgPSBudWxsO1xufVxuXG5mdW5jdGlvbiBhZGRMaW5rVG9Ob2RlKG5vZGUsIGxpbmspIHtcbiAgaWYgKG5vZGUubGlua3MpIHtcbiAgICBub2RlLmxpbmtzLnB1c2gobGluayk7XG4gIH0gZWxzZSB7XG4gICAgbm9kZS5saW5rcyA9IFtsaW5rXTtcbiAgfVxufVxuXG4vKipcbiAqIEludGVybmFsIHN0cnVjdHVyZSB0byByZXByZXNlbnQgbGlua3M7XG4gKi9cbmZ1bmN0aW9uIExpbmsoZnJvbUlkLCB0b0lkLCBkYXRhLCBpZCkge1xuICB0aGlzLmZyb21JZCA9IGZyb21JZDtcbiAgdGhpcy50b0lkID0gdG9JZDtcbiAgdGhpcy5kYXRhID0gZGF0YTtcbiAgdGhpcy5pZCA9IGlkO1xufVxuXG5mdW5jdGlvbiBoYXNoQ29kZShzdHIpIHtcbiAgdmFyIGhhc2ggPSAwLCBpLCBjaHIsIGxlbjtcbiAgaWYgKHN0ci5sZW5ndGggPT0gMCkgcmV0dXJuIGhhc2g7XG4gIGZvciAoaSA9IDAsIGxlbiA9IHN0ci5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgIGNociAgID0gc3RyLmNoYXJDb2RlQXQoaSk7XG4gICAgaGFzaCAgPSAoKGhhc2ggPDwgNSkgLSBoYXNoKSArIGNocjtcbiAgICBoYXNoIHw9IDA7IC8vIENvbnZlcnQgdG8gMzJiaXQgaW50ZWdlclxuICB9XG4gIHJldHVybiBoYXNoO1xufVxuXG5mdW5jdGlvbiBtYWtlTGlua0lkKGZyb21JZCwgdG9JZCkge1xuICByZXR1cm4gaGFzaENvZGUoZnJvbUlkLnRvU3RyaW5nKCkgKyAn8J+RiSAnICsgdG9JZC50b1N0cmluZygpKTtcbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gbWVyZ2U7XG5cbi8qKlxuICogQXVnbWVudHMgYHRhcmdldGAgd2l0aCBwcm9wZXJ0aWVzIGluIGBvcHRpb25zYC4gRG9lcyBub3Qgb3ZlcnJpZGVcbiAqIHRhcmdldCdzIHByb3BlcnRpZXMgaWYgdGhleSBhcmUgZGVmaW5lZCBhbmQgbWF0Y2hlcyBleHBlY3RlZCB0eXBlIGluIFxuICogb3B0aW9uc1xuICpcbiAqIEByZXR1cm5zIHtPYmplY3R9IG1lcmdlZCBvYmplY3RcbiAqL1xuZnVuY3Rpb24gbWVyZ2UodGFyZ2V0LCBvcHRpb25zKSB7XG4gIHZhciBrZXk7XG4gIGlmICghdGFyZ2V0KSB7IHRhcmdldCA9IHt9OyB9XG4gIGlmIChvcHRpb25zKSB7XG4gICAgZm9yIChrZXkgaW4gb3B0aW9ucykge1xuICAgICAgaWYgKG9wdGlvbnMuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgICAgICB2YXIgdGFyZ2V0SGFzSXQgPSB0YXJnZXQuaGFzT3duUHJvcGVydHkoa2V5KSxcbiAgICAgICAgICAgIG9wdGlvbnNWYWx1ZVR5cGUgPSB0eXBlb2Ygb3B0aW9uc1trZXldLFxuICAgICAgICAgICAgc2hvdWxkUmVwbGFjZSA9ICF0YXJnZXRIYXNJdCB8fCAodHlwZW9mIHRhcmdldFtrZXldICE9PSBvcHRpb25zVmFsdWVUeXBlKTtcblxuICAgICAgICBpZiAoc2hvdWxkUmVwbGFjZSkge1xuICAgICAgICAgIHRhcmdldFtrZXldID0gb3B0aW9uc1trZXldO1xuICAgICAgICB9IGVsc2UgaWYgKG9wdGlvbnNWYWx1ZVR5cGUgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgLy8gZ28gZGVlcCwgZG9uJ3QgY2FyZSBhYm91dCBsb29wcyBoZXJlLCB3ZSBhcmUgc2ltcGxlIEFQSSE6XG4gICAgICAgICAgdGFyZ2V0W2tleV0gPSBtZXJnZSh0YXJnZXRba2V5XSwgb3B0aW9uc1trZXldKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB0YXJnZXQ7XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IHtcbiAgQm9keTogQm9keSxcbiAgVmVjdG9yMmQ6IFZlY3RvcjJkLFxuICBCb2R5M2Q6IEJvZHkzZCxcbiAgVmVjdG9yM2Q6IFZlY3RvcjNkXG59O1xuXG5mdW5jdGlvbiBCb2R5KHgsIHkpIHtcbiAgdGhpcy5wb3MgPSBuZXcgVmVjdG9yMmQoeCwgeSk7XG4gIHRoaXMucHJldlBvcyA9IG5ldyBWZWN0b3IyZCh4LCB5KTtcbiAgdGhpcy5mb3JjZSA9IG5ldyBWZWN0b3IyZCgpO1xuICB0aGlzLnZlbG9jaXR5ID0gbmV3IFZlY3RvcjJkKCk7XG4gIHRoaXMubWFzcyA9IDE7XG59XG5cbkJvZHkucHJvdG90eXBlLnNldFBvc2l0aW9uID0gZnVuY3Rpb24gKHgsIHkpIHtcbiAgdGhpcy5wcmV2UG9zLnggPSB0aGlzLnBvcy54ID0geDtcbiAgdGhpcy5wcmV2UG9zLnkgPSB0aGlzLnBvcy55ID0geTtcbn07XG5cbmZ1bmN0aW9uIFZlY3RvcjJkKHgsIHkpIHtcbiAgaWYgKHggJiYgdHlwZW9mIHggIT09ICdudW1iZXInKSB7XG4gICAgLy8gY291bGQgYmUgYW5vdGhlciB2ZWN0b3JcbiAgICB0aGlzLnggPSB0eXBlb2YgeC54ID09PSAnbnVtYmVyJyA/IHgueCA6IDA7XG4gICAgdGhpcy55ID0gdHlwZW9mIHgueSA9PT0gJ251bWJlcicgPyB4LnkgOiAwO1xuICB9IGVsc2Uge1xuICAgIHRoaXMueCA9IHR5cGVvZiB4ID09PSAnbnVtYmVyJyA/IHggOiAwO1xuICAgIHRoaXMueSA9IHR5cGVvZiB5ID09PSAnbnVtYmVyJyA/IHkgOiAwO1xuICB9XG59XG5cblZlY3RvcjJkLnByb3RvdHlwZS5yZXNldCA9IGZ1bmN0aW9uICgpIHtcbiAgdGhpcy54ID0gdGhpcy55ID0gMDtcbn07XG5cbmZ1bmN0aW9uIEJvZHkzZCh4LCB5LCB6KSB7XG4gIHRoaXMucG9zID0gbmV3IFZlY3RvcjNkKHgsIHksIHopO1xuICB0aGlzLnByZXZQb3MgPSBuZXcgVmVjdG9yM2QoeCwgeSwgeik7XG4gIHRoaXMuZm9yY2UgPSBuZXcgVmVjdG9yM2QoKTtcbiAgdGhpcy52ZWxvY2l0eSA9IG5ldyBWZWN0b3IzZCgpO1xuICB0aGlzLm1hc3MgPSAxO1xufVxuXG5Cb2R5M2QucHJvdG90eXBlLnNldFBvc2l0aW9uID0gZnVuY3Rpb24gKHgsIHksIHopIHtcbiAgdGhpcy5wcmV2UG9zLnggPSB0aGlzLnBvcy54ID0geDtcbiAgdGhpcy5wcmV2UG9zLnkgPSB0aGlzLnBvcy55ID0geTtcbiAgdGhpcy5wcmV2UG9zLnogPSB0aGlzLnBvcy56ID0gejtcbn07XG5cbmZ1bmN0aW9uIFZlY3RvcjNkKHgsIHksIHopIHtcbiAgaWYgKHggJiYgdHlwZW9mIHggIT09ICdudW1iZXInKSB7XG4gICAgLy8gY291bGQgYmUgYW5vdGhlciB2ZWN0b3JcbiAgICB0aGlzLnggPSB0eXBlb2YgeC54ID09PSAnbnVtYmVyJyA/IHgueCA6IDA7XG4gICAgdGhpcy55ID0gdHlwZW9mIHgueSA9PT0gJ251bWJlcicgPyB4LnkgOiAwO1xuICAgIHRoaXMueiA9IHR5cGVvZiB4LnogPT09ICdudW1iZXInID8geC56IDogMDtcbiAgfSBlbHNlIHtcbiAgICB0aGlzLnggPSB0eXBlb2YgeCA9PT0gJ251bWJlcicgPyB4IDogMDtcbiAgICB0aGlzLnkgPSB0eXBlb2YgeSA9PT0gJ251bWJlcicgPyB5IDogMDtcbiAgICB0aGlzLnogPSB0eXBlb2YgeiA9PT0gJ251bWJlcicgPyB6IDogMDtcbiAgfVxufTtcblxuVmVjdG9yM2QucHJvdG90eXBlLnJlc2V0ID0gZnVuY3Rpb24gKCkge1xuICB0aGlzLnggPSB0aGlzLnkgPSB0aGlzLnogPSAwO1xufTtcbiIsIi8qKlxuICogVGhpcyBpcyBCYXJuZXMgSHV0IHNpbXVsYXRpb24gYWxnb3JpdGhtIGZvciAyZCBjYXNlLiBJbXBsZW1lbnRhdGlvblxuICogaXMgaGlnaGx5IG9wdGltaXplZCAoYXZvaWRzIHJlY3VzaW9uIGFuZCBnYyBwcmVzc3VyZSlcbiAqXG4gKiBodHRwOi8vd3d3LmNzLnByaW5jZXRvbi5lZHUvY291cnNlcy9hcmNoaXZlL2ZhbGwwMy9jczEyNi9hc3NpZ25tZW50cy9iYXJuZXMtaHV0Lmh0bWxcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcbiAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gIG9wdGlvbnMuZ3Jhdml0eSA9IHR5cGVvZiBvcHRpb25zLmdyYXZpdHkgPT09ICdudW1iZXInID8gb3B0aW9ucy5ncmF2aXR5IDogLTE7XG4gIG9wdGlvbnMudGhldGEgPSB0eXBlb2Ygb3B0aW9ucy50aGV0YSA9PT0gJ251bWJlcicgPyBvcHRpb25zLnRoZXRhIDogMC44O1xuXG4gIC8vIHdlIHJlcXVpcmUgZGV0ZXJtaW5pc3RpYyByYW5kb21uZXNzIGhlcmVcbiAgdmFyIHJhbmRvbSA9IHJlcXVpcmUoJ25ncmFwaC5yYW5kb20nKS5yYW5kb20oMTk4NCksXG4gICAgTm9kZSA9IHJlcXVpcmUoJy4vbm9kZScpLFxuICAgIEluc2VydFN0YWNrID0gcmVxdWlyZSgnLi9pbnNlcnRTdGFjaycpLFxuICAgIGlzU2FtZVBvc2l0aW9uID0gcmVxdWlyZSgnLi9pc1NhbWVQb3NpdGlvbicpO1xuXG4gIHZhciBncmF2aXR5ID0gb3B0aW9ucy5ncmF2aXR5LFxuICAgIHVwZGF0ZVF1ZXVlID0gW10sXG4gICAgaW5zZXJ0U3RhY2sgPSBuZXcgSW5zZXJ0U3RhY2soKSxcbiAgICB0aGV0YSA9IG9wdGlvbnMudGhldGEsXG5cbiAgICBub2Rlc0NhY2hlID0gW10sXG4gICAgY3VycmVudEluQ2FjaGUgPSAwLFxuICAgIG5ld05vZGUgPSBmdW5jdGlvbigpIHtcbiAgICAgIC8vIFRvIGF2b2lkIHByZXNzdXJlIG9uIEdDIHdlIHJldXNlIG5vZGVzLlxuICAgICAgdmFyIG5vZGUgPSBub2Rlc0NhY2hlW2N1cnJlbnRJbkNhY2hlXTtcbiAgICAgIGlmIChub2RlKSB7XG4gICAgICAgIG5vZGUucXVhZDAgPSBudWxsO1xuICAgICAgICBub2RlLnF1YWQxID0gbnVsbDtcbiAgICAgICAgbm9kZS5xdWFkMiA9IG51bGw7XG4gICAgICAgIG5vZGUucXVhZDMgPSBudWxsO1xuICAgICAgICBub2RlLmJvZHkgPSBudWxsO1xuICAgICAgICBub2RlLm1hc3MgPSBub2RlLm1hc3NYID0gbm9kZS5tYXNzWSA9IDA7XG4gICAgICAgIG5vZGUubGVmdCA9IG5vZGUucmlnaHQgPSBub2RlLnRvcCA9IG5vZGUuYm90dG9tID0gMDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG5vZGUgPSBuZXcgTm9kZSgpO1xuICAgICAgICBub2Rlc0NhY2hlW2N1cnJlbnRJbkNhY2hlXSA9IG5vZGU7XG4gICAgICB9XG5cbiAgICAgICsrY3VycmVudEluQ2FjaGU7XG4gICAgICByZXR1cm4gbm9kZTtcbiAgICB9LFxuXG4gICAgcm9vdCA9IG5ld05vZGUoKSxcblxuICAgIC8vIEluc2VydHMgYm9keSB0byB0aGUgdHJlZVxuICAgIGluc2VydCA9IGZ1bmN0aW9uKG5ld0JvZHkpIHtcbiAgICAgIGluc2VydFN0YWNrLnJlc2V0KCk7XG4gICAgICBpbnNlcnRTdGFjay5wdXNoKHJvb3QsIG5ld0JvZHkpO1xuXG4gICAgICB3aGlsZSAoIWluc2VydFN0YWNrLmlzRW1wdHkoKSkge1xuICAgICAgICB2YXIgc3RhY2tJdGVtID0gaW5zZXJ0U3RhY2sucG9wKCksXG4gICAgICAgICAgbm9kZSA9IHN0YWNrSXRlbS5ub2RlLFxuICAgICAgICAgIGJvZHkgPSBzdGFja0l0ZW0uYm9keTtcblxuICAgICAgICBpZiAoIW5vZGUuYm9keSkge1xuICAgICAgICAgIC8vIFRoaXMgaXMgaW50ZXJuYWwgbm9kZS4gVXBkYXRlIHRoZSB0b3RhbCBtYXNzIG9mIHRoZSBub2RlIGFuZCBjZW50ZXItb2YtbWFzcy5cbiAgICAgICAgICB2YXIgeCA9IGJvZHkucG9zLng7XG4gICAgICAgICAgdmFyIHkgPSBib2R5LnBvcy55O1xuICAgICAgICAgIG5vZGUubWFzcyA9IG5vZGUubWFzcyArIGJvZHkubWFzcztcbiAgICAgICAgICBub2RlLm1hc3NYID0gbm9kZS5tYXNzWCArIGJvZHkubWFzcyAqIHg7XG4gICAgICAgICAgbm9kZS5tYXNzWSA9IG5vZGUubWFzc1kgKyBib2R5Lm1hc3MgKiB5O1xuXG4gICAgICAgICAgLy8gUmVjdXJzaXZlbHkgaW5zZXJ0IHRoZSBib2R5IGluIHRoZSBhcHByb3ByaWF0ZSBxdWFkcmFudC5cbiAgICAgICAgICAvLyBCdXQgZmlyc3QgZmluZCB0aGUgYXBwcm9wcmlhdGUgcXVhZHJhbnQuXG4gICAgICAgICAgdmFyIHF1YWRJZHggPSAwLCAvLyBBc3N1bWUgd2UgYXJlIGluIHRoZSAwJ3MgcXVhZC5cbiAgICAgICAgICAgIGxlZnQgPSBub2RlLmxlZnQsXG4gICAgICAgICAgICByaWdodCA9IChub2RlLnJpZ2h0ICsgbGVmdCkgLyAyLFxuICAgICAgICAgICAgdG9wID0gbm9kZS50b3AsXG4gICAgICAgICAgICBib3R0b20gPSAobm9kZS5ib3R0b20gKyB0b3ApIC8gMjtcblxuICAgICAgICAgIGlmICh4ID4gcmlnaHQpIHsgLy8gc29tZXdoZXJlIGluIHRoZSBlYXN0ZXJuIHBhcnQuXG4gICAgICAgICAgICBxdWFkSWR4ID0gcXVhZElkeCArIDE7XG4gICAgICAgICAgICB2YXIgb2xkTGVmdCA9IGxlZnQ7XG4gICAgICAgICAgICBsZWZ0ID0gcmlnaHQ7XG4gICAgICAgICAgICByaWdodCA9IHJpZ2h0ICsgKHJpZ2h0IC0gb2xkTGVmdCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICh5ID4gYm90dG9tKSB7IC8vIGFuZCBpbiBzb3V0aC5cbiAgICAgICAgICAgIHF1YWRJZHggPSBxdWFkSWR4ICsgMjtcbiAgICAgICAgICAgIHZhciBvbGRUb3AgPSB0b3A7XG4gICAgICAgICAgICB0b3AgPSBib3R0b207XG4gICAgICAgICAgICBib3R0b20gPSBib3R0b20gKyAoYm90dG9tIC0gb2xkVG9wKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICB2YXIgY2hpbGQgPSBnZXRDaGlsZChub2RlLCBxdWFkSWR4KTtcbiAgICAgICAgICBpZiAoIWNoaWxkKSB7XG4gICAgICAgICAgICAvLyBUaGUgbm9kZSBpcyBpbnRlcm5hbCBidXQgdGhpcyBxdWFkcmFudCBpcyBub3QgdGFrZW4uIEFkZFxuICAgICAgICAgICAgLy8gc3Vibm9kZSB0byBpdC5cbiAgICAgICAgICAgIGNoaWxkID0gbmV3Tm9kZSgpO1xuICAgICAgICAgICAgY2hpbGQubGVmdCA9IGxlZnQ7XG4gICAgICAgICAgICBjaGlsZC50b3AgPSB0b3A7XG4gICAgICAgICAgICBjaGlsZC5yaWdodCA9IHJpZ2h0O1xuICAgICAgICAgICAgY2hpbGQuYm90dG9tID0gYm90dG9tO1xuICAgICAgICAgICAgY2hpbGQuYm9keSA9IGJvZHk7XG5cbiAgICAgICAgICAgIHNldENoaWxkKG5vZGUsIHF1YWRJZHgsIGNoaWxkKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gY29udGludWUgc2VhcmNoaW5nIGluIHRoaXMgcXVhZHJhbnQuXG4gICAgICAgICAgICBpbnNlcnRTdGFjay5wdXNoKGNoaWxkLCBib2R5KTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gV2UgYXJlIHRyeWluZyB0byBhZGQgdG8gdGhlIGxlYWYgbm9kZS5cbiAgICAgICAgICAvLyBXZSBoYXZlIHRvIGNvbnZlcnQgY3VycmVudCBsZWFmIGludG8gaW50ZXJuYWwgbm9kZVxuICAgICAgICAgIC8vIGFuZCBjb250aW51ZSBhZGRpbmcgdHdvIG5vZGVzLlxuICAgICAgICAgIHZhciBvbGRCb2R5ID0gbm9kZS5ib2R5O1xuICAgICAgICAgIG5vZGUuYm9keSA9IG51bGw7IC8vIGludGVybmFsIG5vZGVzIGRvIG5vdCBjYXJ5IGJvZGllc1xuXG4gICAgICAgICAgaWYgKGlzU2FtZVBvc2l0aW9uKG9sZEJvZHkucG9zLCBib2R5LnBvcykpIHtcbiAgICAgICAgICAgIC8vIFByZXZlbnQgaW5maW5pdGUgc3ViZGl2aXNpb24gYnkgYnVtcGluZyBvbmUgbm9kZVxuICAgICAgICAgICAgLy8gYW55d2hlcmUgaW4gdGhpcyBxdWFkcmFudFxuICAgICAgICAgICAgdmFyIHJldHJpZXNDb3VudCA9IDM7XG4gICAgICAgICAgICBkbyB7XG4gICAgICAgICAgICAgIHZhciBvZmZzZXQgPSByYW5kb20ubmV4dERvdWJsZSgpO1xuICAgICAgICAgICAgICB2YXIgZHggPSAobm9kZS5yaWdodCAtIG5vZGUubGVmdCkgKiBvZmZzZXQ7XG4gICAgICAgICAgICAgIHZhciBkeSA9IChub2RlLmJvdHRvbSAtIG5vZGUudG9wKSAqIG9mZnNldDtcblxuICAgICAgICAgICAgICBvbGRCb2R5LnBvcy54ID0gbm9kZS5sZWZ0ICsgZHg7XG4gICAgICAgICAgICAgIG9sZEJvZHkucG9zLnkgPSBub2RlLnRvcCArIGR5O1xuICAgICAgICAgICAgICByZXRyaWVzQ291bnQgLT0gMTtcbiAgICAgICAgICAgICAgLy8gTWFrZSBzdXJlIHdlIGRvbid0IGJ1bXAgaXQgb3V0IG9mIHRoZSBib3guIElmIHdlIGRvLCBuZXh0IGl0ZXJhdGlvbiBzaG91bGQgZml4IGl0XG4gICAgICAgICAgICB9IHdoaWxlIChyZXRyaWVzQ291bnQgPiAwICYmIGlzU2FtZVBvc2l0aW9uKG9sZEJvZHkucG9zLCBib2R5LnBvcykpO1xuXG4gICAgICAgICAgICBpZiAocmV0cmllc0NvdW50ID09PSAwICYmIGlzU2FtZVBvc2l0aW9uKG9sZEJvZHkucG9zLCBib2R5LnBvcykpIHtcbiAgICAgICAgICAgICAgLy8gVGhpcyBpcyB2ZXJ5IGJhZCwgd2UgcmFuIG91dCBvZiBwcmVjaXNpb24uXG4gICAgICAgICAgICAgIC8vIGlmIHdlIGRvIG5vdCByZXR1cm4gZnJvbSB0aGUgbWV0aG9kIHdlJ2xsIGdldCBpbnRvXG4gICAgICAgICAgICAgIC8vIGluZmluaXRlIGxvb3AgaGVyZS4gU28gd2Ugc2FjcmlmaWNlIGNvcnJlY3RuZXNzIG9mIGxheW91dCwgYW5kIGtlZXAgdGhlIGFwcCBydW5uaW5nXG4gICAgICAgICAgICAgIC8vIE5leHQgbGF5b3V0IGl0ZXJhdGlvbiBzaG91bGQgZ2V0IGxhcmdlciBib3VuZGluZyBib3ggaW4gdGhlIGZpcnN0IHN0ZXAgYW5kIGZpeCB0aGlzXG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gTmV4dCBpdGVyYXRpb24gc2hvdWxkIHN1YmRpdmlkZSBub2RlIGZ1cnRoZXIuXG4gICAgICAgICAgaW5zZXJ0U3RhY2sucHVzaChub2RlLCBvbGRCb2R5KTtcbiAgICAgICAgICBpbnNlcnRTdGFjay5wdXNoKG5vZGUsIGJvZHkpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcblxuICAgIHVwZGF0ZSA9IGZ1bmN0aW9uKHNvdXJjZUJvZHkpIHtcbiAgICAgIHZhciBxdWV1ZSA9IHVwZGF0ZVF1ZXVlLFxuICAgICAgICB2LFxuICAgICAgICBkeCxcbiAgICAgICAgZHksXG4gICAgICAgIHIsIGZ4ID0gMCxcbiAgICAgICAgZnkgPSAwLFxuICAgICAgICBxdWV1ZUxlbmd0aCA9IDEsXG4gICAgICAgIHNoaWZ0SWR4ID0gMCxcbiAgICAgICAgcHVzaElkeCA9IDE7XG5cbiAgICAgIHF1ZXVlWzBdID0gcm9vdDtcblxuICAgICAgd2hpbGUgKHF1ZXVlTGVuZ3RoKSB7XG4gICAgICAgIHZhciBub2RlID0gcXVldWVbc2hpZnRJZHhdLFxuICAgICAgICAgIGJvZHkgPSBub2RlLmJvZHk7XG5cbiAgICAgICAgcXVldWVMZW5ndGggLT0gMTtcbiAgICAgICAgc2hpZnRJZHggKz0gMTtcbiAgICAgICAgdmFyIGRpZmZlcmVudEJvZHkgPSAoYm9keSAhPT0gc291cmNlQm9keSk7XG4gICAgICAgIGlmIChib2R5ICYmIGRpZmZlcmVudEJvZHkpIHtcbiAgICAgICAgICAvLyBJZiB0aGUgY3VycmVudCBub2RlIGlzIGEgbGVhZiBub2RlIChhbmQgaXQgaXMgbm90IHNvdXJjZSBib2R5KSxcbiAgICAgICAgICAvLyBjYWxjdWxhdGUgdGhlIGZvcmNlIGV4ZXJ0ZWQgYnkgdGhlIGN1cnJlbnQgbm9kZSBvbiBib2R5LCBhbmQgYWRkIHRoaXNcbiAgICAgICAgICAvLyBhbW91bnQgdG8gYm9keSdzIG5ldCBmb3JjZS5cbiAgICAgICAgICBkeCA9IGJvZHkucG9zLnggLSBzb3VyY2VCb2R5LnBvcy54O1xuICAgICAgICAgIGR5ID0gYm9keS5wb3MueSAtIHNvdXJjZUJvZHkucG9zLnk7XG4gICAgICAgICAgciA9IE1hdGguc3FydChkeCAqIGR4ICsgZHkgKiBkeSk7XG5cbiAgICAgICAgICBpZiAociA9PT0gMCkge1xuICAgICAgICAgICAgLy8gUG9vciBtYW4ncyBwcm90ZWN0aW9uIGFnYWluc3QgemVybyBkaXN0YW5jZS5cbiAgICAgICAgICAgIGR4ID0gKHJhbmRvbS5uZXh0RG91YmxlKCkgLSAwLjUpIC8gNTA7XG4gICAgICAgICAgICBkeSA9IChyYW5kb20ubmV4dERvdWJsZSgpIC0gMC41KSAvIDUwO1xuICAgICAgICAgICAgciA9IE1hdGguc3FydChkeCAqIGR4ICsgZHkgKiBkeSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gVGhpcyBpcyBzdGFuZGFyZCBncmF2aXRpb24gZm9yY2UgY2FsY3VsYXRpb24gYnV0IHdlIGRpdmlkZVxuICAgICAgICAgIC8vIGJ5IHJeMyB0byBzYXZlIHR3byBvcGVyYXRpb25zIHdoZW4gbm9ybWFsaXppbmcgZm9yY2UgdmVjdG9yLlxuICAgICAgICAgIHYgPSBncmF2aXR5ICogYm9keS5tYXNzICogc291cmNlQm9keS5tYXNzIC8gKHIgKiByICogcik7XG4gICAgICAgICAgZnggKz0gdiAqIGR4O1xuICAgICAgICAgIGZ5ICs9IHYgKiBkeTtcbiAgICAgICAgfSBlbHNlIGlmIChkaWZmZXJlbnRCb2R5KSB7XG4gICAgICAgICAgLy8gT3RoZXJ3aXNlLCBjYWxjdWxhdGUgdGhlIHJhdGlvIHMgLyByLCAgd2hlcmUgcyBpcyB0aGUgd2lkdGggb2YgdGhlIHJlZ2lvblxuICAgICAgICAgIC8vIHJlcHJlc2VudGVkIGJ5IHRoZSBpbnRlcm5hbCBub2RlLCBhbmQgciBpcyB0aGUgZGlzdGFuY2UgYmV0d2VlbiB0aGUgYm9keVxuICAgICAgICAgIC8vIGFuZCB0aGUgbm9kZSdzIGNlbnRlci1vZi1tYXNzXG4gICAgICAgICAgZHggPSBub2RlLm1hc3NYIC8gbm9kZS5tYXNzIC0gc291cmNlQm9keS5wb3MueDtcbiAgICAgICAgICBkeSA9IG5vZGUubWFzc1kgLyBub2RlLm1hc3MgLSBzb3VyY2VCb2R5LnBvcy55O1xuICAgICAgICAgIHIgPSBNYXRoLnNxcnQoZHggKiBkeCArIGR5ICogZHkpO1xuXG4gICAgICAgICAgaWYgKHIgPT09IDApIHtcbiAgICAgICAgICAgIC8vIFNvcnJ5IGFib3V0IGNvZGUgZHVwbHVjYXRpb24uIEkgZG9uJ3Qgd2FudCB0byBjcmVhdGUgbWFueSBmdW5jdGlvbnNcbiAgICAgICAgICAgIC8vIHJpZ2h0IGF3YXkuIEp1c3Qgd2FudCB0byBzZWUgcGVyZm9ybWFuY2UgZmlyc3QuXG4gICAgICAgICAgICBkeCA9IChyYW5kb20ubmV4dERvdWJsZSgpIC0gMC41KSAvIDUwO1xuICAgICAgICAgICAgZHkgPSAocmFuZG9tLm5leHREb3VibGUoKSAtIDAuNSkgLyA1MDtcbiAgICAgICAgICAgIHIgPSBNYXRoLnNxcnQoZHggKiBkeCArIGR5ICogZHkpO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBJZiBzIC8gciA8IM64LCB0cmVhdCB0aGlzIGludGVybmFsIG5vZGUgYXMgYSBzaW5nbGUgYm9keSwgYW5kIGNhbGN1bGF0ZSB0aGVcbiAgICAgICAgICAvLyBmb3JjZSBpdCBleGVydHMgb24gc291cmNlQm9keSwgYW5kIGFkZCB0aGlzIGFtb3VudCB0byBzb3VyY2VCb2R5J3MgbmV0IGZvcmNlLlxuICAgICAgICAgIGlmICgobm9kZS5yaWdodCAtIG5vZGUubGVmdCkgLyByIDwgdGhldGEpIHtcbiAgICAgICAgICAgIC8vIGluIHRoZSBpZiBzdGF0ZW1lbnQgYWJvdmUgd2UgY29uc2lkZXIgbm9kZSdzIHdpZHRoIG9ubHlcbiAgICAgICAgICAgIC8vIGJlY2F1c2UgdGhlIHJlZ2lvbiB3YXMgc3F1YXJpZmllZCBkdXJpbmcgdHJlZSBjcmVhdGlvbi5cbiAgICAgICAgICAgIC8vIFRodXMgdGhlcmUgaXMgbm8gZGlmZmVyZW5jZSBiZXR3ZWVuIHVzaW5nIHdpZHRoIG9yIGhlaWdodC5cbiAgICAgICAgICAgIHYgPSBncmF2aXR5ICogbm9kZS5tYXNzICogc291cmNlQm9keS5tYXNzIC8gKHIgKiByICogcik7XG4gICAgICAgICAgICBmeCArPSB2ICogZHg7XG4gICAgICAgICAgICBmeSArPSB2ICogZHk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIE90aGVyd2lzZSwgcnVuIHRoZSBwcm9jZWR1cmUgcmVjdXJzaXZlbHkgb24gZWFjaCBvZiB0aGUgY3VycmVudCBub2RlJ3MgY2hpbGRyZW4uXG5cbiAgICAgICAgICAgIC8vIEkgaW50ZW50aW9uYWxseSB1bmZvbGRlZCB0aGlzIGxvb3AsIHRvIHNhdmUgc2V2ZXJhbCBDUFUgY3ljbGVzLlxuICAgICAgICAgICAgaWYgKG5vZGUucXVhZDApIHtcbiAgICAgICAgICAgICAgcXVldWVbcHVzaElkeF0gPSBub2RlLnF1YWQwO1xuICAgICAgICAgICAgICBxdWV1ZUxlbmd0aCArPSAxO1xuICAgICAgICAgICAgICBwdXNoSWR4ICs9IDE7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAobm9kZS5xdWFkMSkge1xuICAgICAgICAgICAgICBxdWV1ZVtwdXNoSWR4XSA9IG5vZGUucXVhZDE7XG4gICAgICAgICAgICAgIHF1ZXVlTGVuZ3RoICs9IDE7XG4gICAgICAgICAgICAgIHB1c2hJZHggKz0gMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChub2RlLnF1YWQyKSB7XG4gICAgICAgICAgICAgIHF1ZXVlW3B1c2hJZHhdID0gbm9kZS5xdWFkMjtcbiAgICAgICAgICAgICAgcXVldWVMZW5ndGggKz0gMTtcbiAgICAgICAgICAgICAgcHVzaElkeCArPSAxO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKG5vZGUucXVhZDMpIHtcbiAgICAgICAgICAgICAgcXVldWVbcHVzaElkeF0gPSBub2RlLnF1YWQzO1xuICAgICAgICAgICAgICBxdWV1ZUxlbmd0aCArPSAxO1xuICAgICAgICAgICAgICBwdXNoSWR4ICs9IDE7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHNvdXJjZUJvZHkuZm9yY2UueCArPSBmeDtcbiAgICAgIHNvdXJjZUJvZHkuZm9yY2UueSArPSBmeTtcbiAgICB9LFxuXG4gICAgaW5zZXJ0Qm9kaWVzID0gZnVuY3Rpb24oYm9kaWVzKSB7XG4gICAgICB2YXIgeDEgPSBOdW1iZXIuTUFYX1ZBTFVFLFxuICAgICAgICB5MSA9IE51bWJlci5NQVhfVkFMVUUsXG4gICAgICAgIHgyID0gTnVtYmVyLk1JTl9WQUxVRSxcbiAgICAgICAgeTIgPSBOdW1iZXIuTUlOX1ZBTFVFLFxuICAgICAgICBpLFxuICAgICAgICBtYXggPSBib2RpZXMubGVuZ3RoO1xuXG4gICAgICAvLyBUbyByZWR1Y2UgcXVhZCB0cmVlIGRlcHRoIHdlIGFyZSBsb29raW5nIGZvciBleGFjdCBib3VuZGluZyBib3ggb2YgYWxsIHBhcnRpY2xlcy5cbiAgICAgIGkgPSBtYXg7XG4gICAgICB3aGlsZSAoaS0tKSB7XG4gICAgICAgIHZhciB4ID0gYm9kaWVzW2ldLnBvcy54O1xuICAgICAgICB2YXIgeSA9IGJvZGllc1tpXS5wb3MueTtcbiAgICAgICAgaWYgKHggPCB4MSkge1xuICAgICAgICAgIHgxID0geDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoeCA+IHgyKSB7XG4gICAgICAgICAgeDIgPSB4O1xuICAgICAgICB9XG4gICAgICAgIGlmICh5IDwgeTEpIHtcbiAgICAgICAgICB5MSA9IHk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHkgPiB5Mikge1xuICAgICAgICAgIHkyID0geTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBTcXVhcmlmeSB0aGUgYm91bmRzLlxuICAgICAgdmFyIGR4ID0geDIgLSB4MSxcbiAgICAgICAgZHkgPSB5MiAtIHkxO1xuICAgICAgaWYgKGR4ID4gZHkpIHtcbiAgICAgICAgeTIgPSB5MSArIGR4O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgeDIgPSB4MSArIGR5O1xuICAgICAgfVxuXG4gICAgICBjdXJyZW50SW5DYWNoZSA9IDA7XG4gICAgICByb290ID0gbmV3Tm9kZSgpO1xuICAgICAgcm9vdC5sZWZ0ID0geDE7XG4gICAgICByb290LnJpZ2h0ID0geDI7XG4gICAgICByb290LnRvcCA9IHkxO1xuICAgICAgcm9vdC5ib3R0b20gPSB5MjtcblxuICAgICAgaSA9IG1heCAtIDE7XG4gICAgICBpZiAoaSA+IDApIHtcbiAgICAgICAgcm9vdC5ib2R5ID0gYm9kaWVzW2ldO1xuICAgICAgfVxuICAgICAgd2hpbGUgKGktLSkge1xuICAgICAgICBpbnNlcnQoYm9kaWVzW2ldLCByb290KTtcbiAgICAgIH1cbiAgICB9O1xuXG4gIHJldHVybiB7XG4gICAgaW5zZXJ0Qm9kaWVzOiBpbnNlcnRCb2RpZXMsXG4gICAgdXBkYXRlQm9keUZvcmNlOiB1cGRhdGUsXG4gICAgb3B0aW9uczogZnVuY3Rpb24obmV3T3B0aW9ucykge1xuICAgICAgaWYgKG5ld09wdGlvbnMpIHtcbiAgICAgICAgaWYgKHR5cGVvZiBuZXdPcHRpb25zLmdyYXZpdHkgPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgZ3Jhdml0eSA9IG5ld09wdGlvbnMuZ3Jhdml0eTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodHlwZW9mIG5ld09wdGlvbnMudGhldGEgPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgdGhldGEgPSBuZXdPcHRpb25zLnRoZXRhO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB7XG4gICAgICAgIGdyYXZpdHk6IGdyYXZpdHksXG4gICAgICAgIHRoZXRhOiB0aGV0YVxuICAgICAgfTtcbiAgICB9XG4gIH07XG59O1xuXG5mdW5jdGlvbiBnZXRDaGlsZChub2RlLCBpZHgpIHtcbiAgaWYgKGlkeCA9PT0gMCkgcmV0dXJuIG5vZGUucXVhZDA7XG4gIGlmIChpZHggPT09IDEpIHJldHVybiBub2RlLnF1YWQxO1xuICBpZiAoaWR4ID09PSAyKSByZXR1cm4gbm9kZS5xdWFkMjtcbiAgaWYgKGlkeCA9PT0gMykgcmV0dXJuIG5vZGUucXVhZDM7XG4gIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiBzZXRDaGlsZChub2RlLCBpZHgsIGNoaWxkKSB7XG4gIGlmIChpZHggPT09IDApIG5vZGUucXVhZDAgPSBjaGlsZDtcbiAgZWxzZSBpZiAoaWR4ID09PSAxKSBub2RlLnF1YWQxID0gY2hpbGQ7XG4gIGVsc2UgaWYgKGlkeCA9PT0gMikgbm9kZS5xdWFkMiA9IGNoaWxkO1xuICBlbHNlIGlmIChpZHggPT09IDMpIG5vZGUucXVhZDMgPSBjaGlsZDtcbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gSW5zZXJ0U3RhY2s7XG5cbi8qKlxuICogT3VyIGltcGxtZW50YXRpb24gb2YgUXVhZFRyZWUgaXMgbm9uLXJlY3Vyc2l2ZSB0byBhdm9pZCBHQyBoaXRcbiAqIFRoaXMgZGF0YSBzdHJ1Y3R1cmUgcmVwcmVzZW50IHN0YWNrIG9mIGVsZW1lbnRzXG4gKiB3aGljaCB3ZSBhcmUgdHJ5aW5nIHRvIGluc2VydCBpbnRvIHF1YWQgdHJlZS5cbiAqL1xuZnVuY3Rpb24gSW5zZXJ0U3RhY2sgKCkge1xuICAgIHRoaXMuc3RhY2sgPSBbXTtcbiAgICB0aGlzLnBvcElkeCA9IDA7XG59XG5cbkluc2VydFN0YWNrLnByb3RvdHlwZSA9IHtcbiAgICBpc0VtcHR5OiBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucG9wSWR4ID09PSAwO1xuICAgIH0sXG4gICAgcHVzaDogZnVuY3Rpb24gKG5vZGUsIGJvZHkpIHtcbiAgICAgICAgdmFyIGl0ZW0gPSB0aGlzLnN0YWNrW3RoaXMucG9wSWR4XTtcbiAgICAgICAgaWYgKCFpdGVtKSB7XG4gICAgICAgICAgICAvLyB3ZSBhcmUgdHJ5aW5nIHRvIGF2b2lkIG1lbW9yeSBwcmVzc3VlOiBjcmVhdGUgbmV3IGVsZW1lbnRcbiAgICAgICAgICAgIC8vIG9ubHkgd2hlbiBhYnNvbHV0ZWx5IG5lY2Vzc2FyeVxuICAgICAgICAgICAgdGhpcy5zdGFja1t0aGlzLnBvcElkeF0gPSBuZXcgSW5zZXJ0U3RhY2tFbGVtZW50KG5vZGUsIGJvZHkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaXRlbS5ub2RlID0gbm9kZTtcbiAgICAgICAgICAgIGl0ZW0uYm9keSA9IGJvZHk7XG4gICAgICAgIH1cbiAgICAgICAgKyt0aGlzLnBvcElkeDtcbiAgICB9LFxuICAgIHBvcDogZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAodGhpcy5wb3BJZHggPiAwKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zdGFja1stLXRoaXMucG9wSWR4XTtcbiAgICAgICAgfVxuICAgIH0sXG4gICAgcmVzZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5wb3BJZHggPSAwO1xuICAgIH1cbn07XG5cbmZ1bmN0aW9uIEluc2VydFN0YWNrRWxlbWVudChub2RlLCBib2R5KSB7XG4gICAgdGhpcy5ub2RlID0gbm9kZTsgLy8gUXVhZFRyZWUgbm9kZVxuICAgIHRoaXMuYm9keSA9IGJvZHk7IC8vIHBoeXNpY2FsIGJvZHkgd2hpY2ggbmVlZHMgdG8gYmUgaW5zZXJ0ZWQgdG8gbm9kZVxufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBpc1NhbWVQb3NpdGlvbihwb2ludDEsIHBvaW50Mikge1xuICAgIHZhciBkeCA9IE1hdGguYWJzKHBvaW50MS54IC0gcG9pbnQyLngpO1xuICAgIHZhciBkeSA9IE1hdGguYWJzKHBvaW50MS55IC0gcG9pbnQyLnkpO1xuXG4gICAgcmV0dXJuIChkeCA8IDFlLTggJiYgZHkgPCAxZS04KTtcbn07XG4iLCIvKipcbiAqIEludGVybmFsIGRhdGEgc3RydWN0dXJlIHRvIHJlcHJlc2VudCAyRCBRdWFkVHJlZSBub2RlXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gTm9kZSgpIHtcbiAgLy8gYm9keSBzdG9yZWQgaW5zaWRlIHRoaXMgbm9kZS4gSW4gcXVhZCB0cmVlIG9ubHkgbGVhZiBub2RlcyAoYnkgY29uc3RydWN0aW9uKVxuICAvLyBjb250YWluIGJvaWRlczpcbiAgdGhpcy5ib2R5ID0gbnVsbDtcblxuICAvLyBDaGlsZCBub2RlcyBhcmUgc3RvcmVkIGluIHF1YWRzLiBFYWNoIHF1YWQgaXMgcHJlc2VudGVkIGJ5IG51bWJlcjpcbiAgLy8gMCB8IDFcbiAgLy8gLS0tLS1cbiAgLy8gMiB8IDNcbiAgdGhpcy5xdWFkMCA9IG51bGw7XG4gIHRoaXMucXVhZDEgPSBudWxsO1xuICB0aGlzLnF1YWQyID0gbnVsbDtcbiAgdGhpcy5xdWFkMyA9IG51bGw7XG5cbiAgLy8gVG90YWwgbWFzcyBvZiBjdXJyZW50IG5vZGVcbiAgdGhpcy5tYXNzID0gMDtcblxuICAvLyBDZW50ZXIgb2YgbWFzcyBjb29yZGluYXRlc1xuICB0aGlzLm1hc3NYID0gMDtcbiAgdGhpcy5tYXNzWSA9IDA7XG5cbiAgLy8gYm91bmRpbmcgYm94IGNvb3JkaW5hdGVzXG4gIHRoaXMubGVmdCA9IDA7XG4gIHRoaXMudG9wID0gMDtcbiAgdGhpcy5ib3R0b20gPSAwO1xuICB0aGlzLnJpZ2h0ID0gMDtcbn07XG4iLCIvKipcbiAqIFRoaXMgaXMgQmFybmVzIEh1dCBzaW11bGF0aW9uIGFsZ29yaXRobSBmb3IgM2QgY2FzZS4gSW1wbGVtZW50YXRpb25cbiAqIGlzIGhpZ2hseSBvcHRpbWl6ZWQgKGF2b2lkcyByZWN1c2lvbiBhbmQgZ2MgcHJlc3N1cmUpXG4gKlxuICogaHR0cDovL3d3dy5jcy5wcmluY2V0b24uZWR1L2NvdXJzZXMvYXJjaGl2ZS9mYWxsMDMvY3MxMjYvYXNzaWdubWVudHMvYmFybmVzLWh1dC5odG1sXG4gKlxuICogTk9URTogVGhpcyBtb2R1bGUgZHVwbGljYXRlcyBhIGxvdCBvZiBjb2RlIGZyb20gMmQgY2FzZS4gUHJpbWFyeSByZWFzb24gZm9yXG4gKiB0aGlzIGlzIHBlcmZvcm1hbmNlLiBFdmVyeSB0aW1lIEkgdHJpZWQgdG8gYWJzdHJhY3QgYXdheSB2ZWN0b3Igb3BlcmF0aW9uc1xuICogSSBoYWQgbmVnYXRpdmUgaW1wYWN0IG9uIHBlcmZvcm1hbmNlLiBTbyBpbiB0aGlzIGNhc2UgSSdtIHNjYXJpZnlpbmcgY29kZVxuICogcmV1c2UgaW4gZmF2b3Igb2Ygc3BlZWRcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcbiAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gIG9wdGlvbnMuZ3Jhdml0eSA9IHR5cGVvZiBvcHRpb25zLmdyYXZpdHkgPT09ICdudW1iZXInID8gb3B0aW9ucy5ncmF2aXR5IDogLTE7XG4gIG9wdGlvbnMudGhldGEgPSB0eXBlb2Ygb3B0aW9ucy50aGV0YSA9PT0gJ251bWJlcicgPyBvcHRpb25zLnRoZXRhIDogMC44O1xuXG4gIC8vIHdlIHJlcXVpcmUgZGV0ZXJtaW5pc3RpYyByYW5kb21uZXNzIGhlcmVcbiAgdmFyIHJhbmRvbSA9IHJlcXVpcmUoJ25ncmFwaC5yYW5kb20nKS5yYW5kb20oMTk4NCksXG4gICAgTm9kZSA9IHJlcXVpcmUoJy4vbm9kZScpLFxuICAgIEluc2VydFN0YWNrID0gcmVxdWlyZSgnLi9pbnNlcnRTdGFjaycpLFxuICAgIGlzU2FtZVBvc2l0aW9uID0gcmVxdWlyZSgnLi9pc1NhbWVQb3NpdGlvbicpO1xuXG4gIHZhciBncmF2aXR5ID0gb3B0aW9ucy5ncmF2aXR5LFxuICAgIHVwZGF0ZVF1ZXVlID0gW10sXG4gICAgaW5zZXJ0U3RhY2sgPSBuZXcgSW5zZXJ0U3RhY2soKSxcbiAgICB0aGV0YSA9IG9wdGlvbnMudGhldGEsXG5cbiAgICBub2Rlc0NhY2hlID0gW10sXG4gICAgY3VycmVudEluQ2FjaGUgPSAwLFxuICAgIG5ld05vZGUgPSBmdW5jdGlvbigpIHtcbiAgICAgIC8vIFRvIGF2b2lkIHByZXNzdXJlIG9uIEdDIHdlIHJldXNlIG5vZGVzLlxuICAgICAgdmFyIG5vZGUgPSBub2Rlc0NhY2hlW2N1cnJlbnRJbkNhY2hlXTtcbiAgICAgIGlmIChub2RlKSB7XG4gICAgICAgIG5vZGUucXVhZDAgPSBudWxsO1xuICAgICAgICBub2RlLnF1YWQ0ID0gbnVsbDtcbiAgICAgICAgbm9kZS5xdWFkMSA9IG51bGw7XG4gICAgICAgIG5vZGUucXVhZDUgPSBudWxsO1xuICAgICAgICBub2RlLnF1YWQyID0gbnVsbDtcbiAgICAgICAgbm9kZS5xdWFkNiA9IG51bGw7XG4gICAgICAgIG5vZGUucXVhZDMgPSBudWxsO1xuICAgICAgICBub2RlLnF1YWQ3ID0gbnVsbDtcbiAgICAgICAgbm9kZS5ib2R5ID0gbnVsbDtcbiAgICAgICAgbm9kZS5tYXNzID0gbm9kZS5tYXNzWCA9IG5vZGUubWFzc1kgPSBub2RlLm1hc3NaID0gMDtcbiAgICAgICAgbm9kZS5sZWZ0ID0gbm9kZS5yaWdodCA9IG5vZGUudG9wID0gbm9kZS5ib3R0b20gPSBub2RlLmZyb250ID0gbm9kZS5iYWNrID0gMDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG5vZGUgPSBuZXcgTm9kZSgpO1xuICAgICAgICBub2Rlc0NhY2hlW2N1cnJlbnRJbkNhY2hlXSA9IG5vZGU7XG4gICAgICB9XG5cbiAgICAgICsrY3VycmVudEluQ2FjaGU7XG4gICAgICByZXR1cm4gbm9kZTtcbiAgICB9LFxuXG4gICAgcm9vdCA9IG5ld05vZGUoKSxcblxuICAgIC8vIEluc2VydHMgYm9keSB0byB0aGUgdHJlZVxuICAgIGluc2VydCA9IGZ1bmN0aW9uKG5ld0JvZHkpIHtcbiAgICAgIGluc2VydFN0YWNrLnJlc2V0KCk7XG4gICAgICBpbnNlcnRTdGFjay5wdXNoKHJvb3QsIG5ld0JvZHkpO1xuXG4gICAgICB3aGlsZSAoIWluc2VydFN0YWNrLmlzRW1wdHkoKSkge1xuICAgICAgICB2YXIgc3RhY2tJdGVtID0gaW5zZXJ0U3RhY2sucG9wKCksXG4gICAgICAgICAgbm9kZSA9IHN0YWNrSXRlbS5ub2RlLFxuICAgICAgICAgIGJvZHkgPSBzdGFja0l0ZW0uYm9keTtcblxuICAgICAgICBpZiAoIW5vZGUuYm9keSkge1xuICAgICAgICAgIC8vIFRoaXMgaXMgaW50ZXJuYWwgbm9kZS4gVXBkYXRlIHRoZSB0b3RhbCBtYXNzIG9mIHRoZSBub2RlIGFuZCBjZW50ZXItb2YtbWFzcy5cbiAgICAgICAgICB2YXIgeCA9IGJvZHkucG9zLng7XG4gICAgICAgICAgdmFyIHkgPSBib2R5LnBvcy55O1xuICAgICAgICAgIHZhciB6ID0gYm9keS5wb3MuejtcbiAgICAgICAgICBub2RlLm1hc3MgKz0gYm9keS5tYXNzO1xuICAgICAgICAgIG5vZGUubWFzc1ggKz0gYm9keS5tYXNzICogeDtcbiAgICAgICAgICBub2RlLm1hc3NZICs9IGJvZHkubWFzcyAqIHk7XG4gICAgICAgICAgbm9kZS5tYXNzWiArPSBib2R5Lm1hc3MgKiB6O1xuXG4gICAgICAgICAgLy8gUmVjdXJzaXZlbHkgaW5zZXJ0IHRoZSBib2R5IGluIHRoZSBhcHByb3ByaWF0ZSBxdWFkcmFudC5cbiAgICAgICAgICAvLyBCdXQgZmlyc3QgZmluZCB0aGUgYXBwcm9wcmlhdGUgcXVhZHJhbnQuXG4gICAgICAgICAgdmFyIHF1YWRJZHggPSAwLCAvLyBBc3N1bWUgd2UgYXJlIGluIHRoZSAwJ3MgcXVhZC5cbiAgICAgICAgICAgIGxlZnQgPSBub2RlLmxlZnQsXG4gICAgICAgICAgICByaWdodCA9IChub2RlLnJpZ2h0ICsgbGVmdCkgLyAyLFxuICAgICAgICAgICAgdG9wID0gbm9kZS50b3AsXG4gICAgICAgICAgICBib3R0b20gPSAobm9kZS5ib3R0b20gKyB0b3ApIC8gMixcbiAgICAgICAgICAgIGJhY2sgPSBub2RlLmJhY2ssXG4gICAgICAgICAgICBmcm9udCA9IChub2RlLmZyb250ICsgYmFjaykgLyAyO1xuXG4gICAgICAgICAgaWYgKHggPiByaWdodCkgeyAvLyBzb21ld2hlcmUgaW4gdGhlIGVhc3Rlcm4gcGFydC5cbiAgICAgICAgICAgIHF1YWRJZHggKz0gMTtcbiAgICAgICAgICAgIHZhciBvbGRMZWZ0ID0gbGVmdDtcbiAgICAgICAgICAgIGxlZnQgPSByaWdodDtcbiAgICAgICAgICAgIHJpZ2h0ID0gcmlnaHQgKyAocmlnaHQgLSBvbGRMZWZ0KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHkgPiBib3R0b20pIHsgLy8gYW5kIGluIHNvdXRoLlxuICAgICAgICAgICAgcXVhZElkeCArPSAyO1xuICAgICAgICAgICAgdmFyIG9sZFRvcCA9IHRvcDtcbiAgICAgICAgICAgIHRvcCA9IGJvdHRvbTtcbiAgICAgICAgICAgIGJvdHRvbSA9IGJvdHRvbSArIChib3R0b20gLSBvbGRUb3ApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoeiA+IGZyb250KSB7IC8vIGFuZCBpbiBmcm9udGFsIHBhcnRcbiAgICAgICAgICAgIHF1YWRJZHggKz0gNDtcbiAgICAgICAgICAgIHZhciBvbGRCYWNrID0gYmFjaztcbiAgICAgICAgICAgIGJhY2sgPSBmcm9udDtcbiAgICAgICAgICAgIGZyb250ID0gYmFjayArIChiYWNrIC0gb2xkQmFjayk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgdmFyIGNoaWxkID0gZ2V0Q2hpbGQobm9kZSwgcXVhZElkeCk7XG4gICAgICAgICAgaWYgKCFjaGlsZCkge1xuICAgICAgICAgICAgLy8gVGhlIG5vZGUgaXMgaW50ZXJuYWwgYnV0IHRoaXMgcXVhZHJhbnQgaXMgbm90IHRha2VuLiBBZGQgc3Vibm9kZSB0byBpdC5cbiAgICAgICAgICAgIGNoaWxkID0gbmV3Tm9kZSgpO1xuICAgICAgICAgICAgY2hpbGQubGVmdCA9IGxlZnQ7XG4gICAgICAgICAgICBjaGlsZC50b3AgPSB0b3A7XG4gICAgICAgICAgICBjaGlsZC5yaWdodCA9IHJpZ2h0O1xuICAgICAgICAgICAgY2hpbGQuYm90dG9tID0gYm90dG9tO1xuICAgICAgICAgICAgY2hpbGQuYmFjayA9IGJhY2s7XG4gICAgICAgICAgICBjaGlsZC5mcm9udCA9IGZyb250O1xuICAgICAgICAgICAgY2hpbGQuYm9keSA9IGJvZHk7XG5cbiAgICAgICAgICAgIHNldENoaWxkKG5vZGUsIHF1YWRJZHgsIGNoaWxkKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gY29udGludWUgc2VhcmNoaW5nIGluIHRoaXMgcXVhZHJhbnQuXG4gICAgICAgICAgICBpbnNlcnRTdGFjay5wdXNoKGNoaWxkLCBib2R5KTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gV2UgYXJlIHRyeWluZyB0byBhZGQgdG8gdGhlIGxlYWYgbm9kZS5cbiAgICAgICAgICAvLyBXZSBoYXZlIHRvIGNvbnZlcnQgY3VycmVudCBsZWFmIGludG8gaW50ZXJuYWwgbm9kZVxuICAgICAgICAgIC8vIGFuZCBjb250aW51ZSBhZGRpbmcgdHdvIG5vZGVzLlxuICAgICAgICAgIHZhciBvbGRCb2R5ID0gbm9kZS5ib2R5O1xuICAgICAgICAgIG5vZGUuYm9keSA9IG51bGw7IC8vIGludGVybmFsIG5vZGVzIGRvIG5vdCBjYXJyeSBib2RpZXNcblxuICAgICAgICAgIGlmIChpc1NhbWVQb3NpdGlvbihvbGRCb2R5LnBvcywgYm9keS5wb3MpKSB7XG4gICAgICAgICAgICAvLyBQcmV2ZW50IGluZmluaXRlIHN1YmRpdmlzaW9uIGJ5IGJ1bXBpbmcgb25lIG5vZGVcbiAgICAgICAgICAgIC8vIGFueXdoZXJlIGluIHRoaXMgcXVhZHJhbnRcbiAgICAgICAgICAgIHZhciByZXRyaWVzQ291bnQgPSAzO1xuICAgICAgICAgICAgZG8ge1xuICAgICAgICAgICAgICB2YXIgb2Zmc2V0ID0gcmFuZG9tLm5leHREb3VibGUoKTtcbiAgICAgICAgICAgICAgdmFyIGR4ID0gKG5vZGUucmlnaHQgLSBub2RlLmxlZnQpICogb2Zmc2V0O1xuICAgICAgICAgICAgICB2YXIgZHkgPSAobm9kZS5ib3R0b20gLSBub2RlLnRvcCkgKiBvZmZzZXQ7XG4gICAgICAgICAgICAgIHZhciBkeiA9IChub2RlLmZyb250IC0gbm9kZS5iYWNrKSAqIG9mZnNldDtcblxuICAgICAgICAgICAgICBvbGRCb2R5LnBvcy54ID0gbm9kZS5sZWZ0ICsgZHg7XG4gICAgICAgICAgICAgIG9sZEJvZHkucG9zLnkgPSBub2RlLnRvcCArIGR5O1xuICAgICAgICAgICAgICBvbGRCb2R5LnBvcy56ID0gbm9kZS5iYWNrICsgZHo7XG4gICAgICAgICAgICAgIHJldHJpZXNDb3VudCAtPSAxO1xuICAgICAgICAgICAgICAvLyBNYWtlIHN1cmUgd2UgZG9uJ3QgYnVtcCBpdCBvdXQgb2YgdGhlIGJveC4gSWYgd2UgZG8sIG5leHQgaXRlcmF0aW9uIHNob3VsZCBmaXggaXRcbiAgICAgICAgICAgIH0gd2hpbGUgKHJldHJpZXNDb3VudCA+IDAgJiYgaXNTYW1lUG9zaXRpb24ob2xkQm9keS5wb3MsIGJvZHkucG9zKSk7XG5cbiAgICAgICAgICAgIGlmIChyZXRyaWVzQ291bnQgPT09IDAgJiYgaXNTYW1lUG9zaXRpb24ob2xkQm9keS5wb3MsIGJvZHkucG9zKSkge1xuICAgICAgICAgICAgICAvLyBUaGlzIGlzIHZlcnkgYmFkLCB3ZSByYW4gb3V0IG9mIHByZWNpc2lvbi5cbiAgICAgICAgICAgICAgLy8gaWYgd2UgZG8gbm90IHJldHVybiBmcm9tIHRoZSBtZXRob2Qgd2UnbGwgZ2V0IGludG9cbiAgICAgICAgICAgICAgLy8gaW5maW5pdGUgbG9vcCBoZXJlLiBTbyB3ZSBzYWNyaWZpY2UgY29ycmVjdG5lc3Mgb2YgbGF5b3V0LCBhbmQga2VlcCB0aGUgYXBwIHJ1bm5pbmdcbiAgICAgICAgICAgICAgLy8gTmV4dCBsYXlvdXQgaXRlcmF0aW9uIHNob3VsZCBnZXQgbGFyZ2VyIGJvdW5kaW5nIGJveCBpbiB0aGUgZmlyc3Qgc3RlcCBhbmQgZml4IHRoaXNcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBOZXh0IGl0ZXJhdGlvbiBzaG91bGQgc3ViZGl2aWRlIG5vZGUgZnVydGhlci5cbiAgICAgICAgICBpbnNlcnRTdGFjay5wdXNoKG5vZGUsIG9sZEJvZHkpO1xuICAgICAgICAgIGluc2VydFN0YWNrLnB1c2gobm9kZSwgYm9keSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuXG4gICAgdXBkYXRlID0gZnVuY3Rpb24oc291cmNlQm9keSkge1xuICAgICAgdmFyIHF1ZXVlID0gdXBkYXRlUXVldWUsXG4gICAgICAgIHYsXG4gICAgICAgIGR4LCBkeSwgZHosXG4gICAgICAgIHIsIGZ4ID0gMCxcbiAgICAgICAgZnkgPSAwLFxuICAgICAgICBmeiA9IDAsXG4gICAgICAgIHF1ZXVlTGVuZ3RoID0gMSxcbiAgICAgICAgc2hpZnRJZHggPSAwLFxuICAgICAgICBwdXNoSWR4ID0gMTtcblxuICAgICAgcXVldWVbMF0gPSByb290O1xuXG4gICAgICB3aGlsZSAocXVldWVMZW5ndGgpIHtcbiAgICAgICAgdmFyIG5vZGUgPSBxdWV1ZVtzaGlmdElkeF0sXG4gICAgICAgICAgYm9keSA9IG5vZGUuYm9keTtcblxuICAgICAgICBxdWV1ZUxlbmd0aCAtPSAxO1xuICAgICAgICBzaGlmdElkeCArPSAxO1xuICAgICAgICB2YXIgZGlmZmVyZW50Qm9keSA9IChib2R5ICE9PSBzb3VyY2VCb2R5KTtcbiAgICAgICAgaWYgKGJvZHkgJiYgZGlmZmVyZW50Qm9keSkge1xuICAgICAgICAgIC8vIElmIHRoZSBjdXJyZW50IG5vZGUgaXMgYSBsZWFmIG5vZGUgKGFuZCBpdCBpcyBub3Qgc291cmNlIGJvZHkpLFxuICAgICAgICAgIC8vIGNhbGN1bGF0ZSB0aGUgZm9yY2UgZXhlcnRlZCBieSB0aGUgY3VycmVudCBub2RlIG9uIGJvZHksIGFuZCBhZGQgdGhpc1xuICAgICAgICAgIC8vIGFtb3VudCB0byBib2R5J3MgbmV0IGZvcmNlLlxuICAgICAgICAgIGR4ID0gYm9keS5wb3MueCAtIHNvdXJjZUJvZHkucG9zLng7XG4gICAgICAgICAgZHkgPSBib2R5LnBvcy55IC0gc291cmNlQm9keS5wb3MueTtcbiAgICAgICAgICBkeiA9IGJvZHkucG9zLnogLSBzb3VyY2VCb2R5LnBvcy56O1xuICAgICAgICAgIHIgPSBNYXRoLnNxcnQoZHggKiBkeCArIGR5ICogZHkgKyBkeiAqIGR6KTtcblxuICAgICAgICAgIGlmIChyID09PSAwKSB7XG4gICAgICAgICAgICAvLyBQb29yIG1hbidzIHByb3RlY3Rpb24gYWdhaW5zdCB6ZXJvIGRpc3RhbmNlLlxuICAgICAgICAgICAgZHggPSAocmFuZG9tLm5leHREb3VibGUoKSAtIDAuNSkgLyA1MDtcbiAgICAgICAgICAgIGR5ID0gKHJhbmRvbS5uZXh0RG91YmxlKCkgLSAwLjUpIC8gNTA7XG4gICAgICAgICAgICBkeiA9IChyYW5kb20ubmV4dERvdWJsZSgpIC0gMC41KSAvIDUwO1xuICAgICAgICAgICAgciA9IE1hdGguc3FydChkeCAqIGR4ICsgZHkgKiBkeSArIGR6ICogZHopO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIFRoaXMgaXMgc3RhbmRhcmQgZ3Jhdml0YXRpb24gZm9yY2UgY2FsY3VsYXRpb24gYnV0IHdlIGRpdmlkZVxuICAgICAgICAgIC8vIGJ5IHJeMyB0byBzYXZlIHR3byBvcGVyYXRpb25zIHdoZW4gbm9ybWFsaXppbmcgZm9yY2UgdmVjdG9yLlxuICAgICAgICAgIHYgPSBncmF2aXR5ICogYm9keS5tYXNzICogc291cmNlQm9keS5tYXNzIC8gKHIgKiByICogcik7XG4gICAgICAgICAgZnggKz0gdiAqIGR4O1xuICAgICAgICAgIGZ5ICs9IHYgKiBkeTtcbiAgICAgICAgICBmeiArPSB2ICogZHo7XG4gICAgICAgIH0gZWxzZSBpZiAoZGlmZmVyZW50Qm9keSkge1xuICAgICAgICAgIC8vIE90aGVyd2lzZSwgY2FsY3VsYXRlIHRoZSByYXRpbyBzIC8gciwgIHdoZXJlIHMgaXMgdGhlIHdpZHRoIG9mIHRoZSByZWdpb25cbiAgICAgICAgICAvLyByZXByZXNlbnRlZCBieSB0aGUgaW50ZXJuYWwgbm9kZSwgYW5kIHIgaXMgdGhlIGRpc3RhbmNlIGJldHdlZW4gdGhlIGJvZHlcbiAgICAgICAgICAvLyBhbmQgdGhlIG5vZGUncyBjZW50ZXItb2YtbWFzc1xuICAgICAgICAgIGR4ID0gbm9kZS5tYXNzWCAvIG5vZGUubWFzcyAtIHNvdXJjZUJvZHkucG9zLng7XG4gICAgICAgICAgZHkgPSBub2RlLm1hc3NZIC8gbm9kZS5tYXNzIC0gc291cmNlQm9keS5wb3MueTtcbiAgICAgICAgICBkeiA9IG5vZGUubWFzc1ogLyBub2RlLm1hc3MgLSBzb3VyY2VCb2R5LnBvcy56O1xuXG4gICAgICAgICAgciA9IE1hdGguc3FydChkeCAqIGR4ICsgZHkgKiBkeSArIGR6ICogZHopO1xuXG4gICAgICAgICAgaWYgKHIgPT09IDApIHtcbiAgICAgICAgICAgIC8vIFNvcnJ5IGFib3V0IGNvZGUgZHVwbGljYXRpb24uIEkgZG9uJ3Qgd2FudCB0byBjcmVhdGUgbWFueSBmdW5jdGlvbnNcbiAgICAgICAgICAgIC8vIHJpZ2h0IGF3YXkuIEp1c3Qgd2FudCB0byBzZWUgcGVyZm9ybWFuY2UgZmlyc3QuXG4gICAgICAgICAgICBkeCA9IChyYW5kb20ubmV4dERvdWJsZSgpIC0gMC41KSAvIDUwO1xuICAgICAgICAgICAgZHkgPSAocmFuZG9tLm5leHREb3VibGUoKSAtIDAuNSkgLyA1MDtcbiAgICAgICAgICAgIGR6ID0gKHJhbmRvbS5uZXh0RG91YmxlKCkgLSAwLjUpIC8gNTA7XG4gICAgICAgICAgICByID0gTWF0aC5zcXJ0KGR4ICogZHggKyBkeSAqIGR5ICsgZHogKiBkeik7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gSWYgcyAvIHIgPCDOuCwgdHJlYXQgdGhpcyBpbnRlcm5hbCBub2RlIGFzIGEgc2luZ2xlIGJvZHksIGFuZCBjYWxjdWxhdGUgdGhlXG4gICAgICAgICAgLy8gZm9yY2UgaXQgZXhlcnRzIG9uIHNvdXJjZUJvZHksIGFuZCBhZGQgdGhpcyBhbW91bnQgdG8gc291cmNlQm9keSdzIG5ldCBmb3JjZS5cbiAgICAgICAgICBpZiAoKG5vZGUucmlnaHQgLSBub2RlLmxlZnQpIC8gciA8IHRoZXRhKSB7XG4gICAgICAgICAgICAvLyBpbiB0aGUgaWYgc3RhdGVtZW50IGFib3ZlIHdlIGNvbnNpZGVyIG5vZGUncyB3aWR0aCBvbmx5XG4gICAgICAgICAgICAvLyBiZWNhdXNlIHRoZSByZWdpb24gd2FzIHNxdWFyaWZpZWQgZHVyaW5nIHRyZWUgY3JlYXRpb24uXG4gICAgICAgICAgICAvLyBUaHVzIHRoZXJlIGlzIG5vIGRpZmZlcmVuY2UgYmV0d2VlbiB1c2luZyB3aWR0aCBvciBoZWlnaHQuXG4gICAgICAgICAgICB2ID0gZ3Jhdml0eSAqIG5vZGUubWFzcyAqIHNvdXJjZUJvZHkubWFzcyAvIChyICogciAqIHIpO1xuICAgICAgICAgICAgZnggKz0gdiAqIGR4O1xuICAgICAgICAgICAgZnkgKz0gdiAqIGR5O1xuICAgICAgICAgICAgZnogKz0gdiAqIGR6O1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBPdGhlcndpc2UsIHJ1biB0aGUgcHJvY2VkdXJlIHJlY3Vyc2l2ZWx5IG9uIGVhY2ggb2YgdGhlIGN1cnJlbnQgbm9kZSdzIGNoaWxkcmVuLlxuXG4gICAgICAgICAgICAvLyBJIGludGVudGlvbmFsbHkgdW5mb2xkZWQgdGhpcyBsb29wLCB0byBzYXZlIHNldmVyYWwgQ1BVIGN5Y2xlcy5cbiAgICAgICAgICAgIGlmIChub2RlLnF1YWQwKSB7XG4gICAgICAgICAgICAgIHF1ZXVlW3B1c2hJZHhdID0gbm9kZS5xdWFkMDtcbiAgICAgICAgICAgICAgcXVldWVMZW5ndGggKz0gMTtcbiAgICAgICAgICAgICAgcHVzaElkeCArPSAxO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKG5vZGUucXVhZDEpIHtcbiAgICAgICAgICAgICAgcXVldWVbcHVzaElkeF0gPSBub2RlLnF1YWQxO1xuICAgICAgICAgICAgICBxdWV1ZUxlbmd0aCArPSAxO1xuICAgICAgICAgICAgICBwdXNoSWR4ICs9IDE7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAobm9kZS5xdWFkMikge1xuICAgICAgICAgICAgICBxdWV1ZVtwdXNoSWR4XSA9IG5vZGUucXVhZDI7XG4gICAgICAgICAgICAgIHF1ZXVlTGVuZ3RoICs9IDE7XG4gICAgICAgICAgICAgIHB1c2hJZHggKz0gMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChub2RlLnF1YWQzKSB7XG4gICAgICAgICAgICAgIHF1ZXVlW3B1c2hJZHhdID0gbm9kZS5xdWFkMztcbiAgICAgICAgICAgICAgcXVldWVMZW5ndGggKz0gMTtcbiAgICAgICAgICAgICAgcHVzaElkeCArPSAxO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKG5vZGUucXVhZDQpIHtcbiAgICAgICAgICAgICAgcXVldWVbcHVzaElkeF0gPSBub2RlLnF1YWQ0O1xuICAgICAgICAgICAgICBxdWV1ZUxlbmd0aCArPSAxO1xuICAgICAgICAgICAgICBwdXNoSWR4ICs9IDE7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAobm9kZS5xdWFkNSkge1xuICAgICAgICAgICAgICBxdWV1ZVtwdXNoSWR4XSA9IG5vZGUucXVhZDU7XG4gICAgICAgICAgICAgIHF1ZXVlTGVuZ3RoICs9IDE7XG4gICAgICAgICAgICAgIHB1c2hJZHggKz0gMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChub2RlLnF1YWQ2KSB7XG4gICAgICAgICAgICAgIHF1ZXVlW3B1c2hJZHhdID0gbm9kZS5xdWFkNjtcbiAgICAgICAgICAgICAgcXVldWVMZW5ndGggKz0gMTtcbiAgICAgICAgICAgICAgcHVzaElkeCArPSAxO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKG5vZGUucXVhZDcpIHtcbiAgICAgICAgICAgICAgcXVldWVbcHVzaElkeF0gPSBub2RlLnF1YWQ3O1xuICAgICAgICAgICAgICBxdWV1ZUxlbmd0aCArPSAxO1xuICAgICAgICAgICAgICBwdXNoSWR4ICs9IDE7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHNvdXJjZUJvZHkuZm9yY2UueCArPSBmeDtcbiAgICAgIHNvdXJjZUJvZHkuZm9yY2UueSArPSBmeTtcbiAgICAgIHNvdXJjZUJvZHkuZm9yY2UueiArPSBmejtcbiAgICB9LFxuXG4gICAgaW5zZXJ0Qm9kaWVzID0gZnVuY3Rpb24oYm9kaWVzKSB7XG4gICAgICB2YXIgeDEgPSBOdW1iZXIuTUFYX1ZBTFVFLFxuICAgICAgICB5MSA9IE51bWJlci5NQVhfVkFMVUUsXG4gICAgICAgIHoxID0gTnVtYmVyLk1BWF9WQUxVRSxcbiAgICAgICAgeDIgPSBOdW1iZXIuTUlOX1ZBTFVFLFxuICAgICAgICB5MiA9IE51bWJlci5NSU5fVkFMVUUsXG4gICAgICAgIHoyID0gTnVtYmVyLk1JTl9WQUxVRSxcbiAgICAgICAgaSxcbiAgICAgICAgbWF4ID0gYm9kaWVzLmxlbmd0aDtcblxuICAgICAgLy8gVG8gcmVkdWNlIHF1YWQgdHJlZSBkZXB0aCB3ZSBhcmUgbG9va2luZyBmb3IgZXhhY3QgYm91bmRpbmcgYm94IG9mIGFsbCBwYXJ0aWNsZXMuXG4gICAgICBpID0gbWF4O1xuICAgICAgd2hpbGUgKGktLSkge1xuICAgICAgICB2YXIgcG9zID0gYm9kaWVzW2ldLnBvcztcbiAgICAgICAgdmFyIHggPSBwb3MueDtcbiAgICAgICAgdmFyIHkgPSBwb3MueTtcbiAgICAgICAgdmFyIHogPSBwb3MuejtcbiAgICAgICAgaWYgKHggPCB4MSkge1xuICAgICAgICAgIHgxID0geDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoeCA+IHgyKSB7XG4gICAgICAgICAgeDIgPSB4O1xuICAgICAgICB9XG4gICAgICAgIGlmICh5IDwgeTEpIHtcbiAgICAgICAgICB5MSA9IHk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHkgPiB5Mikge1xuICAgICAgICAgIHkyID0geTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoeiA8IHoxKSB7XG4gICAgICAgICAgejEgPSB6O1xuICAgICAgICB9XG4gICAgICAgIGlmICh6ID4gejIpIHtcbiAgICAgICAgICB6MiA9IHo7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gU3F1YXJpZnkgdGhlIGJvdW5kcy5cbiAgICAgIHZhciBtYXhTaWRlID0gTWF0aC5tYXgoeDIgLSB4MSwgTWF0aC5tYXgoeTIgLSB5MSwgejIgLSB6MSkpO1xuXG4gICAgICB4MiA9IHgxICsgbWF4U2lkZTtcbiAgICAgIHkyID0geTEgKyBtYXhTaWRlO1xuICAgICAgejIgPSB6MSArIG1heFNpZGU7XG5cbiAgICAgIGN1cnJlbnRJbkNhY2hlID0gMDtcbiAgICAgIHJvb3QgPSBuZXdOb2RlKCk7XG4gICAgICByb290LmxlZnQgPSB4MTtcbiAgICAgIHJvb3QucmlnaHQgPSB4MjtcbiAgICAgIHJvb3QudG9wID0geTE7XG4gICAgICByb290LmJvdHRvbSA9IHkyO1xuICAgICAgcm9vdC5iYWNrID0gejE7XG4gICAgICByb290LmZyb250ID0gejI7XG5cbiAgICAgIGkgPSBtYXggLSAxO1xuICAgICAgaWYgKGkgPiAwKSB7XG4gICAgICAgIHJvb3QuYm9keSA9IGJvZGllc1tpXTtcbiAgICAgIH1cbiAgICAgIHdoaWxlIChpLS0pIHtcbiAgICAgICAgaW5zZXJ0KGJvZGllc1tpXSwgcm9vdCk7XG4gICAgICB9XG4gICAgfTtcblxuICByZXR1cm4ge1xuICAgIGluc2VydEJvZGllczogaW5zZXJ0Qm9kaWVzLFxuICAgIHVwZGF0ZUJvZHlGb3JjZTogdXBkYXRlLFxuICAgIG9wdGlvbnM6IGZ1bmN0aW9uKG5ld09wdGlvbnMpIHtcbiAgICAgIGlmIChuZXdPcHRpb25zKSB7XG4gICAgICAgIGlmICh0eXBlb2YgbmV3T3B0aW9ucy5ncmF2aXR5ID09PSAnbnVtYmVyJykge1xuICAgICAgICAgIGdyYXZpdHkgPSBuZXdPcHRpb25zLmdyYXZpdHk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHR5cGVvZiBuZXdPcHRpb25zLnRoZXRhID09PSAnbnVtYmVyJykge1xuICAgICAgICAgIHRoZXRhID0gbmV3T3B0aW9ucy50aGV0YTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4ge1xuICAgICAgICBncmF2aXR5OiBncmF2aXR5LFxuICAgICAgICB0aGV0YTogdGhldGFcbiAgICAgIH07XG4gICAgfVxuICB9O1xufTtcblxuZnVuY3Rpb24gZ2V0Q2hpbGQobm9kZSwgaWR4KSB7XG4gIGlmIChpZHggPT09IDApIHJldHVybiBub2RlLnF1YWQwO1xuICBpZiAoaWR4ID09PSAxKSByZXR1cm4gbm9kZS5xdWFkMTtcbiAgaWYgKGlkeCA9PT0gMikgcmV0dXJuIG5vZGUucXVhZDI7XG4gIGlmIChpZHggPT09IDMpIHJldHVybiBub2RlLnF1YWQzO1xuICBpZiAoaWR4ID09PSA0KSByZXR1cm4gbm9kZS5xdWFkNDtcbiAgaWYgKGlkeCA9PT0gNSkgcmV0dXJuIG5vZGUucXVhZDU7XG4gIGlmIChpZHggPT09IDYpIHJldHVybiBub2RlLnF1YWQ2O1xuICBpZiAoaWR4ID09PSA3KSByZXR1cm4gbm9kZS5xdWFkNztcbiAgcmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIHNldENoaWxkKG5vZGUsIGlkeCwgY2hpbGQpIHtcbiAgaWYgKGlkeCA9PT0gMCkgbm9kZS5xdWFkMCA9IGNoaWxkO1xuICBlbHNlIGlmIChpZHggPT09IDEpIG5vZGUucXVhZDEgPSBjaGlsZDtcbiAgZWxzZSBpZiAoaWR4ID09PSAyKSBub2RlLnF1YWQyID0gY2hpbGQ7XG4gIGVsc2UgaWYgKGlkeCA9PT0gMykgbm9kZS5xdWFkMyA9IGNoaWxkO1xuICBlbHNlIGlmIChpZHggPT09IDQpIG5vZGUucXVhZDQgPSBjaGlsZDtcbiAgZWxzZSBpZiAoaWR4ID09PSA1KSBub2RlLnF1YWQ1ID0gY2hpbGQ7XG4gIGVsc2UgaWYgKGlkeCA9PT0gNikgbm9kZS5xdWFkNiA9IGNoaWxkO1xuICBlbHNlIGlmIChpZHggPT09IDcpIG5vZGUucXVhZDcgPSBjaGlsZDtcbn1cbiIsIm1vZHVsZS5leHBvcnRzID0gSW5zZXJ0U3RhY2s7XG5cbi8qKlxuICogT3VyIGltcGxlbWVudGF0aW9uIG9mIFF1YWRUcmVlIGlzIG5vbi1yZWN1cnNpdmUgdG8gYXZvaWQgR0MgaGl0XG4gKiBUaGlzIGRhdGEgc3RydWN0dXJlIHJlcHJlc2VudCBzdGFjayBvZiBlbGVtZW50c1xuICogd2hpY2ggd2UgYXJlIHRyeWluZyB0byBpbnNlcnQgaW50byBxdWFkIHRyZWUuXG4gKi9cbmZ1bmN0aW9uIEluc2VydFN0YWNrICgpIHtcbiAgICB0aGlzLnN0YWNrID0gW107XG4gICAgdGhpcy5wb3BJZHggPSAwO1xufVxuXG5JbnNlcnRTdGFjay5wcm90b3R5cGUgPSB7XG4gICAgaXNFbXB0eTogZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnBvcElkeCA9PT0gMDtcbiAgICB9LFxuICAgIHB1c2g6IGZ1bmN0aW9uIChub2RlLCBib2R5KSB7XG4gICAgICAgIHZhciBpdGVtID0gdGhpcy5zdGFja1t0aGlzLnBvcElkeF07XG4gICAgICAgIGlmICghaXRlbSkge1xuICAgICAgICAgICAgLy8gd2UgYXJlIHRyeWluZyB0byBhdm9pZCBtZW1vcnkgcHJlc3N1cmU6IGNyZWF0ZSBuZXcgZWxlbWVudFxuICAgICAgICAgICAgLy8gb25seSB3aGVuIGFic29sdXRlbHkgbmVjZXNzYXJ5XG4gICAgICAgICAgICB0aGlzLnN0YWNrW3RoaXMucG9wSWR4XSA9IG5ldyBJbnNlcnRTdGFja0VsZW1lbnQobm9kZSwgYm9keSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpdGVtLm5vZGUgPSBub2RlO1xuICAgICAgICAgICAgaXRlbS5ib2R5ID0gYm9keTtcbiAgICAgICAgfVxuICAgICAgICArK3RoaXMucG9wSWR4O1xuICAgIH0sXG4gICAgcG9wOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzLnBvcElkeCA+IDApIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnN0YWNrWy0tdGhpcy5wb3BJZHhdO1xuICAgICAgICB9XG4gICAgfSxcbiAgICByZXNldDogZnVuY3Rpb24gKCkge1xuICAgICAgICB0aGlzLnBvcElkeCA9IDA7XG4gICAgfVxufTtcblxuZnVuY3Rpb24gSW5zZXJ0U3RhY2tFbGVtZW50KG5vZGUsIGJvZHkpIHtcbiAgICB0aGlzLm5vZGUgPSBub2RlOyAvLyBRdWFkVHJlZSBub2RlXG4gICAgdGhpcy5ib2R5ID0gYm9keTsgLy8gcGh5c2ljYWwgYm9keSB3aGljaCBuZWVkcyB0byBiZSBpbnNlcnRlZCB0byBub2RlXG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGlzU2FtZVBvc2l0aW9uKHBvaW50MSwgcG9pbnQyKSB7XG4gICAgdmFyIGR4ID0gTWF0aC5hYnMocG9pbnQxLnggLSBwb2ludDIueCk7XG4gICAgdmFyIGR5ID0gTWF0aC5hYnMocG9pbnQxLnkgLSBwb2ludDIueSk7XG4gICAgdmFyIGR6ID0gTWF0aC5hYnMocG9pbnQxLnogLSBwb2ludDIueik7XG5cbiAgICByZXR1cm4gKGR4IDwgMWUtOCAmJiBkeSA8IDFlLTggJiYgZHogPCAxZS04KTtcbn07XG4iLCIvKipcbiAqIEludGVybmFsIGRhdGEgc3RydWN0dXJlIHRvIHJlcHJlc2VudCAzRCBRdWFkVHJlZSBub2RlXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gTm9kZSgpIHtcbiAgLy8gYm9keSBzdG9yZWQgaW5zaWRlIHRoaXMgbm9kZS4gSW4gcXVhZCB0cmVlIG9ubHkgbGVhZiBub2RlcyAoYnkgY29uc3RydWN0aW9uKVxuICAvLyBjb250YWluIGJvaWRlczpcbiAgdGhpcy5ib2R5ID0gbnVsbDtcblxuICAvLyBDaGlsZCBub2RlcyBhcmUgc3RvcmVkIGluIHF1YWRzLiBFYWNoIHF1YWQgaXMgcHJlc2VudGVkIGJ5IG51bWJlcjpcbiAgLy8gQmVoaW5kIFogbWVkaWFuOlxuICAvLyAwIHwgMVxuICAvLyAtLS0tLVxuICAvLyAyIHwgM1xuICAvLyBJbiBmcm9udCBvZiBaIG1lZGlhbjpcbiAgLy8gNCB8IDVcbiAgLy8gLS0tLS1cbiAgLy8gNiB8IDdcbiAgdGhpcy5xdWFkMCA9IG51bGw7XG4gIHRoaXMucXVhZDEgPSBudWxsO1xuICB0aGlzLnF1YWQyID0gbnVsbDtcbiAgdGhpcy5xdWFkMyA9IG51bGw7XG4gIHRoaXMucXVhZDQgPSBudWxsO1xuICB0aGlzLnF1YWQ1ID0gbnVsbDtcbiAgdGhpcy5xdWFkNiA9IG51bGw7XG4gIHRoaXMucXVhZDcgPSBudWxsO1xuXG4gIC8vIFRvdGFsIG1hc3Mgb2YgY3VycmVudCBub2RlXG4gIHRoaXMubWFzcyA9IDA7XG5cbiAgLy8gQ2VudGVyIG9mIG1hc3MgY29vcmRpbmF0ZXNcbiAgdGhpcy5tYXNzWCA9IDA7XG4gIHRoaXMubWFzc1kgPSAwO1xuICB0aGlzLm1hc3NaID0gMDtcblxuICAvLyBib3VuZGluZyBib3ggY29vcmRpbmF0ZXNcbiAgdGhpcy5sZWZ0ID0gMDtcbiAgdGhpcy50b3AgPSAwO1xuICB0aGlzLmJvdHRvbSA9IDA7XG4gIHRoaXMucmlnaHQgPSAwO1xuICB0aGlzLmZyb250ID0gMDtcbiAgdGhpcy5iYWNrID0gMDtcbn07XG4iLCJtb2R1bGUuZXhwb3J0cyA9IHtcbiAgcmFuZG9tOiByYW5kb20sXG4gIHJhbmRvbUl0ZXJhdG9yOiByYW5kb21JdGVyYXRvclxufTtcblxuLyoqXG4gKiBDcmVhdGVzIHNlZWRlZCBQUk5HIHdpdGggdHdvIG1ldGhvZHM6XG4gKiAgIG5leHQoKSBhbmQgbmV4dERvdWJsZSgpXG4gKi9cbmZ1bmN0aW9uIHJhbmRvbShpbnB1dFNlZWQpIHtcbiAgdmFyIHNlZWQgPSB0eXBlb2YgaW5wdXRTZWVkID09PSAnbnVtYmVyJyA/IGlucHV0U2VlZCA6ICgrIG5ldyBEYXRlKCkpO1xuICB2YXIgcmFuZG9tRnVuYyA9IGZ1bmN0aW9uKCkge1xuICAgICAgLy8gUm9iZXJ0IEplbmtpbnMnIDMyIGJpdCBpbnRlZ2VyIGhhc2ggZnVuY3Rpb24uXG4gICAgICBzZWVkID0gKChzZWVkICsgMHg3ZWQ1NWQxNikgKyAoc2VlZCA8PCAxMikpICAmIDB4ZmZmZmZmZmY7XG4gICAgICBzZWVkID0gKChzZWVkIF4gMHhjNzYxYzIzYykgXiAoc2VlZCA+Pj4gMTkpKSAmIDB4ZmZmZmZmZmY7XG4gICAgICBzZWVkID0gKChzZWVkICsgMHgxNjU2NjdiMSkgKyAoc2VlZCA8PCA1KSkgICAmIDB4ZmZmZmZmZmY7XG4gICAgICBzZWVkID0gKChzZWVkICsgMHhkM2EyNjQ2YykgXiAoc2VlZCA8PCA5KSkgICAmIDB4ZmZmZmZmZmY7XG4gICAgICBzZWVkID0gKChzZWVkICsgMHhmZDcwNDZjNSkgKyAoc2VlZCA8PCAzKSkgICAmIDB4ZmZmZmZmZmY7XG4gICAgICBzZWVkID0gKChzZWVkIF4gMHhiNTVhNGYwOSkgXiAoc2VlZCA+Pj4gMTYpKSAmIDB4ZmZmZmZmZmY7XG4gICAgICByZXR1cm4gKHNlZWQgJiAweGZmZmZmZmYpIC8gMHgxMDAwMDAwMDtcbiAgfTtcblxuICByZXR1cm4ge1xuICAgICAgLyoqXG4gICAgICAgKiBHZW5lcmF0ZXMgcmFuZG9tIGludGVnZXIgbnVtYmVyIGluIHRoZSByYW5nZSBmcm9tIDAgKGluY2x1c2l2ZSkgdG8gbWF4VmFsdWUgKGV4Y2x1c2l2ZSlcbiAgICAgICAqXG4gICAgICAgKiBAcGFyYW0gbWF4VmFsdWUgTnVtYmVyIFJFUVVJUkVELiBPbW1pdHRpbmcgdGhpcyBudW1iZXIgd2lsbCByZXN1bHQgaW4gTmFOIHZhbHVlcyBmcm9tIFBSTkcuXG4gICAgICAgKi9cbiAgICAgIG5leHQgOiBmdW5jdGlvbiAobWF4VmFsdWUpIHtcbiAgICAgICAgICByZXR1cm4gTWF0aC5mbG9vcihyYW5kb21GdW5jKCkgKiBtYXhWYWx1ZSk7XG4gICAgICB9LFxuXG4gICAgICAvKipcbiAgICAgICAqIEdlbmVyYXRlcyByYW5kb20gZG91YmxlIG51bWJlciBpbiB0aGUgcmFuZ2UgZnJvbSAwIChpbmNsdXNpdmUpIHRvIDEgKGV4Y2x1c2l2ZSlcbiAgICAgICAqIFRoaXMgZnVuY3Rpb24gaXMgdGhlIHNhbWUgYXMgTWF0aC5yYW5kb20oKSAoZXhjZXB0IHRoYXQgaXQgY291bGQgYmUgc2VlZGVkKVxuICAgICAgICovXG4gICAgICBuZXh0RG91YmxlIDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHJldHVybiByYW5kb21GdW5jKCk7XG4gICAgICB9XG4gIH07XG59XG5cbi8qXG4gKiBDcmVhdGVzIGl0ZXJhdG9yIG92ZXIgYXJyYXksIHdoaWNoIHJldHVybnMgaXRlbXMgb2YgYXJyYXkgaW4gcmFuZG9tIG9yZGVyXG4gKiBUaW1lIGNvbXBsZXhpdHkgaXMgZ3VhcmFudGVlZCB0byBiZSBPKG4pO1xuICovXG5mdW5jdGlvbiByYW5kb21JdGVyYXRvcihhcnJheSwgY3VzdG9tUmFuZG9tKSB7XG4gICAgdmFyIGxvY2FsUmFuZG9tID0gY3VzdG9tUmFuZG9tIHx8IHJhbmRvbSgpO1xuICAgIGlmICh0eXBlb2YgbG9jYWxSYW5kb20ubmV4dCAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdjdXN0b21SYW5kb20gZG9lcyBub3QgbWF0Y2ggZXhwZWN0ZWQgQVBJOiBuZXh0KCkgZnVuY3Rpb24gaXMgbWlzc2luZycpO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICAgIGZvckVhY2ggOiBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgICAgIHZhciBpLCBqLCB0O1xuICAgICAgICAgICAgZm9yIChpID0gYXJyYXkubGVuZ3RoIC0gMTsgaSA+IDA7IC0taSkge1xuICAgICAgICAgICAgICAgIGogPSBsb2NhbFJhbmRvbS5uZXh0KGkgKyAxKTsgLy8gaSBpbmNsdXNpdmVcbiAgICAgICAgICAgICAgICB0ID0gYXJyYXlbal07XG4gICAgICAgICAgICAgICAgYXJyYXlbal0gPSBhcnJheVtpXTtcbiAgICAgICAgICAgICAgICBhcnJheVtpXSA9IHQ7XG5cbiAgICAgICAgICAgICAgICBjYWxsYmFjayh0KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGFycmF5Lmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKGFycmF5WzBdKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogU2h1ZmZsZXMgYXJyYXkgcmFuZG9tbHksIGluIHBsYWNlLlxuICAgICAgICAgKi9cbiAgICAgICAgc2h1ZmZsZSA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBpLCBqLCB0O1xuICAgICAgICAgICAgZm9yIChpID0gYXJyYXkubGVuZ3RoIC0gMTsgaSA+IDA7IC0taSkge1xuICAgICAgICAgICAgICAgIGogPSBsb2NhbFJhbmRvbS5uZXh0KGkgKyAxKTsgLy8gaSBpbmNsdXNpdmVcbiAgICAgICAgICAgICAgICB0ID0gYXJyYXlbal07XG4gICAgICAgICAgICAgICAgYXJyYXlbal0gPSBhcnJheVtpXTtcbiAgICAgICAgICAgICAgICBhcnJheVtpXSA9IHQ7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBhcnJheTtcbiAgICAgICAgfVxuICAgIH07XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IHJlbW92ZU92ZXJsYXBzO1xuXG5mdW5jdGlvbiByZW1vdmVPdmVybGFwcyhsYXlvdXQsIG9wdGlvbnMpIHtcbiAgaWYgKCFsYXlvdXQpIHRocm93IG5ldyBFcnJvcignbGF5b3V0IGFyZ3VtZW50IGlzIHJlcXVpcmVkJyk7XG5cbiAgLy8gVGhpcyB2YXJpYWJsZSBpcyB1c2VkIGR1cmluZyBpdGVyYXRpb24gb3ZlciBxdWFkVHJlZVxuICB2YXIgY3VycmVudE5vZGUgPSB7XG4gICAgd2lkdGg6IDAsXG4gICAgaGVpZ2h0OiAwLFxuICAgIHg6IDAsXG4gICAgeTogMCxcbiAgICBib2R5OiBudWxsXG4gIH07XG5cbiAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cbiAgdmFyIGRlZmF1bHRTaXplID0gb3B0aW9ucy5kZWZhdWx0U2l6ZSB8fCB7XG4gICAgd2lkdGg6IDIwLFxuICAgIGhlaWdodDogMjBcbiAgfTtcblxuICB2YXIgYWN0aXZlID0gb3B0aW9ucy5hY3RpdmUgIT09IHVuZGVmaW5lZCA/IG9wdGlvbnMuYWN0aXZlIDogZmFsc2U7XG5cbiAgLy8gd2Ugc3RvcmUgYW1vdW50IG9mIG5vZGUgbW92ZW1lbnQgaW50byB0aGlzIHZhcmlhYmxlLlxuICB2YXIgdG90YWxNb3ZlbWVudCA9IDE7XG5cbiAgdmFyIHBoeXNpY3NTaW11bGF0b3IgPSBsYXlvdXQuc2ltdWxhdG9yO1xuICB2YXIgZ3JhcGggPSBsYXlvdXQuZ3JhcGg7XG5cbiAgaWYgKGFjdGl2ZSkge1xuICAgIGxheW91dC5vbignc3RlcCcsIHN0ZXApO1xuICAgIGxheW91dC5vbignZGlzcG9zZWQnLCBkaXNwb3NlKTtcbiAgICBsYXlvdXQub24oJ3N0YWJsZScsIHJlbW92ZUFsbCk7XG4gIH0gZWxzZSB7XG4gICAgcmVtb3ZlQWxsKCk7XG4gIH1cblxuICAvLyBXZSB3aWxsIGF1dG9kaXNwb3NlIHdoZW4gbGF5b3V0IGlzIGRpc3Bvc2VkLiBKdXN0IGluIGNhc2UsIGdpdmluZyBhXG4gIC8vIHJlZmVyZW5jZSBmb3IgZGlzcG9zYWxcbiAgcmV0dXJuIGRpc3Bvc2U7XG5cbiAgZnVuY3Rpb24gZGlzcG9zZSgpIHtcbiAgICBsYXlvdXQub2ZmKCdzdGVwJywgc3RlcCk7XG4gICAgbGF5b3V0Lm9mZignc3RhYmxlJywgcmVtb3ZlQWxsKTtcbiAgICBsYXlvdXQub2ZmKCdkaXNwb3NlZCcsIGRpc3Bvc2UpO1xuICB9XG5cbiAgZnVuY3Rpb24gcmVtb3ZlQWxsKCkge1xuICAgIHdoaWxlICh0b3RhbE1vdmVtZW50ID4gMCkge1xuICAgICAgcnVuUmVtb3ZlT3ZlcmxhcHNJZk5lZWRlZCgpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHN0ZXAoKSB7XG4gICAgcnVuUmVtb3ZlT3ZlcmxhcHNJZk5lZWRlZCgpO1xuICB9XG5cbiAgZnVuY3Rpb24gcnVuUmVtb3ZlT3ZlcmxhcHNJZk5lZWRlZCgpIHtcbiAgICB2YXIgdHJlZSA9IHBoeXNpY3NTaW11bGF0b3IucXVhZFRyZWU7XG4gICAgdmFyIHJvb3QgPSB0cmVlLmdldFJvb3QoKTtcbiAgICB0b3RhbE1vdmVtZW50ID0gMDtcblxuICAgIGxheW91dC5mb3JFYWNoQm9keShmdW5jdGlvbihib2R5LCBncmFwaE5vZGVJZCkge1xuICAgICAgdmFyIGdyYXBoTm9kZSA9IGdyYXBoLmdldE5vZGUoZ3JhcGhOb2RlSWQpO1xuXG4gICAgICBjdXJyZW50Tm9kZS53aWR0aCA9IGdldFdpZHRoKGdyYXBoTm9kZS5kYXRhKTtcbiAgICAgIGN1cnJlbnROb2RlLmhlaWdodCA9IGdldEhlaWdodChncmFwaE5vZGUuZGF0YSk7XG4gICAgICBjdXJyZW50Tm9kZS54ID0gYm9keS5wb3MueDtcbiAgICAgIGN1cnJlbnROb2RlLnkgPSBib2R5LnBvcy55O1xuICAgICAgY3VycmVudE5vZGUuYm9keSA9IGJvZHk7XG5cbiAgICAgIHRyYXZlcnNlKHJvb3QsIHZpc2l0UXVhZCk7XG4gICAgfSk7XG4gIH1cblxuICBmdW5jdGlvbiB2aXNpdFF1YWQocXVhZCkge1xuICAgIHZhciBib2R5ID0gcXVhZC5ib2R5O1xuICAgIGlmIChib2R5ID09PSBjdXJyZW50Tm9kZS5ib2R5KSByZXR1cm4gZmFsc2U7XG5cbiAgICBpZiAoYm9keSkge1xuICAgICAgLy8gQ2hlY2sgaWYgYm9keSBuZWVkcyB0byBiZSBtb3ZlZDtcbiAgICAgIHRvdGFsTW92ZW1lbnQgKz0gbW92ZUlmTmVlZGVkKGJvZHkpO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyB3ZSBvbmx5IGNvbnRpbnVlIHN1YmRpdmlkaW5nIHRoZSB0cmVlIGlmIGN1cnJlbnQgbm9kZSBpbnRlcnNlY3RzIHRoZSBxdWFkXG4gICAgICByZXR1cm4gaW50ZXJzZWN0UXVhZChxdWFkKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGdldFdpZHRoKG5vZGVEYXRhKSB7XG4gICAgcmV0dXJuIChub2RlRGF0YSAmJiBub2RlRGF0YS53aWR0aCkgfHwgZGVmYXVsdFNpemUud2lkdGg7XG4gIH1cblxuICBmdW5jdGlvbiBnZXRIZWlnaHQobm9kZURhdGEpIHtcbiAgICByZXR1cm4gKG5vZGVEYXRhICYmIG5vZGVEYXRhLmhlaWdodCkgfHwgZGVmYXVsdFNpemUuaGVpZ2h0O1xuICB9XG5cbiAgZnVuY3Rpb24gbW92ZUlmTmVlZGVkKGJvZHkpIHtcbiAgICB2YXIgYSA9IGN1cnJlbnROb2RlO1xuICAgIHZhciBub2RlID0gZ3JhcGguZ2V0Tm9kZShib2R5LmlkKTtcblxuICAgIHZhciBiID0ge1xuICAgICAgeDogYm9keS5wb3MueCxcbiAgICAgIHk6IGJvZHkucG9zLnksXG4gICAgICB3aWR0aDogZ2V0V2lkdGgobm9kZS5kYXRhKSxcbiAgICAgIGhlaWdodDogZ2V0SGVpZ2h0KG5vZGUuZGF0YSlcbiAgICB9XG5cbiAgICB2YXIgb3ggPSBNYXRoLm1pbihhLnggKyBhLndpZHRoIC8gMiwgYi54ICsgYi53aWR0aCAvIDIpIC0gTWF0aC5tYXgoYS54IC0gYS53aWR0aCAvIDIsIGIueCAtIGIud2lkdGggLyAyKTtcbiAgICB2YXIgb3kgPSBNYXRoLm1pbihhLnkgKyBhLmhlaWdodCAvIDIsIGIueSArIGIuaGVpZ2h0IC8gMikgLSBNYXRoLm1heChhLnkgLSBhLmhlaWdodCAvIDIsIGIueSAtIGIuaGVpZ2h0IC8gMik7XG5cbiAgICBpZiAob3ggPiAwICYmIG95ID4gMCkge1xuICAgICAgdmFyIHRvdGFsTW92ZW1lbnQgPSBtb3ZlKG94LCBveSwgYSwgYik7XG4gICAgICBjdXJyZW50Tm9kZS5ib2R5LnBvcy54ID0gYS54O1xuICAgICAgY3VycmVudE5vZGUuYm9keS5wb3MueSA9IGEueTtcblxuICAgICAgYm9keS5wb3MueCA9IGIueDtcbiAgICAgIGJvZHkucG9zLnkgPSBiLnk7XG5cbiAgICAgIHJldHVybiB0b3RhbE1vdmVtZW50O1xuICAgIH1cblxuICAgIHJldHVybiAwO1xuICB9XG5cbiAgZnVuY3Rpb24gbW92ZShveCwgb3ksIGEsIGIpIHtcbiAgICAvLyBzaGlmdCBhbG9uZyB0aGUgYXhpcyBvZiBpZGVhbC90YXJnZXQgcG9zaXRpb25zXG4gICAgLy8gc28gYm94ZXMgY2FuIGNyb3NzIGVhY2ggb3RoZXIgcmF0aGVyIHRoYW4gY29sbGlkZVxuICAgIC8vIHRoaXMgbWFrZXMgdGhlIHJlc3VsdCBtb3JlIHByZWRpY3RhYmxlXG5cbiAgICB2YXIgdngwID0gKGEueCArIGEud2lkdGggLyAyKSAtIChiLnggKyBiLndpZHRoIC8gMik7XG4gICAgdmFyIHZ5MCA9IChhLnkgKyBhLmhlaWdodCAvIDIpIC0gKGIueSArIGIud2lkdGggLyAyKSxcbiAgICAgIHYwID0gTWF0aC5zcXJ0KHZ4MCAqIHZ4MCArIHZ5MCAqIHZ5MCksXG4gICAgICBzaGlmdCA9IE1hdGguc3FydChveCAqIG95KSxcbiAgICAgIHNoaWZ0WCxcbiAgICAgIHNoaWZ0WTtcblxuICAgIGlmICh2MCAhPT0gMCkge1xuICAgICAgdngwIC89IHYwO1xuICAgICAgdnkwIC89IHYwO1xuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgcGhpID0gTWF0aC5yYW5kb20oKSAqIDIgKiBNYXRoLlBJO1xuICAgICAgdngwID0gTWF0aC5jb3MocGhpKTtcbiAgICAgIHZ5MCA9IE1hdGguc2luKHBoaSk7XG4gICAgfVxuXG4gICAgc2hpZnRYID0gc2hpZnQgKiB2eDA7XG4gICAgc2hpZnRZID0gc2hpZnQgKiB2eTA7XG5cbiAgICBhLnggKz0gc2hpZnRYO1xuICAgIGIueCAtPSBzaGlmdFg7XG4gICAgYS55ICs9IHNoaWZ0WTtcbiAgICBiLnkgLT0gc2hpZnRZO1xuXG4gICAgcmV0dXJuIE1hdGguYWJzKHNoaWZ0WCkgKyBNYXRoLmFicyhzaGlmdFkpO1xuICB9XG5cbiAgZnVuY3Rpb24gaW50ZXJzZWN0UXVhZChxdWFkKSB7XG4gICAgdmFyIHhIYWxmID0gY3VycmVudE5vZGUud2lkdGggLyAyO1xuICAgIHZhciB5SGFsZiA9IGN1cnJlbnROb2RlLmhlaWdodCAvIDI7XG4gICAgdmFyIGxlZnQgPSBjdXJyZW50Tm9kZS54IC0geEhhbGY7XG4gICAgdmFyIHRvcCA9IGN1cnJlbnROb2RlLnkgLSB5SGFsZjtcbiAgICB2YXIgcmlnaHQgPSBjdXJyZW50Tm9kZS54ICsgeEhhbGY7XG4gICAgdmFyIGJvdHRvbSA9IGN1cnJlbnROb2RlLnkgKyB5SGFsZjtcblxuICAgIC8vIENvbnRpbnVlIHN1YmRpdmlzaW9uIG9ubHkgaWYgY3VycmVudCByZWN0YW5nbGUgaW50ZXJzZWN0cyBvdXIgcXVhZFxuICAgIC8vIGh0dHA6Ly9zdGFja292ZXJmbG93LmNvbS9xdWVzdGlvbnMvMzA2MzE2L2RldGVybWluZS1pZi10d28tcmVjdGFuZ2xlcy1vdmVybGFwLWVhY2gtb3RoZXJcbiAgICByZXR1cm4gbGVmdCA8IHF1YWQucmlnaHQgJiZcbiAgICAgIHJpZ2h0ID4gcXVhZC5sZWZ0ICYmXG4gICAgICB0b3AgPCBxdWFkLmJvdHRvbSAmJlxuICAgICAgYm90dG9tID4gcXVhZC50b3A7XG4gIH1cbn1cblxuZnVuY3Rpb24gdHJhdmVyc2UocXVhZCwgdmlzaXRvcikge1xuICBpZiAodmlzaXRvcihxdWFkKSkge1xuICAgIGlmIChxdWFkLnF1YWQwKSB0cmF2ZXJzZShxdWFkLnF1YWQwLCB2aXNpdG9yKVxuICAgIGlmIChxdWFkLnF1YWQxKSB0cmF2ZXJzZShxdWFkLnF1YWQxLCB2aXNpdG9yKVxuICAgIGlmIChxdWFkLnF1YWQyKSB0cmF2ZXJzZShxdWFkLnF1YWQyLCB2aXNpdG9yKVxuICAgIGlmIChxdWFkLnF1YWQzKSB0cmF2ZXJzZShxdWFkLnF1YWQzLCB2aXNpdG9yKVxuICB9XG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IHNhdmU7XG5cbmZ1bmN0aW9uIHNhdmUoZ3JhcGgsIGN1c3RvbU5vZGVUcmFuc2Zvcm0sIGN1c3RvbUxpbmtUcmFuc2Zvcm0pIHtcbiAgLy8gT2JqZWN0IGNvbnRhaW5zIGBub2Rlc2AgYW5kIGBsaW5rc2AgYXJyYXlzLlxuICB2YXIgcmVzdWx0ID0ge1xuICAgIG5vZGVzOiBbXSxcbiAgICBsaW5rczogW11cbiAgfTtcblxuICB2YXIgbm9kZVRyYW5zZm9ybSA9IGN1c3RvbU5vZGVUcmFuc2Zvcm0gfHwgZGVmYXVsdFRyYW5zZm9ybUZvck5vZGU7XG4gIHZhciBsaW5rVHJhbnNmb3JtID0gY3VzdG9tTGlua1RyYW5zZm9ybSB8fCBkZWZhdWx0VHJhbnNmb3JtRm9yTGluaztcblxuICBncmFwaC5mb3JFYWNoTm9kZShzYXZlTm9kZSk7XG4gIGdyYXBoLmZvckVhY2hMaW5rKHNhdmVMaW5rKTtcblxuICByZXR1cm4gSlNPTi5zdHJpbmdpZnkocmVzdWx0KTtcblxuICBmdW5jdGlvbiBzYXZlTm9kZShub2RlKSB7XG4gICAgLy8gRWFjaCBub2RlIG9mIHRoZSBncmFwaCBpcyBwcm9jZXNzZWQgdG8gdGFrZSBvbmx5IHJlcXVpcmVkIGZpZWxkc1xuICAgIC8vIGBpZGAgYW5kIGBkYXRhYFxuICAgIHJlc3VsdC5ub2Rlcy5wdXNoKG5vZGVUcmFuc2Zvcm0obm9kZSkpO1xuICB9XG5cbiAgZnVuY3Rpb24gc2F2ZUxpbmsobGluaykge1xuICAgIC8vIEVhY2ggbGluayBvZiB0aGUgZ3JhcGggaXMgYWxzbyBwcm9jZXNzZWQgdG8gdGFrZSBgZnJvbUlkYCwgYHRvSWRgIGFuZFxuICAgIC8vIGBkYXRhYFxuICAgIHJlc3VsdC5saW5rcy5wdXNoKGxpbmtUcmFuc2Zvcm0obGluaykpO1xuICB9XG5cbiAgZnVuY3Rpb24gZGVmYXVsdFRyYW5zZm9ybUZvck5vZGUobm9kZSkge1xuICAgIHZhciByZXN1bHQgPSB7XG4gICAgICBpZDogbm9kZS5pZFxuICAgIH07XG4gICAgLy8gV2UgZG9uJ3Qgd2FudCB0byBzdG9yZSB1bmRlZmluZWQgZmllbGRzIHdoZW4gaXQncyBub3QgbmVjZXNzYXJ5OlxuICAgIGlmIChub2RlLmRhdGEgIT09IHVuZGVmaW5lZCkge1xuICAgICAgcmVzdWx0LmRhdGEgPSBub2RlLmRhdGE7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIGZ1bmN0aW9uIGRlZmF1bHRUcmFuc2Zvcm1Gb3JMaW5rKGxpbmspIHtcbiAgICB2YXIgcmVzdWx0ID0ge1xuICAgICAgZnJvbUlkOiBsaW5rLmZyb21JZCxcbiAgICAgIHRvSWQ6IGxpbmsudG9JZCxcbiAgICB9O1xuXG4gICAgaWYgKGxpbmsuZGF0YSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICByZXN1bHQuZGF0YSA9IGxpbmsuZGF0YTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG59XG4iLCIvLyBzaGltIGZvciB1c2luZyBwcm9jZXNzIGluIGJyb3dzZXJcbnZhciBwcm9jZXNzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxuLy8gY2FjaGVkIGZyb20gd2hhdGV2ZXIgZ2xvYmFsIGlzIHByZXNlbnQgc28gdGhhdCB0ZXN0IHJ1bm5lcnMgdGhhdCBzdHViIGl0XG4vLyBkb24ndCBicmVhayB0aGluZ3MuICBCdXQgd2UgbmVlZCB0byB3cmFwIGl0IGluIGEgdHJ5IGNhdGNoIGluIGNhc2UgaXQgaXNcbi8vIHdyYXBwZWQgaW4gc3RyaWN0IG1vZGUgY29kZSB3aGljaCBkb2Vzbid0IGRlZmluZSBhbnkgZ2xvYmFscy4gIEl0J3MgaW5zaWRlIGFcbi8vIGZ1bmN0aW9uIGJlY2F1c2UgdHJ5L2NhdGNoZXMgZGVvcHRpbWl6ZSBpbiBjZXJ0YWluIGVuZ2luZXMuXG5cbnZhciBjYWNoZWRTZXRUaW1lb3V0O1xudmFyIGNhY2hlZENsZWFyVGltZW91dDtcblxuZnVuY3Rpb24gZGVmYXVsdFNldFRpbW91dCgpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3NldFRpbWVvdXQgaGFzIG5vdCBiZWVuIGRlZmluZWQnKTtcbn1cbmZ1bmN0aW9uIGRlZmF1bHRDbGVhclRpbWVvdXQgKCkge1xuICAgIHRocm93IG5ldyBFcnJvcignY2xlYXJUaW1lb3V0IGhhcyBub3QgYmVlbiBkZWZpbmVkJyk7XG59XG4oZnVuY3Rpb24gKCkge1xuICAgIHRyeSB7XG4gICAgICAgIGlmICh0eXBlb2Ygc2V0VGltZW91dCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgY2FjaGVkU2V0VGltZW91dCA9IHNldFRpbWVvdXQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjYWNoZWRTZXRUaW1lb3V0ID0gZGVmYXVsdFNldFRpbW91dDtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY2FjaGVkU2V0VGltZW91dCA9IGRlZmF1bHRTZXRUaW1vdXQ7XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICAgIGlmICh0eXBlb2YgY2xlYXJUaW1lb3V0ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICBjYWNoZWRDbGVhclRpbWVvdXQgPSBjbGVhclRpbWVvdXQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjYWNoZWRDbGVhclRpbWVvdXQgPSBkZWZhdWx0Q2xlYXJUaW1lb3V0O1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjYWNoZWRDbGVhclRpbWVvdXQgPSBkZWZhdWx0Q2xlYXJUaW1lb3V0O1xuICAgIH1cbn0gKCkpXG5mdW5jdGlvbiBydW5UaW1lb3V0KGZ1bikge1xuICAgIGlmIChjYWNoZWRTZXRUaW1lb3V0ID09PSBzZXRUaW1lb3V0KSB7XG4gICAgICAgIC8vbm9ybWFsIGVudmlyb21lbnRzIGluIHNhbmUgc2l0dWF0aW9uc1xuICAgICAgICByZXR1cm4gc2V0VGltZW91dChmdW4sIDApO1xuICAgIH1cbiAgICAvLyBpZiBzZXRUaW1lb3V0IHdhc24ndCBhdmFpbGFibGUgYnV0IHdhcyBsYXR0ZXIgZGVmaW5lZFxuICAgIGlmICgoY2FjaGVkU2V0VGltZW91dCA9PT0gZGVmYXVsdFNldFRpbW91dCB8fCAhY2FjaGVkU2V0VGltZW91dCkgJiYgc2V0VGltZW91dCkge1xuICAgICAgICBjYWNoZWRTZXRUaW1lb3V0ID0gc2V0VGltZW91dDtcbiAgICAgICAgcmV0dXJuIHNldFRpbWVvdXQoZnVuLCAwKTtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgICAgLy8gd2hlbiB3aGVuIHNvbWVib2R5IGhhcyBzY3Jld2VkIHdpdGggc2V0VGltZW91dCBidXQgbm8gSS5FLiBtYWRkbmVzc1xuICAgICAgICByZXR1cm4gY2FjaGVkU2V0VGltZW91dChmdW4sIDApO1xuICAgIH0gY2F0Y2goZSl7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBXaGVuIHdlIGFyZSBpbiBJLkUuIGJ1dCB0aGUgc2NyaXB0IGhhcyBiZWVuIGV2YWxlZCBzbyBJLkUuIGRvZXNuJ3QgdHJ1c3QgdGhlIGdsb2JhbCBvYmplY3Qgd2hlbiBjYWxsZWQgbm9ybWFsbHlcbiAgICAgICAgICAgIHJldHVybiBjYWNoZWRTZXRUaW1lb3V0LmNhbGwobnVsbCwgZnVuLCAwKTtcbiAgICAgICAgfSBjYXRjaChlKXtcbiAgICAgICAgICAgIC8vIHNhbWUgYXMgYWJvdmUgYnV0IHdoZW4gaXQncyBhIHZlcnNpb24gb2YgSS5FLiB0aGF0IG11c3QgaGF2ZSB0aGUgZ2xvYmFsIG9iamVjdCBmb3IgJ3RoaXMnLCBob3BmdWxseSBvdXIgY29udGV4dCBjb3JyZWN0IG90aGVyd2lzZSBpdCB3aWxsIHRocm93IGEgZ2xvYmFsIGVycm9yXG4gICAgICAgICAgICByZXR1cm4gY2FjaGVkU2V0VGltZW91dC5jYWxsKHRoaXMsIGZ1biwgMCk7XG4gICAgICAgIH1cbiAgICB9XG5cblxufVxuZnVuY3Rpb24gcnVuQ2xlYXJUaW1lb3V0KG1hcmtlcikge1xuICAgIGlmIChjYWNoZWRDbGVhclRpbWVvdXQgPT09IGNsZWFyVGltZW91dCkge1xuICAgICAgICAvL25vcm1hbCBlbnZpcm9tZW50cyBpbiBzYW5lIHNpdHVhdGlvbnNcbiAgICAgICAgcmV0dXJuIGNsZWFyVGltZW91dChtYXJrZXIpO1xuICAgIH1cbiAgICAvLyBpZiBjbGVhclRpbWVvdXQgd2Fzbid0IGF2YWlsYWJsZSBidXQgd2FzIGxhdHRlciBkZWZpbmVkXG4gICAgaWYgKChjYWNoZWRDbGVhclRpbWVvdXQgPT09IGRlZmF1bHRDbGVhclRpbWVvdXQgfHwgIWNhY2hlZENsZWFyVGltZW91dCkgJiYgY2xlYXJUaW1lb3V0KSB7XG4gICAgICAgIGNhY2hlZENsZWFyVGltZW91dCA9IGNsZWFyVGltZW91dDtcbiAgICAgICAgcmV0dXJuIGNsZWFyVGltZW91dChtYXJrZXIpO1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgICAvLyB3aGVuIHdoZW4gc29tZWJvZHkgaGFzIHNjcmV3ZWQgd2l0aCBzZXRUaW1lb3V0IGJ1dCBubyBJLkUuIG1hZGRuZXNzXG4gICAgICAgIHJldHVybiBjYWNoZWRDbGVhclRpbWVvdXQobWFya2VyKTtcbiAgICB9IGNhdGNoIChlKXtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIFdoZW4gd2UgYXJlIGluIEkuRS4gYnV0IHRoZSBzY3JpcHQgaGFzIGJlZW4gZXZhbGVkIHNvIEkuRS4gZG9lc24ndCAgdHJ1c3QgdGhlIGdsb2JhbCBvYmplY3Qgd2hlbiBjYWxsZWQgbm9ybWFsbHlcbiAgICAgICAgICAgIHJldHVybiBjYWNoZWRDbGVhclRpbWVvdXQuY2FsbChudWxsLCBtYXJrZXIpO1xuICAgICAgICB9IGNhdGNoIChlKXtcbiAgICAgICAgICAgIC8vIHNhbWUgYXMgYWJvdmUgYnV0IHdoZW4gaXQncyBhIHZlcnNpb24gb2YgSS5FLiB0aGF0IG11c3QgaGF2ZSB0aGUgZ2xvYmFsIG9iamVjdCBmb3IgJ3RoaXMnLCBob3BmdWxseSBvdXIgY29udGV4dCBjb3JyZWN0IG90aGVyd2lzZSBpdCB3aWxsIHRocm93IGEgZ2xvYmFsIGVycm9yLlxuICAgICAgICAgICAgLy8gU29tZSB2ZXJzaW9ucyBvZiBJLkUuIGhhdmUgZGlmZmVyZW50IHJ1bGVzIGZvciBjbGVhclRpbWVvdXQgdnMgc2V0VGltZW91dFxuICAgICAgICAgICAgcmV0dXJuIGNhY2hlZENsZWFyVGltZW91dC5jYWxsKHRoaXMsIG1hcmtlcik7XG4gICAgICAgIH1cbiAgICB9XG5cblxuXG59XG52YXIgcXVldWUgPSBbXTtcbnZhciBkcmFpbmluZyA9IGZhbHNlO1xudmFyIGN1cnJlbnRRdWV1ZTtcbnZhciBxdWV1ZUluZGV4ID0gLTE7XG5cbmZ1bmN0aW9uIGNsZWFuVXBOZXh0VGljaygpIHtcbiAgICBpZiAoIWRyYWluaW5nIHx8ICFjdXJyZW50UXVldWUpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBkcmFpbmluZyA9IGZhbHNlO1xuICAgIGlmIChjdXJyZW50UXVldWUubGVuZ3RoKSB7XG4gICAgICAgIHF1ZXVlID0gY3VycmVudFF1ZXVlLmNvbmNhdChxdWV1ZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcXVldWVJbmRleCA9IC0xO1xuICAgIH1cbiAgICBpZiAocXVldWUubGVuZ3RoKSB7XG4gICAgICAgIGRyYWluUXVldWUoKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGRyYWluUXVldWUoKSB7XG4gICAgaWYgKGRyYWluaW5nKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdmFyIHRpbWVvdXQgPSBydW5UaW1lb3V0KGNsZWFuVXBOZXh0VGljayk7XG4gICAgZHJhaW5pbmcgPSB0cnVlO1xuXG4gICAgdmFyIGxlbiA9IHF1ZXVlLmxlbmd0aDtcbiAgICB3aGlsZShsZW4pIHtcbiAgICAgICAgY3VycmVudFF1ZXVlID0gcXVldWU7XG4gICAgICAgIHF1ZXVlID0gW107XG4gICAgICAgIHdoaWxlICgrK3F1ZXVlSW5kZXggPCBsZW4pIHtcbiAgICAgICAgICAgIGlmIChjdXJyZW50UXVldWUpIHtcbiAgICAgICAgICAgICAgICBjdXJyZW50UXVldWVbcXVldWVJbmRleF0ucnVuKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcXVldWVJbmRleCA9IC0xO1xuICAgICAgICBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgfVxuICAgIGN1cnJlbnRRdWV1ZSA9IG51bGw7XG4gICAgZHJhaW5pbmcgPSBmYWxzZTtcbiAgICBydW5DbGVhclRpbWVvdXQodGltZW91dCk7XG59XG5cbnByb2Nlc3MubmV4dFRpY2sgPSBmdW5jdGlvbiAoZnVuKSB7XG4gICAgdmFyIGFyZ3MgPSBuZXcgQXJyYXkoYXJndW1lbnRzLmxlbmd0aCAtIDEpO1xuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMSkge1xuICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgYXJnc1tpIC0gMV0gPSBhcmd1bWVudHNbaV07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcXVldWUucHVzaChuZXcgSXRlbShmdW4sIGFyZ3MpKTtcbiAgICBpZiAocXVldWUubGVuZ3RoID09PSAxICYmICFkcmFpbmluZykge1xuICAgICAgICBydW5UaW1lb3V0KGRyYWluUXVldWUpO1xuICAgIH1cbn07XG5cbi8vIHY4IGxpa2VzIHByZWRpY3RpYmxlIG9iamVjdHNcbmZ1bmN0aW9uIEl0ZW0oZnVuLCBhcnJheSkge1xuICAgIHRoaXMuZnVuID0gZnVuO1xuICAgIHRoaXMuYXJyYXkgPSBhcnJheTtcbn1cbkl0ZW0ucHJvdG90eXBlLnJ1biA9IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLmZ1bi5hcHBseShudWxsLCB0aGlzLmFycmF5KTtcbn07XG5wcm9jZXNzLnRpdGxlID0gJ2Jyb3dzZXInO1xucHJvY2Vzcy5icm93c2VyID0gdHJ1ZTtcbnByb2Nlc3MuZW52ID0ge307XG5wcm9jZXNzLmFyZ3YgPSBbXTtcbnByb2Nlc3MudmVyc2lvbiA9ICcnOyAvLyBlbXB0eSBzdHJpbmcgdG8gYXZvaWQgcmVnZXhwIGlzc3Vlc1xucHJvY2Vzcy52ZXJzaW9ucyA9IHt9O1xuXG5mdW5jdGlvbiBub29wKCkge31cblxucHJvY2Vzcy5vbiA9IG5vb3A7XG5wcm9jZXNzLmFkZExpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3Mub25jZSA9IG5vb3A7XG5wcm9jZXNzLm9mZiA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUxpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlQWxsTGlzdGVuZXJzID0gbm9vcDtcbnByb2Nlc3MuZW1pdCA9IG5vb3A7XG5cbnByb2Nlc3MuYmluZGluZyA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmJpbmRpbmcgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcblxucHJvY2Vzcy5jd2QgPSBmdW5jdGlvbiAoKSB7IHJldHVybiAnLycgfTtcbnByb2Nlc3MuY2hkaXIgPSBmdW5jdGlvbiAoZGlyKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmNoZGlyIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5wcm9jZXNzLnVtYXNrID0gZnVuY3Rpb24oKSB7IHJldHVybiAwOyB9O1xuIiwiLy8gICAgIFVuZGVyc2NvcmUuanMgMS44LjNcbi8vICAgICBodHRwOi8vdW5kZXJzY29yZWpzLm9yZ1xuLy8gICAgIChjKSAyMDA5LTIwMTUgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbi8vICAgICBVbmRlcnNjb3JlIG1heSBiZSBmcmVlbHkgZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIE1JVCBsaWNlbnNlLlxuXG4oZnVuY3Rpb24oKSB7XG5cbiAgLy8gQmFzZWxpbmUgc2V0dXBcbiAgLy8gLS0tLS0tLS0tLS0tLS1cblxuICAvLyBFc3RhYmxpc2ggdGhlIHJvb3Qgb2JqZWN0LCBgd2luZG93YCBpbiB0aGUgYnJvd3Nlciwgb3IgYGV4cG9ydHNgIG9uIHRoZSBzZXJ2ZXIuXG4gIHZhciByb290ID0gdGhpcztcblxuICAvLyBTYXZlIHRoZSBwcmV2aW91cyB2YWx1ZSBvZiB0aGUgYF9gIHZhcmlhYmxlLlxuICB2YXIgcHJldmlvdXNVbmRlcnNjb3JlID0gcm9vdC5fO1xuXG4gIC8vIFNhdmUgYnl0ZXMgaW4gdGhlIG1pbmlmaWVkIChidXQgbm90IGd6aXBwZWQpIHZlcnNpb246XG4gIHZhciBBcnJheVByb3RvID0gQXJyYXkucHJvdG90eXBlLCBPYmpQcm90byA9IE9iamVjdC5wcm90b3R5cGUsIEZ1bmNQcm90byA9IEZ1bmN0aW9uLnByb3RvdHlwZTtcblxuICAvLyBDcmVhdGUgcXVpY2sgcmVmZXJlbmNlIHZhcmlhYmxlcyBmb3Igc3BlZWQgYWNjZXNzIHRvIGNvcmUgcHJvdG90eXBlcy5cbiAgdmFyXG4gICAgcHVzaCAgICAgICAgICAgICA9IEFycmF5UHJvdG8ucHVzaCxcbiAgICBzbGljZSAgICAgICAgICAgID0gQXJyYXlQcm90by5zbGljZSxcbiAgICB0b1N0cmluZyAgICAgICAgID0gT2JqUHJvdG8udG9TdHJpbmcsXG4gICAgaGFzT3duUHJvcGVydHkgICA9IE9ialByb3RvLmhhc093blByb3BlcnR5O1xuXG4gIC8vIEFsbCAqKkVDTUFTY3JpcHQgNSoqIG5hdGl2ZSBmdW5jdGlvbiBpbXBsZW1lbnRhdGlvbnMgdGhhdCB3ZSBob3BlIHRvIHVzZVxuICAvLyBhcmUgZGVjbGFyZWQgaGVyZS5cbiAgdmFyXG4gICAgbmF0aXZlSXNBcnJheSAgICAgID0gQXJyYXkuaXNBcnJheSxcbiAgICBuYXRpdmVLZXlzICAgICAgICAgPSBPYmplY3Qua2V5cyxcbiAgICBuYXRpdmVCaW5kICAgICAgICAgPSBGdW5jUHJvdG8uYmluZCxcbiAgICBuYXRpdmVDcmVhdGUgICAgICAgPSBPYmplY3QuY3JlYXRlO1xuXG4gIC8vIE5ha2VkIGZ1bmN0aW9uIHJlZmVyZW5jZSBmb3Igc3Vycm9nYXRlLXByb3RvdHlwZS1zd2FwcGluZy5cbiAgdmFyIEN0b3IgPSBmdW5jdGlvbigpe307XG5cbiAgLy8gQ3JlYXRlIGEgc2FmZSByZWZlcmVuY2UgdG8gdGhlIFVuZGVyc2NvcmUgb2JqZWN0IGZvciB1c2UgYmVsb3cuXG4gIHZhciBfID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgaWYgKG9iaiBpbnN0YW5jZW9mIF8pIHJldHVybiBvYmo7XG4gICAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIF8pKSByZXR1cm4gbmV3IF8ob2JqKTtcbiAgICB0aGlzLl93cmFwcGVkID0gb2JqO1xuICB9O1xuXG4gIC8vIEV4cG9ydCB0aGUgVW5kZXJzY29yZSBvYmplY3QgZm9yICoqTm9kZS5qcyoqLCB3aXRoXG4gIC8vIGJhY2t3YXJkcy1jb21wYXRpYmlsaXR5IGZvciB0aGUgb2xkIGByZXF1aXJlKClgIEFQSS4gSWYgd2UncmUgaW5cbiAgLy8gdGhlIGJyb3dzZXIsIGFkZCBgX2AgYXMgYSBnbG9iYWwgb2JqZWN0LlxuICBpZiAodHlwZW9mIGV4cG9ydHMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgaWYgKHR5cGVvZiBtb2R1bGUgIT09ICd1bmRlZmluZWQnICYmIG1vZHVsZS5leHBvcnRzKSB7XG4gICAgICBleHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSBfO1xuICAgIH1cbiAgICBleHBvcnRzLl8gPSBfO1xuICB9IGVsc2Uge1xuICAgIHJvb3QuXyA9IF87XG4gIH1cblxuICAvLyBDdXJyZW50IHZlcnNpb24uXG4gIF8uVkVSU0lPTiA9ICcxLjguMyc7XG5cbiAgLy8gSW50ZXJuYWwgZnVuY3Rpb24gdGhhdCByZXR1cm5zIGFuIGVmZmljaWVudCAoZm9yIGN1cnJlbnQgZW5naW5lcykgdmVyc2lvblxuICAvLyBvZiB0aGUgcGFzc2VkLWluIGNhbGxiYWNrLCB0byBiZSByZXBlYXRlZGx5IGFwcGxpZWQgaW4gb3RoZXIgVW5kZXJzY29yZVxuICAvLyBmdW5jdGlvbnMuXG4gIHZhciBvcHRpbWl6ZUNiID0gZnVuY3Rpb24oZnVuYywgY29udGV4dCwgYXJnQ291bnQpIHtcbiAgICBpZiAoY29udGV4dCA9PT0gdm9pZCAwKSByZXR1cm4gZnVuYztcbiAgICBzd2l0Y2ggKGFyZ0NvdW50ID09IG51bGwgPyAzIDogYXJnQ291bnQpIHtcbiAgICAgIGNhc2UgMTogcmV0dXJuIGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgIHJldHVybiBmdW5jLmNhbGwoY29udGV4dCwgdmFsdWUpO1xuICAgICAgfTtcbiAgICAgIGNhc2UgMjogcmV0dXJuIGZ1bmN0aW9uKHZhbHVlLCBvdGhlcikge1xuICAgICAgICByZXR1cm4gZnVuYy5jYWxsKGNvbnRleHQsIHZhbHVlLCBvdGhlcik7XG4gICAgICB9O1xuICAgICAgY2FzZSAzOiByZXR1cm4gZnVuY3Rpb24odmFsdWUsIGluZGV4LCBjb2xsZWN0aW9uKSB7XG4gICAgICAgIHJldHVybiBmdW5jLmNhbGwoY29udGV4dCwgdmFsdWUsIGluZGV4LCBjb2xsZWN0aW9uKTtcbiAgICAgIH07XG4gICAgICBjYXNlIDQ6IHJldHVybiBmdW5jdGlvbihhY2N1bXVsYXRvciwgdmFsdWUsIGluZGV4LCBjb2xsZWN0aW9uKSB7XG4gICAgICAgIHJldHVybiBmdW5jLmNhbGwoY29udGV4dCwgYWNjdW11bGF0b3IsIHZhbHVlLCBpbmRleCwgY29sbGVjdGlvbik7XG4gICAgICB9O1xuICAgIH1cbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gZnVuYy5hcHBseShjb250ZXh0LCBhcmd1bWVudHMpO1xuICAgIH07XG4gIH07XG5cbiAgLy8gQSBtb3N0bHktaW50ZXJuYWwgZnVuY3Rpb24gdG8gZ2VuZXJhdGUgY2FsbGJhY2tzIHRoYXQgY2FuIGJlIGFwcGxpZWRcbiAgLy8gdG8gZWFjaCBlbGVtZW50IGluIGEgY29sbGVjdGlvbiwgcmV0dXJuaW5nIHRoZSBkZXNpcmVkIHJlc3VsdCDigJQgZWl0aGVyXG4gIC8vIGlkZW50aXR5LCBhbiBhcmJpdHJhcnkgY2FsbGJhY2ssIGEgcHJvcGVydHkgbWF0Y2hlciwgb3IgYSBwcm9wZXJ0eSBhY2Nlc3Nvci5cbiAgdmFyIGNiID0gZnVuY3Rpb24odmFsdWUsIGNvbnRleHQsIGFyZ0NvdW50KSB7XG4gICAgaWYgKHZhbHVlID09IG51bGwpIHJldHVybiBfLmlkZW50aXR5O1xuICAgIGlmIChfLmlzRnVuY3Rpb24odmFsdWUpKSByZXR1cm4gb3B0aW1pemVDYih2YWx1ZSwgY29udGV4dCwgYXJnQ291bnQpO1xuICAgIGlmIChfLmlzT2JqZWN0KHZhbHVlKSkgcmV0dXJuIF8ubWF0Y2hlcih2YWx1ZSk7XG4gICAgcmV0dXJuIF8ucHJvcGVydHkodmFsdWUpO1xuICB9O1xuICBfLml0ZXJhdGVlID0gZnVuY3Rpb24odmFsdWUsIGNvbnRleHQpIHtcbiAgICByZXR1cm4gY2IodmFsdWUsIGNvbnRleHQsIEluZmluaXR5KTtcbiAgfTtcblxuICAvLyBBbiBpbnRlcm5hbCBmdW5jdGlvbiBmb3IgY3JlYXRpbmcgYXNzaWduZXIgZnVuY3Rpb25zLlxuICB2YXIgY3JlYXRlQXNzaWduZXIgPSBmdW5jdGlvbihrZXlzRnVuYywgdW5kZWZpbmVkT25seSkge1xuICAgIHJldHVybiBmdW5jdGlvbihvYmopIHtcbiAgICAgIHZhciBsZW5ndGggPSBhcmd1bWVudHMubGVuZ3RoO1xuICAgICAgaWYgKGxlbmd0aCA8IDIgfHwgb2JqID09IG51bGwpIHJldHVybiBvYmo7XG4gICAgICBmb3IgKHZhciBpbmRleCA9IDE7IGluZGV4IDwgbGVuZ3RoOyBpbmRleCsrKSB7XG4gICAgICAgIHZhciBzb3VyY2UgPSBhcmd1bWVudHNbaW5kZXhdLFxuICAgICAgICAgICAga2V5cyA9IGtleXNGdW5jKHNvdXJjZSksXG4gICAgICAgICAgICBsID0ga2V5cy5sZW5ndGg7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgICAgdmFyIGtleSA9IGtleXNbaV07XG4gICAgICAgICAgaWYgKCF1bmRlZmluZWRPbmx5IHx8IG9ialtrZXldID09PSB2b2lkIDApIG9ialtrZXldID0gc291cmNlW2tleV07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBvYmo7XG4gICAgfTtcbiAgfTtcblxuICAvLyBBbiBpbnRlcm5hbCBmdW5jdGlvbiBmb3IgY3JlYXRpbmcgYSBuZXcgb2JqZWN0IHRoYXQgaW5oZXJpdHMgZnJvbSBhbm90aGVyLlxuICB2YXIgYmFzZUNyZWF0ZSA9IGZ1bmN0aW9uKHByb3RvdHlwZSkge1xuICAgIGlmICghXy5pc09iamVjdChwcm90b3R5cGUpKSByZXR1cm4ge307XG4gICAgaWYgKG5hdGl2ZUNyZWF0ZSkgcmV0dXJuIG5hdGl2ZUNyZWF0ZShwcm90b3R5cGUpO1xuICAgIEN0b3IucHJvdG90eXBlID0gcHJvdG90eXBlO1xuICAgIHZhciByZXN1bHQgPSBuZXcgQ3RvcjtcbiAgICBDdG9yLnByb3RvdHlwZSA9IG51bGw7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfTtcblxuICB2YXIgcHJvcGVydHkgPSBmdW5jdGlvbihrZXkpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24ob2JqKSB7XG4gICAgICByZXR1cm4gb2JqID09IG51bGwgPyB2b2lkIDAgOiBvYmpba2V5XTtcbiAgICB9O1xuICB9O1xuXG4gIC8vIEhlbHBlciBmb3IgY29sbGVjdGlvbiBtZXRob2RzIHRvIGRldGVybWluZSB3aGV0aGVyIGEgY29sbGVjdGlvblxuICAvLyBzaG91bGQgYmUgaXRlcmF0ZWQgYXMgYW4gYXJyYXkgb3IgYXMgYW4gb2JqZWN0XG4gIC8vIFJlbGF0ZWQ6IGh0dHA6Ly9wZW9wbGUubW96aWxsYS5vcmcvfmpvcmVuZG9yZmYvZXM2LWRyYWZ0Lmh0bWwjc2VjLXRvbGVuZ3RoXG4gIC8vIEF2b2lkcyBhIHZlcnkgbmFzdHkgaU9TIDggSklUIGJ1ZyBvbiBBUk0tNjQuICMyMDk0XG4gIHZhciBNQVhfQVJSQVlfSU5ERVggPSBNYXRoLnBvdygyLCA1MykgLSAxO1xuICB2YXIgZ2V0TGVuZ3RoID0gcHJvcGVydHkoJ2xlbmd0aCcpO1xuICB2YXIgaXNBcnJheUxpa2UgPSBmdW5jdGlvbihjb2xsZWN0aW9uKSB7XG4gICAgdmFyIGxlbmd0aCA9IGdldExlbmd0aChjb2xsZWN0aW9uKTtcbiAgICByZXR1cm4gdHlwZW9mIGxlbmd0aCA9PSAnbnVtYmVyJyAmJiBsZW5ndGggPj0gMCAmJiBsZW5ndGggPD0gTUFYX0FSUkFZX0lOREVYO1xuICB9O1xuXG4gIC8vIENvbGxlY3Rpb24gRnVuY3Rpb25zXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgLy8gVGhlIGNvcm5lcnN0b25lLCBhbiBgZWFjaGAgaW1wbGVtZW50YXRpb24sIGFrYSBgZm9yRWFjaGAuXG4gIC8vIEhhbmRsZXMgcmF3IG9iamVjdHMgaW4gYWRkaXRpb24gdG8gYXJyYXktbGlrZXMuIFRyZWF0cyBhbGxcbiAgLy8gc3BhcnNlIGFycmF5LWxpa2VzIGFzIGlmIHRoZXkgd2VyZSBkZW5zZS5cbiAgXy5lYWNoID0gXy5mb3JFYWNoID0gZnVuY3Rpb24ob2JqLCBpdGVyYXRlZSwgY29udGV4dCkge1xuICAgIGl0ZXJhdGVlID0gb3B0aW1pemVDYihpdGVyYXRlZSwgY29udGV4dCk7XG4gICAgdmFyIGksIGxlbmd0aDtcbiAgICBpZiAoaXNBcnJheUxpa2Uob2JqKSkge1xuICAgICAgZm9yIChpID0gMCwgbGVuZ3RoID0gb2JqLmxlbmd0aDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGl0ZXJhdGVlKG9ialtpXSwgaSwgb2JqKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIGtleXMgPSBfLmtleXMob2JqKTtcbiAgICAgIGZvciAoaSA9IDAsIGxlbmd0aCA9IGtleXMubGVuZ3RoOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaXRlcmF0ZWUob2JqW2tleXNbaV1dLCBrZXlzW2ldLCBvYmopO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gb2JqO1xuICB9O1xuXG4gIC8vIFJldHVybiB0aGUgcmVzdWx0cyBvZiBhcHBseWluZyB0aGUgaXRlcmF0ZWUgdG8gZWFjaCBlbGVtZW50LlxuICBfLm1hcCA9IF8uY29sbGVjdCA9IGZ1bmN0aW9uKG9iaiwgaXRlcmF0ZWUsIGNvbnRleHQpIHtcbiAgICBpdGVyYXRlZSA9IGNiKGl0ZXJhdGVlLCBjb250ZXh0KTtcbiAgICB2YXIga2V5cyA9ICFpc0FycmF5TGlrZShvYmopICYmIF8ua2V5cyhvYmopLFxuICAgICAgICBsZW5ndGggPSAoa2V5cyB8fCBvYmopLmxlbmd0aCxcbiAgICAgICAgcmVzdWx0cyA9IEFycmF5KGxlbmd0aCk7XG4gICAgZm9yICh2YXIgaW5kZXggPSAwOyBpbmRleCA8IGxlbmd0aDsgaW5kZXgrKykge1xuICAgICAgdmFyIGN1cnJlbnRLZXkgPSBrZXlzID8ga2V5c1tpbmRleF0gOiBpbmRleDtcbiAgICAgIHJlc3VsdHNbaW5kZXhdID0gaXRlcmF0ZWUob2JqW2N1cnJlbnRLZXldLCBjdXJyZW50S2V5LCBvYmopO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0cztcbiAgfTtcblxuICAvLyBDcmVhdGUgYSByZWR1Y2luZyBmdW5jdGlvbiBpdGVyYXRpbmcgbGVmdCBvciByaWdodC5cbiAgZnVuY3Rpb24gY3JlYXRlUmVkdWNlKGRpcikge1xuICAgIC8vIE9wdGltaXplZCBpdGVyYXRvciBmdW5jdGlvbiBhcyB1c2luZyBhcmd1bWVudHMubGVuZ3RoXG4gICAgLy8gaW4gdGhlIG1haW4gZnVuY3Rpb24gd2lsbCBkZW9wdGltaXplIHRoZSwgc2VlICMxOTkxLlxuICAgIGZ1bmN0aW9uIGl0ZXJhdG9yKG9iaiwgaXRlcmF0ZWUsIG1lbW8sIGtleXMsIGluZGV4LCBsZW5ndGgpIHtcbiAgICAgIGZvciAoOyBpbmRleCA+PSAwICYmIGluZGV4IDwgbGVuZ3RoOyBpbmRleCArPSBkaXIpIHtcbiAgICAgICAgdmFyIGN1cnJlbnRLZXkgPSBrZXlzID8ga2V5c1tpbmRleF0gOiBpbmRleDtcbiAgICAgICAgbWVtbyA9IGl0ZXJhdGVlKG1lbW8sIG9ialtjdXJyZW50S2V5XSwgY3VycmVudEtleSwgb2JqKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBtZW1vO1xuICAgIH1cblxuICAgIHJldHVybiBmdW5jdGlvbihvYmosIGl0ZXJhdGVlLCBtZW1vLCBjb250ZXh0KSB7XG4gICAgICBpdGVyYXRlZSA9IG9wdGltaXplQ2IoaXRlcmF0ZWUsIGNvbnRleHQsIDQpO1xuICAgICAgdmFyIGtleXMgPSAhaXNBcnJheUxpa2Uob2JqKSAmJiBfLmtleXMob2JqKSxcbiAgICAgICAgICBsZW5ndGggPSAoa2V5cyB8fCBvYmopLmxlbmd0aCxcbiAgICAgICAgICBpbmRleCA9IGRpciA+IDAgPyAwIDogbGVuZ3RoIC0gMTtcbiAgICAgIC8vIERldGVybWluZSB0aGUgaW5pdGlhbCB2YWx1ZSBpZiBub25lIGlzIHByb3ZpZGVkLlxuICAgICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPCAzKSB7XG4gICAgICAgIG1lbW8gPSBvYmpba2V5cyA/IGtleXNbaW5kZXhdIDogaW5kZXhdO1xuICAgICAgICBpbmRleCArPSBkaXI7XG4gICAgICB9XG4gICAgICByZXR1cm4gaXRlcmF0b3Iob2JqLCBpdGVyYXRlZSwgbWVtbywga2V5cywgaW5kZXgsIGxlbmd0aCk7XG4gICAgfTtcbiAgfVxuXG4gIC8vICoqUmVkdWNlKiogYnVpbGRzIHVwIGEgc2luZ2xlIHJlc3VsdCBmcm9tIGEgbGlzdCBvZiB2YWx1ZXMsIGFrYSBgaW5qZWN0YCxcbiAgLy8gb3IgYGZvbGRsYC5cbiAgXy5yZWR1Y2UgPSBfLmZvbGRsID0gXy5pbmplY3QgPSBjcmVhdGVSZWR1Y2UoMSk7XG5cbiAgLy8gVGhlIHJpZ2h0LWFzc29jaWF0aXZlIHZlcnNpb24gb2YgcmVkdWNlLCBhbHNvIGtub3duIGFzIGBmb2xkcmAuXG4gIF8ucmVkdWNlUmlnaHQgPSBfLmZvbGRyID0gY3JlYXRlUmVkdWNlKC0xKTtcblxuICAvLyBSZXR1cm4gdGhlIGZpcnN0IHZhbHVlIHdoaWNoIHBhc3NlcyBhIHRydXRoIHRlc3QuIEFsaWFzZWQgYXMgYGRldGVjdGAuXG4gIF8uZmluZCA9IF8uZGV0ZWN0ID0gZnVuY3Rpb24ob2JqLCBwcmVkaWNhdGUsIGNvbnRleHQpIHtcbiAgICB2YXIga2V5O1xuICAgIGlmIChpc0FycmF5TGlrZShvYmopKSB7XG4gICAgICBrZXkgPSBfLmZpbmRJbmRleChvYmosIHByZWRpY2F0ZSwgY29udGV4dCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGtleSA9IF8uZmluZEtleShvYmosIHByZWRpY2F0ZSwgY29udGV4dCk7XG4gICAgfVxuICAgIGlmIChrZXkgIT09IHZvaWQgMCAmJiBrZXkgIT09IC0xKSByZXR1cm4gb2JqW2tleV07XG4gIH07XG5cbiAgLy8gUmV0dXJuIGFsbCB0aGUgZWxlbWVudHMgdGhhdCBwYXNzIGEgdHJ1dGggdGVzdC5cbiAgLy8gQWxpYXNlZCBhcyBgc2VsZWN0YC5cbiAgXy5maWx0ZXIgPSBfLnNlbGVjdCA9IGZ1bmN0aW9uKG9iaiwgcHJlZGljYXRlLCBjb250ZXh0KSB7XG4gICAgdmFyIHJlc3VsdHMgPSBbXTtcbiAgICBwcmVkaWNhdGUgPSBjYihwcmVkaWNhdGUsIGNvbnRleHQpO1xuICAgIF8uZWFjaChvYmosIGZ1bmN0aW9uKHZhbHVlLCBpbmRleCwgbGlzdCkge1xuICAgICAgaWYgKHByZWRpY2F0ZSh2YWx1ZSwgaW5kZXgsIGxpc3QpKSByZXN1bHRzLnB1c2godmFsdWUpO1xuICAgIH0pO1xuICAgIHJldHVybiByZXN1bHRzO1xuICB9O1xuXG4gIC8vIFJldHVybiBhbGwgdGhlIGVsZW1lbnRzIGZvciB3aGljaCBhIHRydXRoIHRlc3QgZmFpbHMuXG4gIF8ucmVqZWN0ID0gZnVuY3Rpb24ob2JqLCBwcmVkaWNhdGUsIGNvbnRleHQpIHtcbiAgICByZXR1cm4gXy5maWx0ZXIob2JqLCBfLm5lZ2F0ZShjYihwcmVkaWNhdGUpKSwgY29udGV4dCk7XG4gIH07XG5cbiAgLy8gRGV0ZXJtaW5lIHdoZXRoZXIgYWxsIG9mIHRoZSBlbGVtZW50cyBtYXRjaCBhIHRydXRoIHRlc3QuXG4gIC8vIEFsaWFzZWQgYXMgYGFsbGAuXG4gIF8uZXZlcnkgPSBfLmFsbCA9IGZ1bmN0aW9uKG9iaiwgcHJlZGljYXRlLCBjb250ZXh0KSB7XG4gICAgcHJlZGljYXRlID0gY2IocHJlZGljYXRlLCBjb250ZXh0KTtcbiAgICB2YXIga2V5cyA9ICFpc0FycmF5TGlrZShvYmopICYmIF8ua2V5cyhvYmopLFxuICAgICAgICBsZW5ndGggPSAoa2V5cyB8fCBvYmopLmxlbmd0aDtcbiAgICBmb3IgKHZhciBpbmRleCA9IDA7IGluZGV4IDwgbGVuZ3RoOyBpbmRleCsrKSB7XG4gICAgICB2YXIgY3VycmVudEtleSA9IGtleXMgPyBrZXlzW2luZGV4XSA6IGluZGV4O1xuICAgICAgaWYgKCFwcmVkaWNhdGUob2JqW2N1cnJlbnRLZXldLCBjdXJyZW50S2V5LCBvYmopKSByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xuICB9O1xuXG4gIC8vIERldGVybWluZSBpZiBhdCBsZWFzdCBvbmUgZWxlbWVudCBpbiB0aGUgb2JqZWN0IG1hdGNoZXMgYSB0cnV0aCB0ZXN0LlxuICAvLyBBbGlhc2VkIGFzIGBhbnlgLlxuICBfLnNvbWUgPSBfLmFueSA9IGZ1bmN0aW9uKG9iaiwgcHJlZGljYXRlLCBjb250ZXh0KSB7XG4gICAgcHJlZGljYXRlID0gY2IocHJlZGljYXRlLCBjb250ZXh0KTtcbiAgICB2YXIga2V5cyA9ICFpc0FycmF5TGlrZShvYmopICYmIF8ua2V5cyhvYmopLFxuICAgICAgICBsZW5ndGggPSAoa2V5cyB8fCBvYmopLmxlbmd0aDtcbiAgICBmb3IgKHZhciBpbmRleCA9IDA7IGluZGV4IDwgbGVuZ3RoOyBpbmRleCsrKSB7XG4gICAgICB2YXIgY3VycmVudEtleSA9IGtleXMgPyBrZXlzW2luZGV4XSA6IGluZGV4O1xuICAgICAgaWYgKHByZWRpY2F0ZShvYmpbY3VycmVudEtleV0sIGN1cnJlbnRLZXksIG9iaikpIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG4gIH07XG5cbiAgLy8gRGV0ZXJtaW5lIGlmIHRoZSBhcnJheSBvciBvYmplY3QgY29udGFpbnMgYSBnaXZlbiBpdGVtICh1c2luZyBgPT09YCkuXG4gIC8vIEFsaWFzZWQgYXMgYGluY2x1ZGVzYCBhbmQgYGluY2x1ZGVgLlxuICBfLmNvbnRhaW5zID0gXy5pbmNsdWRlcyA9IF8uaW5jbHVkZSA9IGZ1bmN0aW9uKG9iaiwgaXRlbSwgZnJvbUluZGV4LCBndWFyZCkge1xuICAgIGlmICghaXNBcnJheUxpa2Uob2JqKSkgb2JqID0gXy52YWx1ZXMob2JqKTtcbiAgICBpZiAodHlwZW9mIGZyb21JbmRleCAhPSAnbnVtYmVyJyB8fCBndWFyZCkgZnJvbUluZGV4ID0gMDtcbiAgICByZXR1cm4gXy5pbmRleE9mKG9iaiwgaXRlbSwgZnJvbUluZGV4KSA+PSAwO1xuICB9O1xuXG4gIC8vIEludm9rZSBhIG1ldGhvZCAod2l0aCBhcmd1bWVudHMpIG9uIGV2ZXJ5IGl0ZW0gaW4gYSBjb2xsZWN0aW9uLlxuICBfLmludm9rZSA9IGZ1bmN0aW9uKG9iaiwgbWV0aG9kKSB7XG4gICAgdmFyIGFyZ3MgPSBzbGljZS5jYWxsKGFyZ3VtZW50cywgMik7XG4gICAgdmFyIGlzRnVuYyA9IF8uaXNGdW5jdGlvbihtZXRob2QpO1xuICAgIHJldHVybiBfLm1hcChvYmosIGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICB2YXIgZnVuYyA9IGlzRnVuYyA/IG1ldGhvZCA6IHZhbHVlW21ldGhvZF07XG4gICAgICByZXR1cm4gZnVuYyA9PSBudWxsID8gZnVuYyA6IGZ1bmMuYXBwbHkodmFsdWUsIGFyZ3MpO1xuICAgIH0pO1xuICB9O1xuXG4gIC8vIENvbnZlbmllbmNlIHZlcnNpb24gb2YgYSBjb21tb24gdXNlIGNhc2Ugb2YgYG1hcGA6IGZldGNoaW5nIGEgcHJvcGVydHkuXG4gIF8ucGx1Y2sgPSBmdW5jdGlvbihvYmosIGtleSkge1xuICAgIHJldHVybiBfLm1hcChvYmosIF8ucHJvcGVydHkoa2V5KSk7XG4gIH07XG5cbiAgLy8gQ29udmVuaWVuY2UgdmVyc2lvbiBvZiBhIGNvbW1vbiB1c2UgY2FzZSBvZiBgZmlsdGVyYDogc2VsZWN0aW5nIG9ubHkgb2JqZWN0c1xuICAvLyBjb250YWluaW5nIHNwZWNpZmljIGBrZXk6dmFsdWVgIHBhaXJzLlxuICBfLndoZXJlID0gZnVuY3Rpb24ob2JqLCBhdHRycykge1xuICAgIHJldHVybiBfLmZpbHRlcihvYmosIF8ubWF0Y2hlcihhdHRycykpO1xuICB9O1xuXG4gIC8vIENvbnZlbmllbmNlIHZlcnNpb24gb2YgYSBjb21tb24gdXNlIGNhc2Ugb2YgYGZpbmRgOiBnZXR0aW5nIHRoZSBmaXJzdCBvYmplY3RcbiAgLy8gY29udGFpbmluZyBzcGVjaWZpYyBga2V5OnZhbHVlYCBwYWlycy5cbiAgXy5maW5kV2hlcmUgPSBmdW5jdGlvbihvYmosIGF0dHJzKSB7XG4gICAgcmV0dXJuIF8uZmluZChvYmosIF8ubWF0Y2hlcihhdHRycykpO1xuICB9O1xuXG4gIC8vIFJldHVybiB0aGUgbWF4aW11bSBlbGVtZW50IChvciBlbGVtZW50LWJhc2VkIGNvbXB1dGF0aW9uKS5cbiAgXy5tYXggPSBmdW5jdGlvbihvYmosIGl0ZXJhdGVlLCBjb250ZXh0KSB7XG4gICAgdmFyIHJlc3VsdCA9IC1JbmZpbml0eSwgbGFzdENvbXB1dGVkID0gLUluZmluaXR5LFxuICAgICAgICB2YWx1ZSwgY29tcHV0ZWQ7XG4gICAgaWYgKGl0ZXJhdGVlID09IG51bGwgJiYgb2JqICE9IG51bGwpIHtcbiAgICAgIG9iaiA9IGlzQXJyYXlMaWtlKG9iaikgPyBvYmogOiBfLnZhbHVlcyhvYmopO1xuICAgICAgZm9yICh2YXIgaSA9IDAsIGxlbmd0aCA9IG9iai5sZW5ndGg7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgICB2YWx1ZSA9IG9ialtpXTtcbiAgICAgICAgaWYgKHZhbHVlID4gcmVzdWx0KSB7XG4gICAgICAgICAgcmVzdWx0ID0gdmFsdWU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgaXRlcmF0ZWUgPSBjYihpdGVyYXRlZSwgY29udGV4dCk7XG4gICAgICBfLmVhY2gob2JqLCBmdW5jdGlvbih2YWx1ZSwgaW5kZXgsIGxpc3QpIHtcbiAgICAgICAgY29tcHV0ZWQgPSBpdGVyYXRlZSh2YWx1ZSwgaW5kZXgsIGxpc3QpO1xuICAgICAgICBpZiAoY29tcHV0ZWQgPiBsYXN0Q29tcHV0ZWQgfHwgY29tcHV0ZWQgPT09IC1JbmZpbml0eSAmJiByZXN1bHQgPT09IC1JbmZpbml0eSkge1xuICAgICAgICAgIHJlc3VsdCA9IHZhbHVlO1xuICAgICAgICAgIGxhc3RDb21wdXRlZCA9IGNvbXB1dGVkO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfTtcblxuICAvLyBSZXR1cm4gdGhlIG1pbmltdW0gZWxlbWVudCAob3IgZWxlbWVudC1iYXNlZCBjb21wdXRhdGlvbikuXG4gIF8ubWluID0gZnVuY3Rpb24ob2JqLCBpdGVyYXRlZSwgY29udGV4dCkge1xuICAgIHZhciByZXN1bHQgPSBJbmZpbml0eSwgbGFzdENvbXB1dGVkID0gSW5maW5pdHksXG4gICAgICAgIHZhbHVlLCBjb21wdXRlZDtcbiAgICBpZiAoaXRlcmF0ZWUgPT0gbnVsbCAmJiBvYmogIT0gbnVsbCkge1xuICAgICAgb2JqID0gaXNBcnJheUxpa2Uob2JqKSA/IG9iaiA6IF8udmFsdWVzKG9iaik7XG4gICAgICBmb3IgKHZhciBpID0gMCwgbGVuZ3RoID0gb2JqLmxlbmd0aDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhbHVlID0gb2JqW2ldO1xuICAgICAgICBpZiAodmFsdWUgPCByZXN1bHQpIHtcbiAgICAgICAgICByZXN1bHQgPSB2YWx1ZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBpdGVyYXRlZSA9IGNiKGl0ZXJhdGVlLCBjb250ZXh0KTtcbiAgICAgIF8uZWFjaChvYmosIGZ1bmN0aW9uKHZhbHVlLCBpbmRleCwgbGlzdCkge1xuICAgICAgICBjb21wdXRlZCA9IGl0ZXJhdGVlKHZhbHVlLCBpbmRleCwgbGlzdCk7XG4gICAgICAgIGlmIChjb21wdXRlZCA8IGxhc3RDb21wdXRlZCB8fCBjb21wdXRlZCA9PT0gSW5maW5pdHkgJiYgcmVzdWx0ID09PSBJbmZpbml0eSkge1xuICAgICAgICAgIHJlc3VsdCA9IHZhbHVlO1xuICAgICAgICAgIGxhc3RDb21wdXRlZCA9IGNvbXB1dGVkO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfTtcblxuICAvLyBTaHVmZmxlIGEgY29sbGVjdGlvbiwgdXNpbmcgdGhlIG1vZGVybiB2ZXJzaW9uIG9mIHRoZVxuICAvLyBbRmlzaGVyLVlhdGVzIHNodWZmbGVdKGh0dHA6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvRmlzaGVy4oCTWWF0ZXNfc2h1ZmZsZSkuXG4gIF8uc2h1ZmZsZSA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHZhciBzZXQgPSBpc0FycmF5TGlrZShvYmopID8gb2JqIDogXy52YWx1ZXMob2JqKTtcbiAgICB2YXIgbGVuZ3RoID0gc2V0Lmxlbmd0aDtcbiAgICB2YXIgc2h1ZmZsZWQgPSBBcnJheShsZW5ndGgpO1xuICAgIGZvciAodmFyIGluZGV4ID0gMCwgcmFuZDsgaW5kZXggPCBsZW5ndGg7IGluZGV4KyspIHtcbiAgICAgIHJhbmQgPSBfLnJhbmRvbSgwLCBpbmRleCk7XG4gICAgICBpZiAocmFuZCAhPT0gaW5kZXgpIHNodWZmbGVkW2luZGV4XSA9IHNodWZmbGVkW3JhbmRdO1xuICAgICAgc2h1ZmZsZWRbcmFuZF0gPSBzZXRbaW5kZXhdO1xuICAgIH1cbiAgICByZXR1cm4gc2h1ZmZsZWQ7XG4gIH07XG5cbiAgLy8gU2FtcGxlICoqbioqIHJhbmRvbSB2YWx1ZXMgZnJvbSBhIGNvbGxlY3Rpb24uXG4gIC8vIElmICoqbioqIGlzIG5vdCBzcGVjaWZpZWQsIHJldHVybnMgYSBzaW5nbGUgcmFuZG9tIGVsZW1lbnQuXG4gIC8vIFRoZSBpbnRlcm5hbCBgZ3VhcmRgIGFyZ3VtZW50IGFsbG93cyBpdCB0byB3b3JrIHdpdGggYG1hcGAuXG4gIF8uc2FtcGxlID0gZnVuY3Rpb24ob2JqLCBuLCBndWFyZCkge1xuICAgIGlmIChuID09IG51bGwgfHwgZ3VhcmQpIHtcbiAgICAgIGlmICghaXNBcnJheUxpa2Uob2JqKSkgb2JqID0gXy52YWx1ZXMob2JqKTtcbiAgICAgIHJldHVybiBvYmpbXy5yYW5kb20ob2JqLmxlbmd0aCAtIDEpXTtcbiAgICB9XG4gICAgcmV0dXJuIF8uc2h1ZmZsZShvYmopLnNsaWNlKDAsIE1hdGgubWF4KDAsIG4pKTtcbiAgfTtcblxuICAvLyBTb3J0IHRoZSBvYmplY3QncyB2YWx1ZXMgYnkgYSBjcml0ZXJpb24gcHJvZHVjZWQgYnkgYW4gaXRlcmF0ZWUuXG4gIF8uc29ydEJ5ID0gZnVuY3Rpb24ob2JqLCBpdGVyYXRlZSwgY29udGV4dCkge1xuICAgIGl0ZXJhdGVlID0gY2IoaXRlcmF0ZWUsIGNvbnRleHQpO1xuICAgIHJldHVybiBfLnBsdWNrKF8ubWFwKG9iaiwgZnVuY3Rpb24odmFsdWUsIGluZGV4LCBsaXN0KSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICB2YWx1ZTogdmFsdWUsXG4gICAgICAgIGluZGV4OiBpbmRleCxcbiAgICAgICAgY3JpdGVyaWE6IGl0ZXJhdGVlKHZhbHVlLCBpbmRleCwgbGlzdClcbiAgICAgIH07XG4gICAgfSkuc29ydChmdW5jdGlvbihsZWZ0LCByaWdodCkge1xuICAgICAgdmFyIGEgPSBsZWZ0LmNyaXRlcmlhO1xuICAgICAgdmFyIGIgPSByaWdodC5jcml0ZXJpYTtcbiAgICAgIGlmIChhICE9PSBiKSB7XG4gICAgICAgIGlmIChhID4gYiB8fCBhID09PSB2b2lkIDApIHJldHVybiAxO1xuICAgICAgICBpZiAoYSA8IGIgfHwgYiA9PT0gdm9pZCAwKSByZXR1cm4gLTE7XG4gICAgICB9XG4gICAgICByZXR1cm4gbGVmdC5pbmRleCAtIHJpZ2h0LmluZGV4O1xuICAgIH0pLCAndmFsdWUnKTtcbiAgfTtcblxuICAvLyBBbiBpbnRlcm5hbCBmdW5jdGlvbiB1c2VkIGZvciBhZ2dyZWdhdGUgXCJncm91cCBieVwiIG9wZXJhdGlvbnMuXG4gIHZhciBncm91cCA9IGZ1bmN0aW9uKGJlaGF2aW9yKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKG9iaiwgaXRlcmF0ZWUsIGNvbnRleHQpIHtcbiAgICAgIHZhciByZXN1bHQgPSB7fTtcbiAgICAgIGl0ZXJhdGVlID0gY2IoaXRlcmF0ZWUsIGNvbnRleHQpO1xuICAgICAgXy5lYWNoKG9iaiwgZnVuY3Rpb24odmFsdWUsIGluZGV4KSB7XG4gICAgICAgIHZhciBrZXkgPSBpdGVyYXRlZSh2YWx1ZSwgaW5kZXgsIG9iaik7XG4gICAgICAgIGJlaGF2aW9yKHJlc3VsdCwgdmFsdWUsIGtleSk7XG4gICAgICB9KTtcbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfTtcbiAgfTtcblxuICAvLyBHcm91cHMgdGhlIG9iamVjdCdzIHZhbHVlcyBieSBhIGNyaXRlcmlvbi4gUGFzcyBlaXRoZXIgYSBzdHJpbmcgYXR0cmlidXRlXG4gIC8vIHRvIGdyb3VwIGJ5LCBvciBhIGZ1bmN0aW9uIHRoYXQgcmV0dXJucyB0aGUgY3JpdGVyaW9uLlxuICBfLmdyb3VwQnkgPSBncm91cChmdW5jdGlvbihyZXN1bHQsIHZhbHVlLCBrZXkpIHtcbiAgICBpZiAoXy5oYXMocmVzdWx0LCBrZXkpKSByZXN1bHRba2V5XS5wdXNoKHZhbHVlKTsgZWxzZSByZXN1bHRba2V5XSA9IFt2YWx1ZV07XG4gIH0pO1xuXG4gIC8vIEluZGV4ZXMgdGhlIG9iamVjdCdzIHZhbHVlcyBieSBhIGNyaXRlcmlvbiwgc2ltaWxhciB0byBgZ3JvdXBCeWAsIGJ1dCBmb3JcbiAgLy8gd2hlbiB5b3Uga25vdyB0aGF0IHlvdXIgaW5kZXggdmFsdWVzIHdpbGwgYmUgdW5pcXVlLlxuICBfLmluZGV4QnkgPSBncm91cChmdW5jdGlvbihyZXN1bHQsIHZhbHVlLCBrZXkpIHtcbiAgICByZXN1bHRba2V5XSA9IHZhbHVlO1xuICB9KTtcblxuICAvLyBDb3VudHMgaW5zdGFuY2VzIG9mIGFuIG9iamVjdCB0aGF0IGdyb3VwIGJ5IGEgY2VydGFpbiBjcml0ZXJpb24uIFBhc3NcbiAgLy8gZWl0aGVyIGEgc3RyaW5nIGF0dHJpYnV0ZSB0byBjb3VudCBieSwgb3IgYSBmdW5jdGlvbiB0aGF0IHJldHVybnMgdGhlXG4gIC8vIGNyaXRlcmlvbi5cbiAgXy5jb3VudEJ5ID0gZ3JvdXAoZnVuY3Rpb24ocmVzdWx0LCB2YWx1ZSwga2V5KSB7XG4gICAgaWYgKF8uaGFzKHJlc3VsdCwga2V5KSkgcmVzdWx0W2tleV0rKzsgZWxzZSByZXN1bHRba2V5XSA9IDE7XG4gIH0pO1xuXG4gIC8vIFNhZmVseSBjcmVhdGUgYSByZWFsLCBsaXZlIGFycmF5IGZyb20gYW55dGhpbmcgaXRlcmFibGUuXG4gIF8udG9BcnJheSA9IGZ1bmN0aW9uKG9iaikge1xuICAgIGlmICghb2JqKSByZXR1cm4gW107XG4gICAgaWYgKF8uaXNBcnJheShvYmopKSByZXR1cm4gc2xpY2UuY2FsbChvYmopO1xuICAgIGlmIChpc0FycmF5TGlrZShvYmopKSByZXR1cm4gXy5tYXAob2JqLCBfLmlkZW50aXR5KTtcbiAgICByZXR1cm4gXy52YWx1ZXMob2JqKTtcbiAgfTtcblxuICAvLyBSZXR1cm4gdGhlIG51bWJlciBvZiBlbGVtZW50cyBpbiBhbiBvYmplY3QuXG4gIF8uc2l6ZSA9IGZ1bmN0aW9uKG9iaikge1xuICAgIGlmIChvYmogPT0gbnVsbCkgcmV0dXJuIDA7XG4gICAgcmV0dXJuIGlzQXJyYXlMaWtlKG9iaikgPyBvYmoubGVuZ3RoIDogXy5rZXlzKG9iaikubGVuZ3RoO1xuICB9O1xuXG4gIC8vIFNwbGl0IGEgY29sbGVjdGlvbiBpbnRvIHR3byBhcnJheXM6IG9uZSB3aG9zZSBlbGVtZW50cyBhbGwgc2F0aXNmeSB0aGUgZ2l2ZW5cbiAgLy8gcHJlZGljYXRlLCBhbmQgb25lIHdob3NlIGVsZW1lbnRzIGFsbCBkbyBub3Qgc2F0aXNmeSB0aGUgcHJlZGljYXRlLlxuICBfLnBhcnRpdGlvbiA9IGZ1bmN0aW9uKG9iaiwgcHJlZGljYXRlLCBjb250ZXh0KSB7XG4gICAgcHJlZGljYXRlID0gY2IocHJlZGljYXRlLCBjb250ZXh0KTtcbiAgICB2YXIgcGFzcyA9IFtdLCBmYWlsID0gW107XG4gICAgXy5lYWNoKG9iaiwgZnVuY3Rpb24odmFsdWUsIGtleSwgb2JqKSB7XG4gICAgICAocHJlZGljYXRlKHZhbHVlLCBrZXksIG9iaikgPyBwYXNzIDogZmFpbCkucHVzaCh2YWx1ZSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIFtwYXNzLCBmYWlsXTtcbiAgfTtcblxuICAvLyBBcnJheSBGdW5jdGlvbnNcbiAgLy8gLS0tLS0tLS0tLS0tLS0tXG5cbiAgLy8gR2V0IHRoZSBmaXJzdCBlbGVtZW50IG9mIGFuIGFycmF5LiBQYXNzaW5nICoqbioqIHdpbGwgcmV0dXJuIHRoZSBmaXJzdCBOXG4gIC8vIHZhbHVlcyBpbiB0aGUgYXJyYXkuIEFsaWFzZWQgYXMgYGhlYWRgIGFuZCBgdGFrZWAuIFRoZSAqKmd1YXJkKiogY2hlY2tcbiAgLy8gYWxsb3dzIGl0IHRvIHdvcmsgd2l0aCBgXy5tYXBgLlxuICBfLmZpcnN0ID0gXy5oZWFkID0gXy50YWtlID0gZnVuY3Rpb24oYXJyYXksIG4sIGd1YXJkKSB7XG4gICAgaWYgKGFycmF5ID09IG51bGwpIHJldHVybiB2b2lkIDA7XG4gICAgaWYgKG4gPT0gbnVsbCB8fCBndWFyZCkgcmV0dXJuIGFycmF5WzBdO1xuICAgIHJldHVybiBfLmluaXRpYWwoYXJyYXksIGFycmF5Lmxlbmd0aCAtIG4pO1xuICB9O1xuXG4gIC8vIFJldHVybnMgZXZlcnl0aGluZyBidXQgdGhlIGxhc3QgZW50cnkgb2YgdGhlIGFycmF5LiBFc3BlY2lhbGx5IHVzZWZ1bCBvblxuICAvLyB0aGUgYXJndW1lbnRzIG9iamVjdC4gUGFzc2luZyAqKm4qKiB3aWxsIHJldHVybiBhbGwgdGhlIHZhbHVlcyBpblxuICAvLyB0aGUgYXJyYXksIGV4Y2x1ZGluZyB0aGUgbGFzdCBOLlxuICBfLmluaXRpYWwgPSBmdW5jdGlvbihhcnJheSwgbiwgZ3VhcmQpIHtcbiAgICByZXR1cm4gc2xpY2UuY2FsbChhcnJheSwgMCwgTWF0aC5tYXgoMCwgYXJyYXkubGVuZ3RoIC0gKG4gPT0gbnVsbCB8fCBndWFyZCA/IDEgOiBuKSkpO1xuICB9O1xuXG4gIC8vIEdldCB0aGUgbGFzdCBlbGVtZW50IG9mIGFuIGFycmF5LiBQYXNzaW5nICoqbioqIHdpbGwgcmV0dXJuIHRoZSBsYXN0IE5cbiAgLy8gdmFsdWVzIGluIHRoZSBhcnJheS5cbiAgXy5sYXN0ID0gZnVuY3Rpb24oYXJyYXksIG4sIGd1YXJkKSB7XG4gICAgaWYgKGFycmF5ID09IG51bGwpIHJldHVybiB2b2lkIDA7XG4gICAgaWYgKG4gPT0gbnVsbCB8fCBndWFyZCkgcmV0dXJuIGFycmF5W2FycmF5Lmxlbmd0aCAtIDFdO1xuICAgIHJldHVybiBfLnJlc3QoYXJyYXksIE1hdGgubWF4KDAsIGFycmF5Lmxlbmd0aCAtIG4pKTtcbiAgfTtcblxuICAvLyBSZXR1cm5zIGV2ZXJ5dGhpbmcgYnV0IHRoZSBmaXJzdCBlbnRyeSBvZiB0aGUgYXJyYXkuIEFsaWFzZWQgYXMgYHRhaWxgIGFuZCBgZHJvcGAuXG4gIC8vIEVzcGVjaWFsbHkgdXNlZnVsIG9uIHRoZSBhcmd1bWVudHMgb2JqZWN0LiBQYXNzaW5nIGFuICoqbioqIHdpbGwgcmV0dXJuXG4gIC8vIHRoZSByZXN0IE4gdmFsdWVzIGluIHRoZSBhcnJheS5cbiAgXy5yZXN0ID0gXy50YWlsID0gXy5kcm9wID0gZnVuY3Rpb24oYXJyYXksIG4sIGd1YXJkKSB7XG4gICAgcmV0dXJuIHNsaWNlLmNhbGwoYXJyYXksIG4gPT0gbnVsbCB8fCBndWFyZCA/IDEgOiBuKTtcbiAgfTtcblxuICAvLyBUcmltIG91dCBhbGwgZmFsc3kgdmFsdWVzIGZyb20gYW4gYXJyYXkuXG4gIF8uY29tcGFjdCA9IGZ1bmN0aW9uKGFycmF5KSB7XG4gICAgcmV0dXJuIF8uZmlsdGVyKGFycmF5LCBfLmlkZW50aXR5KTtcbiAgfTtcblxuICAvLyBJbnRlcm5hbCBpbXBsZW1lbnRhdGlvbiBvZiBhIHJlY3Vyc2l2ZSBgZmxhdHRlbmAgZnVuY3Rpb24uXG4gIHZhciBmbGF0dGVuID0gZnVuY3Rpb24oaW5wdXQsIHNoYWxsb3csIHN0cmljdCwgc3RhcnRJbmRleCkge1xuICAgIHZhciBvdXRwdXQgPSBbXSwgaWR4ID0gMDtcbiAgICBmb3IgKHZhciBpID0gc3RhcnRJbmRleCB8fCAwLCBsZW5ndGggPSBnZXRMZW5ndGgoaW5wdXQpOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciB2YWx1ZSA9IGlucHV0W2ldO1xuICAgICAgaWYgKGlzQXJyYXlMaWtlKHZhbHVlKSAmJiAoXy5pc0FycmF5KHZhbHVlKSB8fCBfLmlzQXJndW1lbnRzKHZhbHVlKSkpIHtcbiAgICAgICAgLy9mbGF0dGVuIGN1cnJlbnQgbGV2ZWwgb2YgYXJyYXkgb3IgYXJndW1lbnRzIG9iamVjdFxuICAgICAgICBpZiAoIXNoYWxsb3cpIHZhbHVlID0gZmxhdHRlbih2YWx1ZSwgc2hhbGxvdywgc3RyaWN0KTtcbiAgICAgICAgdmFyIGogPSAwLCBsZW4gPSB2YWx1ZS5sZW5ndGg7XG4gICAgICAgIG91dHB1dC5sZW5ndGggKz0gbGVuO1xuICAgICAgICB3aGlsZSAoaiA8IGxlbikge1xuICAgICAgICAgIG91dHB1dFtpZHgrK10gPSB2YWx1ZVtqKytdO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKCFzdHJpY3QpIHtcbiAgICAgICAgb3V0cHV0W2lkeCsrXSA9IHZhbHVlO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gb3V0cHV0O1xuICB9O1xuXG4gIC8vIEZsYXR0ZW4gb3V0IGFuIGFycmF5LCBlaXRoZXIgcmVjdXJzaXZlbHkgKGJ5IGRlZmF1bHQpLCBvciBqdXN0IG9uZSBsZXZlbC5cbiAgXy5mbGF0dGVuID0gZnVuY3Rpb24oYXJyYXksIHNoYWxsb3cpIHtcbiAgICByZXR1cm4gZmxhdHRlbihhcnJheSwgc2hhbGxvdywgZmFsc2UpO1xuICB9O1xuXG4gIC8vIFJldHVybiBhIHZlcnNpb24gb2YgdGhlIGFycmF5IHRoYXQgZG9lcyBub3QgY29udGFpbiB0aGUgc3BlY2lmaWVkIHZhbHVlKHMpLlxuICBfLndpdGhvdXQgPSBmdW5jdGlvbihhcnJheSkge1xuICAgIHJldHVybiBfLmRpZmZlcmVuY2UoYXJyYXksIHNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKSk7XG4gIH07XG5cbiAgLy8gUHJvZHVjZSBhIGR1cGxpY2F0ZS1mcmVlIHZlcnNpb24gb2YgdGhlIGFycmF5LiBJZiB0aGUgYXJyYXkgaGFzIGFscmVhZHlcbiAgLy8gYmVlbiBzb3J0ZWQsIHlvdSBoYXZlIHRoZSBvcHRpb24gb2YgdXNpbmcgYSBmYXN0ZXIgYWxnb3JpdGhtLlxuICAvLyBBbGlhc2VkIGFzIGB1bmlxdWVgLlxuICBfLnVuaXEgPSBfLnVuaXF1ZSA9IGZ1bmN0aW9uKGFycmF5LCBpc1NvcnRlZCwgaXRlcmF0ZWUsIGNvbnRleHQpIHtcbiAgICBpZiAoIV8uaXNCb29sZWFuKGlzU29ydGVkKSkge1xuICAgICAgY29udGV4dCA9IGl0ZXJhdGVlO1xuICAgICAgaXRlcmF0ZWUgPSBpc1NvcnRlZDtcbiAgICAgIGlzU29ydGVkID0gZmFsc2U7XG4gICAgfVxuICAgIGlmIChpdGVyYXRlZSAhPSBudWxsKSBpdGVyYXRlZSA9IGNiKGl0ZXJhdGVlLCBjb250ZXh0KTtcbiAgICB2YXIgcmVzdWx0ID0gW107XG4gICAgdmFyIHNlZW4gPSBbXTtcbiAgICBmb3IgKHZhciBpID0gMCwgbGVuZ3RoID0gZ2V0TGVuZ3RoKGFycmF5KTsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgdmFsdWUgPSBhcnJheVtpXSxcbiAgICAgICAgICBjb21wdXRlZCA9IGl0ZXJhdGVlID8gaXRlcmF0ZWUodmFsdWUsIGksIGFycmF5KSA6IHZhbHVlO1xuICAgICAgaWYgKGlzU29ydGVkKSB7XG4gICAgICAgIGlmICghaSB8fCBzZWVuICE9PSBjb21wdXRlZCkgcmVzdWx0LnB1c2godmFsdWUpO1xuICAgICAgICBzZWVuID0gY29tcHV0ZWQ7XG4gICAgICB9IGVsc2UgaWYgKGl0ZXJhdGVlKSB7XG4gICAgICAgIGlmICghXy5jb250YWlucyhzZWVuLCBjb21wdXRlZCkpIHtcbiAgICAgICAgICBzZWVuLnB1c2goY29tcHV0ZWQpO1xuICAgICAgICAgIHJlc3VsdC5wdXNoKHZhbHVlKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmICghXy5jb250YWlucyhyZXN1bHQsIHZhbHVlKSkge1xuICAgICAgICByZXN1bHQucHVzaCh2YWx1ZSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG5cbiAgLy8gUHJvZHVjZSBhbiBhcnJheSB0aGF0IGNvbnRhaW5zIHRoZSB1bmlvbjogZWFjaCBkaXN0aW5jdCBlbGVtZW50IGZyb20gYWxsIG9mXG4gIC8vIHRoZSBwYXNzZWQtaW4gYXJyYXlzLlxuICBfLnVuaW9uID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIF8udW5pcShmbGF0dGVuKGFyZ3VtZW50cywgdHJ1ZSwgdHJ1ZSkpO1xuICB9O1xuXG4gIC8vIFByb2R1Y2UgYW4gYXJyYXkgdGhhdCBjb250YWlucyBldmVyeSBpdGVtIHNoYXJlZCBiZXR3ZWVuIGFsbCB0aGVcbiAgLy8gcGFzc2VkLWluIGFycmF5cy5cbiAgXy5pbnRlcnNlY3Rpb24gPSBmdW5jdGlvbihhcnJheSkge1xuICAgIHZhciByZXN1bHQgPSBbXTtcbiAgICB2YXIgYXJnc0xlbmd0aCA9IGFyZ3VtZW50cy5sZW5ndGg7XG4gICAgZm9yICh2YXIgaSA9IDAsIGxlbmd0aCA9IGdldExlbmd0aChhcnJheSk7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgdmFyIGl0ZW0gPSBhcnJheVtpXTtcbiAgICAgIGlmIChfLmNvbnRhaW5zKHJlc3VsdCwgaXRlbSkpIGNvbnRpbnVlO1xuICAgICAgZm9yICh2YXIgaiA9IDE7IGogPCBhcmdzTGVuZ3RoOyBqKyspIHtcbiAgICAgICAgaWYgKCFfLmNvbnRhaW5zKGFyZ3VtZW50c1tqXSwgaXRlbSkpIGJyZWFrO1xuICAgICAgfVxuICAgICAgaWYgKGogPT09IGFyZ3NMZW5ndGgpIHJlc3VsdC5wdXNoKGl0ZW0pO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuXG4gIC8vIFRha2UgdGhlIGRpZmZlcmVuY2UgYmV0d2VlbiBvbmUgYXJyYXkgYW5kIGEgbnVtYmVyIG9mIG90aGVyIGFycmF5cy5cbiAgLy8gT25seSB0aGUgZWxlbWVudHMgcHJlc2VudCBpbiBqdXN0IHRoZSBmaXJzdCBhcnJheSB3aWxsIHJlbWFpbi5cbiAgXy5kaWZmZXJlbmNlID0gZnVuY3Rpb24oYXJyYXkpIHtcbiAgICB2YXIgcmVzdCA9IGZsYXR0ZW4oYXJndW1lbnRzLCB0cnVlLCB0cnVlLCAxKTtcbiAgICByZXR1cm4gXy5maWx0ZXIoYXJyYXksIGZ1bmN0aW9uKHZhbHVlKXtcbiAgICAgIHJldHVybiAhXy5jb250YWlucyhyZXN0LCB2YWx1ZSk7XG4gICAgfSk7XG4gIH07XG5cbiAgLy8gWmlwIHRvZ2V0aGVyIG11bHRpcGxlIGxpc3RzIGludG8gYSBzaW5nbGUgYXJyYXkgLS0gZWxlbWVudHMgdGhhdCBzaGFyZVxuICAvLyBhbiBpbmRleCBnbyB0b2dldGhlci5cbiAgXy56aXAgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gXy51bnppcChhcmd1bWVudHMpO1xuICB9O1xuXG4gIC8vIENvbXBsZW1lbnQgb2YgXy56aXAuIFVuemlwIGFjY2VwdHMgYW4gYXJyYXkgb2YgYXJyYXlzIGFuZCBncm91cHNcbiAgLy8gZWFjaCBhcnJheSdzIGVsZW1lbnRzIG9uIHNoYXJlZCBpbmRpY2VzXG4gIF8udW56aXAgPSBmdW5jdGlvbihhcnJheSkge1xuICAgIHZhciBsZW5ndGggPSBhcnJheSAmJiBfLm1heChhcnJheSwgZ2V0TGVuZ3RoKS5sZW5ndGggfHwgMDtcbiAgICB2YXIgcmVzdWx0ID0gQXJyYXkobGVuZ3RoKTtcblxuICAgIGZvciAodmFyIGluZGV4ID0gMDsgaW5kZXggPCBsZW5ndGg7IGluZGV4KyspIHtcbiAgICAgIHJlc3VsdFtpbmRleF0gPSBfLnBsdWNrKGFycmF5LCBpbmRleCk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG5cbiAgLy8gQ29udmVydHMgbGlzdHMgaW50byBvYmplY3RzLiBQYXNzIGVpdGhlciBhIHNpbmdsZSBhcnJheSBvZiBgW2tleSwgdmFsdWVdYFxuICAvLyBwYWlycywgb3IgdHdvIHBhcmFsbGVsIGFycmF5cyBvZiB0aGUgc2FtZSBsZW5ndGggLS0gb25lIG9mIGtleXMsIGFuZCBvbmUgb2ZcbiAgLy8gdGhlIGNvcnJlc3BvbmRpbmcgdmFsdWVzLlxuICBfLm9iamVjdCA9IGZ1bmN0aW9uKGxpc3QsIHZhbHVlcykge1xuICAgIHZhciByZXN1bHQgPSB7fTtcbiAgICBmb3IgKHZhciBpID0gMCwgbGVuZ3RoID0gZ2V0TGVuZ3RoKGxpc3QpOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIGlmICh2YWx1ZXMpIHtcbiAgICAgICAgcmVzdWx0W2xpc3RbaV1dID0gdmFsdWVzW2ldO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVzdWx0W2xpc3RbaV1bMF1dID0gbGlzdFtpXVsxXTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfTtcblxuICAvLyBHZW5lcmF0b3IgZnVuY3Rpb24gdG8gY3JlYXRlIHRoZSBmaW5kSW5kZXggYW5kIGZpbmRMYXN0SW5kZXggZnVuY3Rpb25zXG4gIGZ1bmN0aW9uIGNyZWF0ZVByZWRpY2F0ZUluZGV4RmluZGVyKGRpcikge1xuICAgIHJldHVybiBmdW5jdGlvbihhcnJheSwgcHJlZGljYXRlLCBjb250ZXh0KSB7XG4gICAgICBwcmVkaWNhdGUgPSBjYihwcmVkaWNhdGUsIGNvbnRleHQpO1xuICAgICAgdmFyIGxlbmd0aCA9IGdldExlbmd0aChhcnJheSk7XG4gICAgICB2YXIgaW5kZXggPSBkaXIgPiAwID8gMCA6IGxlbmd0aCAtIDE7XG4gICAgICBmb3IgKDsgaW5kZXggPj0gMCAmJiBpbmRleCA8IGxlbmd0aDsgaW5kZXggKz0gZGlyKSB7XG4gICAgICAgIGlmIChwcmVkaWNhdGUoYXJyYXlbaW5kZXhdLCBpbmRleCwgYXJyYXkpKSByZXR1cm4gaW5kZXg7XG4gICAgICB9XG4gICAgICByZXR1cm4gLTE7XG4gICAgfTtcbiAgfVxuXG4gIC8vIFJldHVybnMgdGhlIGZpcnN0IGluZGV4IG9uIGFuIGFycmF5LWxpa2UgdGhhdCBwYXNzZXMgYSBwcmVkaWNhdGUgdGVzdFxuICBfLmZpbmRJbmRleCA9IGNyZWF0ZVByZWRpY2F0ZUluZGV4RmluZGVyKDEpO1xuICBfLmZpbmRMYXN0SW5kZXggPSBjcmVhdGVQcmVkaWNhdGVJbmRleEZpbmRlcigtMSk7XG5cbiAgLy8gVXNlIGEgY29tcGFyYXRvciBmdW5jdGlvbiB0byBmaWd1cmUgb3V0IHRoZSBzbWFsbGVzdCBpbmRleCBhdCB3aGljaFxuICAvLyBhbiBvYmplY3Qgc2hvdWxkIGJlIGluc2VydGVkIHNvIGFzIHRvIG1haW50YWluIG9yZGVyLiBVc2VzIGJpbmFyeSBzZWFyY2guXG4gIF8uc29ydGVkSW5kZXggPSBmdW5jdGlvbihhcnJheSwgb2JqLCBpdGVyYXRlZSwgY29udGV4dCkge1xuICAgIGl0ZXJhdGVlID0gY2IoaXRlcmF0ZWUsIGNvbnRleHQsIDEpO1xuICAgIHZhciB2YWx1ZSA9IGl0ZXJhdGVlKG9iaik7XG4gICAgdmFyIGxvdyA9IDAsIGhpZ2ggPSBnZXRMZW5ndGgoYXJyYXkpO1xuICAgIHdoaWxlIChsb3cgPCBoaWdoKSB7XG4gICAgICB2YXIgbWlkID0gTWF0aC5mbG9vcigobG93ICsgaGlnaCkgLyAyKTtcbiAgICAgIGlmIChpdGVyYXRlZShhcnJheVttaWRdKSA8IHZhbHVlKSBsb3cgPSBtaWQgKyAxOyBlbHNlIGhpZ2ggPSBtaWQ7XG4gICAgfVxuICAgIHJldHVybiBsb3c7XG4gIH07XG5cbiAgLy8gR2VuZXJhdG9yIGZ1bmN0aW9uIHRvIGNyZWF0ZSB0aGUgaW5kZXhPZiBhbmQgbGFzdEluZGV4T2YgZnVuY3Rpb25zXG4gIGZ1bmN0aW9uIGNyZWF0ZUluZGV4RmluZGVyKGRpciwgcHJlZGljYXRlRmluZCwgc29ydGVkSW5kZXgpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oYXJyYXksIGl0ZW0sIGlkeCkge1xuICAgICAgdmFyIGkgPSAwLCBsZW5ndGggPSBnZXRMZW5ndGgoYXJyYXkpO1xuICAgICAgaWYgKHR5cGVvZiBpZHggPT0gJ251bWJlcicpIHtcbiAgICAgICAgaWYgKGRpciA+IDApIHtcbiAgICAgICAgICAgIGkgPSBpZHggPj0gMCA/IGlkeCA6IE1hdGgubWF4KGlkeCArIGxlbmd0aCwgaSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsZW5ndGggPSBpZHggPj0gMCA/IE1hdGgubWluKGlkeCArIDEsIGxlbmd0aCkgOiBpZHggKyBsZW5ndGggKyAxO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHNvcnRlZEluZGV4ICYmIGlkeCAmJiBsZW5ndGgpIHtcbiAgICAgICAgaWR4ID0gc29ydGVkSW5kZXgoYXJyYXksIGl0ZW0pO1xuICAgICAgICByZXR1cm4gYXJyYXlbaWR4XSA9PT0gaXRlbSA/IGlkeCA6IC0xO1xuICAgICAgfVxuICAgICAgaWYgKGl0ZW0gIT09IGl0ZW0pIHtcbiAgICAgICAgaWR4ID0gcHJlZGljYXRlRmluZChzbGljZS5jYWxsKGFycmF5LCBpLCBsZW5ndGgpLCBfLmlzTmFOKTtcbiAgICAgICAgcmV0dXJuIGlkeCA+PSAwID8gaWR4ICsgaSA6IC0xO1xuICAgICAgfVxuICAgICAgZm9yIChpZHggPSBkaXIgPiAwID8gaSA6IGxlbmd0aCAtIDE7IGlkeCA+PSAwICYmIGlkeCA8IGxlbmd0aDsgaWR4ICs9IGRpcikge1xuICAgICAgICBpZiAoYXJyYXlbaWR4XSA9PT0gaXRlbSkgcmV0dXJuIGlkeDtcbiAgICAgIH1cbiAgICAgIHJldHVybiAtMTtcbiAgICB9O1xuICB9XG5cbiAgLy8gUmV0dXJuIHRoZSBwb3NpdGlvbiBvZiB0aGUgZmlyc3Qgb2NjdXJyZW5jZSBvZiBhbiBpdGVtIGluIGFuIGFycmF5LFxuICAvLyBvciAtMSBpZiB0aGUgaXRlbSBpcyBub3QgaW5jbHVkZWQgaW4gdGhlIGFycmF5LlxuICAvLyBJZiB0aGUgYXJyYXkgaXMgbGFyZ2UgYW5kIGFscmVhZHkgaW4gc29ydCBvcmRlciwgcGFzcyBgdHJ1ZWBcbiAgLy8gZm9yICoqaXNTb3J0ZWQqKiB0byB1c2UgYmluYXJ5IHNlYXJjaC5cbiAgXy5pbmRleE9mID0gY3JlYXRlSW5kZXhGaW5kZXIoMSwgXy5maW5kSW5kZXgsIF8uc29ydGVkSW5kZXgpO1xuICBfLmxhc3RJbmRleE9mID0gY3JlYXRlSW5kZXhGaW5kZXIoLTEsIF8uZmluZExhc3RJbmRleCk7XG5cbiAgLy8gR2VuZXJhdGUgYW4gaW50ZWdlciBBcnJheSBjb250YWluaW5nIGFuIGFyaXRobWV0aWMgcHJvZ3Jlc3Npb24uIEEgcG9ydCBvZlxuICAvLyB0aGUgbmF0aXZlIFB5dGhvbiBgcmFuZ2UoKWAgZnVuY3Rpb24uIFNlZVxuICAvLyBbdGhlIFB5dGhvbiBkb2N1bWVudGF0aW9uXShodHRwOi8vZG9jcy5weXRob24ub3JnL2xpYnJhcnkvZnVuY3Rpb25zLmh0bWwjcmFuZ2UpLlxuICBfLnJhbmdlID0gZnVuY3Rpb24oc3RhcnQsIHN0b3AsIHN0ZXApIHtcbiAgICBpZiAoc3RvcCA9PSBudWxsKSB7XG4gICAgICBzdG9wID0gc3RhcnQgfHwgMDtcbiAgICAgIHN0YXJ0ID0gMDtcbiAgICB9XG4gICAgc3RlcCA9IHN0ZXAgfHwgMTtcblxuICAgIHZhciBsZW5ndGggPSBNYXRoLm1heChNYXRoLmNlaWwoKHN0b3AgLSBzdGFydCkgLyBzdGVwKSwgMCk7XG4gICAgdmFyIHJhbmdlID0gQXJyYXkobGVuZ3RoKTtcblxuICAgIGZvciAodmFyIGlkeCA9IDA7IGlkeCA8IGxlbmd0aDsgaWR4KyssIHN0YXJ0ICs9IHN0ZXApIHtcbiAgICAgIHJhbmdlW2lkeF0gPSBzdGFydDtcbiAgICB9XG5cbiAgICByZXR1cm4gcmFuZ2U7XG4gIH07XG5cbiAgLy8gRnVuY3Rpb24gKGFoZW0pIEZ1bmN0aW9uc1xuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS1cblxuICAvLyBEZXRlcm1pbmVzIHdoZXRoZXIgdG8gZXhlY3V0ZSBhIGZ1bmN0aW9uIGFzIGEgY29uc3RydWN0b3JcbiAgLy8gb3IgYSBub3JtYWwgZnVuY3Rpb24gd2l0aCB0aGUgcHJvdmlkZWQgYXJndW1lbnRzXG4gIHZhciBleGVjdXRlQm91bmQgPSBmdW5jdGlvbihzb3VyY2VGdW5jLCBib3VuZEZ1bmMsIGNvbnRleHQsIGNhbGxpbmdDb250ZXh0LCBhcmdzKSB7XG4gICAgaWYgKCEoY2FsbGluZ0NvbnRleHQgaW5zdGFuY2VvZiBib3VuZEZ1bmMpKSByZXR1cm4gc291cmNlRnVuYy5hcHBseShjb250ZXh0LCBhcmdzKTtcbiAgICB2YXIgc2VsZiA9IGJhc2VDcmVhdGUoc291cmNlRnVuYy5wcm90b3R5cGUpO1xuICAgIHZhciByZXN1bHQgPSBzb3VyY2VGdW5jLmFwcGx5KHNlbGYsIGFyZ3MpO1xuICAgIGlmIChfLmlzT2JqZWN0KHJlc3VsdCkpIHJldHVybiByZXN1bHQ7XG4gICAgcmV0dXJuIHNlbGY7XG4gIH07XG5cbiAgLy8gQ3JlYXRlIGEgZnVuY3Rpb24gYm91bmQgdG8gYSBnaXZlbiBvYmplY3QgKGFzc2lnbmluZyBgdGhpc2AsIGFuZCBhcmd1bWVudHMsXG4gIC8vIG9wdGlvbmFsbHkpLiBEZWxlZ2F0ZXMgdG8gKipFQ01BU2NyaXB0IDUqKidzIG5hdGl2ZSBgRnVuY3Rpb24uYmluZGAgaWZcbiAgLy8gYXZhaWxhYmxlLlxuICBfLmJpbmQgPSBmdW5jdGlvbihmdW5jLCBjb250ZXh0KSB7XG4gICAgaWYgKG5hdGl2ZUJpbmQgJiYgZnVuYy5iaW5kID09PSBuYXRpdmVCaW5kKSByZXR1cm4gbmF0aXZlQmluZC5hcHBseShmdW5jLCBzbGljZS5jYWxsKGFyZ3VtZW50cywgMSkpO1xuICAgIGlmICghXy5pc0Z1bmN0aW9uKGZ1bmMpKSB0aHJvdyBuZXcgVHlwZUVycm9yKCdCaW5kIG11c3QgYmUgY2FsbGVkIG9uIGEgZnVuY3Rpb24nKTtcbiAgICB2YXIgYXJncyA9IHNsaWNlLmNhbGwoYXJndW1lbnRzLCAyKTtcbiAgICB2YXIgYm91bmQgPSBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBleGVjdXRlQm91bmQoZnVuYywgYm91bmQsIGNvbnRleHQsIHRoaXMsIGFyZ3MuY29uY2F0KHNsaWNlLmNhbGwoYXJndW1lbnRzKSkpO1xuICAgIH07XG4gICAgcmV0dXJuIGJvdW5kO1xuICB9O1xuXG4gIC8vIFBhcnRpYWxseSBhcHBseSBhIGZ1bmN0aW9uIGJ5IGNyZWF0aW5nIGEgdmVyc2lvbiB0aGF0IGhhcyBoYWQgc29tZSBvZiBpdHNcbiAgLy8gYXJndW1lbnRzIHByZS1maWxsZWQsIHdpdGhvdXQgY2hhbmdpbmcgaXRzIGR5bmFtaWMgYHRoaXNgIGNvbnRleHQuIF8gYWN0c1xuICAvLyBhcyBhIHBsYWNlaG9sZGVyLCBhbGxvd2luZyBhbnkgY29tYmluYXRpb24gb2YgYXJndW1lbnRzIHRvIGJlIHByZS1maWxsZWQuXG4gIF8ucGFydGlhbCA9IGZ1bmN0aW9uKGZ1bmMpIHtcbiAgICB2YXIgYm91bmRBcmdzID0gc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuICAgIHZhciBib3VuZCA9IGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIHBvc2l0aW9uID0gMCwgbGVuZ3RoID0gYm91bmRBcmdzLmxlbmd0aDtcbiAgICAgIHZhciBhcmdzID0gQXJyYXkobGVuZ3RoKTtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgICAgYXJnc1tpXSA9IGJvdW5kQXJnc1tpXSA9PT0gXyA/IGFyZ3VtZW50c1twb3NpdGlvbisrXSA6IGJvdW5kQXJnc1tpXTtcbiAgICAgIH1cbiAgICAgIHdoaWxlIChwb3NpdGlvbiA8IGFyZ3VtZW50cy5sZW5ndGgpIGFyZ3MucHVzaChhcmd1bWVudHNbcG9zaXRpb24rK10pO1xuICAgICAgcmV0dXJuIGV4ZWN1dGVCb3VuZChmdW5jLCBib3VuZCwgdGhpcywgdGhpcywgYXJncyk7XG4gICAgfTtcbiAgICByZXR1cm4gYm91bmQ7XG4gIH07XG5cbiAgLy8gQmluZCBhIG51bWJlciBvZiBhbiBvYmplY3QncyBtZXRob2RzIHRvIHRoYXQgb2JqZWN0LiBSZW1haW5pbmcgYXJndW1lbnRzXG4gIC8vIGFyZSB0aGUgbWV0aG9kIG5hbWVzIHRvIGJlIGJvdW5kLiBVc2VmdWwgZm9yIGVuc3VyaW5nIHRoYXQgYWxsIGNhbGxiYWNrc1xuICAvLyBkZWZpbmVkIG9uIGFuIG9iamVjdCBiZWxvbmcgdG8gaXQuXG4gIF8uYmluZEFsbCA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHZhciBpLCBsZW5ndGggPSBhcmd1bWVudHMubGVuZ3RoLCBrZXk7XG4gICAgaWYgKGxlbmd0aCA8PSAxKSB0aHJvdyBuZXcgRXJyb3IoJ2JpbmRBbGwgbXVzdCBiZSBwYXNzZWQgZnVuY3Rpb24gbmFtZXMnKTtcbiAgICBmb3IgKGkgPSAxOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIGtleSA9IGFyZ3VtZW50c1tpXTtcbiAgICAgIG9ialtrZXldID0gXy5iaW5kKG9ialtrZXldLCBvYmopO1xuICAgIH1cbiAgICByZXR1cm4gb2JqO1xuICB9O1xuXG4gIC8vIE1lbW9pemUgYW4gZXhwZW5zaXZlIGZ1bmN0aW9uIGJ5IHN0b3JpbmcgaXRzIHJlc3VsdHMuXG4gIF8ubWVtb2l6ZSA9IGZ1bmN0aW9uKGZ1bmMsIGhhc2hlcikge1xuICAgIHZhciBtZW1vaXplID0gZnVuY3Rpb24oa2V5KSB7XG4gICAgICB2YXIgY2FjaGUgPSBtZW1vaXplLmNhY2hlO1xuICAgICAgdmFyIGFkZHJlc3MgPSAnJyArIChoYXNoZXIgPyBoYXNoZXIuYXBwbHkodGhpcywgYXJndW1lbnRzKSA6IGtleSk7XG4gICAgICBpZiAoIV8uaGFzKGNhY2hlLCBhZGRyZXNzKSkgY2FjaGVbYWRkcmVzc10gPSBmdW5jLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICByZXR1cm4gY2FjaGVbYWRkcmVzc107XG4gICAgfTtcbiAgICBtZW1vaXplLmNhY2hlID0ge307XG4gICAgcmV0dXJuIG1lbW9pemU7XG4gIH07XG5cbiAgLy8gRGVsYXlzIGEgZnVuY3Rpb24gZm9yIHRoZSBnaXZlbiBudW1iZXIgb2YgbWlsbGlzZWNvbmRzLCBhbmQgdGhlbiBjYWxsc1xuICAvLyBpdCB3aXRoIHRoZSBhcmd1bWVudHMgc3VwcGxpZWQuXG4gIF8uZGVsYXkgPSBmdW5jdGlvbihmdW5jLCB3YWl0KSB7XG4gICAgdmFyIGFyZ3MgPSBzbGljZS5jYWxsKGFyZ3VtZW50cywgMik7XG4gICAgcmV0dXJuIHNldFRpbWVvdXQoZnVuY3Rpb24oKXtcbiAgICAgIHJldHVybiBmdW5jLmFwcGx5KG51bGwsIGFyZ3MpO1xuICAgIH0sIHdhaXQpO1xuICB9O1xuXG4gIC8vIERlZmVycyBhIGZ1bmN0aW9uLCBzY2hlZHVsaW5nIGl0IHRvIHJ1biBhZnRlciB0aGUgY3VycmVudCBjYWxsIHN0YWNrIGhhc1xuICAvLyBjbGVhcmVkLlxuICBfLmRlZmVyID0gXy5wYXJ0aWFsKF8uZGVsYXksIF8sIDEpO1xuXG4gIC8vIFJldHVybnMgYSBmdW5jdGlvbiwgdGhhdCwgd2hlbiBpbnZva2VkLCB3aWxsIG9ubHkgYmUgdHJpZ2dlcmVkIGF0IG1vc3Qgb25jZVxuICAvLyBkdXJpbmcgYSBnaXZlbiB3aW5kb3cgb2YgdGltZS4gTm9ybWFsbHksIHRoZSB0aHJvdHRsZWQgZnVuY3Rpb24gd2lsbCBydW5cbiAgLy8gYXMgbXVjaCBhcyBpdCBjYW4sIHdpdGhvdXQgZXZlciBnb2luZyBtb3JlIHRoYW4gb25jZSBwZXIgYHdhaXRgIGR1cmF0aW9uO1xuICAvLyBidXQgaWYgeW91J2QgbGlrZSB0byBkaXNhYmxlIHRoZSBleGVjdXRpb24gb24gdGhlIGxlYWRpbmcgZWRnZSwgcGFzc1xuICAvLyBge2xlYWRpbmc6IGZhbHNlfWAuIFRvIGRpc2FibGUgZXhlY3V0aW9uIG9uIHRoZSB0cmFpbGluZyBlZGdlLCBkaXR0by5cbiAgXy50aHJvdHRsZSA9IGZ1bmN0aW9uKGZ1bmMsIHdhaXQsIG9wdGlvbnMpIHtcbiAgICB2YXIgY29udGV4dCwgYXJncywgcmVzdWx0O1xuICAgIHZhciB0aW1lb3V0ID0gbnVsbDtcbiAgICB2YXIgcHJldmlvdXMgPSAwO1xuICAgIGlmICghb3B0aW9ucykgb3B0aW9ucyA9IHt9O1xuICAgIHZhciBsYXRlciA9IGZ1bmN0aW9uKCkge1xuICAgICAgcHJldmlvdXMgPSBvcHRpb25zLmxlYWRpbmcgPT09IGZhbHNlID8gMCA6IF8ubm93KCk7XG4gICAgICB0aW1lb3V0ID0gbnVsbDtcbiAgICAgIHJlc3VsdCA9IGZ1bmMuYXBwbHkoY29udGV4dCwgYXJncyk7XG4gICAgICBpZiAoIXRpbWVvdXQpIGNvbnRleHQgPSBhcmdzID0gbnVsbDtcbiAgICB9O1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBub3cgPSBfLm5vdygpO1xuICAgICAgaWYgKCFwcmV2aW91cyAmJiBvcHRpb25zLmxlYWRpbmcgPT09IGZhbHNlKSBwcmV2aW91cyA9IG5vdztcbiAgICAgIHZhciByZW1haW5pbmcgPSB3YWl0IC0gKG5vdyAtIHByZXZpb3VzKTtcbiAgICAgIGNvbnRleHQgPSB0aGlzO1xuICAgICAgYXJncyA9IGFyZ3VtZW50cztcbiAgICAgIGlmIChyZW1haW5pbmcgPD0gMCB8fCByZW1haW5pbmcgPiB3YWl0KSB7XG4gICAgICAgIGlmICh0aW1lb3V0KSB7XG4gICAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuICAgICAgICAgIHRpbWVvdXQgPSBudWxsO1xuICAgICAgICB9XG4gICAgICAgIHByZXZpb3VzID0gbm93O1xuICAgICAgICByZXN1bHQgPSBmdW5jLmFwcGx5KGNvbnRleHQsIGFyZ3MpO1xuICAgICAgICBpZiAoIXRpbWVvdXQpIGNvbnRleHQgPSBhcmdzID0gbnVsbDtcbiAgICAgIH0gZWxzZSBpZiAoIXRpbWVvdXQgJiYgb3B0aW9ucy50cmFpbGluZyAhPT0gZmFsc2UpIHtcbiAgICAgICAgdGltZW91dCA9IHNldFRpbWVvdXQobGF0ZXIsIHJlbWFpbmluZyk7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH07XG4gIH07XG5cbiAgLy8gUmV0dXJucyBhIGZ1bmN0aW9uLCB0aGF0LCBhcyBsb25nIGFzIGl0IGNvbnRpbnVlcyB0byBiZSBpbnZva2VkLCB3aWxsIG5vdFxuICAvLyBiZSB0cmlnZ2VyZWQuIFRoZSBmdW5jdGlvbiB3aWxsIGJlIGNhbGxlZCBhZnRlciBpdCBzdG9wcyBiZWluZyBjYWxsZWQgZm9yXG4gIC8vIE4gbWlsbGlzZWNvbmRzLiBJZiBgaW1tZWRpYXRlYCBpcyBwYXNzZWQsIHRyaWdnZXIgdGhlIGZ1bmN0aW9uIG9uIHRoZVxuICAvLyBsZWFkaW5nIGVkZ2UsIGluc3RlYWQgb2YgdGhlIHRyYWlsaW5nLlxuICBfLmRlYm91bmNlID0gZnVuY3Rpb24oZnVuYywgd2FpdCwgaW1tZWRpYXRlKSB7XG4gICAgdmFyIHRpbWVvdXQsIGFyZ3MsIGNvbnRleHQsIHRpbWVzdGFtcCwgcmVzdWx0O1xuXG4gICAgdmFyIGxhdGVyID0gZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgbGFzdCA9IF8ubm93KCkgLSB0aW1lc3RhbXA7XG5cbiAgICAgIGlmIChsYXN0IDwgd2FpdCAmJiBsYXN0ID49IDApIHtcbiAgICAgICAgdGltZW91dCA9IHNldFRpbWVvdXQobGF0ZXIsIHdhaXQgLSBsYXN0KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRpbWVvdXQgPSBudWxsO1xuICAgICAgICBpZiAoIWltbWVkaWF0ZSkge1xuICAgICAgICAgIHJlc3VsdCA9IGZ1bmMuYXBwbHkoY29udGV4dCwgYXJncyk7XG4gICAgICAgICAgaWYgKCF0aW1lb3V0KSBjb250ZXh0ID0gYXJncyA9IG51bGw7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9O1xuXG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgY29udGV4dCA9IHRoaXM7XG4gICAgICBhcmdzID0gYXJndW1lbnRzO1xuICAgICAgdGltZXN0YW1wID0gXy5ub3coKTtcbiAgICAgIHZhciBjYWxsTm93ID0gaW1tZWRpYXRlICYmICF0aW1lb3V0O1xuICAgICAgaWYgKCF0aW1lb3V0KSB0aW1lb3V0ID0gc2V0VGltZW91dChsYXRlciwgd2FpdCk7XG4gICAgICBpZiAoY2FsbE5vdykge1xuICAgICAgICByZXN1bHQgPSBmdW5jLmFwcGx5KGNvbnRleHQsIGFyZ3MpO1xuICAgICAgICBjb250ZXh0ID0gYXJncyA9IG51bGw7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfTtcbiAgfTtcblxuICAvLyBSZXR1cm5zIHRoZSBmaXJzdCBmdW5jdGlvbiBwYXNzZWQgYXMgYW4gYXJndW1lbnQgdG8gdGhlIHNlY29uZCxcbiAgLy8gYWxsb3dpbmcgeW91IHRvIGFkanVzdCBhcmd1bWVudHMsIHJ1biBjb2RlIGJlZm9yZSBhbmQgYWZ0ZXIsIGFuZFxuICAvLyBjb25kaXRpb25hbGx5IGV4ZWN1dGUgdGhlIG9yaWdpbmFsIGZ1bmN0aW9uLlxuICBfLndyYXAgPSBmdW5jdGlvbihmdW5jLCB3cmFwcGVyKSB7XG4gICAgcmV0dXJuIF8ucGFydGlhbCh3cmFwcGVyLCBmdW5jKTtcbiAgfTtcblxuICAvLyBSZXR1cm5zIGEgbmVnYXRlZCB2ZXJzaW9uIG9mIHRoZSBwYXNzZWQtaW4gcHJlZGljYXRlLlxuICBfLm5lZ2F0ZSA9IGZ1bmN0aW9uKHByZWRpY2F0ZSkge1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiAhcHJlZGljYXRlLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgfTtcbiAgfTtcblxuICAvLyBSZXR1cm5zIGEgZnVuY3Rpb24gdGhhdCBpcyB0aGUgY29tcG9zaXRpb24gb2YgYSBsaXN0IG9mIGZ1bmN0aW9ucywgZWFjaFxuICAvLyBjb25zdW1pbmcgdGhlIHJldHVybiB2YWx1ZSBvZiB0aGUgZnVuY3Rpb24gdGhhdCBmb2xsb3dzLlxuICBfLmNvbXBvc2UgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgYXJncyA9IGFyZ3VtZW50cztcbiAgICB2YXIgc3RhcnQgPSBhcmdzLmxlbmd0aCAtIDE7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIGkgPSBzdGFydDtcbiAgICAgIHZhciByZXN1bHQgPSBhcmdzW3N0YXJ0XS5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgd2hpbGUgKGktLSkgcmVzdWx0ID0gYXJnc1tpXS5jYWxsKHRoaXMsIHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH07XG4gIH07XG5cbiAgLy8gUmV0dXJucyBhIGZ1bmN0aW9uIHRoYXQgd2lsbCBvbmx5IGJlIGV4ZWN1dGVkIG9uIGFuZCBhZnRlciB0aGUgTnRoIGNhbGwuXG4gIF8uYWZ0ZXIgPSBmdW5jdGlvbih0aW1lcywgZnVuYykge1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIGlmICgtLXRpbWVzIDwgMSkge1xuICAgICAgICByZXR1cm4gZnVuYy5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgfVxuICAgIH07XG4gIH07XG5cbiAgLy8gUmV0dXJucyBhIGZ1bmN0aW9uIHRoYXQgd2lsbCBvbmx5IGJlIGV4ZWN1dGVkIHVwIHRvIChidXQgbm90IGluY2x1ZGluZykgdGhlIE50aCBjYWxsLlxuICBfLmJlZm9yZSA9IGZ1bmN0aW9uKHRpbWVzLCBmdW5jKSB7XG4gICAgdmFyIG1lbW87XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgaWYgKC0tdGltZXMgPiAwKSB7XG4gICAgICAgIG1lbW8gPSBmdW5jLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICB9XG4gICAgICBpZiAodGltZXMgPD0gMSkgZnVuYyA9IG51bGw7XG4gICAgICByZXR1cm4gbWVtbztcbiAgICB9O1xuICB9O1xuXG4gIC8vIFJldHVybnMgYSBmdW5jdGlvbiB0aGF0IHdpbGwgYmUgZXhlY3V0ZWQgYXQgbW9zdCBvbmUgdGltZSwgbm8gbWF0dGVyIGhvd1xuICAvLyBvZnRlbiB5b3UgY2FsbCBpdC4gVXNlZnVsIGZvciBsYXp5IGluaXRpYWxpemF0aW9uLlxuICBfLm9uY2UgPSBfLnBhcnRpYWwoXy5iZWZvcmUsIDIpO1xuXG4gIC8vIE9iamVjdCBGdW5jdGlvbnNcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLVxuXG4gIC8vIEtleXMgaW4gSUUgPCA5IHRoYXQgd29uJ3QgYmUgaXRlcmF0ZWQgYnkgYGZvciBrZXkgaW4gLi4uYCBhbmQgdGh1cyBtaXNzZWQuXG4gIHZhciBoYXNFbnVtQnVnID0gIXt0b1N0cmluZzogbnVsbH0ucHJvcGVydHlJc0VudW1lcmFibGUoJ3RvU3RyaW5nJyk7XG4gIHZhciBub25FbnVtZXJhYmxlUHJvcHMgPSBbJ3ZhbHVlT2YnLCAnaXNQcm90b3R5cGVPZicsICd0b1N0cmluZycsXG4gICAgICAgICAgICAgICAgICAgICAgJ3Byb3BlcnR5SXNFbnVtZXJhYmxlJywgJ2hhc093blByb3BlcnR5JywgJ3RvTG9jYWxlU3RyaW5nJ107XG5cbiAgZnVuY3Rpb24gY29sbGVjdE5vbkVudW1Qcm9wcyhvYmosIGtleXMpIHtcbiAgICB2YXIgbm9uRW51bUlkeCA9IG5vbkVudW1lcmFibGVQcm9wcy5sZW5ndGg7XG4gICAgdmFyIGNvbnN0cnVjdG9yID0gb2JqLmNvbnN0cnVjdG9yO1xuICAgIHZhciBwcm90byA9IChfLmlzRnVuY3Rpb24oY29uc3RydWN0b3IpICYmIGNvbnN0cnVjdG9yLnByb3RvdHlwZSkgfHwgT2JqUHJvdG87XG5cbiAgICAvLyBDb25zdHJ1Y3RvciBpcyBhIHNwZWNpYWwgY2FzZS5cbiAgICB2YXIgcHJvcCA9ICdjb25zdHJ1Y3Rvcic7XG4gICAgaWYgKF8uaGFzKG9iaiwgcHJvcCkgJiYgIV8uY29udGFpbnMoa2V5cywgcHJvcCkpIGtleXMucHVzaChwcm9wKTtcblxuICAgIHdoaWxlIChub25FbnVtSWR4LS0pIHtcbiAgICAgIHByb3AgPSBub25FbnVtZXJhYmxlUHJvcHNbbm9uRW51bUlkeF07XG4gICAgICBpZiAocHJvcCBpbiBvYmogJiYgb2JqW3Byb3BdICE9PSBwcm90b1twcm9wXSAmJiAhXy5jb250YWlucyhrZXlzLCBwcm9wKSkge1xuICAgICAgICBrZXlzLnB1c2gocHJvcCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gUmV0cmlldmUgdGhlIG5hbWVzIG9mIGFuIG9iamVjdCdzIG93biBwcm9wZXJ0aWVzLlxuICAvLyBEZWxlZ2F0ZXMgdG8gKipFQ01BU2NyaXB0IDUqKidzIG5hdGl2ZSBgT2JqZWN0LmtleXNgXG4gIF8ua2V5cyA9IGZ1bmN0aW9uKG9iaikge1xuICAgIGlmICghXy5pc09iamVjdChvYmopKSByZXR1cm4gW107XG4gICAgaWYgKG5hdGl2ZUtleXMpIHJldHVybiBuYXRpdmVLZXlzKG9iaik7XG4gICAgdmFyIGtleXMgPSBbXTtcbiAgICBmb3IgKHZhciBrZXkgaW4gb2JqKSBpZiAoXy5oYXMob2JqLCBrZXkpKSBrZXlzLnB1c2goa2V5KTtcbiAgICAvLyBBaGVtLCBJRSA8IDkuXG4gICAgaWYgKGhhc0VudW1CdWcpIGNvbGxlY3ROb25FbnVtUHJvcHMob2JqLCBrZXlzKTtcbiAgICByZXR1cm4ga2V5cztcbiAgfTtcblxuICAvLyBSZXRyaWV2ZSBhbGwgdGhlIHByb3BlcnR5IG5hbWVzIG9mIGFuIG9iamVjdC5cbiAgXy5hbGxLZXlzID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgaWYgKCFfLmlzT2JqZWN0KG9iaikpIHJldHVybiBbXTtcbiAgICB2YXIga2V5cyA9IFtdO1xuICAgIGZvciAodmFyIGtleSBpbiBvYmopIGtleXMucHVzaChrZXkpO1xuICAgIC8vIEFoZW0sIElFIDwgOS5cbiAgICBpZiAoaGFzRW51bUJ1ZykgY29sbGVjdE5vbkVudW1Qcm9wcyhvYmosIGtleXMpO1xuICAgIHJldHVybiBrZXlzO1xuICB9O1xuXG4gIC8vIFJldHJpZXZlIHRoZSB2YWx1ZXMgb2YgYW4gb2JqZWN0J3MgcHJvcGVydGllcy5cbiAgXy52YWx1ZXMgPSBmdW5jdGlvbihvYmopIHtcbiAgICB2YXIga2V5cyA9IF8ua2V5cyhvYmopO1xuICAgIHZhciBsZW5ndGggPSBrZXlzLmxlbmd0aDtcbiAgICB2YXIgdmFsdWVzID0gQXJyYXkobGVuZ3RoKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICB2YWx1ZXNbaV0gPSBvYmpba2V5c1tpXV07XG4gICAgfVxuICAgIHJldHVybiB2YWx1ZXM7XG4gIH07XG5cbiAgLy8gUmV0dXJucyB0aGUgcmVzdWx0cyBvZiBhcHBseWluZyB0aGUgaXRlcmF0ZWUgdG8gZWFjaCBlbGVtZW50IG9mIHRoZSBvYmplY3RcbiAgLy8gSW4gY29udHJhc3QgdG8gXy5tYXAgaXQgcmV0dXJucyBhbiBvYmplY3RcbiAgXy5tYXBPYmplY3QgPSBmdW5jdGlvbihvYmosIGl0ZXJhdGVlLCBjb250ZXh0KSB7XG4gICAgaXRlcmF0ZWUgPSBjYihpdGVyYXRlZSwgY29udGV4dCk7XG4gICAgdmFyIGtleXMgPSAgXy5rZXlzKG9iaiksXG4gICAgICAgICAgbGVuZ3RoID0ga2V5cy5sZW5ndGgsXG4gICAgICAgICAgcmVzdWx0cyA9IHt9LFxuICAgICAgICAgIGN1cnJlbnRLZXk7XG4gICAgICBmb3IgKHZhciBpbmRleCA9IDA7IGluZGV4IDwgbGVuZ3RoOyBpbmRleCsrKSB7XG4gICAgICAgIGN1cnJlbnRLZXkgPSBrZXlzW2luZGV4XTtcbiAgICAgICAgcmVzdWx0c1tjdXJyZW50S2V5XSA9IGl0ZXJhdGVlKG9ialtjdXJyZW50S2V5XSwgY3VycmVudEtleSwgb2JqKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXN1bHRzO1xuICB9O1xuXG4gIC8vIENvbnZlcnQgYW4gb2JqZWN0IGludG8gYSBsaXN0IG9mIGBba2V5LCB2YWx1ZV1gIHBhaXJzLlxuICBfLnBhaXJzID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgdmFyIGtleXMgPSBfLmtleXMob2JqKTtcbiAgICB2YXIgbGVuZ3RoID0ga2V5cy5sZW5ndGg7XG4gICAgdmFyIHBhaXJzID0gQXJyYXkobGVuZ3RoKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICBwYWlyc1tpXSA9IFtrZXlzW2ldLCBvYmpba2V5c1tpXV1dO1xuICAgIH1cbiAgICByZXR1cm4gcGFpcnM7XG4gIH07XG5cbiAgLy8gSW52ZXJ0IHRoZSBrZXlzIGFuZCB2YWx1ZXMgb2YgYW4gb2JqZWN0LiBUaGUgdmFsdWVzIG11c3QgYmUgc2VyaWFsaXphYmxlLlxuICBfLmludmVydCA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHZhciByZXN1bHQgPSB7fTtcbiAgICB2YXIga2V5cyA9IF8ua2V5cyhvYmopO1xuICAgIGZvciAodmFyIGkgPSAwLCBsZW5ndGggPSBrZXlzLmxlbmd0aDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICByZXN1bHRbb2JqW2tleXNbaV1dXSA9IGtleXNbaV07XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG5cbiAgLy8gUmV0dXJuIGEgc29ydGVkIGxpc3Qgb2YgdGhlIGZ1bmN0aW9uIG5hbWVzIGF2YWlsYWJsZSBvbiB0aGUgb2JqZWN0LlxuICAvLyBBbGlhc2VkIGFzIGBtZXRob2RzYFxuICBfLmZ1bmN0aW9ucyA9IF8ubWV0aG9kcyA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHZhciBuYW1lcyA9IFtdO1xuICAgIGZvciAodmFyIGtleSBpbiBvYmopIHtcbiAgICAgIGlmIChfLmlzRnVuY3Rpb24ob2JqW2tleV0pKSBuYW1lcy5wdXNoKGtleSk7XG4gICAgfVxuICAgIHJldHVybiBuYW1lcy5zb3J0KCk7XG4gIH07XG5cbiAgLy8gRXh0ZW5kIGEgZ2l2ZW4gb2JqZWN0IHdpdGggYWxsIHRoZSBwcm9wZXJ0aWVzIGluIHBhc3NlZC1pbiBvYmplY3QocykuXG4gIF8uZXh0ZW5kID0gY3JlYXRlQXNzaWduZXIoXy5hbGxLZXlzKTtcblxuICAvLyBBc3NpZ25zIGEgZ2l2ZW4gb2JqZWN0IHdpdGggYWxsIHRoZSBvd24gcHJvcGVydGllcyBpbiB0aGUgcGFzc2VkLWluIG9iamVjdChzKVxuICAvLyAoaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZG9jcy9XZWIvSmF2YVNjcmlwdC9SZWZlcmVuY2UvR2xvYmFsX09iamVjdHMvT2JqZWN0L2Fzc2lnbilcbiAgXy5leHRlbmRPd24gPSBfLmFzc2lnbiA9IGNyZWF0ZUFzc2lnbmVyKF8ua2V5cyk7XG5cbiAgLy8gUmV0dXJucyB0aGUgZmlyc3Qga2V5IG9uIGFuIG9iamVjdCB0aGF0IHBhc3NlcyBhIHByZWRpY2F0ZSB0ZXN0XG4gIF8uZmluZEtleSA9IGZ1bmN0aW9uKG9iaiwgcHJlZGljYXRlLCBjb250ZXh0KSB7XG4gICAgcHJlZGljYXRlID0gY2IocHJlZGljYXRlLCBjb250ZXh0KTtcbiAgICB2YXIga2V5cyA9IF8ua2V5cyhvYmopLCBrZXk7XG4gICAgZm9yICh2YXIgaSA9IDAsIGxlbmd0aCA9IGtleXMubGVuZ3RoOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIGtleSA9IGtleXNbaV07XG4gICAgICBpZiAocHJlZGljYXRlKG9ialtrZXldLCBrZXksIG9iaikpIHJldHVybiBrZXk7XG4gICAgfVxuICB9O1xuXG4gIC8vIFJldHVybiBhIGNvcHkgb2YgdGhlIG9iamVjdCBvbmx5IGNvbnRhaW5pbmcgdGhlIHdoaXRlbGlzdGVkIHByb3BlcnRpZXMuXG4gIF8ucGljayA9IGZ1bmN0aW9uKG9iamVjdCwgb2l0ZXJhdGVlLCBjb250ZXh0KSB7XG4gICAgdmFyIHJlc3VsdCA9IHt9LCBvYmogPSBvYmplY3QsIGl0ZXJhdGVlLCBrZXlzO1xuICAgIGlmIChvYmogPT0gbnVsbCkgcmV0dXJuIHJlc3VsdDtcbiAgICBpZiAoXy5pc0Z1bmN0aW9uKG9pdGVyYXRlZSkpIHtcbiAgICAgIGtleXMgPSBfLmFsbEtleXMob2JqKTtcbiAgICAgIGl0ZXJhdGVlID0gb3B0aW1pemVDYihvaXRlcmF0ZWUsIGNvbnRleHQpO1xuICAgIH0gZWxzZSB7XG4gICAgICBrZXlzID0gZmxhdHRlbihhcmd1bWVudHMsIGZhbHNlLCBmYWxzZSwgMSk7XG4gICAgICBpdGVyYXRlZSA9IGZ1bmN0aW9uKHZhbHVlLCBrZXksIG9iaikgeyByZXR1cm4ga2V5IGluIG9iajsgfTtcbiAgICAgIG9iaiA9IE9iamVjdChvYmopO1xuICAgIH1cbiAgICBmb3IgKHZhciBpID0gMCwgbGVuZ3RoID0ga2V5cy5sZW5ndGg7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgdmFyIGtleSA9IGtleXNbaV07XG4gICAgICB2YXIgdmFsdWUgPSBvYmpba2V5XTtcbiAgICAgIGlmIChpdGVyYXRlZSh2YWx1ZSwga2V5LCBvYmopKSByZXN1bHRba2V5XSA9IHZhbHVlO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuXG4gICAvLyBSZXR1cm4gYSBjb3B5IG9mIHRoZSBvYmplY3Qgd2l0aG91dCB0aGUgYmxhY2tsaXN0ZWQgcHJvcGVydGllcy5cbiAgXy5vbWl0ID0gZnVuY3Rpb24ob2JqLCBpdGVyYXRlZSwgY29udGV4dCkge1xuICAgIGlmIChfLmlzRnVuY3Rpb24oaXRlcmF0ZWUpKSB7XG4gICAgICBpdGVyYXRlZSA9IF8ubmVnYXRlKGl0ZXJhdGVlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIGtleXMgPSBfLm1hcChmbGF0dGVuKGFyZ3VtZW50cywgZmFsc2UsIGZhbHNlLCAxKSwgU3RyaW5nKTtcbiAgICAgIGl0ZXJhdGVlID0gZnVuY3Rpb24odmFsdWUsIGtleSkge1xuICAgICAgICByZXR1cm4gIV8uY29udGFpbnMoa2V5cywga2V5KTtcbiAgICAgIH07XG4gICAgfVxuICAgIHJldHVybiBfLnBpY2sob2JqLCBpdGVyYXRlZSwgY29udGV4dCk7XG4gIH07XG5cbiAgLy8gRmlsbCBpbiBhIGdpdmVuIG9iamVjdCB3aXRoIGRlZmF1bHQgcHJvcGVydGllcy5cbiAgXy5kZWZhdWx0cyA9IGNyZWF0ZUFzc2lnbmVyKF8uYWxsS2V5cywgdHJ1ZSk7XG5cbiAgLy8gQ3JlYXRlcyBhbiBvYmplY3QgdGhhdCBpbmhlcml0cyBmcm9tIHRoZSBnaXZlbiBwcm90b3R5cGUgb2JqZWN0LlxuICAvLyBJZiBhZGRpdGlvbmFsIHByb3BlcnRpZXMgYXJlIHByb3ZpZGVkIHRoZW4gdGhleSB3aWxsIGJlIGFkZGVkIHRvIHRoZVxuICAvLyBjcmVhdGVkIG9iamVjdC5cbiAgXy5jcmVhdGUgPSBmdW5jdGlvbihwcm90b3R5cGUsIHByb3BzKSB7XG4gICAgdmFyIHJlc3VsdCA9IGJhc2VDcmVhdGUocHJvdG90eXBlKTtcbiAgICBpZiAocHJvcHMpIF8uZXh0ZW5kT3duKHJlc3VsdCwgcHJvcHMpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG5cbiAgLy8gQ3JlYXRlIGEgKHNoYWxsb3ctY2xvbmVkKSBkdXBsaWNhdGUgb2YgYW4gb2JqZWN0LlxuICBfLmNsb25lID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgaWYgKCFfLmlzT2JqZWN0KG9iaikpIHJldHVybiBvYmo7XG4gICAgcmV0dXJuIF8uaXNBcnJheShvYmopID8gb2JqLnNsaWNlKCkgOiBfLmV4dGVuZCh7fSwgb2JqKTtcbiAgfTtcblxuICAvLyBJbnZva2VzIGludGVyY2VwdG9yIHdpdGggdGhlIG9iaiwgYW5kIHRoZW4gcmV0dXJucyBvYmouXG4gIC8vIFRoZSBwcmltYXJ5IHB1cnBvc2Ugb2YgdGhpcyBtZXRob2QgaXMgdG8gXCJ0YXAgaW50b1wiIGEgbWV0aG9kIGNoYWluLCBpblxuICAvLyBvcmRlciB0byBwZXJmb3JtIG9wZXJhdGlvbnMgb24gaW50ZXJtZWRpYXRlIHJlc3VsdHMgd2l0aGluIHRoZSBjaGFpbi5cbiAgXy50YXAgPSBmdW5jdGlvbihvYmosIGludGVyY2VwdG9yKSB7XG4gICAgaW50ZXJjZXB0b3Iob2JqKTtcbiAgICByZXR1cm4gb2JqO1xuICB9O1xuXG4gIC8vIFJldHVybnMgd2hldGhlciBhbiBvYmplY3QgaGFzIGEgZ2l2ZW4gc2V0IG9mIGBrZXk6dmFsdWVgIHBhaXJzLlxuICBfLmlzTWF0Y2ggPSBmdW5jdGlvbihvYmplY3QsIGF0dHJzKSB7XG4gICAgdmFyIGtleXMgPSBfLmtleXMoYXR0cnMpLCBsZW5ndGggPSBrZXlzLmxlbmd0aDtcbiAgICBpZiAob2JqZWN0ID09IG51bGwpIHJldHVybiAhbGVuZ3RoO1xuICAgIHZhciBvYmogPSBPYmplY3Qob2JqZWN0KTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIga2V5ID0ga2V5c1tpXTtcbiAgICAgIGlmIChhdHRyc1trZXldICE9PSBvYmpba2V5XSB8fCAhKGtleSBpbiBvYmopKSByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xuICB9O1xuXG5cbiAgLy8gSW50ZXJuYWwgcmVjdXJzaXZlIGNvbXBhcmlzb24gZnVuY3Rpb24gZm9yIGBpc0VxdWFsYC5cbiAgdmFyIGVxID0gZnVuY3Rpb24oYSwgYiwgYVN0YWNrLCBiU3RhY2spIHtcbiAgICAvLyBJZGVudGljYWwgb2JqZWN0cyBhcmUgZXF1YWwuIGAwID09PSAtMGAsIGJ1dCB0aGV5IGFyZW4ndCBpZGVudGljYWwuXG4gICAgLy8gU2VlIHRoZSBbSGFybW9ueSBgZWdhbGAgcHJvcG9zYWxdKGh0dHA6Ly93aWtpLmVjbWFzY3JpcHQub3JnL2Rva3UucGhwP2lkPWhhcm1vbnk6ZWdhbCkuXG4gICAgaWYgKGEgPT09IGIpIHJldHVybiBhICE9PSAwIHx8IDEgLyBhID09PSAxIC8gYjtcbiAgICAvLyBBIHN0cmljdCBjb21wYXJpc29uIGlzIG5lY2Vzc2FyeSBiZWNhdXNlIGBudWxsID09IHVuZGVmaW5lZGAuXG4gICAgaWYgKGEgPT0gbnVsbCB8fCBiID09IG51bGwpIHJldHVybiBhID09PSBiO1xuICAgIC8vIFVud3JhcCBhbnkgd3JhcHBlZCBvYmplY3RzLlxuICAgIGlmIChhIGluc3RhbmNlb2YgXykgYSA9IGEuX3dyYXBwZWQ7XG4gICAgaWYgKGIgaW5zdGFuY2VvZiBfKSBiID0gYi5fd3JhcHBlZDtcbiAgICAvLyBDb21wYXJlIGBbW0NsYXNzXV1gIG5hbWVzLlxuICAgIHZhciBjbGFzc05hbWUgPSB0b1N0cmluZy5jYWxsKGEpO1xuICAgIGlmIChjbGFzc05hbWUgIT09IHRvU3RyaW5nLmNhbGwoYikpIHJldHVybiBmYWxzZTtcbiAgICBzd2l0Y2ggKGNsYXNzTmFtZSkge1xuICAgICAgLy8gU3RyaW5ncywgbnVtYmVycywgcmVndWxhciBleHByZXNzaW9ucywgZGF0ZXMsIGFuZCBib29sZWFucyBhcmUgY29tcGFyZWQgYnkgdmFsdWUuXG4gICAgICBjYXNlICdbb2JqZWN0IFJlZ0V4cF0nOlxuICAgICAgLy8gUmVnRXhwcyBhcmUgY29lcmNlZCB0byBzdHJpbmdzIGZvciBjb21wYXJpc29uIChOb3RlOiAnJyArIC9hL2kgPT09ICcvYS9pJylcbiAgICAgIGNhc2UgJ1tvYmplY3QgU3RyaW5nXSc6XG4gICAgICAgIC8vIFByaW1pdGl2ZXMgYW5kIHRoZWlyIGNvcnJlc3BvbmRpbmcgb2JqZWN0IHdyYXBwZXJzIGFyZSBlcXVpdmFsZW50OyB0aHVzLCBgXCI1XCJgIGlzXG4gICAgICAgIC8vIGVxdWl2YWxlbnQgdG8gYG5ldyBTdHJpbmcoXCI1XCIpYC5cbiAgICAgICAgcmV0dXJuICcnICsgYSA9PT0gJycgKyBiO1xuICAgICAgY2FzZSAnW29iamVjdCBOdW1iZXJdJzpcbiAgICAgICAgLy8gYE5hTmBzIGFyZSBlcXVpdmFsZW50LCBidXQgbm9uLXJlZmxleGl2ZS5cbiAgICAgICAgLy8gT2JqZWN0KE5hTikgaXMgZXF1aXZhbGVudCB0byBOYU5cbiAgICAgICAgaWYgKCthICE9PSArYSkgcmV0dXJuICtiICE9PSArYjtcbiAgICAgICAgLy8gQW4gYGVnYWxgIGNvbXBhcmlzb24gaXMgcGVyZm9ybWVkIGZvciBvdGhlciBudW1lcmljIHZhbHVlcy5cbiAgICAgICAgcmV0dXJuICthID09PSAwID8gMSAvICthID09PSAxIC8gYiA6ICthID09PSArYjtcbiAgICAgIGNhc2UgJ1tvYmplY3QgRGF0ZV0nOlxuICAgICAgY2FzZSAnW29iamVjdCBCb29sZWFuXSc6XG4gICAgICAgIC8vIENvZXJjZSBkYXRlcyBhbmQgYm9vbGVhbnMgdG8gbnVtZXJpYyBwcmltaXRpdmUgdmFsdWVzLiBEYXRlcyBhcmUgY29tcGFyZWQgYnkgdGhlaXJcbiAgICAgICAgLy8gbWlsbGlzZWNvbmQgcmVwcmVzZW50YXRpb25zLiBOb3RlIHRoYXQgaW52YWxpZCBkYXRlcyB3aXRoIG1pbGxpc2Vjb25kIHJlcHJlc2VudGF0aW9uc1xuICAgICAgICAvLyBvZiBgTmFOYCBhcmUgbm90IGVxdWl2YWxlbnQuXG4gICAgICAgIHJldHVybiArYSA9PT0gK2I7XG4gICAgfVxuXG4gICAgdmFyIGFyZUFycmF5cyA9IGNsYXNzTmFtZSA9PT0gJ1tvYmplY3QgQXJyYXldJztcbiAgICBpZiAoIWFyZUFycmF5cykge1xuICAgICAgaWYgKHR5cGVvZiBhICE9ICdvYmplY3QnIHx8IHR5cGVvZiBiICE9ICdvYmplY3QnKSByZXR1cm4gZmFsc2U7XG5cbiAgICAgIC8vIE9iamVjdHMgd2l0aCBkaWZmZXJlbnQgY29uc3RydWN0b3JzIGFyZSBub3QgZXF1aXZhbGVudCwgYnV0IGBPYmplY3RgcyBvciBgQXJyYXlgc1xuICAgICAgLy8gZnJvbSBkaWZmZXJlbnQgZnJhbWVzIGFyZS5cbiAgICAgIHZhciBhQ3RvciA9IGEuY29uc3RydWN0b3IsIGJDdG9yID0gYi5jb25zdHJ1Y3RvcjtcbiAgICAgIGlmIChhQ3RvciAhPT0gYkN0b3IgJiYgIShfLmlzRnVuY3Rpb24oYUN0b3IpICYmIGFDdG9yIGluc3RhbmNlb2YgYUN0b3IgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBfLmlzRnVuY3Rpb24oYkN0b3IpICYmIGJDdG9yIGluc3RhbmNlb2YgYkN0b3IpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICYmICgnY29uc3RydWN0b3InIGluIGEgJiYgJ2NvbnN0cnVjdG9yJyBpbiBiKSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgfVxuICAgIC8vIEFzc3VtZSBlcXVhbGl0eSBmb3IgY3ljbGljIHN0cnVjdHVyZXMuIFRoZSBhbGdvcml0aG0gZm9yIGRldGVjdGluZyBjeWNsaWNcbiAgICAvLyBzdHJ1Y3R1cmVzIGlzIGFkYXB0ZWQgZnJvbSBFUyA1LjEgc2VjdGlvbiAxNS4xMi4zLCBhYnN0cmFjdCBvcGVyYXRpb24gYEpPYC5cblxuICAgIC8vIEluaXRpYWxpemluZyBzdGFjayBvZiB0cmF2ZXJzZWQgb2JqZWN0cy5cbiAgICAvLyBJdCdzIGRvbmUgaGVyZSBzaW5jZSB3ZSBvbmx5IG5lZWQgdGhlbSBmb3Igb2JqZWN0cyBhbmQgYXJyYXlzIGNvbXBhcmlzb24uXG4gICAgYVN0YWNrID0gYVN0YWNrIHx8IFtdO1xuICAgIGJTdGFjayA9IGJTdGFjayB8fCBbXTtcbiAgICB2YXIgbGVuZ3RoID0gYVN0YWNrLmxlbmd0aDtcbiAgICB3aGlsZSAobGVuZ3RoLS0pIHtcbiAgICAgIC8vIExpbmVhciBzZWFyY2guIFBlcmZvcm1hbmNlIGlzIGludmVyc2VseSBwcm9wb3J0aW9uYWwgdG8gdGhlIG51bWJlciBvZlxuICAgICAgLy8gdW5pcXVlIG5lc3RlZCBzdHJ1Y3R1cmVzLlxuICAgICAgaWYgKGFTdGFja1tsZW5ndGhdID09PSBhKSByZXR1cm4gYlN0YWNrW2xlbmd0aF0gPT09IGI7XG4gICAgfVxuXG4gICAgLy8gQWRkIHRoZSBmaXJzdCBvYmplY3QgdG8gdGhlIHN0YWNrIG9mIHRyYXZlcnNlZCBvYmplY3RzLlxuICAgIGFTdGFjay5wdXNoKGEpO1xuICAgIGJTdGFjay5wdXNoKGIpO1xuXG4gICAgLy8gUmVjdXJzaXZlbHkgY29tcGFyZSBvYmplY3RzIGFuZCBhcnJheXMuXG4gICAgaWYgKGFyZUFycmF5cykge1xuICAgICAgLy8gQ29tcGFyZSBhcnJheSBsZW5ndGhzIHRvIGRldGVybWluZSBpZiBhIGRlZXAgY29tcGFyaXNvbiBpcyBuZWNlc3NhcnkuXG4gICAgICBsZW5ndGggPSBhLmxlbmd0aDtcbiAgICAgIGlmIChsZW5ndGggIT09IGIubGVuZ3RoKSByZXR1cm4gZmFsc2U7XG4gICAgICAvLyBEZWVwIGNvbXBhcmUgdGhlIGNvbnRlbnRzLCBpZ25vcmluZyBub24tbnVtZXJpYyBwcm9wZXJ0aWVzLlxuICAgICAgd2hpbGUgKGxlbmd0aC0tKSB7XG4gICAgICAgIGlmICghZXEoYVtsZW5ndGhdLCBiW2xlbmd0aF0sIGFTdGFjaywgYlN0YWNrKSkgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBEZWVwIGNvbXBhcmUgb2JqZWN0cy5cbiAgICAgIHZhciBrZXlzID0gXy5rZXlzKGEpLCBrZXk7XG4gICAgICBsZW5ndGggPSBrZXlzLmxlbmd0aDtcbiAgICAgIC8vIEVuc3VyZSB0aGF0IGJvdGggb2JqZWN0cyBjb250YWluIHRoZSBzYW1lIG51bWJlciBvZiBwcm9wZXJ0aWVzIGJlZm9yZSBjb21wYXJpbmcgZGVlcCBlcXVhbGl0eS5cbiAgICAgIGlmIChfLmtleXMoYikubGVuZ3RoICE9PSBsZW5ndGgpIHJldHVybiBmYWxzZTtcbiAgICAgIHdoaWxlIChsZW5ndGgtLSkge1xuICAgICAgICAvLyBEZWVwIGNvbXBhcmUgZWFjaCBtZW1iZXJcbiAgICAgICAga2V5ID0ga2V5c1tsZW5ndGhdO1xuICAgICAgICBpZiAoIShfLmhhcyhiLCBrZXkpICYmIGVxKGFba2V5XSwgYltrZXldLCBhU3RhY2ssIGJTdGFjaykpKSByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgfVxuICAgIC8vIFJlbW92ZSB0aGUgZmlyc3Qgb2JqZWN0IGZyb20gdGhlIHN0YWNrIG9mIHRyYXZlcnNlZCBvYmplY3RzLlxuICAgIGFTdGFjay5wb3AoKTtcbiAgICBiU3RhY2sucG9wKCk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH07XG5cbiAgLy8gUGVyZm9ybSBhIGRlZXAgY29tcGFyaXNvbiB0byBjaGVjayBpZiB0d28gb2JqZWN0cyBhcmUgZXF1YWwuXG4gIF8uaXNFcXVhbCA9IGZ1bmN0aW9uKGEsIGIpIHtcbiAgICByZXR1cm4gZXEoYSwgYik7XG4gIH07XG5cbiAgLy8gSXMgYSBnaXZlbiBhcnJheSwgc3RyaW5nLCBvciBvYmplY3QgZW1wdHk/XG4gIC8vIEFuIFwiZW1wdHlcIiBvYmplY3QgaGFzIG5vIGVudW1lcmFibGUgb3duLXByb3BlcnRpZXMuXG4gIF8uaXNFbXB0eSA9IGZ1bmN0aW9uKG9iaikge1xuICAgIGlmIChvYmogPT0gbnVsbCkgcmV0dXJuIHRydWU7XG4gICAgaWYgKGlzQXJyYXlMaWtlKG9iaikgJiYgKF8uaXNBcnJheShvYmopIHx8IF8uaXNTdHJpbmcob2JqKSB8fCBfLmlzQXJndW1lbnRzKG9iaikpKSByZXR1cm4gb2JqLmxlbmd0aCA9PT0gMDtcbiAgICByZXR1cm4gXy5rZXlzKG9iaikubGVuZ3RoID09PSAwO1xuICB9O1xuXG4gIC8vIElzIGEgZ2l2ZW4gdmFsdWUgYSBET00gZWxlbWVudD9cbiAgXy5pc0VsZW1lbnQgPSBmdW5jdGlvbihvYmopIHtcbiAgICByZXR1cm4gISEob2JqICYmIG9iai5ub2RlVHlwZSA9PT0gMSk7XG4gIH07XG5cbiAgLy8gSXMgYSBnaXZlbiB2YWx1ZSBhbiBhcnJheT9cbiAgLy8gRGVsZWdhdGVzIHRvIEVDTUE1J3MgbmF0aXZlIEFycmF5LmlzQXJyYXlcbiAgXy5pc0FycmF5ID0gbmF0aXZlSXNBcnJheSB8fCBmdW5jdGlvbihvYmopIHtcbiAgICByZXR1cm4gdG9TdHJpbmcuY2FsbChvYmopID09PSAnW29iamVjdCBBcnJheV0nO1xuICB9O1xuXG4gIC8vIElzIGEgZ2l2ZW4gdmFyaWFibGUgYW4gb2JqZWN0P1xuICBfLmlzT2JqZWN0ID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgdmFyIHR5cGUgPSB0eXBlb2Ygb2JqO1xuICAgIHJldHVybiB0eXBlID09PSAnZnVuY3Rpb24nIHx8IHR5cGUgPT09ICdvYmplY3QnICYmICEhb2JqO1xuICB9O1xuXG4gIC8vIEFkZCBzb21lIGlzVHlwZSBtZXRob2RzOiBpc0FyZ3VtZW50cywgaXNGdW5jdGlvbiwgaXNTdHJpbmcsIGlzTnVtYmVyLCBpc0RhdGUsIGlzUmVnRXhwLCBpc0Vycm9yLlxuICBfLmVhY2goWydBcmd1bWVudHMnLCAnRnVuY3Rpb24nLCAnU3RyaW5nJywgJ051bWJlcicsICdEYXRlJywgJ1JlZ0V4cCcsICdFcnJvciddLCBmdW5jdGlvbihuYW1lKSB7XG4gICAgX1snaXMnICsgbmFtZV0gPSBmdW5jdGlvbihvYmopIHtcbiAgICAgIHJldHVybiB0b1N0cmluZy5jYWxsKG9iaikgPT09ICdbb2JqZWN0ICcgKyBuYW1lICsgJ10nO1xuICAgIH07XG4gIH0pO1xuXG4gIC8vIERlZmluZSBhIGZhbGxiYWNrIHZlcnNpb24gb2YgdGhlIG1ldGhvZCBpbiBicm93c2VycyAoYWhlbSwgSUUgPCA5KSwgd2hlcmVcbiAgLy8gdGhlcmUgaXNuJ3QgYW55IGluc3BlY3RhYmxlIFwiQXJndW1lbnRzXCIgdHlwZS5cbiAgaWYgKCFfLmlzQXJndW1lbnRzKGFyZ3VtZW50cykpIHtcbiAgICBfLmlzQXJndW1lbnRzID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgICByZXR1cm4gXy5oYXMob2JqLCAnY2FsbGVlJyk7XG4gICAgfTtcbiAgfVxuXG4gIC8vIE9wdGltaXplIGBpc0Z1bmN0aW9uYCBpZiBhcHByb3ByaWF0ZS4gV29yayBhcm91bmQgc29tZSB0eXBlb2YgYnVncyBpbiBvbGQgdjgsXG4gIC8vIElFIDExICgjMTYyMSksIGFuZCBpbiBTYWZhcmkgOCAoIzE5MjkpLlxuICBpZiAodHlwZW9mIC8uLyAhPSAnZnVuY3Rpb24nICYmIHR5cGVvZiBJbnQ4QXJyYXkgIT0gJ29iamVjdCcpIHtcbiAgICBfLmlzRnVuY3Rpb24gPSBmdW5jdGlvbihvYmopIHtcbiAgICAgIHJldHVybiB0eXBlb2Ygb2JqID09ICdmdW5jdGlvbicgfHwgZmFsc2U7XG4gICAgfTtcbiAgfVxuXG4gIC8vIElzIGEgZ2l2ZW4gb2JqZWN0IGEgZmluaXRlIG51bWJlcj9cbiAgXy5pc0Zpbml0ZSA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHJldHVybiBpc0Zpbml0ZShvYmopICYmICFpc05hTihwYXJzZUZsb2F0KG9iaikpO1xuICB9O1xuXG4gIC8vIElzIHRoZSBnaXZlbiB2YWx1ZSBgTmFOYD8gKE5hTiBpcyB0aGUgb25seSBudW1iZXIgd2hpY2ggZG9lcyBub3QgZXF1YWwgaXRzZWxmKS5cbiAgXy5pc05hTiA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHJldHVybiBfLmlzTnVtYmVyKG9iaikgJiYgb2JqICE9PSArb2JqO1xuICB9O1xuXG4gIC8vIElzIGEgZ2l2ZW4gdmFsdWUgYSBib29sZWFuP1xuICBfLmlzQm9vbGVhbiA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHJldHVybiBvYmogPT09IHRydWUgfHwgb2JqID09PSBmYWxzZSB8fCB0b1N0cmluZy5jYWxsKG9iaikgPT09ICdbb2JqZWN0IEJvb2xlYW5dJztcbiAgfTtcblxuICAvLyBJcyBhIGdpdmVuIHZhbHVlIGVxdWFsIHRvIG51bGw/XG4gIF8uaXNOdWxsID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgcmV0dXJuIG9iaiA9PT0gbnVsbDtcbiAgfTtcblxuICAvLyBJcyBhIGdpdmVuIHZhcmlhYmxlIHVuZGVmaW5lZD9cbiAgXy5pc1VuZGVmaW5lZCA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHJldHVybiBvYmogPT09IHZvaWQgMDtcbiAgfTtcblxuICAvLyBTaG9ydGN1dCBmdW5jdGlvbiBmb3IgY2hlY2tpbmcgaWYgYW4gb2JqZWN0IGhhcyBhIGdpdmVuIHByb3BlcnR5IGRpcmVjdGx5XG4gIC8vIG9uIGl0c2VsZiAoaW4gb3RoZXIgd29yZHMsIG5vdCBvbiBhIHByb3RvdHlwZSkuXG4gIF8uaGFzID0gZnVuY3Rpb24ob2JqLCBrZXkpIHtcbiAgICByZXR1cm4gb2JqICE9IG51bGwgJiYgaGFzT3duUHJvcGVydHkuY2FsbChvYmosIGtleSk7XG4gIH07XG5cbiAgLy8gVXRpbGl0eSBGdW5jdGlvbnNcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS1cblxuICAvLyBSdW4gVW5kZXJzY29yZS5qcyBpbiAqbm9Db25mbGljdCogbW9kZSwgcmV0dXJuaW5nIHRoZSBgX2AgdmFyaWFibGUgdG8gaXRzXG4gIC8vIHByZXZpb3VzIG93bmVyLiBSZXR1cm5zIGEgcmVmZXJlbmNlIHRvIHRoZSBVbmRlcnNjb3JlIG9iamVjdC5cbiAgXy5ub0NvbmZsaWN0ID0gZnVuY3Rpb24oKSB7XG4gICAgcm9vdC5fID0gcHJldmlvdXNVbmRlcnNjb3JlO1xuICAgIHJldHVybiB0aGlzO1xuICB9O1xuXG4gIC8vIEtlZXAgdGhlIGlkZW50aXR5IGZ1bmN0aW9uIGFyb3VuZCBmb3IgZGVmYXVsdCBpdGVyYXRlZXMuXG4gIF8uaWRlbnRpdHkgPSBmdW5jdGlvbih2YWx1ZSkge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfTtcblxuICAvLyBQcmVkaWNhdGUtZ2VuZXJhdGluZyBmdW5jdGlvbnMuIE9mdGVuIHVzZWZ1bCBvdXRzaWRlIG9mIFVuZGVyc2NvcmUuXG4gIF8uY29uc3RhbnQgPSBmdW5jdGlvbih2YWx1ZSkge1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9O1xuICB9O1xuXG4gIF8ubm9vcCA9IGZ1bmN0aW9uKCl7fTtcblxuICBfLnByb3BlcnR5ID0gcHJvcGVydHk7XG5cbiAgLy8gR2VuZXJhdGVzIGEgZnVuY3Rpb24gZm9yIGEgZ2l2ZW4gb2JqZWN0IHRoYXQgcmV0dXJucyBhIGdpdmVuIHByb3BlcnR5LlxuICBfLnByb3BlcnR5T2YgPSBmdW5jdGlvbihvYmopIHtcbiAgICByZXR1cm4gb2JqID09IG51bGwgPyBmdW5jdGlvbigpe30gOiBmdW5jdGlvbihrZXkpIHtcbiAgICAgIHJldHVybiBvYmpba2V5XTtcbiAgICB9O1xuICB9O1xuXG4gIC8vIFJldHVybnMgYSBwcmVkaWNhdGUgZm9yIGNoZWNraW5nIHdoZXRoZXIgYW4gb2JqZWN0IGhhcyBhIGdpdmVuIHNldCBvZlxuICAvLyBga2V5OnZhbHVlYCBwYWlycy5cbiAgXy5tYXRjaGVyID0gXy5tYXRjaGVzID0gZnVuY3Rpb24oYXR0cnMpIHtcbiAgICBhdHRycyA9IF8uZXh0ZW5kT3duKHt9LCBhdHRycyk7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKG9iaikge1xuICAgICAgcmV0dXJuIF8uaXNNYXRjaChvYmosIGF0dHJzKTtcbiAgICB9O1xuICB9O1xuXG4gIC8vIFJ1biBhIGZ1bmN0aW9uICoqbioqIHRpbWVzLlxuICBfLnRpbWVzID0gZnVuY3Rpb24obiwgaXRlcmF0ZWUsIGNvbnRleHQpIHtcbiAgICB2YXIgYWNjdW0gPSBBcnJheShNYXRoLm1heCgwLCBuKSk7XG4gICAgaXRlcmF0ZWUgPSBvcHRpbWl6ZUNiKGl0ZXJhdGVlLCBjb250ZXh0LCAxKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG47IGkrKykgYWNjdW1baV0gPSBpdGVyYXRlZShpKTtcbiAgICByZXR1cm4gYWNjdW07XG4gIH07XG5cbiAgLy8gUmV0dXJuIGEgcmFuZG9tIGludGVnZXIgYmV0d2VlbiBtaW4gYW5kIG1heCAoaW5jbHVzaXZlKS5cbiAgXy5yYW5kb20gPSBmdW5jdGlvbihtaW4sIG1heCkge1xuICAgIGlmIChtYXggPT0gbnVsbCkge1xuICAgICAgbWF4ID0gbWluO1xuICAgICAgbWluID0gMDtcbiAgICB9XG4gICAgcmV0dXJuIG1pbiArIE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIChtYXggLSBtaW4gKyAxKSk7XG4gIH07XG5cbiAgLy8gQSAocG9zc2libHkgZmFzdGVyKSB3YXkgdG8gZ2V0IHRoZSBjdXJyZW50IHRpbWVzdGFtcCBhcyBhbiBpbnRlZ2VyLlxuICBfLm5vdyA9IERhdGUubm93IHx8IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgfTtcblxuICAgLy8gTGlzdCBvZiBIVE1MIGVudGl0aWVzIGZvciBlc2NhcGluZy5cbiAgdmFyIGVzY2FwZU1hcCA9IHtcbiAgICAnJic6ICcmYW1wOycsXG4gICAgJzwnOiAnJmx0OycsXG4gICAgJz4nOiAnJmd0OycsXG4gICAgJ1wiJzogJyZxdW90OycsXG4gICAgXCInXCI6ICcmI3gyNzsnLFxuICAgICdgJzogJyYjeDYwOydcbiAgfTtcbiAgdmFyIHVuZXNjYXBlTWFwID0gXy5pbnZlcnQoZXNjYXBlTWFwKTtcblxuICAvLyBGdW5jdGlvbnMgZm9yIGVzY2FwaW5nIGFuZCB1bmVzY2FwaW5nIHN0cmluZ3MgdG8vZnJvbSBIVE1MIGludGVycG9sYXRpb24uXG4gIHZhciBjcmVhdGVFc2NhcGVyID0gZnVuY3Rpb24obWFwKSB7XG4gICAgdmFyIGVzY2FwZXIgPSBmdW5jdGlvbihtYXRjaCkge1xuICAgICAgcmV0dXJuIG1hcFttYXRjaF07XG4gICAgfTtcbiAgICAvLyBSZWdleGVzIGZvciBpZGVudGlmeWluZyBhIGtleSB0aGF0IG5lZWRzIHRvIGJlIGVzY2FwZWRcbiAgICB2YXIgc291cmNlID0gJyg/OicgKyBfLmtleXMobWFwKS5qb2luKCd8JykgKyAnKSc7XG4gICAgdmFyIHRlc3RSZWdleHAgPSBSZWdFeHAoc291cmNlKTtcbiAgICB2YXIgcmVwbGFjZVJlZ2V4cCA9IFJlZ0V4cChzb3VyY2UsICdnJyk7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKHN0cmluZykge1xuICAgICAgc3RyaW5nID0gc3RyaW5nID09IG51bGwgPyAnJyA6ICcnICsgc3RyaW5nO1xuICAgICAgcmV0dXJuIHRlc3RSZWdleHAudGVzdChzdHJpbmcpID8gc3RyaW5nLnJlcGxhY2UocmVwbGFjZVJlZ2V4cCwgZXNjYXBlcikgOiBzdHJpbmc7XG4gICAgfTtcbiAgfTtcbiAgXy5lc2NhcGUgPSBjcmVhdGVFc2NhcGVyKGVzY2FwZU1hcCk7XG4gIF8udW5lc2NhcGUgPSBjcmVhdGVFc2NhcGVyKHVuZXNjYXBlTWFwKTtcblxuICAvLyBJZiB0aGUgdmFsdWUgb2YgdGhlIG5hbWVkIGBwcm9wZXJ0eWAgaXMgYSBmdW5jdGlvbiB0aGVuIGludm9rZSBpdCB3aXRoIHRoZVxuICAvLyBgb2JqZWN0YCBhcyBjb250ZXh0OyBvdGhlcndpc2UsIHJldHVybiBpdC5cbiAgXy5yZXN1bHQgPSBmdW5jdGlvbihvYmplY3QsIHByb3BlcnR5LCBmYWxsYmFjaykge1xuICAgIHZhciB2YWx1ZSA9IG9iamVjdCA9PSBudWxsID8gdm9pZCAwIDogb2JqZWN0W3Byb3BlcnR5XTtcbiAgICBpZiAodmFsdWUgPT09IHZvaWQgMCkge1xuICAgICAgdmFsdWUgPSBmYWxsYmFjaztcbiAgICB9XG4gICAgcmV0dXJuIF8uaXNGdW5jdGlvbih2YWx1ZSkgPyB2YWx1ZS5jYWxsKG9iamVjdCkgOiB2YWx1ZTtcbiAgfTtcblxuICAvLyBHZW5lcmF0ZSBhIHVuaXF1ZSBpbnRlZ2VyIGlkICh1bmlxdWUgd2l0aGluIHRoZSBlbnRpcmUgY2xpZW50IHNlc3Npb24pLlxuICAvLyBVc2VmdWwgZm9yIHRlbXBvcmFyeSBET00gaWRzLlxuICB2YXIgaWRDb3VudGVyID0gMDtcbiAgXy51bmlxdWVJZCA9IGZ1bmN0aW9uKHByZWZpeCkge1xuICAgIHZhciBpZCA9ICsraWRDb3VudGVyICsgJyc7XG4gICAgcmV0dXJuIHByZWZpeCA/IHByZWZpeCArIGlkIDogaWQ7XG4gIH07XG5cbiAgLy8gQnkgZGVmYXVsdCwgVW5kZXJzY29yZSB1c2VzIEVSQi1zdHlsZSB0ZW1wbGF0ZSBkZWxpbWl0ZXJzLCBjaGFuZ2UgdGhlXG4gIC8vIGZvbGxvd2luZyB0ZW1wbGF0ZSBzZXR0aW5ncyB0byB1c2UgYWx0ZXJuYXRpdmUgZGVsaW1pdGVycy5cbiAgXy50ZW1wbGF0ZVNldHRpbmdzID0ge1xuICAgIGV2YWx1YXRlICAgIDogLzwlKFtcXHNcXFNdKz8pJT4vZyxcbiAgICBpbnRlcnBvbGF0ZSA6IC88JT0oW1xcc1xcU10rPyklPi9nLFxuICAgIGVzY2FwZSAgICAgIDogLzwlLShbXFxzXFxTXSs/KSU+L2dcbiAgfTtcblxuICAvLyBXaGVuIGN1c3RvbWl6aW5nIGB0ZW1wbGF0ZVNldHRpbmdzYCwgaWYgeW91IGRvbid0IHdhbnQgdG8gZGVmaW5lIGFuXG4gIC8vIGludGVycG9sYXRpb24sIGV2YWx1YXRpb24gb3IgZXNjYXBpbmcgcmVnZXgsIHdlIG5lZWQgb25lIHRoYXQgaXNcbiAgLy8gZ3VhcmFudGVlZCBub3QgdG8gbWF0Y2guXG4gIHZhciBub01hdGNoID0gLyguKV4vO1xuXG4gIC8vIENlcnRhaW4gY2hhcmFjdGVycyBuZWVkIHRvIGJlIGVzY2FwZWQgc28gdGhhdCB0aGV5IGNhbiBiZSBwdXQgaW50byBhXG4gIC8vIHN0cmluZyBsaXRlcmFsLlxuICB2YXIgZXNjYXBlcyA9IHtcbiAgICBcIidcIjogICAgICBcIidcIixcbiAgICAnXFxcXCc6ICAgICAnXFxcXCcsXG4gICAgJ1xccic6ICAgICAncicsXG4gICAgJ1xcbic6ICAgICAnbicsXG4gICAgJ1xcdTIwMjgnOiAndTIwMjgnLFxuICAgICdcXHUyMDI5JzogJ3UyMDI5J1xuICB9O1xuXG4gIHZhciBlc2NhcGVyID0gL1xcXFx8J3xcXHJ8XFxufFxcdTIwMjh8XFx1MjAyOS9nO1xuXG4gIHZhciBlc2NhcGVDaGFyID0gZnVuY3Rpb24obWF0Y2gpIHtcbiAgICByZXR1cm4gJ1xcXFwnICsgZXNjYXBlc1ttYXRjaF07XG4gIH07XG5cbiAgLy8gSmF2YVNjcmlwdCBtaWNyby10ZW1wbGF0aW5nLCBzaW1pbGFyIHRvIEpvaG4gUmVzaWcncyBpbXBsZW1lbnRhdGlvbi5cbiAgLy8gVW5kZXJzY29yZSB0ZW1wbGF0aW5nIGhhbmRsZXMgYXJiaXRyYXJ5IGRlbGltaXRlcnMsIHByZXNlcnZlcyB3aGl0ZXNwYWNlLFxuICAvLyBhbmQgY29ycmVjdGx5IGVzY2FwZXMgcXVvdGVzIHdpdGhpbiBpbnRlcnBvbGF0ZWQgY29kZS5cbiAgLy8gTkI6IGBvbGRTZXR0aW5nc2Agb25seSBleGlzdHMgZm9yIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5LlxuICBfLnRlbXBsYXRlID0gZnVuY3Rpb24odGV4dCwgc2V0dGluZ3MsIG9sZFNldHRpbmdzKSB7XG4gICAgaWYgKCFzZXR0aW5ncyAmJiBvbGRTZXR0aW5ncykgc2V0dGluZ3MgPSBvbGRTZXR0aW5ncztcbiAgICBzZXR0aW5ncyA9IF8uZGVmYXVsdHMoe30sIHNldHRpbmdzLCBfLnRlbXBsYXRlU2V0dGluZ3MpO1xuXG4gICAgLy8gQ29tYmluZSBkZWxpbWl0ZXJzIGludG8gb25lIHJlZ3VsYXIgZXhwcmVzc2lvbiB2aWEgYWx0ZXJuYXRpb24uXG4gICAgdmFyIG1hdGNoZXIgPSBSZWdFeHAoW1xuICAgICAgKHNldHRpbmdzLmVzY2FwZSB8fCBub01hdGNoKS5zb3VyY2UsXG4gICAgICAoc2V0dGluZ3MuaW50ZXJwb2xhdGUgfHwgbm9NYXRjaCkuc291cmNlLFxuICAgICAgKHNldHRpbmdzLmV2YWx1YXRlIHx8IG5vTWF0Y2gpLnNvdXJjZVxuICAgIF0uam9pbignfCcpICsgJ3wkJywgJ2cnKTtcblxuICAgIC8vIENvbXBpbGUgdGhlIHRlbXBsYXRlIHNvdXJjZSwgZXNjYXBpbmcgc3RyaW5nIGxpdGVyYWxzIGFwcHJvcHJpYXRlbHkuXG4gICAgdmFyIGluZGV4ID0gMDtcbiAgICB2YXIgc291cmNlID0gXCJfX3ArPSdcIjtcbiAgICB0ZXh0LnJlcGxhY2UobWF0Y2hlciwgZnVuY3Rpb24obWF0Y2gsIGVzY2FwZSwgaW50ZXJwb2xhdGUsIGV2YWx1YXRlLCBvZmZzZXQpIHtcbiAgICAgIHNvdXJjZSArPSB0ZXh0LnNsaWNlKGluZGV4LCBvZmZzZXQpLnJlcGxhY2UoZXNjYXBlciwgZXNjYXBlQ2hhcik7XG4gICAgICBpbmRleCA9IG9mZnNldCArIG1hdGNoLmxlbmd0aDtcblxuICAgICAgaWYgKGVzY2FwZSkge1xuICAgICAgICBzb3VyY2UgKz0gXCInK1xcbigoX190PShcIiArIGVzY2FwZSArIFwiKSk9PW51bGw/Jyc6Xy5lc2NhcGUoX190KSkrXFxuJ1wiO1xuICAgICAgfSBlbHNlIGlmIChpbnRlcnBvbGF0ZSkge1xuICAgICAgICBzb3VyY2UgKz0gXCInK1xcbigoX190PShcIiArIGludGVycG9sYXRlICsgXCIpKT09bnVsbD8nJzpfX3QpK1xcbidcIjtcbiAgICAgIH0gZWxzZSBpZiAoZXZhbHVhdGUpIHtcbiAgICAgICAgc291cmNlICs9IFwiJztcXG5cIiArIGV2YWx1YXRlICsgXCJcXG5fX3ArPSdcIjtcbiAgICAgIH1cblxuICAgICAgLy8gQWRvYmUgVk1zIG5lZWQgdGhlIG1hdGNoIHJldHVybmVkIHRvIHByb2R1Y2UgdGhlIGNvcnJlY3Qgb2ZmZXN0LlxuICAgICAgcmV0dXJuIG1hdGNoO1xuICAgIH0pO1xuICAgIHNvdXJjZSArPSBcIic7XFxuXCI7XG5cbiAgICAvLyBJZiBhIHZhcmlhYmxlIGlzIG5vdCBzcGVjaWZpZWQsIHBsYWNlIGRhdGEgdmFsdWVzIGluIGxvY2FsIHNjb3BlLlxuICAgIGlmICghc2V0dGluZ3MudmFyaWFibGUpIHNvdXJjZSA9ICd3aXRoKG9ianx8e30pe1xcbicgKyBzb3VyY2UgKyAnfVxcbic7XG5cbiAgICBzb3VyY2UgPSBcInZhciBfX3QsX19wPScnLF9faj1BcnJheS5wcm90b3R5cGUuam9pbixcIiArXG4gICAgICBcInByaW50PWZ1bmN0aW9uKCl7X19wKz1fX2ouY2FsbChhcmd1bWVudHMsJycpO307XFxuXCIgK1xuICAgICAgc291cmNlICsgJ3JldHVybiBfX3A7XFxuJztcblxuICAgIHRyeSB7XG4gICAgICB2YXIgcmVuZGVyID0gbmV3IEZ1bmN0aW9uKHNldHRpbmdzLnZhcmlhYmxlIHx8ICdvYmonLCAnXycsIHNvdXJjZSk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgZS5zb3VyY2UgPSBzb3VyY2U7XG4gICAgICB0aHJvdyBlO1xuICAgIH1cblxuICAgIHZhciB0ZW1wbGF0ZSA9IGZ1bmN0aW9uKGRhdGEpIHtcbiAgICAgIHJldHVybiByZW5kZXIuY2FsbCh0aGlzLCBkYXRhLCBfKTtcbiAgICB9O1xuXG4gICAgLy8gUHJvdmlkZSB0aGUgY29tcGlsZWQgc291cmNlIGFzIGEgY29udmVuaWVuY2UgZm9yIHByZWNvbXBpbGF0aW9uLlxuICAgIHZhciBhcmd1bWVudCA9IHNldHRpbmdzLnZhcmlhYmxlIHx8ICdvYmonO1xuICAgIHRlbXBsYXRlLnNvdXJjZSA9ICdmdW5jdGlvbignICsgYXJndW1lbnQgKyAnKXtcXG4nICsgc291cmNlICsgJ30nO1xuXG4gICAgcmV0dXJuIHRlbXBsYXRlO1xuICB9O1xuXG4gIC8vIEFkZCBhIFwiY2hhaW5cIiBmdW5jdGlvbi4gU3RhcnQgY2hhaW5pbmcgYSB3cmFwcGVkIFVuZGVyc2NvcmUgb2JqZWN0LlxuICBfLmNoYWluID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgdmFyIGluc3RhbmNlID0gXyhvYmopO1xuICAgIGluc3RhbmNlLl9jaGFpbiA9IHRydWU7XG4gICAgcmV0dXJuIGluc3RhbmNlO1xuICB9O1xuXG4gIC8vIE9PUFxuICAvLyAtLS0tLS0tLS0tLS0tLS1cbiAgLy8gSWYgVW5kZXJzY29yZSBpcyBjYWxsZWQgYXMgYSBmdW5jdGlvbiwgaXQgcmV0dXJucyBhIHdyYXBwZWQgb2JqZWN0IHRoYXRcbiAgLy8gY2FuIGJlIHVzZWQgT08tc3R5bGUuIFRoaXMgd3JhcHBlciBob2xkcyBhbHRlcmVkIHZlcnNpb25zIG9mIGFsbCB0aGVcbiAgLy8gdW5kZXJzY29yZSBmdW5jdGlvbnMuIFdyYXBwZWQgb2JqZWN0cyBtYXkgYmUgY2hhaW5lZC5cblxuICAvLyBIZWxwZXIgZnVuY3Rpb24gdG8gY29udGludWUgY2hhaW5pbmcgaW50ZXJtZWRpYXRlIHJlc3VsdHMuXG4gIHZhciByZXN1bHQgPSBmdW5jdGlvbihpbnN0YW5jZSwgb2JqKSB7XG4gICAgcmV0dXJuIGluc3RhbmNlLl9jaGFpbiA/IF8ob2JqKS5jaGFpbigpIDogb2JqO1xuICB9O1xuXG4gIC8vIEFkZCB5b3VyIG93biBjdXN0b20gZnVuY3Rpb25zIHRvIHRoZSBVbmRlcnNjb3JlIG9iamVjdC5cbiAgXy5taXhpbiA9IGZ1bmN0aW9uKG9iaikge1xuICAgIF8uZWFjaChfLmZ1bmN0aW9ucyhvYmopLCBmdW5jdGlvbihuYW1lKSB7XG4gICAgICB2YXIgZnVuYyA9IF9bbmFtZV0gPSBvYmpbbmFtZV07XG4gICAgICBfLnByb3RvdHlwZVtuYW1lXSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgYXJncyA9IFt0aGlzLl93cmFwcGVkXTtcbiAgICAgICAgcHVzaC5hcHBseShhcmdzLCBhcmd1bWVudHMpO1xuICAgICAgICByZXR1cm4gcmVzdWx0KHRoaXMsIGZ1bmMuYXBwbHkoXywgYXJncykpO1xuICAgICAgfTtcbiAgICB9KTtcbiAgfTtcblxuICAvLyBBZGQgYWxsIG9mIHRoZSBVbmRlcnNjb3JlIGZ1bmN0aW9ucyB0byB0aGUgd3JhcHBlciBvYmplY3QuXG4gIF8ubWl4aW4oXyk7XG5cbiAgLy8gQWRkIGFsbCBtdXRhdG9yIEFycmF5IGZ1bmN0aW9ucyB0byB0aGUgd3JhcHBlci5cbiAgXy5lYWNoKFsncG9wJywgJ3B1c2gnLCAncmV2ZXJzZScsICdzaGlmdCcsICdzb3J0JywgJ3NwbGljZScsICd1bnNoaWZ0J10sIGZ1bmN0aW9uKG5hbWUpIHtcbiAgICB2YXIgbWV0aG9kID0gQXJyYXlQcm90b1tuYW1lXTtcbiAgICBfLnByb3RvdHlwZVtuYW1lXSA9IGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIG9iaiA9IHRoaXMuX3dyYXBwZWQ7XG4gICAgICBtZXRob2QuYXBwbHkob2JqLCBhcmd1bWVudHMpO1xuICAgICAgaWYgKChuYW1lID09PSAnc2hpZnQnIHx8IG5hbWUgPT09ICdzcGxpY2UnKSAmJiBvYmoubGVuZ3RoID09PSAwKSBkZWxldGUgb2JqWzBdO1xuICAgICAgcmV0dXJuIHJlc3VsdCh0aGlzLCBvYmopO1xuICAgIH07XG4gIH0pO1xuXG4gIC8vIEFkZCBhbGwgYWNjZXNzb3IgQXJyYXkgZnVuY3Rpb25zIHRvIHRoZSB3cmFwcGVyLlxuICBfLmVhY2goWydjb25jYXQnLCAnam9pbicsICdzbGljZSddLCBmdW5jdGlvbihuYW1lKSB7XG4gICAgdmFyIG1ldGhvZCA9IEFycmF5UHJvdG9bbmFtZV07XG4gICAgXy5wcm90b3R5cGVbbmFtZV0gPSBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiByZXN1bHQodGhpcywgbWV0aG9kLmFwcGx5KHRoaXMuX3dyYXBwZWQsIGFyZ3VtZW50cykpO1xuICAgIH07XG4gIH0pO1xuXG4gIC8vIEV4dHJhY3RzIHRoZSByZXN1bHQgZnJvbSBhIHdyYXBwZWQgYW5kIGNoYWluZWQgb2JqZWN0LlxuICBfLnByb3RvdHlwZS52YWx1ZSA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLl93cmFwcGVkO1xuICB9O1xuXG4gIC8vIFByb3ZpZGUgdW53cmFwcGluZyBwcm94eSBmb3Igc29tZSBtZXRob2RzIHVzZWQgaW4gZW5naW5lIG9wZXJhdGlvbnNcbiAgLy8gc3VjaCBhcyBhcml0aG1ldGljIGFuZCBKU09OIHN0cmluZ2lmaWNhdGlvbi5cbiAgXy5wcm90b3R5cGUudmFsdWVPZiA9IF8ucHJvdG90eXBlLnRvSlNPTiA9IF8ucHJvdG90eXBlLnZhbHVlO1xuXG4gIF8ucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuICcnICsgdGhpcy5fd3JhcHBlZDtcbiAgfTtcblxuICAvLyBBTUQgcmVnaXN0cmF0aW9uIGhhcHBlbnMgYXQgdGhlIGVuZCBmb3IgY29tcGF0aWJpbGl0eSB3aXRoIEFNRCBsb2FkZXJzXG4gIC8vIHRoYXQgbWF5IG5vdCBlbmZvcmNlIG5leHQtdHVybiBzZW1hbnRpY3Mgb24gbW9kdWxlcy4gRXZlbiB0aG91Z2ggZ2VuZXJhbFxuICAvLyBwcmFjdGljZSBmb3IgQU1EIHJlZ2lzdHJhdGlvbiBpcyB0byBiZSBhbm9ueW1vdXMsIHVuZGVyc2NvcmUgcmVnaXN0ZXJzXG4gIC8vIGFzIGEgbmFtZWQgbW9kdWxlIGJlY2F1c2UsIGxpa2UgalF1ZXJ5LCBpdCBpcyBhIGJhc2UgbGlicmFyeSB0aGF0IGlzXG4gIC8vIHBvcHVsYXIgZW5vdWdoIHRvIGJlIGJ1bmRsZWQgaW4gYSB0aGlyZCBwYXJ0eSBsaWIsIGJ1dCBub3QgYmUgcGFydCBvZlxuICAvLyBhbiBBTUQgbG9hZCByZXF1ZXN0LiBUaG9zZSBjYXNlcyBjb3VsZCBnZW5lcmF0ZSBhbiBlcnJvciB3aGVuIGFuXG4gIC8vIGFub255bW91cyBkZWZpbmUoKSBpcyBjYWxsZWQgb3V0c2lkZSBvZiBhIGxvYWRlciByZXF1ZXN0LlxuICBpZiAodHlwZW9mIGRlZmluZSA9PT0gJ2Z1bmN0aW9uJyAmJiBkZWZpbmUuYW1kKSB7XG4gICAgZGVmaW5lKCd1bmRlcnNjb3JlJywgW10sIGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIF87XG4gICAgfSk7XG4gIH1cbn0uY2FsbCh0aGlzKSk7XG4iLCJ2YXIgYnVuZGxlRm4gPSBhcmd1bWVudHNbM107XG52YXIgc291cmNlcyA9IGFyZ3VtZW50c1s0XTtcbnZhciBjYWNoZSA9IGFyZ3VtZW50c1s1XTtcblxudmFyIHN0cmluZ2lmeSA9IEpTT04uc3RyaW5naWZ5O1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChmbiwgb3B0aW9ucykge1xuICAgIHZhciB3a2V5O1xuICAgIHZhciBjYWNoZUtleXMgPSBPYmplY3Qua2V5cyhjYWNoZSk7XG5cbiAgICBmb3IgKHZhciBpID0gMCwgbCA9IGNhY2hlS2V5cy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgdmFyIGtleSA9IGNhY2hlS2V5c1tpXTtcbiAgICAgICAgdmFyIGV4cCA9IGNhY2hlW2tleV0uZXhwb3J0cztcbiAgICAgICAgLy8gVXNpbmcgYmFiZWwgYXMgYSB0cmFuc3BpbGVyIHRvIHVzZSBlc21vZHVsZSwgdGhlIGV4cG9ydCB3aWxsIGFsd2F5c1xuICAgICAgICAvLyBiZSBhbiBvYmplY3Qgd2l0aCB0aGUgZGVmYXVsdCBleHBvcnQgYXMgYSBwcm9wZXJ0eSBvZiBpdC4gVG8gZW5zdXJlXG4gICAgICAgIC8vIHRoZSBleGlzdGluZyBhcGkgYW5kIGJhYmVsIGVzbW9kdWxlIGV4cG9ydHMgYXJlIGJvdGggc3VwcG9ydGVkIHdlXG4gICAgICAgIC8vIGNoZWNrIGZvciBib3RoXG4gICAgICAgIGlmIChleHAgPT09IGZuIHx8IGV4cCAmJiBleHAuZGVmYXVsdCA9PT0gZm4pIHtcbiAgICAgICAgICAgIHdrZXkgPSBrZXk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmICghd2tleSkge1xuICAgICAgICB3a2V5ID0gTWF0aC5mbG9vcihNYXRoLnBvdygxNiwgOCkgKiBNYXRoLnJhbmRvbSgpKS50b1N0cmluZygxNik7XG4gICAgICAgIHZhciB3Y2FjaGUgPSB7fTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDAsIGwgPSBjYWNoZUtleXMubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIga2V5ID0gY2FjaGVLZXlzW2ldO1xuICAgICAgICAgICAgd2NhY2hlW2tleV0gPSBrZXk7XG4gICAgICAgIH1cbiAgICAgICAgc291cmNlc1t3a2V5XSA9IFtcbiAgICAgICAgICAgIEZ1bmN0aW9uKFsncmVxdWlyZScsJ21vZHVsZScsJ2V4cG9ydHMnXSwgJygnICsgZm4gKyAnKShzZWxmKScpLFxuICAgICAgICAgICAgd2NhY2hlXG4gICAgICAgIF07XG4gICAgfVxuICAgIHZhciBza2V5ID0gTWF0aC5mbG9vcihNYXRoLnBvdygxNiwgOCkgKiBNYXRoLnJhbmRvbSgpKS50b1N0cmluZygxNik7XG5cbiAgICB2YXIgc2NhY2hlID0ge307IHNjYWNoZVt3a2V5XSA9IHdrZXk7XG4gICAgc291cmNlc1tza2V5XSA9IFtcbiAgICAgICAgRnVuY3Rpb24oWydyZXF1aXJlJ10sIChcbiAgICAgICAgICAgIC8vIHRyeSB0byBjYWxsIGRlZmF1bHQgaWYgZGVmaW5lZCB0byBhbHNvIHN1cHBvcnQgYmFiZWwgZXNtb2R1bGVcbiAgICAgICAgICAgIC8vIGV4cG9ydHNcbiAgICAgICAgICAgICd2YXIgZiA9IHJlcXVpcmUoJyArIHN0cmluZ2lmeSh3a2V5KSArICcpOycgK1xuICAgICAgICAgICAgJyhmLmRlZmF1bHQgPyBmLmRlZmF1bHQgOiBmKShzZWxmKTsnXG4gICAgICAgICkpLFxuICAgICAgICBzY2FjaGVcbiAgICBdO1xuXG4gICAgdmFyIHdvcmtlclNvdXJjZXMgPSB7fTtcbiAgICByZXNvbHZlU291cmNlcyhza2V5KTtcblxuICAgIGZ1bmN0aW9uIHJlc29sdmVTb3VyY2VzKGtleSkge1xuICAgICAgICB3b3JrZXJTb3VyY2VzW2tleV0gPSB0cnVlO1xuXG4gICAgICAgIGZvciAodmFyIGRlcFBhdGggaW4gc291cmNlc1trZXldWzFdKSB7XG4gICAgICAgICAgICB2YXIgZGVwS2V5ID0gc291cmNlc1trZXldWzFdW2RlcFBhdGhdO1xuICAgICAgICAgICAgaWYgKCF3b3JrZXJTb3VyY2VzW2RlcEtleV0pIHtcbiAgICAgICAgICAgICAgICByZXNvbHZlU291cmNlcyhkZXBLZXkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgdmFyIHNyYyA9ICcoJyArIGJ1bmRsZUZuICsgJykoeydcbiAgICAgICAgKyBPYmplY3Qua2V5cyh3b3JrZXJTb3VyY2VzKS5tYXAoZnVuY3Rpb24gKGtleSkge1xuICAgICAgICAgICAgcmV0dXJuIHN0cmluZ2lmeShrZXkpICsgJzpbJ1xuICAgICAgICAgICAgICAgICsgc291cmNlc1trZXldWzBdXG4gICAgICAgICAgICAgICAgKyAnLCcgKyBzdHJpbmdpZnkoc291cmNlc1trZXldWzFdKSArICddJ1xuICAgICAgICAgICAgO1xuICAgICAgICB9KS5qb2luKCcsJylcbiAgICAgICAgKyAnfSx7fSxbJyArIHN0cmluZ2lmeShza2V5KSArICddKSdcbiAgICA7XG5cbiAgICB2YXIgVVJMID0gd2luZG93LlVSTCB8fCB3aW5kb3cud2Via2l0VVJMIHx8IHdpbmRvdy5tb3pVUkwgfHwgd2luZG93Lm1zVVJMO1xuXG4gICAgdmFyIGJsb2IgPSBuZXcgQmxvYihbc3JjXSwgeyB0eXBlOiAndGV4dC9qYXZhc2NyaXB0JyB9KTtcbiAgICBpZiAob3B0aW9ucyAmJiBvcHRpb25zLmJhcmUpIHsgcmV0dXJuIGJsb2I7IH1cbiAgICB2YXIgd29ya2VyVXJsID0gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTtcbiAgICB2YXIgd29ya2VyID0gbmV3IFdvcmtlcih3b3JrZXJVcmwpO1xuICAgIHdvcmtlci5vYmplY3RVUkwgPSB3b3JrZXJVcmw7XG4gICAgcmV0dXJuIHdvcmtlcjtcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBHcmFwaCA9IHJlcXVpcmUoJ25ncmFwaC5ncmFwaCcpO1xudmFyIF8gPSByZXF1aXJlKCd1bmRlcnNjb3JlJyk7XG52YXIgUSA9IHJlcXVpcmUoJ1EnKTtcbnZhciBObGF5b3V0ID0gcmVxdWlyZSgnbmdyYXBoLmFzeW5jZm9yY2UnKTtcbnZhciByZW1vdmVPdmVybGFwcyA9IHJlcXVpcmUoJ25ncmFwaC5yZW1vdmUtb3ZlcmxhcHMnKTtcbi8vIHJlZ2lzdGVycyB0aGUgZXh0ZW5zaW9uIG9uIGEgY3l0b3NjYXBlIGxpYiByZWZcblxudmFyIG5ncmFwaCA9IGZ1bmN0aW9uIChjeXRvc2NhcGUpIHtcblxuICAgICAgICBpZiAoIWN5dG9zY2FwZSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9IC8vIGNhbid0IHJlZ2lzdGVyIGlmIGN5dG9zY2FwZSB1bnNwZWNpZmllZFxuXG4gICAgICAgIHZhciBkZWZhdWx0cyA9IHtcbiAgICAgICAgICAgIGFzeW5jOiB7XG4gICAgICAgICAgICAgICAgLy8gdGVsbCBsYXlvdXQgdGhhdCB3ZSB3YW50IHRvIGNvbXB1dGUgYWxsIGF0IG9uY2U6XG4gICAgICAgICAgICAgICAgbWF4SXRlcmF0aW9uczogMTAwMCxcbiAgICAgICAgICAgICAgICBzdGVwc1BlckN5Y2xlOiAzMCxcblxuICAgICAgICAgICAgICAgIC8vIFJ1biBpdCB0aWxsIHRoZSBlbmQ6XG4gICAgICAgICAgICAgICAgd2FpdEZvclN0ZXA6IGZhbHNlXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgcGh5c2ljczoge1xuICAgICAgICAgICAgICAgIC8qKlxuICAgICAgICAgICAgICAgICAqIElkZWFsIGxlbmd0aCBmb3IgbGlua3MgKHNwcmluZ3MgaW4gcGh5c2ljYWwgbW9kZWwpLlxuICAgICAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgICAgIHNwcmluZ0xlbmd0aDogMTAwLFxuXG4gICAgICAgICAgICAgICAgLyoqXG4gICAgICAgICAgICAgICAgICogSG9vaydzIGxhdyBjb2VmZmljaWVudC4gMSAtIHNvbGlkIHNwcmluZy5cbiAgICAgICAgICAgICAgICAgKi9cbiAgICAgICAgICAgICAgICBzcHJpbmdDb2VmZjogMC4wMDA4LFxuXG4gICAgICAgICAgICAgICAgLyoqXG4gICAgICAgICAgICAgICAgICogQ291bG9tYidzIGxhdyBjb2VmZmljaWVudC4gSXQncyB1c2VkIHRvIHJlcGVsIG5vZGVzIHRodXMgc2hvdWxkIGJlIG5lZ2F0aXZlXG4gICAgICAgICAgICAgICAgICogaWYgeW91IG1ha2UgaXQgcG9zaXRpdmUgbm9kZXMgc3RhcnQgYXR0cmFjdCBlYWNoIG90aGVyIDopLlxuICAgICAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgICAgIGdyYXZpdHk6IC0xLjIsXG5cbiAgICAgICAgICAgICAgICAvKipcbiAgICAgICAgICAgICAgICAgKiBUaGV0YSBjb2VmZmljaWVudCBmcm9tIEJhcm5lcyBIdXQgc2ltdWxhdGlvbi4gUmFuZ2VkIGJldHdlZW4gKDAsIDEpLlxuICAgICAgICAgICAgICAgICAqIFRoZSBjbG9zZXIgaXQncyB0byAxIHRoZSBtb3JlIG5vZGVzIGFsZ29yaXRobSB3aWxsIGhhdmUgdG8gZ28gdGhyb3VnaC5cbiAgICAgICAgICAgICAgICAgKiBTZXR0aW5nIGl0IHRvIG9uZSBtYWtlcyBCYXJuZXMgSHV0IHNpbXVsYXRpb24gbm8gZGlmZmVyZW50IGZyb21cbiAgICAgICAgICAgICAgICAgKiBicnV0ZS1mb3JjZSBmb3JjZXMgY2FsY3VsYXRpb24gKGVhY2ggbm9kZSBpcyBjb25zaWRlcmVkKS5cbiAgICAgICAgICAgICAgICAgKi9cbiAgICAgICAgICAgICAgICB0aGV0YTogMC44LFxuXG4gICAgICAgICAgICAgICAgLyoqXG4gICAgICAgICAgICAgICAgICogRHJhZyBmb3JjZSBjb2VmZmljaWVudC4gVXNlZCB0byBzbG93IGRvd24gc3lzdGVtLCB0aHVzIHNob3VsZCBiZSBsZXNzIHRoYW4gMS5cbiAgICAgICAgICAgICAgICAgKiBUaGUgY2xvc2VyIGl0IGlzIHRvIDAgdGhlIGxlc3MgdGlnaHQgc3lzdGVtIHdpbGwgYmUuXG4gICAgICAgICAgICAgICAgICovXG4gICAgICAgICAgICAgICAgZHJhZ0NvZWZmOiAwLjAyLFxuXG4gICAgICAgICAgICAgICAgLyoqXG4gICAgICAgICAgICAgICAgICogRGVmYXVsdCB0aW1lIHN0ZXAgKGR0KSBmb3IgZm9yY2VzIGludGVncmF0aW9uXG4gICAgICAgICAgICAgICAgICovXG4gICAgICAgICAgICAgICAgdGltZVN0ZXA6IDIwLFxuICAgICAgICAgICAgICAgIGl0ZXJhdGlvbnM6IDEwMDAwLFxuICAgICAgICAgICAgICAgIGZpdDogdHJ1ZSxcblxuICAgICAgICAgICAgICAgIC8qKlxuICAgICAgICAgICAgICAgICAqIE1heGltdW0gbW92ZW1lbnQgb2YgdGhlIHN5c3RlbSB3aGljaCBjYW4gYmUgY29uc2lkZXJlZCBhcyBzdGFiaWxpemVkXG4gICAgICAgICAgICAgICAgICovXG4gICAgICAgICAgICAgICAgc3RhYmxlVGhyZXNob2xkOiAwLjAwMDAwOVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGl0ZXJhdGlvbnM6IDEwMDAwLFxuICAgICAgICAgICAgcmVmcmVzaEludGVydmFsOiAxNiwgLy8gaW4gbXNcbiAgICAgICAgICAgIHJlZnJlc2hJdGVyYXRpb25zOiAxMCwgLy8gaXRlcmF0aW9ucyB1bnRpbCB0aHJlYWQgc2VuZHMgYW4gdXBkYXRlXG4gICAgICAgICAgICBzdGFibGVUaHJlc2hvbGQ6IDIsXG4gICAgICAgICAgICBhbmltYXRlOiB0cnVlLFxuICAgICAgICAgICAgZml0OiB0cnVlXG4gICAgICAgIH07XG5cbiAgICAgICAgdmFyIGV4dGVuZCA9IE9iamVjdC5hc3NpZ24gfHwgZnVuY3Rpb24gKHRndCkge1xuICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSAxOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBvYmogPSBhcmd1bWVudHNbaV07XG5cbiAgICAgICAgICAgICAgICAgICAgZm9yICh2YXIgayBpbiBvYmopIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRndFtrXSA9IG9ialtrXTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gdGd0O1xuICAgICAgICAgICAgfTtcblxuICAgICAgICBmdW5jdGlvbiBMYXlvdXQob3B0aW9ucykge1xuICAgICAgICAgICAgdGhpcy5vcHRpb25zID0gZXh0ZW5kKHt9LCBkZWZhdWx0cywgb3B0aW9ucyk7XG4gICAgICAgICAgICB0aGlzLmxheW91dE9wdGlvbnMgPSBleHRlbmQoe30sIGRlZmF1bHRzLCBvcHRpb25zKTtcbiAgICAgICAgICAgIGRlbGV0ZSAgdGhpcy5sYXlvdXRPcHRpb25zLmN5O1xuICAgICAgICAgICAgZGVsZXRlICB0aGlzLmxheW91dE9wdGlvbnMuZWxlcztcbiAgICAgICAgfVxuXG4gICAgICAgIExheW91dC5wcm90b3R5cGUubCA9IE5sYXlvdXQ7XG4gICAgICAgIExheW91dC5wcm90b3R5cGUuZyA9IEdyYXBoO1xuXG4gICAgICAgIExheW91dC5wcm90b3R5cGUucnVuID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIGxheW91dCA9IHRoaXM7XG4gICAgICAgICAgICBsYXlvdXQudHJpZ2dlcih7dHlwZTogJ2xheW91dHN0YXJ0JywgbGF5b3V0OiBsYXlvdXR9KTtcbiAgICAgICAgICAgIHZhciBvcHRpb25zID0gdGhpcy5vcHRpb25zO1xuICAgICAgICAgICAgdmFyIGxheW91dE9wdGlvbnMgPSB0aGlzLmxheW91dE9wdGlvbnM7XG4gICAgICAgICAgICB2YXIgdGhhdCA9IHRoaXM7XG4gICAgICAgICAgICB2YXIgZ3JhcGggPSB0aGF0LmcoKTtcbiAgICAgICAgICAgIHZhciBjeSA9IG9wdGlvbnMuY3k7XG4gICAgICAgICAgICB2YXIgZWxlcyA9IG9wdGlvbnMuZWxlcztcbiAgICAgICAgICAgIHZhciBub2RlcyA9IGVsZXMubm9kZXMoKTtcbiAgICAgICAgICAgIHZhciBwYXJlbnRzID0gbm9kZXMucGFyZW50cygpO1xuXG4gICAgICAgICAgICAvLyBGSUxURVJcblxuICAgICAgICAgICAgbm9kZXMgPSBub2Rlcy5kaWZmZXJlbmNlKHBhcmVudHMpO1xuXG4gICAgICAgICAgICBub2RlcyA9IG5vZGVzLmZpbHRlckZuKGZ1bmN0aW9uIChlbGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZWxlLmNvbm5lY3RlZEVkZ2VzKCkubGVuZ3RoID4gMFxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHZhciBlZGdlcyA9IGVsZXMuZWRnZXMoKTtcbiAgICAgICAgICAgIHZhciBlZGdlc0hhc2ggPSB7fTtcbiAgICAgICAgICAgIHZhciBMO1xuXG5cbiAgICAgICAgICAgIHZhciBmaXJzdFVwZGF0ZSA9IHRydWU7XG5cbiAgICAgICAgICAgIC8qICAgICAgICBpZiAoZWxlcy5sZW5ndGggPiAzMDAwKSB7XG4gICAgICAgICAgICAgb3B0aW9ucy5pdGVyYXRpb25zID0gb3B0aW9ucy5pdGVyYXRpb25zIC0gTWF0aC5hYnMob3B0aW9ucy5pdGVyYXRpb25zIC8gMyk7IC8vIHJlZHVjZSBpdGVyYXRpb25zIGZvciBiaWcgZ3JhcGhcbiAgICAgICAgICAgICB9Ki9cblxuICAgICAgICAgICAgdmFyIHVwZGF0ZSA9IGZ1bmN0aW9uIChub2Rlc0pzb24pIHtcbiAgICAgICAgICAgICAgICAvKiBjeS5iYXRjaChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgIG5vZGVzSnNvbi5mb3JFYWNoKGZ1bmN0aW9uKGUsayl7XG4gICAgICAgICAgICAgICAgIG5vZGVzLiQoJyMnKyBlLmRhdGEuaWQpLnBvc2l0aW9uKGUucG9zaXRpb24pO1xuICAgICAgICAgICAgICAgICB9KVxuXG4gICAgICAgICAgICAgICAgIH0pOyovXG4gICAgICAgICAgICAgICAgbm9kZXMucG9zaXRpb25zKGZ1bmN0aW9uIChpLCBub2RlKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICghbm9kZS5kYXRhKCdkcmFnZ2luZycpKVxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIEwuZ2V0Tm9kZVBvc2l0aW9uKG5vZGUuaWQoKSlcbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgIGlmIChsYXlvdXRPcHRpb25zLmFzeW5jKSB7XG4gICAgICAgICAgICAgICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgbGF5b3V0LnRyaWdnZXIoe3R5cGU6ICdsYXlvdXRzdG9wJywgbGF5b3V0OiBsYXlvdXR9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxheW91dC50cmlnZ2VyKHt0eXBlOiAnbGF5b3V0cmVhZHknLCBsYXlvdXQ6IGxheW91dH0pO1xuICAgICAgICAgICAgICAgICAgICB9LCA1MDApO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8qIG5vZGVzLmZvckVhY2goZnVuY3Rpb24gKG5vZGUpIHtcbiAgICAgICAgICAgICAgICAgTC5nZXROb2RlUG9zaXRpb24obm9kZS5pZCgpKVxuICAgICAgICAgICAgICAgICB9KTsqL1xuXG4gICAgICAgICAgICAgICAgLy8gbWF5YmUgd2UgZml0IGVhY2ggaXRlcmF0aW9uXG4gICAgICAgICAgICAgICAgaWYgKGxheW91dE9wdGlvbnMuZml0KSB7XG4gICAgICAgICAgICAgICAgICAgIGN5LmZpdChsYXlvdXRPcHRpb25zLnBhZGRpbmcpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChmaXJzdFVwZGF0ZSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBpbmRpY2F0ZSB0aGUgaW5pdGlhbCBwb3NpdGlvbnMgaGF2ZSBiZWVuIHNldFxuICAgICAgICAgICAgICAgICAgICBsYXlvdXQudHJpZ2dlcignbGF5b3V0cmVhZHknKTtcbiAgICAgICAgICAgICAgICAgICAgZmlyc3RVcGRhdGUgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGdyYXBoLm9uKCdjaGFuZ2VkJywgZnVuY3Rpb24gKGUpIHtcbiAgICAgICAgICAgICAgICAvLyAgY29uc29sZS5kaXIoZSk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgXy5lYWNoKG5vZGVzLCBmdW5jdGlvbiAoZSwgaykge1xuICAgICAgICAgICAgICAgIGUub24oJ3RhcHN0YXJ0JywgZnVuY3Rpb24gKGUpIHtcbiAgICAgICAgICAgICAgICAgICAgZS5jeVRhcmdldC5kYXRhKCdkcmFnZ2luZycsIHRydWUpXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgZS5vbigndGFwZW5kJywgZnVuY3Rpb24gKGUpIHtcbiAgICAgICAgICAgICAgICAgICAgZS5jeVRhcmdldC5yZW1vdmVEYXRhKCdkcmFnZ2luZycpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGUub24oJ3Bvc2l0aW9uJywgJ25vZGVbZHJhZ2dpbmddJywgZnVuY3Rpb24gKGUpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKEwuc2V0Tm9kZVBvc2l0aW9uICYmIGUuY3lUYXJnZXQuZGF0YSgnZHJhZ2dpbmcnKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgTC5zZXROb2RlUG9zaXRpb24oZS5jeVRhcmdldC5kYXRhKCkuaWQpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgZ3JhcGguYWRkTm9kZShlLmRhdGEoKS5pZCk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgXy5lYWNoKGVkZ2VzLCBmdW5jdGlvbiAoZSwgaykge1xuICAgICAgICAgICAgICAgIGlmICghZWRnZXNIYXNoW2UuZGF0YSgpLnNvdXJjZSArICc6JyArIGUuZGF0YSgpLnRhcmdldF0gJiYgIWVkZ2VzSGFzaFtlLmRhdGEoKS50YXJnZXQgKyAnOicgKyBlLmRhdGEoKS5zb3VyY2VdKSB7XG4gICAgICAgICAgICAgICAgICAgIGVkZ2VzSGFzaFtlLmRhdGEoKS5zb3VyY2UgKyAnOicgKyBlLmRhdGEoKS50YXJnZXRdID0gZTtcbiAgICAgICAgICAgICAgICAgICAgZ3JhcGguYWRkTGluayhlLmRhdGEoKS5zb3VyY2UsIGUuZGF0YSgpLnRhcmdldCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIEwgPSB0aGF0LmwoZ3JhcGgsIGxheW91dE9wdGlvbnMpO1xuXG4gICAgICAgICAgICBfLmVhY2gobm9kZXMsIGZ1bmN0aW9uIChlLCBrKSB7XG4gICAgICAgICAgICAgICAgdmFyIGRhdGEgPSBlLmRhdGEoKTtcbiAgICAgICAgICAgICAgICAvL3ZhciBwb3MgPSBlLnBvc2l0aW9uKCk7XG4gICAgICAgICAgICAgICAgaWYgKGRhdGEucGluKSB7XG4gICAgICAgICAgICAgICAgICAgIEwucGluTm9kZShkYXRhLmlkLCB0cnVlKTtcbiAgICAgICAgICAgICAgICAgICAgZS5yZW1vdmVEYXRhKCdwaW4nKTtcbiAgICAgICAgICAgICAgICAgICAgZS5kYXRhKCd1bnBpbicsIHRydWUpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoZGF0YS51bnBpbikge1xuICAgICAgICAgICAgICAgICAgICBMLnBpbk5vZGUoZGF0YS5pZCwgZmFsc2UpO1xuICAgICAgICAgICAgICAgICAgICBlLnJlbW92ZURhdGEoJ3VucGluJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIC8vaWYgKHBvcy54ICYmIHBvcy55KSB7XG4gICAgICAgICAgICAgICAgLy8gIEwuc2V0Tm9kZVBvc2l0aW9uKGRhdGEuaWQsIHBvcyk7XG4gICAgICAgICAgICAgICAgLy99XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgdmFyIGxlZnQgPSBsYXlvdXRPcHRpb25zLml0ZXJhdGlvbnM7XG5cbiAgICAgICAgICAgIHRoaXMub24oJ2xheW91dHN0b3AnLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgbGF5b3V0T3B0aW9ucy5pdGVyYXRpb25zID0gMDtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBMLm9uKCdzdGFibGUnLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coJ2dvdCBTdGFibGUgZXZlbnQnKTtcbiAgICAgICAgICAgICAgICBsZWZ0ID0gMDtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBpZiAoIWxheW91dE9wdGlvbnMuYW5pbWF0ZSkge1xuICAgICAgICAgICAgICAgIGxheW91dE9wdGlvbnMucmVmcmVzaEludGVydmFsID0gMDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHZhciB1cGRhdGVUaW1lb3V0O1xuICAgICAgICAgICAgTC5vbignY3ljbGUnLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgdXBkYXRlKCk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgaWYgKGxheW91dE9wdGlvbnMuYXN5bmMpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIHN0ZXAgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgaWYgKGxheW91dE9wdGlvbnMuYW5pbWF0ZSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAobGVmdCAhPSAwICAvKmNvbmRpdGlvbiBmb3Igc3RvcHBpbmcgbGF5b3V0Ki8pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghdXBkYXRlVGltZW91dCB8fCBsZWZ0ID09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB1cGRhdGVUaW1lb3V0ID0gc2V0VGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxlZnQtLTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy91cGRhdGUoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdXBkYXRlVGltZW91dCA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIEwuc3RlcCgpID8gbGVmdCA9IDAgOiBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gdXBkYXRlKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0ZXAoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy9zdGVwKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSwgbGF5b3V0T3B0aW9ucy5yZWZyZXNoSW50ZXJ2YWwpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgbGF5b3V0LnRyaWdnZXIoe3R5cGU6ICdsYXlvdXRzdG9wJywgbGF5b3V0OiBsYXlvdXR9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxheW91dC50cmlnZ2VyKHt0eXBlOiAnbGF5b3V0cmVhZHknLCBsYXlvdXQ6IGxheW91dH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcblxuICAgICAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxheW91dE9wdGlvbnMuaXRlcmF0aW9uczsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBMLnN0ZXAoKVxuICAgICAgICAgICAgICAgICAgICAgICAgcmVtb3ZlT3ZlcmxhcHMoTCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgbGF5b3V0LnRyaWdnZXIoe3R5cGU6ICdsYXlvdXRzdG9wJywgbGF5b3V0OiBsYXlvdXR9KTtcbiAgICAgICAgICAgICAgICAgICAgbGF5b3V0LnRyaWdnZXIoe3R5cGU6ICdsYXlvdXRyZWFkeScsIGxheW91dDogbGF5b3V0fSk7XG4gICAgICAgICAgICAgICAgICAgIC8vdXBkYXRlKCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgc3RlcCgpO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH07XG5cbiAgICAgICAgTGF5b3V0LnByb3RvdHlwZS5zdG9wID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgLy8gVE9ETzogdGhyZWFkIGFjdGlvbnNcbiAgICAgICAgICAgIC8vIGNvbnRpbnVvdXMvYXN5bmNocm9ub3VzIGxheW91dCBtYXkgd2FudCB0byBzZXQgYSBmbGFnIGV0YyB0byBsZXRcbiAgICAgICAgICAgIC8vIHJ1bigpIGtub3cgdG8gc3RvcFxuXG5cbiAgICAgICAgICAgIGlmICh0aGlzLnRocmVhZCkge1xuICAgICAgICAgICAgICAgIHRoaXMudGhyZWFkLnN0b3AoKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy50cmlnZ2VyKCdsYXlvdXRzdG9wJyk7XG5cbiAgICAgICAgICAgIHJldHVybiB0aGlzOyAvLyBjaGFpbmluZ1xuICAgICAgICB9O1xuXG4gICAgICAgIExheW91dC5wcm90b3R5cGUuZGVzdHJveSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIC8vIGNsZWFuIHVwIGhlcmUgaWYgeW91IGNyZWF0ZSB0aHJlYWRzIGV0Y1xuICAgICAgICAgICAgLy8gVE9ETzogdGhyZWFkIGFjdGlvbnNcblxuICAgICAgICAgICAgaWYgKHRoaXMudGhyZWFkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy50aHJlYWQuc3RvcCgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gdGhpczsgLy8gY2hhaW5pbmdcbiAgICAgICAgfTtcblxuICAgICAgICByZXR1cm4gTGF5b3V0O1xuXG4gICAgfTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBnZXQoY3l0b3NjYXBlKSB7XG4gICAgcmV0dXJuIG5ncmFwaChjeXRvc2NhcGUpO1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxuKGZ1bmN0aW9uKCl7XG5cbiAgICAvLyByZWdpc3RlcnMgdGhlIGV4dGVuc2lvbiBvbiBhIGN5dG9zY2FwZSBsaWIgcmVmXG4gICAgdmFyIGdldExheW91dCA9IHJlcXVpcmUoJy4vaW1wbC5qcycpO1xuICAgIHZhciByZWdpc3RlciA9IGZ1bmN0aW9uKCBjeXRvc2NhcGUgKXtcbiAgICAgICAgdmFyIExheW91dCA9IGdldExheW91dCggY3l0b3NjYXBlICk7XG4gICAgICAgIGN5dG9zY2FwZSgnbGF5b3V0JywgJ2N5dG9zY2FwZS1uZ3JhcGguZm9yY2VsYXlvdXQnLCBMYXlvdXQpO1xuICAgIH07XG5cbiAgICBpZiggdHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcgJiYgbW9kdWxlLmV4cG9ydHMgKXsgLy8gZXhwb3NlIGFzIGEgY29tbW9uanMgbW9kdWxlXG4gICAgICAgIG1vZHVsZS5leHBvcnRzID0gcmVnaXN0ZXI7XG4gICAgfVxuXG4gICAgaWYoIHR5cGVvZiBkZWZpbmUgIT09ICd1bmRlZmluZWQnICYmIGRlZmluZS5hbWQgKXsgLy8gZXhwb3NlIGFzIGFuIGFtZC9yZXF1aXJlanMgbW9kdWxlXG4gICAgICAgIGRlZmluZSgnY3l0b3NjYXBlLW5ncmFwaC5mb3JjZWxheW91dCcsIGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICByZXR1cm4gcmVnaXN0ZXI7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGlmKCB0eXBlb2YgY3l0b3NjYXBlICE9PSAndW5kZWZpbmVkJyApeyAvLyBleHBvc2UgdG8gZ2xvYmFsIGN5dG9zY2FwZSAoaS5lLiB3aW5kb3cuY3l0b3NjYXBlKVxuICAgICAgICByZWdpc3RlciggY3l0b3NjYXBlICk7XG4gICAgfVxuXG59KSgpOyJdfQ==
