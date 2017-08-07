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
function ViChatFSM() {
    this.count = 0;

    mod_mooremachine.FSM.call(this, 'normal');
}
mod_util.inherits(ViChatFSM, mod_mooremachine.FSM);

ViChatFSM.prototype.state_normal = function (S) {
    var self = this;

    S.validTransitions([
        'change',
        'changeWindow',
        'charjump',
        'copy',
        'delete',
        'goto',
        'insert',
        'linejump',
        'mark',
        'visual'
    ]);

    self.count = 0;

    S.on(self, 'controlAsserted', function (info) {
        switch (info.key) {
        // Movement
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
            S.gotoState('changeWindow');
            return;
        case '^Z':
            self.emit('suspend');
            return;
        case '^L':
            self.emit('refresh');
            return;
        case '^C':
            // XXX: Just do nothing? Quit?
            return;

        default:
            self.emit('warn',
                'Not yet implemented in normal mode: ' + info.key);
            return;
        }
    });

    S.on(self, 'specialAsserted', function (type, mods) {
        switch (type) {
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
                self.emit('move', type, 'word', self.getCount());
            } else {
                self.emit('move', type, 'char', self.getCount());
            }
            return;
        default:
            self.emit('warn',
                'Not yet implemented in normal mode: ' + type);
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
            // self.emit('move', 'down', 'char', self.getCount());
            self.emit('scroll', 'down', 'line', self.getCount());
            return;
        case 'k':
            // self.emit('move', 'up', 'char', self.getCount());
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
            self.emit('warn', 'Not yet implemented in normal mode: ' + ch);
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
            self.emit('warn', 'Not yet implemented in normal mode: ' + ch);
            break;
        }
    });
};


ViChatFSM.prototype.state_change = function (S) {
    S.validTransitions([ 'normal' ]);

    var self = this;

    S.on(self, 'controlAsserted', function (info) {
        switch (info.key) {
        default:
            break;
        }
        S.gotoState('normal');
    });

    S.on(self, 'specialAsserted', function (type, mods) {
        switch (type) {
        case 'prior':
            break;
        case 'next':
            break;
        case 'end':
            break;
        case 'home':
            break;
        case 'delete':
            break;
        case 'left':
        case 'right':
        case 'up':
        case 'down':
            break;
        default:
            break;
        }

        S.gotoState('normal');
    });

    S.on(self, 'pressAsserted', function (ch) {
        switch (ch) {
        default:
            break;
        }

        S.gotoState('normal');
    });
};


ViChatFSM.prototype.state_copy = function (S) {
    S.validTransitions([ 'normal' ]);

    var self = this;

    S.on(self, 'controlAsserted', function (info) {
        switch (info.key) {
        default:
            break;
        }
        S.gotoState('normal');
    });

    S.on(self, 'specialAsserted', function (type, mods) {
        S.gotoState('normal');
    });

    S.on(self, 'pressAsserted', function (ch) {
        switch (ch) {
        default:
            break;
        }

        S.gotoState('normal');
    });
};


ViChatFSM.prototype.state_delete = function (S) {
    S.validTransitions([ 'normal' ]);

    var self = this;

    S.on(self, 'controlAsserted', function (info) {
        switch (info.key) {
        default:
            break;
        }
        S.gotoState('normal');
    });

    S.on(self, 'specialAsserted', function (type, mods) {
        S.gotoState('normal');
    });

    S.on(self, 'pressAsserted', function (ch) {
        switch (ch) {
        default:
            break;
        }

        S.gotoState('normal');
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
            S.gotoState('normal');
            return;
        }
    });

    S.on(self, 'specialAsserted', function (type, mods) {
        switch (type) {
        case 'up':
        case 'down':
            self.emit('move', type, 'char', self.getCount());
            break;
        default:
            break;
        }

        S.gotoState('normal');
    });

    S.on(self, 'pressAsserted', function (ch) {
        switch (ch) {
        case 'g':
            self.emit('scroll', 'top');
            break;
        case 'l':
            self.emit('focus-lobby');
            break;
        default:
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
            return;
        }
    });

    S.on(self, 'specialAsserted', function (type, mods) {
        switch (type) {
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
                self.emit('move', type, 'word', self.getCount());
            } else {
                self.emit('move', type, 'char', self.getCount());
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


ViChatFSM.prototype.state_linejump = function (S) {
    S.validTransitions([ 'normal' ]);

    var self = this;

    S.on(self, 'controlAsserted', function (info) {
        switch (info.key) {
        default:
            break;
        }
        S.gotoState('normal');
    });

    S.on(self, 'specialAsserted', function (type, mods) {
        S.gotoState('normal');
    });

    S.on(self, 'pressAsserted', function (ch) {
        var lch = ch.toLowerCase();
        if (lch >= 'a' && lch <= 'z') {
            self.emit('linejump', ch);
        }

        S.gotoState('normal');
    });
};


ViChatFSM.prototype.state_charjump = function (S) {
    S.validTransitions([ 'normal' ]);

    var self = this;

    S.on(self, 'controlAsserted', function (info) {
        switch (info.key) {
        default:
            break;
        }
        S.gotoState('normal');
    });

    S.on(self, 'specialAsserted', function (type, mods) {
        S.gotoState('normal');
    });

    S.on(self, 'pressAsserted', function (ch) {
        var lch = ch.toLowerCase();
        if (lch >= 'a' && lch <= 'z') {
            self.emit('charjump', ch);
        }

        S.gotoState('normal');
    });
};





ViChatFSM.prototype.state_mark = function (S) {
    S.validTransitions([ 'normal' ]);

    var self = this;

    S.on(self, 'controlAsserted', function (info) {
        switch (info.key) {
        default:
            break;
        }
        S.gotoState('normal');
    });

    S.on(self, 'specialAsserted', function (type, mods) {
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
            break;
        }
        S.gotoState('normal');
    });

    S.on(self, 'specialAsserted', function (type, mods) {
        S.gotoState('normal');
    });

    S.on(self, 'pressAsserted', function (ch) {
        switch (ch) {
        default:
            break;
        }

        S.gotoState('normal');
    });
};




ViChatFSM.prototype.state_changeWindow = function (S) {
    S.validTransitions([ 'normal' ]);

    var self = this;

    S.on(self, 'controlAsserted', function (info) {
        switch (info.key) {
        default:
            break;
        }
        S.gotoState('normal');
    });

    S.on(self, 'specialAsserted', function (type, mods) {
        S.gotoState('normal');
    });

    S.on(self, 'pressAsserted', function (ch) {
        switch (ch) {
        default:
            break;
        }

        S.gotoState('normal');
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

module.exports = {
    Chat: ViChatFSM
};
