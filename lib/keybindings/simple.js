/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2017, Cody Mello.
 */

'use strict';

var assert = require('assert-plus');
var mod_mooremachine = require('mooremachine');
var mod_util = require('util');

/*
 * Some basic keybindings, similar to what you'd find in many GUI text areas.
 */
function SimpleChatFSM() {
    mod_mooremachine.FSM.call(this, 'waiting');
}
mod_util.inherits(SimpleChatFSM, mod_mooremachine.FSM);


SimpleChatFSM.prototype.state_waiting = function (S) {
    var self = this;

    S.validTransitions([ 'changeWindow' ]);

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
        case '^W':
            S.gotoState('changeWindow');
            return;
        case '^?':
        case '^H':
            self.emit('backspace', 'char', 1);
            return;
        case '^U':
            self.emit('clear');
            return;
        case '^J':
        case '^M':
            self.emit('submit');
            return;
        case '^A':
            self.emit('line', 'start');
            return;
        case '^E':
            self.emit('line', 'end');
            return;
        default:
            return;
        }
    });

    S.on(self, 'specialAsserted', function (type, mods) {
        switch (type) {
        case 'prior':
            self.emit('scroll', 'up');
            return;
        case 'next':
            self.emit('scroll', 'down');
            return;
        case 'end':
            self.emit('line', 'end');
            return;
        case 'home':
            self.emit('line', 'start');
            return;
        case 'delete':
            self.emit('delete', 'char', 1);
            return;
        case 'left':
        case 'right':
        case 'up':
        case 'down':
            if (mods.shift) {
                self.emit('highlight', type, 'char', 1);
            } else {
                self.emit('move', type, 'char', 1);
            }
            return;
        default:
            return;
        }
    });

    S.on(self, 'pressAsserted', function (ch) {
        self.emit('type', ch);
    });
};


SimpleChatFSM.prototype.state_changeWindow = function (S) {
    var self = this;

    S.validTransitions([ 'waiting' ]);

    S.on(self, 'pressAsserted', function (_, info) {
        switch (info.name) {
            case 'left':
            case 'right':
            case 'down':
            case 'up':
                self.emit('move-focus', info.name);
                S.gotoState('waiting');
                return;
            default:
                S.gotoState('waiting');
                return;
        }
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


module.exports = {
    Chat: SimpleChatFSM
};
