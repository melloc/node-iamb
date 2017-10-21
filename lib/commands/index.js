/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2017, Cody Mello.
 */

'use strict';

var mod_jsprim = require('jsprim');
var sprintf = require('extsprintf').sprintf;

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
    'registers': function (program, argv) {
        if (argv.length > 1) {
            program.warn('trailing characters');
            return;
        }

        var regs = program.registers.dumpRegisters();
        var text = '';
        mod_jsprim.forEachKey(regs, function (r, v) {
            text += sprintf('"%s   %s\n', r, v);
        });

        program.screen.lobby.display(text);
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
    'reg': 'registers',
    'register': 'registers',
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

    /*
     * Strip off any leading :'s or spaces before running the command.
     */
    var start = 0;
    while (text[start] === ':' || text[start] === ' ') {
        start += 1;
    }

    var argv = text.slice(start).split(/\s+/);
    var cmd = argv[0];

    /*
     * Dispatch the command to the appropriate handler.
     */
    if (MAPPINGS.hasOwnProperty(cmd)) {
        MAPPINGS[cmd](program, argv);
    } else if (ALIASES.hasOwnProperty(cmd)) {
        MAPPINGS[ALIASES[cmd]](program, argv);
    } else {
        setImmediate(function () {
            program.warn('Not a client command: ' + cmd);
        });
    }

    /*
     * Command handled, now update the command register.
     */
    program.registers.updateCommand(text);
}

module.exports = {
    mappings: MAPPINGS,
    names: NAMES,
    aliases: ALIASES,
    run: runCommand
};
