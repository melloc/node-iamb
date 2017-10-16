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
var sprintf = require('extsprintf').sprintf;

// --- Globals

var NYI = 'Not yet implemented in %s mode: %s';


// --- Exports

/*
 * Some basic keybindings, similar to what you'd find in many GUI text areas.
 */
function ViChatFSM() {
    this.count = 0;

    mod_mooremachine.FSM.call(this, 'normal');
}
mod_util.inherits(ViChatFSM, mod_mooremachine.FSM);


ViChatFSM.prototype.state_normal = function (S) {
    var self = this;

    S.validTransitions([
        'change',
        'charjump',
        'copy',
        'delete',
        'goto',
        'insert',
        'linejump',
        'mark',
        'normal',
        'visual',
        'wincmd'
    ]);

    self.count = 0;

    S.on(self, 'controlAsserted', function (info) {
        switch (info.key) {
        case '^C':
            if (self.count === 0) {
                self.warn('Type :quit<Enter> to exit iamb');
            }
            // fallthrough
        case '^[':
            S.gotoState('normal');
            return;
        // Movement
        case '^?':
        case '^H':
            self.emit('move', 'left', 'char', self.getCount());
            return;
        case '^J':
        case '^M':
            self.emit('submit');
            return;

        // Scroll
        case '^U':
            self.emit('scroll', 'up', 'screen', 0.5 * self.getCount());
            return;
        case '^D':
            self.emit('scroll', 'down', 'screen', 0.5 * self.getCount());
            return;
        case '^B':
            self.emit('scroll', 'up', 'screen', self.getCount());
            return;
        case '^F':
            self.emit('scroll', 'down', 'screen', self.getCount());
            return;
        case '^P':
        case '^Y':
            self.emit('scroll', 'up', 'line', self.getCount());
            return;
        case '^N':
        case '^E':
            self.emit('scroll', 'down', 'line', self.getCount());
            return;


        // Editing history
        case '^R':
            self.emit('redo');
            return;

        case '^W':
            S.gotoState('wincmd');
            return;
        case '^Z':
            self.emit('suspend');
            return;
        case '^L':
            self.emit('refresh');
            return;

        default:
            self.warn(NYI, 'normal', info.key);
            return;
        }
    });

    S.on(self, 'specialAsserted', function (name, mods) {
        switch (name) {
        case 'prior':
            self.emit('scroll', 'up', 'screen', self.getCount());
            return;
        case 'next':
            self.emit('scroll', 'down', 'screen', self.getCount());
            return;
        case 'end':
            self.emit('line', 'end');
            return;
        case 'home':
            self.emit('line', 'start');
            return;
        case 'delete':
            self.emit('delete', 'char', self.getCount());
            return;
        case 'left':
        case 'right':
        case 'up':
        case 'down':
            if (mods.shift) {
                self.emit('move', name, 'word', self.getCount());
            } else {
                self.emit('move', name, 'char', self.getCount());
            }
            return;
        default:
            self.warn(NYI, 'normal', name);
            return;
        }
    });

    S.on(self, 'pressAsserted', function (ch) {
        switch (ch) {
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
        case '7':
        case '8':
        case '9':
            self.count *= 10;
            self.count += parseInt(ch, 10);
            return;

        // Movement:
        case 'h':
            self.emit('move', 'left', 'char', self.getCount());
            return;
        case 'j':
            self.emit('scroll', 'down', 'line', self.getCount());
            return;
        case 'k':
            self.emit('scroll', 'up', 'line', self.getCount());
            return;
        case 'l':
        case ' ':
            self.emit('move', 'right', 'char', self.getCount());
            return;
        case 'b':
            self.emit('move', 'left', 'word-begin', self.getCount());
            return;
        case 'w':
            self.emit('move', 'right', 'word-begin', self.getCount());
            return;
        case 'e':
            self.emit('move', 'right', 'word-end', self.getCount());
            return;

        // Line movement
        case '^':
            self.emit('line', 'first-word');
            return;
        case '$':
            self.emit('line', 'end');
            return;
        case '0':
            if (self.count === 0) {
                self.emit('line', 'start');
            } else {
                self.count *= 10;
            }
            return;

        // Scroll
        case 'G':
            self.emit('scroll', 'bottom');
            return;

        // Paste
        case 'p':
            self.emit('paste', 'after', self.getCount());
            return;
        case 'P':
            self.emit('paste', 'before', self.getCount());
            return;

        // Editing history
        case 'u':
            self.emit('undo');
            return;

        // Searching
        case 'n':
        case 'N':
        case 't':
        case 'T':
        case 'f':
        case 'F':
        case 'K':
        case ';':
        case ',':
        case '?':
        case '/':
            self.warn(NYI, 'normal', ch);
            return;

        // Switch to command-line
        case ':':
            self.emit('switch');
            return;

        // State changes
        case 'v':
            S.gotoState('visual');
            return;
        case 'm':
            S.gotoState('mark');
            return;
        case 'I':
            self.emit('line', 'start');
            S.gotoState('insert');
            return;
        case 'i':
            S.gotoState('insert');
            return;
        case 'A':
            self.emit('line', 'end');
            S.gotoState('insert');
            return;
        case 'a':
            self.emit('move', 'right', 'char', 1);
            S.gotoState('insert');
            return;
        case '\'':
            S.gotoState('linejump');
            return;
        case '`':
            S.gotoState('charjump');
            return;
        case 'y':
            S.gotoState('copy');
            return;
        case 'd':
            S.gotoState('delete');
            return;
        case 'c':
            S.gotoState('change');
            return;
        case 'g':
            S.gotoState('goto');
            return;
        case 'S':
            self.emit('clear');
            S.gotoState('insert');
            return;
        case 's':
            self.emit('delete', 'char', self.getCount());
            S.gotoState('insert');
            return;

        // Edit characters
        case 'x':
            self.emit('delete', 'char', self.getCount());
            return;

        default:
            self.warn(NYI, 'normal', ch);
            break;
        }
    });
};


ViChatFSM.prototype.state_change = function (S) {
    S.validTransitions([ 'normal' ]);

    var self = this;

    S.on(self, 'controlAsserted', function (info) {
        switch (info.key) {
        case '^C':
        case '^[':
            S.gotoState('normal');
            return;
        default:
            self.warn(NYI, 'change', info.key);
            S.gotoState('normal');
            return;
        }
    });

    S.on(self, 'specialAsserted', function (name, _mods) {
        switch (name) {
        default:
            self.warn(NYI, 'change', name);
            S.gotoState('normal');
            break;
        }
    });

    S.on(self, 'pressAsserted', function (ch) {
        switch (ch) {
        default:
            self.warn(NYI, 'change', ch);
            S.gotoState('normal');
            return;
        }
    });
};


ViChatFSM.prototype.state_copy = function (S) {
    S.validTransitions([ 'normal' ]);

    var self = this;

    S.on(self, 'controlAsserted', function (info) {
        switch (info.key) {
        case '^C':
        case '^[':
            S.gotoState('normal');
            return;
        default:
            self.warn(NYI, 'copy', info.key);
            S.gotoState('normal');
            return;
        }
    });

    S.on(self, 'specialAsserted', function (name, _mods) {
        switch (name) {
        default:
            self.warn(NYI, 'copy', name);
            S.gotoState('normal');
            return;
        }
    });

    S.on(self, 'pressAsserted', function (ch) {
        switch (ch) {
        default:
            self.warn(NYI, 'copy', ch);
            S.gotoState('normal');
            break;
        }
    });
};


ViChatFSM.prototype.state_delete = function (S) {
    S.validTransitions([ 'normal' ]);

    var self = this;

    S.on(self, 'controlAsserted', function (info) {
        switch (info.key) {
        case '^C':
        case '^[':
            S.gotoState('normal');
            return;
        default:
            self.warn(NYI, 'delete', info.key);
            S.gotoState('normal');
            return;
        }
    });

    S.on(self, 'specialAsserted', function (name, _mods) {
        switch (name) {
        default:
            self.warn(NYI, 'delete', name);
            S.gotoState('normal');
            return;
        }
    });

    S.on(self, 'pressAsserted', function (ch) {
        switch (ch) {
        default:
            self.warn(NYI, 'delete', ch);
            S.gotoState('normal');
            return;
        }
    });
};


ViChatFSM.prototype.state_goto = function (S) {
    S.validTransitions([ 'normal' ]);

    var self = this;

    S.on(self, 'controlAsserted', function (info) {
        switch (info.key) {
        case '^C':
        case '^[':
            S.gotoState('normal');
            return;
        default:
            self.warn(NYI, 'goto', info.key);
            S.gotoState('normal');
            return;
        }
    });

    S.on(self, 'specialAsserted', function (name, _mods) {
        switch (name) {
        case 'up':
        case 'down':
            self.emit('scroll', name, 'char', self.getCount());
            break;
        default:
            self.warn(NYI, 'goto', name);
            break;
        }

        S.gotoState('normal');
    });

    S.on(self, 'pressAsserted', function (ch) {
        switch (ch) {
        // Counting
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
        case '7':
        case '8':
        case '9':
            self.count *= 10;
            self.count += parseInt(ch, 10);
            return;

        // Movement
        case 'g':
            self.emit('scroll', 'top');
            break;
        case 'j':
            self.emit('scroll', 'down', 'line', self.getCount());
            break;
        case 'k':
            self.emit('scroll', 'up', 'line', self.getCount());
            break;

        // Line movement
        case '^':
            self.emit('line', 'first-word');
            break;
        case '$':
            self.emit('line', 'end');
            break;
        case '0':
            if (self.count === 0) {
                self.emit('line', 'start');
            } else {
                self.count *= 10;
            }
            break;

        case 'l':
            self.emit('focus-lobby');
            break;
        default:
            self.warn(NYI, 'goto', ch);
            break;
        }

        S.gotoState('normal');
    });
};


ViChatFSM.prototype.state_insert = function (S) {
    S.validTransitions([ 'normal' ]);

    var self = this;

    S.on(self, 'controlAsserted', function (info) {
        switch (info.key) {
        case '^C':
        case '^[':
            S.gotoState('normal');
            return;
        case '^Z':
            self.emit('suspend');
            return;
        case '^L':
            self.emit('refresh');
            return;
        case '^?':
        case '^H':
            self.emit('backspace', 'char', 1);
            return;
        case '^J':
        case '^M':
            self.emit('submit');
            return;
        case '^U':
            self.emit('clear');
            return;
        default:
            self.warn(NYI, 'insert', info.key);
            return;
        }
    });

    S.on(self, 'specialAsserted', function (name, mods) {
        switch (name) {
        case 'prior':
            self.emit('scroll', 'up', 'screen', self.getCount());
            return;
        case 'next':
            self.emit('scroll', 'down', 'screen', self.getCount());
            return;
        case 'end':
            self.emit('line', 'end');
            return;
        case 'home':
            self.emit('line', 'start');
            return;
        case 'delete':
            self.emit('delete', 'char', self.getCount());
            return;
        case 'left':
        case 'right':
        case 'up':
        case 'down':
            if (mods.shift) {
                self.emit('move', name, 'word', self.getCount());
            } else {
                self.emit('move', name, 'char', self.getCount());
            }
            return;
        default:
            self.warn(NYI, 'insert', name);
            return;
        }
    });

    S.on(self, 'pressAsserted', function (ch) {
        self.emit('type', ch);
    });
};


ViChatFSM.prototype.state_linejump = function (S) {
    S.validTransitions([ 'normal' ]);

    var self = this;

    S.on(self, 'controlAsserted', function (info) {
        self.warn('Unknown mark: %s', info.key);
        S.gotoState('normal');
    });

    S.on(self, 'specialAsserted', function (name, _mods) {
        self.warn('Unknown mark: %s', name);
        S.gotoState('normal');
    });

    S.on(self, 'pressAsserted', function (ch) {
        var lch = ch.toLowerCase();
        if (lch >= 'a' && lch <= 'z') {
            self.emit('linejump', ch);
        } else {
            self.warn('Unkown mark: %s', ch);
        }

        S.gotoState('normal');
    });
};


ViChatFSM.prototype.state_charjump = function (S) {
    S.validTransitions([ 'normal' ]);

    var self = this;

    S.on(self, 'controlAsserted', function (info) {
        self.warn('Unknown mark: %s', info.key);
        S.gotoState('normal');
    });

    S.on(self, 'specialAsserted', function (name, _mods) {
        self.warn('Unknown mark: %s', name);
        S.gotoState('normal');
    });

    S.on(self, 'pressAsserted', function (ch) {
        var lch = ch.toLowerCase();
        if (lch >= 'a' && lch <= 'z') {
            self.emit('charjump', ch);
        } else {
            self.warn('Unknown mark: %s', ch);
        }

        S.gotoState('normal');
    });
};


ViChatFSM.prototype.state_mark = function (S) {
    S.validTransitions([ 'normal' ]);

    var self = this;

    S.on(self, 'controlAsserted', function (_info) {
        S.gotoState('normal');
    });

    S.on(self, 'specialAsserted', function (_type, _mods) {
        S.gotoState('normal');
    });

    S.on(self, 'pressAsserted', function (ch) {
        var lch = ch.toLowerCase();
        if (lch >= 'a' && lch <= 'z') {
            self.emit('mark', ch);
        }

        S.gotoState('normal');
    });
};


ViChatFSM.prototype.state_visual = function (S) {
    S.validTransitions([ 'normal' ]);

    var self = this;

    S.on(self, 'controlAsserted', function (info) {
        switch (info.key) {
        default:
            self.warn(NYI, 'visual', info.key);
            S.gotoState('normal');
            return;
        }
    });

    S.on(self, 'specialAsserted', function (name, _mods) {
        switch (name) {
        default:
            self.warn(NYI, 'visual', name);
            S.gotoState('normal');
            return;
        }
    });

    S.on(self, 'pressAsserted', function (ch) {
        switch (ch) {
        default:
            self.warn(NYI, 'visual', ch);
            S.gotoState('normal');
            return;
        }
    });
};


ViChatFSM.prototype.state_wincmd = function (S) {
    S.validTransitions([ 'normal' ]);

    var self = this;

    S.on(self, 'controlAsserted', function (info) {
        switch (info.key) {
        default:
            self.warn(NYI, 'wincmd', info.key);
            S.gotoState('normal');
            return;
        }
    });

    S.on(self, 'specialAsserted', function (name, _mods) {
        switch (name) {
        default:
            self.warn(NYI, 'wincmd', name);
            S.gotoState('normal');
            return;
        }
    });

    S.on(self, 'pressAsserted', function (ch) {
        switch (ch) {
        default:
            self.warn(NYI, 'wincmd', ch);
            S.gotoState('normal');
            return;
        }
    });
};


ViChatFSM.prototype.getCount = function () {
    var count = this.count;
    this.count = 0;
    return (count === 0 ? 1 : count);
};


ViChatFSM.prototype.press = function (ch) {
    assert.string(ch, 'ch');
    this.emit('pressAsserted', ch);
};


ViChatFSM.prototype.special = function (type, info) {
    assert.string(type, 'type');
    assert.object(info, 'info');
    assert.bool(info.shift, 'info.shift');
    assert.bool(info.control, 'info.control');
    this.emit('specialAsserted', type, info);
};


ViChatFSM.prototype.control = function (info) {
    assert.object(info, 'info');
    assert.string(info.key, 'info.key');
    assert.string(info.ascii, 'info.ascii');
    this.emit('controlAsserted', info);
};


ViChatFSM.prototype.warn = function emitWarn() {
    this.emit('warn', sprintf.apply(null, arguments));
};


module.exports = {
    Chat: ViChatFSM
};
