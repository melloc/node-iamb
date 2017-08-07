/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2017, Cody Mello.
 */

'use strict';

var MAPPINGS = {
    'dm': function (program, argv) {
        if (argv.length !== 2) {
            program.warn('expected a single username for direct messaging');
            return;
        }

        program.openDirect(argv[1]);
    },
    'shell': function (program, argv) {
        if (argv.length > 1) {
            program.warn('trailing characters');
            return;
        }

        program.shell();
    },
    'quit': function (program, argv) {
        if (argv.length > 1) {
            program.warn('trailing characters');
            return;
        }

        program.quit();
    },
    'help': function (program, argv) {
        if (argv.length === 1) {
            program.warn('commands are: ' +
                Object.keys(MAPPINGS).join(', '));
            return;
        }

        switch (argv[1]) {
        case 'dm':
            program.warn('use ":dm <user>" to start a conversation');
            return;
        default:
            return;
        }
    }
};

var NAMES = Object.keys(MAPPINGS);

var ALIASES = {
    'sh': 'shell',
    'Sh': 'shell',
    'h': 'help',
    'q': 'quit',
    'Q': 'quit'
};

function runCommand(program, text) {
    if (text === '') {
        return;
    }

    var start = 0;
    while (text[start] === ':') {
        start += 1;
    }

    var argv = text.slice(start).split(/\s+/);
    var cmd = argv[0];
    if (MAPPINGS.hasOwnProperty(cmd)) {
        MAPPINGS[cmd](program, argv);
    } else if (ALIASES.hasOwnProperty(cmd)) {
        MAPPINGS[ALIASES[cmd]](program, argv);
    } else {
        setImmediate(function () {
            program.warn('Not a client command: ' + cmd);
        });
    }
}

module.exports = {
    mappings: MAPPINGS,
    names: NAMES,
    aliases: ALIASES,
    run: runCommand
};
