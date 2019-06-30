/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2019, Cody Mello.
 */

'use strict';

var assert = require('assert-plus');
var mod_mooremachine = require('mooremachine');
var mod_util = require('util');


// --- Globals

var REGISTER_REGEX = /^[a-zA-Z0-9.:%#/_"=-]$/;
var D_LEFT = 'left';
var D_DOWN = 'down';
var D_UP = 'up';
var D_RIGHT = 'right';


// --- Exports

/*
 * Some basic keybindings, similar to what you'd find in many GUI text areas.
 */
function SimpleChatFSM() {
    mod_mooremachine.FSM.call(this, 'waiting');
}
mod_util.inherits(SimpleChatFSM, mod_mooremachine.FSM);


SimpleChatFSM.prototype.state_waiting = function (S) {
    var self = this;

    S.validTransitions([ 'paste' ]);

    S.on(self, 'controlAsserted', function (info) {
        switch (info.key) {
        case '^C':
        case '^[':
            self.emit('switch');
            return;
        case '^Z':
            self.emit('suspend');
            return;
        case '^L':
            self.emit('refresh');
            return;
        case '^D':
            // XXX: Implement completion
            return;
        case '^R':
            S.gotoState('paste');
            return;
        case '^?':
        case '^H':
            self.action('delete', 'char', D_LEFT);
            return;
        case '^U':
            self.action('delete', 'line', D_DOWN);
            return;
        case '^J':
        case '^M':
            self.emit('submit');
            return;
        case '^I':
            self.emit('complete', 'next');
            return;
        case '^A':
            self.action('move', 'line', D_LEFT);
            return;
        case '^E':
            self.action('move', 'line', D_RIGHT);
            return;
        default:
            return;
        }
    });

    S.on(self, 'specialAsserted', function (type, mods) {
        switch (type) {
        case 'prior':
            self.emit('scroll', D_UP);
            return;
        case 'next':
            self.emit('scroll', D_DOWN);
            return;
        case 'end':
            self.action('move', 'line', D_RIGHT);
            return;
        case 'home':
            self.action('move', 'line', D_LEFT);
            return;
        case 'delete':
            self.action('delete', 'char', D_RIGHT);
            return;
        case 'left':
            if (mods.shift) {
                self.action('move', 'word-begin', D_LEFT);
            } else {
                self.action('move', 'char', D_LEFT);
            }
            return;
        case 'right':
            if (mods.shift) {
                self.action('move', 'to-char', D_RIGHT, ' ');
            } else {
                self.action('move', 'char', D_RIGHT);
            }
            return;
        case 'reverse-tab':
            self.emit('complete', 'previous');
            return;
        case 'up':
        case 'down':
            // XXX: History
            return;
        default:
            return;
        }
    });

    S.on(self, 'pressAsserted', function (ch) {
        self.emit('type', ch);
    });
};


SimpleChatFSM.prototype.state_paste = function (S) {
    S.validTransitions([ 'waiting' ]);

    var self = this;

    S.on(self, 'controlAsserted', function (info) {
        switch (info.key) {
        default:
            S.gotoState('waiting');
            return;
        }
    });

    S.on(self, 'specialAsserted', function (name, _mods) {
        switch (name) {
        default:
            S.gotoState('waiting');
            return;
        }
    });

    S.on(self, 'pressAsserted', function (ch) {
        if (REGISTER_REGEX.test(ch)) {
            self.emit('paste', 'before', ch, 1);
        }
        S.gotoState('waiting');
    });
};


SimpleChatFSM.prototype.press = function (ch) {
    assert.string(ch, 'ch');
    this.emit('pressAsserted', ch);
};


SimpleChatFSM.prototype.special = function (type, info) {
    assert.string(type, 'type');
    assert.object(info, 'info');
    assert.bool(info.shift, 'info.shift');
    assert.bool(info.control, 'info.control');
    this.emit('specialAsserted', type, info);
};


SimpleChatFSM.prototype.control = function (info) {
    assert.object(info, 'info');
    assert.string(info.key, 'info.key');
    assert.string(info.ascii, 'info.ascii');
    this.emit('controlAsserted', info);
};


SimpleChatFSM.prototype.action =
    function emitAction(action, movement, direction, ch) {
    this.emit('edit', action, {
        movement: movement,
        direction: direction,
        character: ch,
        count: 1,
        register: '_'
    });
};


module.exports = {
    Chat: SimpleChatFSM
};
