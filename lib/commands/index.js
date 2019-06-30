/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2019, Cody Mello.
 */

'use strict';

var FuzzySet = require('fuzzyset.js');
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
    'join': function (program, argv) {
        if (argv.length !== 2) {
            program.warn('expected a single room name for conference rooms');
            return;
        }

        program.openConference(argv[1]);
    },
    'shell': function (program, argv) {
        if (argv.length > 1) {
            program.warn('trailing characters');
            return;
        }

        program.shell();
    },
    'qall': function (program, argv) {
        if (argv.length > 1) {
            program.warn('trailing characters');
            return;
        }

        program.quit();
    },
    'quit': function (program, argv) {
        if (argv.length > 1) {
            program.warn('trailing characters');
            return;
        }

        program.screen.window.quit();
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
    'split': function (program, argv) {
        if (argv.length !== 1) {
            program.warn('trailing characters');
            return;
        }

        program.screen.window.hsplit();
    },
    'vsplit': function (program, argv) {
        if (argv.length !== 1) {
            program.warn('trailing characters');
            return;
        }

        program.screen.window.vsplit();
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
var FUZZY = FuzzySet(NAMES);

var ALIASES = {
    'reg': 'registers',
    'register': 'registers',
    'sh': 'shell',
    'Sh': 'shell',
    'sp': 'split',
    'vsp': 'vsplit',
    'h': 'help',
    'q': 'quit',
    'Q': 'quit',
    'qa': 'qall',
    'Qa': 'qall'
};

function suggestionToText(s) {
    return s[1];
}

function getCompletions(cmd) {
    return NAMES.reduce(function (acc, curr) {
        if (mod_jsprim.startsWith(curr, cmd)) {
            acc.push(curr.slice(cmd.length));
        }

        return acc;
    }, []);
}

function getSuggestions(cmd) {
    var suggestions = FUZZY.get(cmd);
    if (suggestions === null) {
        return null;
    }

    return suggestions.map(suggestionToText);
}

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
            var msg = 'Not a client command: ' + cmd;
            var suggestions = getSuggestions(cmd);
            if (suggestions !== null) {
                msg += '; did you mean: ' + suggestions.join(', ');
            }
            program.warn(msg);
        });
    }

    /*
     * Command handled, now update the command register.
     */
    program.registers.updateCommand(text);
}

module.exports = {
    getCompletions: getCompletions,
    getSuggestions: getSuggestions,
    mappings: MAPPINGS,
    names: NAMES,
    aliases: ALIASES,
    run: runCommand
};
