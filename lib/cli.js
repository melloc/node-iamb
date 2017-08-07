/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2017, Cody Mello.
 */

'use strict';

var mod_dashdash = require('dashdash');
var mod_path = require('path');

var Program = require('../lib/prog');

var HELP_OPTS = {
        includeDefault: true,
            includeEnv: true
};

var OPTIONS = [
    {
        names: [ 'help', 'h' ],
        type: 'bool',
        help: 'Print this help and exit.'
    },
    {
        names: [ 'config', 'c' ],
        type: 'string',
        default: 'mm-account.json',
        help: 'Path to the configuration file.'
    }
];

function main(argv) {
    var parser = mod_dashdash.createParser({ options: OPTIONS });
    var opts;

    try {
        opts = parser.parse(argv);
    } catch (e) {
        console.error('iamb: error: %s', e.message);
        process.exit(2);
    }

    if (opts.help) {
        console.error('usage: iamb [OPTIONS]\noptions:\n%s',
            parser.help(HELP_OPTS));
        process.exit(0);
    }

    if (opts._args.length > 0) {
        console.error('iamb: error: no positional arguments allowed');
        console.error('usage: iamb [OPTIONS]\noptions:\n%s',
            parser.help(HELP_OPTS));
        process.exit(2);
    }

    var path = mod_path.resolve(opts.config);
    var prog = new Program({
        configFile: path
    });

    return prog;
}


module.exports = {
    main: main
};
