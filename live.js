#!/usr/bin/env node
var queries = [
        'series'
    ],
    args = process.argv.slice(2),
    prototypeHost = args[0];

if (!prototypeHost) {
    throw 'No Host passed for prototype'
}

var request = require('request'),
    QueueLib = require('queue'),
    http = require('http'),
    cheerio = require('cheerio'),
    Q = require('q'),

    queue = QueueLib({
        concurrency: http.globalAgent.maxSockets,
        timeout: 60000
    });

    queue.on('timeout', function(next, job) {
        console.log('Job Timeout: ', job.toString());
        next();
    });

    queue.on('error', function(err, job) {
        console.error('Job Error: ', job.toString(), err);
    });


var results = {};
var defers = [];

queries.forEach(function (term, i) {
    results[term] = {
        live: {},
        proto: {}
    };
    var liveDefer = Q.defer(),
        protoDefer = Q.defer(),

        getLivePage = function (next) {
            request('http://www.bbc.co.uk/iplayer/search?q=' + term, function (err, response, body) {
                var nodes, lists, totalItems, unavailableItems, counts;
                if (err) liveDefer.reject();

                nodes = cheerio.load(body);
                lists = '.iplayer-list:not(.unavailable-programmes)';

                counts = {
                    results: nodes(lists + ' > li').length,
                    total: nodes(lists + ' > li').length,
                    unavailable: nodes(lists + ' > li.coming-soon').length
                }

                counts.available = counts.total - counts.unavailable;

                console.log('got the things for', term, counts);

                results[term]['live'] = counts;
                liveDefer.resolve();
                next();
            });
        }

        getPrototypePage = function (next) {
            request(prototypeHost + '/search?q=' + term, function (err, response, body) {
                var nodes, lists, totalItems, unavailableItems, counts;
                if (err) protoDefer.reject();

                feed = JSON.parse(body);

                console.log('got the things for', term, feed.requests);

                results[term]['proto'] = feed.requests;
                results[term]['proto'].results = feed.results.length;

                protoDefer.resolve();
                next();
            });
        }

    defers.push(liveDefer.promise);
    defers.push(protoDefer.promise);

    queue.push(getLivePage);
    queue.push(getPrototypePage);
    queue.start();
    console.log('starting the queue', term);

});

Q.allSettled(defers).done(function () {
    console.log('All Done', JSON.stringify(results, null, 4));
});
