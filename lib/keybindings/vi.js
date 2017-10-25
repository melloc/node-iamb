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
var D_LEFT = 'left';
var D_DOWN = 'down';
var D_UP = 'up';
var D_RIGHT = 'right';
var REGISTER_REGEX = /^[a-zA-Z0-9.:%#/_"=-]$/;


// --- Internal helpers

function flipDirection(dir) {
    return (dir === D_LEFT ? D_RIGHT : D_LEFT);
}


// --- Exports

/**
 * This is the logic for handling iamb's vi keybindings, and turning
 * them into actions by emitting the following events:
 *
 * - "clamp", to indicate we're in NORMAL mode, and the
 *   cursor should not be allowed past the last character
 * - "type", to type a character
 * - "replace", to replace a character
 * - "submit", to submit the currently entered text
 * - "scroll", to scroll the window
 * - "mark", to create a new named mark
 * - "charjump", to jump to a specific character mark
 * - "linejump", to jump to a specific line mark
 * - "highlight", to extend a highlighted range
 * - "move", to move the cursor
 * - "delete", to delete some text
 * - "yank", to yank some text
 * - "paste", to paste some text
 * - "clear", to clear the text on the line
 * - "undo", to undo an edit
 * - "redo", to redo an edit
 * - "focus", to focus another UI element
 * - "refresh", to force a full window redraw
 * - "suspend", to suspend the program
 *
 * Many of the vi editing actions correspond to a movement. To represent
 * the movement, an "action" argument is passed along with the event. It
 * contains the following fields:
 *
 * - "type", the kind of movement
 * - "direction" of the movement
 * - "character", a character associated with the movement, if relevant
 * - "count", the number of times to repeat the movement
 * - "register", the register to enter text into, if relevant
 *
 * The kinds of movements are:
 *
 * - "line", to move to the beginning or end of the line
 * - "word-begin", to move to the start of a word
 * - "word-end", to move to the end of a word
 * - "to-char", to move to the next occurrence of "character"
 * - "till-char", to move to just before the next occurrence of "character"
 * - "char", to move by characters
 *
 * All of these can move "left" or "right". "line" can also move by "first-word"
 * to move to the first word on a line.
 */
function ViChatFSM() {
    this.count = 0;
    this.insmode = 'type';

    this.charsearch_character = null;
    this.charsearch_direction = D_RIGHT;
    this.charsearch_operation = 'to-char';

    this.movement_action = 'move';
    this.movement_poststate = 'normal';

    mod_mooremachine.FSM.call(this, 'normal');
}
mod_util.inherits(ViChatFSM, mod_mooremachine.FSM);


/**
 * Handle movements common to most states using control + some key.
 *
 * If this function did anything it returns true. Otherwise, it returns false.
 */
ViChatFSM.prototype._processMovementControl = function (S, info) {
    var self = this;

    switch (info.key) {
    // Movement
    case '^?':
    case '^H':
        self.action(self.movement_action, 'char', D_LEFT);
        S.gotoState(self.movement_poststate);
        return true;
    default:
        return false;
    }
};


/**
 * Handle movements common to most states using special keys (e.g. arrow keys).
 *
 * If this function did anything it returns true. Otherwise, it returns false.
 */
ViChatFSM.prototype._processMovementSpecial = function (S, name, mods) {
    var self = this;

    function emit(type, direction) {
        self.action(self.movement_action, type, direction);
        S.gotoState(self.movement_poststate);
    }

    switch (name) {
    case 'end':
        emit('line', D_RIGHT);
        return true;
    case 'home':
        emit('line', D_LEFT);
        return true;
    case 'left':
    case 'right':
    case 'up':
    case 'down':
        if (mods.shift) {
            emit('word-begin', name);
        } else {
            emit('char', name);
        }
        return true;
    default:
        return false;
    }
};


/**
 * Handle movements common to most states.
 *
 * If this function did anything it returns true. Otherwise, it returns false.
 */
ViChatFSM.prototype._processMovementKey = function (S, ch) {
    var self = this;

    function emit(type, direction, c) {
        self.action(self.movement_action, type, direction, c);
        S.gotoState(self.movement_poststate);
    }

    switch (ch) {
    // Movement: Characters
    case 'h':
        emit('char', D_LEFT);
        return true;
    case 'l':
    case ' ':
        emit('char', D_RIGHT);
        return true;

    // Movement: Words
    case 'b':
        emit('word-begin', D_LEFT);
        return true;
    case 'w':
        emit('word-begin', D_RIGHT);
        return true;
    case 'e':
        emit('word-end', D_RIGHT);
        return true;

    // Movement: Line
    case '^':
        emit('line', 'first-word');
        return true;
    case '$':
        emit('line', D_RIGHT);
        return true;
    case '0':
        if (self.count === 0) {
            emit('line', D_LEFT);
        } else {
            self.count *= 10;
        }
        return true;

    // Movement: Character searching
    case 't':
        self.charsearch_direction = D_RIGHT;
        self.charsearch_operation = 'till-char';
        S.gotoState('charsearch');
        return true;
    case 'T':
        self.charsearch_direction = D_LEFT;
        self.charsearch_operation = 'till-char';
        S.gotoState('charsearch');
        return true;
    case 'f':
        self.charsearch_direction = D_RIGHT;
        self.charsearch_operation = 'to-char';
        S.gotoState('charsearch');
        return true;
    case 'F':
        self.charsearch_direction = D_LEFT;
        self.charsearch_operation = 'to-char';
        S.gotoState('charsearch');
        return true;
    case ';':
        emit(
            self.charsearch_operation,
            self.charsearch_direction,
            self.charsearch_character);
        return true;
    case ',':
        emit(
            self.charsearch_operation,
            flipDirection(self.charsearch_direction),
            self.charsearch_character);
        return true;
    default:
        return false;
    }
};


/**
 * Handle bumping the current count.
 *
 * If this function did anything it returns true. Otherwise, it returns false.
 */
ViChatFSM.prototype._processCount = function (ch) {
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
        this.count *= 10;
        this.count += parseInt(ch, 10);
        return true;
    default:
        return false;
    }
};


/**
 * This state handles keypresses in NORMAL mode.
 */
ViChatFSM.prototype.state_normal = function (S) {
    var self = this;

    S.validTransitions([
        'change',
        'charjump',
        'charsearch',
        'delete',
        'goto',
        'insert',
        'linejump',
        'mark',
        'normal',
        'register',
        'replace',
        'visual',
        'wincmd',
        'yank'
    ]);

    self.count = 0;
    self.insmode = 'type';
    self.movement_action = 'move';
    self.movement_poststate = 'normal';

    S.on(self, 'controlAsserted', function (info) {
        if (self._processMovementControl(S, info)) {
            return;
        }

        switch (info.key) {
        case '^C':
            if (self.count === 0) {
                self.warn('Type :quit<Enter> to exit iamb');
            }
            // fallthrough
        case '^[':
            S.gotoState('normal');
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
            S.gotoState('normal');
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
        if (self._processMovementSpecial(S, name, mods)) {
            return;
        }

        switch (name) {
        case 'prior':
            self.emit('scroll', 'up', 'screen', self.getCount());
            return;
        case 'next':
            self.emit('scroll', 'down', 'screen', self.getCount());
            return;
        case 'delete':
            self.emit('delete', {
                type: 'char',
                direction: D_RIGHT,
                count: self.getCount(),
                register: self.getRegister(),
                character: undefined
            });
            return;
        default:
            self.warn(NYI, 'normal', name);
            return;
        }
    });

    S.on(self, 'pressAsserted', function (ch) {
        if (self._processMovementKey(S, ch)) {
            return;
        }

        if (self._processCount(ch)) {
            return;
        }

        switch (ch) {
        // Scroll
        case 'G':
            self.emit('scroll', 'bottom');
            return;
        case 'j':
            self.emit('scroll', 'down', 'line', self.getCount());
            return;
        case 'k':
            self.emit('scroll', 'up', 'line', self.getCount());
            return;

        // Paste
        case 'p':
            self.emit('paste', 'after', self.getRegister(), self.getCount());
            return;
        case 'P':
            self.emit('paste', 'before', self.getRegister(), self.getCount());
            return;

        // Editing history
        case 'u':
            self.emit('undo');
            S.gotoState('normal');
            return;

        // Searching
        case 'n':
        case 'N':
        case 'K':
        case '?':
        case '/':
            self.warn(NYI, 'normal', ch);
            return;

        // Focus other UI elements
        case ':':
            self.emit('focus', 'command');
            return;

        // State changes
        case 'm':
            S.gotoState('mark');
            return;
        case '"':
            S.gotoState('register');
            return;
        case 'I':
            self.emit('move', {
                type: 'line',
                direction: D_LEFT,
                character: undefined,
                count: 1,
                register: self.getRegister()
            });
            S.gotoState('insert');
            return;
        case 'i':
            S.gotoState('insert');
            return;
        case 'A':
            self.emit('move', {
                type: 'line',
                direction: D_RIGHT,
                character: undefined,
                count: 1,
                register: self.getRegister()
            });
            S.gotoState('insert');
            return;
        case 'a':
            self.emit('move', {
               type: 'char',
               direction: D_RIGHT,
               character: undefined,
               count: 1,
               register: self.getRegister()
            });
            S.gotoState('insert');
            return;
        case '\'':
            S.gotoState('linejump');
            return;
        case '`':
            S.gotoState('charjump');
            return;
        case 'v':
            S.gotoState('visual');
            return;
        case 'y':
            S.gotoState('yank');
            return;
        case 'd':
            S.gotoState('delete');
            return;
        case 'c':
            S.gotoState('change');
            return;
        case 'C':
            self.action('delete', 'line', D_RIGHT);
            S.gotoState('insert');
            return;
        case 'g':
            S.gotoState('goto');
            return;
        case 'r':
            S.gotoState('replace');
            return;
        case 'R':
            self.insmode = 'replace';
            S.gotoState('insert');
            return;
        case 'S':
            self.emit('clear');
            S.gotoState('insert');
            return;
        case 's':
            self.action('delete', 'char', D_RIGHT);
            S.gotoState('insert');
            return;

        // Edit characters
        case 'D':
            self.action('delete', 'line', D_RIGHT);
            S.gotoState('normal');
            return;
        case 'x':
            self.action('delete', 'char', D_RIGHT);
            S.gotoState('normal');
            return;

        default:
            self.warn(NYI, 'normal', ch);
            break;
        }
    });

    self.emit('clamp');
};


/**
 * Handle keys pressed after typing 'c' in NORMAL mode.
 */
ViChatFSM.prototype.state_change = function (S) {
    S.validTransitions([ 'charsearch', 'insert', 'normal' ]);

    var self = this;

    self.movement_action = 'delete';
    self.movement_poststate = 'insert';

    S.on(self, 'controlAsserted', function (info) {
        if (self._processMovementControl(S, info)) {
            return;
        }

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

    S.on(self, 'specialAsserted', function (name, mods) {
        if (self._processMovementSpecial(S, name, mods)) {
            return;
        }

        switch (name) {
        default:
            self.warn(NYI, 'change', name);
            S.gotoState('normal');
            break;
        }
    });

    S.on(self, 'pressAsserted', function (ch) {
        if (self._processMovementKey(S, ch)) {
            return;
        }

        if (self._processCount(ch)) {
            return;
        }

        switch (ch) {
        default:
            self.warn(NYI, 'change', ch);
            S.gotoState('normal');
            return;
        }
    });
};


/**
 * Handle keys pressed after typing 'y' in NORMAL mode.
 */
ViChatFSM.prototype.state_yank = function (S) {
    S.validTransitions([ 'charsearch', 'normal' ]);

    var self = this;

    self.movement_action = 'yank';
    self.movement_poststate = 'normal';

    S.on(self, 'controlAsserted', function (info) {
        if (self._processMovementControl(S, info)) {
            return;
        }

        switch (info.key) {
        case '^C':
        case '^[':
            S.gotoState('normal');
            return;
        default:
            self.warn(NYI, 'yank', info.key);
            S.gotoState('normal');
            return;
        }
    });

    S.on(self, 'specialAsserted', function (name, mods) {
        if (self._processMovementSpecial(S, name, mods)) {
            return;
        }

        switch (name) {
        default:
            self.warn(NYI, 'yank', name);
            S.gotoState('normal');
            return;
        }
    });

    S.on(self, 'pressAsserted', function (ch) {
        if (self._processMovementKey(S, ch)) {
            return;
        }

        if (self._processCount(ch)) {
            return;
        }

        switch (ch) {
        default:
            self.warn(NYI, 'yank', ch);
            S.gotoState('normal');
            break;
        }
    });
};


/**
 * Handle keys pressed after typing 'd' in NORMAL mode.
 */
ViChatFSM.prototype.state_delete = function (S) {
    S.validTransitions([ 'charsearch', 'normal' ]);

    var self = this;

    self.movement_action = 'delete';
    self.movement_poststate = 'normal';

    S.on(self, 'controlAsserted', function (info) {
        if (self._processMovementControl(S, info)) {
            return;
        }

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

    S.on(self, 'specialAsserted', function (name, mods) {
        if (self._processMovementSpecial(S, name, mods)) {
            return;
        }

        switch (name) {
        default:
            self.warn(NYI, 'delete', name);
            S.gotoState('normal');
            return;
        }
    });

    S.on(self, 'pressAsserted', function (ch) {
        if (self._processMovementKey(S, ch)) {
            return;
        }

        if (self._processCount(ch)) {
            return;
        }

        switch (ch) {
        default:
            self.warn(NYI, 'delete', ch);
            S.gotoState('normal');
            return;
        }
    });
};


/**
 * Handle keys pressed after typing 'g' in NORMAL mode.
 */
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
        if (self._processCount(ch)) {
            return;
        }

        switch (ch) {
        // Movement
        case 'e':
            self.action('move', 'word-end', D_LEFT);
            break;
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
            self.action('move', 'line', 'first-word');
            break;
        case '$':
            self.action('move', 'line', D_RIGHT);
            break;
        case '0':
            if (self.count === 0) {
                self.action('move', 'line', D_LEFT);
            } else {
                self.count *= 10;
            }
            break;

        case 'l':
            self.emit('focus', 'lobby');
            break;
        default:
            self.warn(NYI, 'goto', ch);
            break;
        }

        S.gotoState('normal');
    });
};


/*
 * Handle keys pressed in INSERT or REPLACE mode.
 *
 * INSERT and REPLACE mode function almost identically. The main
 * difference is that REPLACE mode overwrites existing characters,
 * and restores replaced characters when backspace is pressed.
 *
 * We implement the two in the same mooremachine state here, and
 * disambiguate the small differences using the "insmode" value.
 */
ViChatFSM.prototype.state_insert = function (S) {
    S.validTransitions([ 'normal', 'paste' ]);

    var self = this;

    S.on(self, 'controlAsserted', function (info) {
        switch (info.key) {
        case '^C':
        case '^[':
            S.gotoState('normal');
            return;
        case '^R':
            S.gotoState('paste');
            return;
        case '^Z':
            self.emit('suspend');
            return;
        case '^L':
            self.emit('refresh');
            return;
        case '^?':
        case '^H':
            self.action('delete', 'char', D_LEFT);
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
            self.action('move', 'line', D_RIGHT);
            return;
        case 'home':
            self.action('move', 'line', D_LEFT);
            return;
        case 'delete':
            self.action('delete', 'char', D_RIGHT);
            return;
        case 'left':
        case 'right':
        case 'up':
        case 'down':
            if (mods.shift) {
                self.action('move', 'word-begin', name);
            } else {
                self.action('move', 'char', name);
            }
            return;
        default:
            self.warn(NYI, 'insert', name);
            return;
        }
    });

    S.on(self, 'pressAsserted', function (ch) {
        self.emit(self.insmode, ch, 0);
    });
};


/**
 * Handle keys pressed after typing "'" (single quote) in NORMAL mode.
 */
ViChatFSM.prototype.state_linejump = function (S) {
    S.validTransitions([ 'normal' ]);

    var self = this;

    S.on(self, 'controlAsserted', function (info) {
        switch (info.key) {
        case '^[':
            S.gotoState('normal');
            return;
        default:
            self.warn('Unknown mark: %s', info.key);
            S.gotoState('normal');
            return;
        }
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


/**
 * Handle keys pressed after typing '`' (backtick) in NORMAL mode.
 */
ViChatFSM.prototype.state_charjump = function (S) {
    S.validTransitions([ 'normal' ]);

    var self = this;

    S.on(self, 'controlAsserted', function (info) {
        switch (info.key) {
        case '^[':
            S.gotoState('normal');
            return;
        default:
            self.warn('Unknown mark: %s', info.key);
            S.gotoState('normal');
            return;
        }
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


/**
 * This special state handles reading a key to search for. We get here by
 * typing the movement keys 't'/'T'/'f'/'F'.
 */
ViChatFSM.prototype.state_charsearch = function (S) {
    S.validTransitions([ 'insert', 'normal', 'visual' ]);

    var self = this;

    S.on(self, 'controlAsserted', function (info) {
        switch (info.key) {
        default:
            self.warn(NYI, 'charsearch', info.key);
            S.gotoState('normal');
            return;
        }
    });

    S.on(self, 'specialAsserted', function (_type, _mods) {
        S.gotoState('normal');
    });

    S.on(self, 'pressAsserted', function (ch) {
        self.charsearch_character = ch;
        self.action(self.movement_action,
            self.charsearch_operation,
            self.charsearch_direction,
            self.charsearch_character);
        S.gotoState(self.movement_poststate);
    });
};


/**
 * Handle keys pressed after typing 'm' in NORMAL mode.
 */
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


/**
 * This is to paste the contents of a register while in INSERT
 * mode, by pressing ^R.
 */
ViChatFSM.prototype.state_paste = function (S) {
    S.validTransitions([ 'insert' ]);

    var self = this;

    S.on(self, 'controlAsserted', function (info) {
        switch (info.key) {
        default:
            S.gotoState('insert');
            return;
        }
    });

    S.on(self, 'specialAsserted', function (name, _mods) {
        switch (name) {
        default:
            S.gotoState('insert');
            return;
        }
    });

    S.on(self, 'pressAsserted', function (ch) {
        if (REGISTER_REGEX.test(ch)) {
            self.emit('paste', 'before', ch, 1);
        }
        S.gotoState('insert');
    });
};


/**
 * Handle keys pressed after typing '"' (double quote) in NORMAL mode.
 */
ViChatFSM.prototype.state_register = function (S) {
    S.validTransitions([ 'normal' ]);

    var self = this;

    S.on(self, 'controlAsserted', function (info) {
        switch (info.key) {
        default:
            self.warn(NYI, 'register', info.key);
            S.gotoState('normal');
            return;
        }
    });

    S.on(self, 'specialAsserted', function (name, _mods) {
        switch (name) {
        default:
            self.warn(NYI, 'register', name);
            S.gotoState('normal');
            return;
        }
    });

    S.on(self, 'pressAsserted', function (ch) {
        if (REGISTER_REGEX.test(ch)) {
            self.register = ch;
        } else {
            self.warn('Invalid register name: %s', ch);
        }
        S.gotoState('normal');
    });
};


/**
 * Handle keys pressed after typing 'r' in NORMAL mode.
 */
ViChatFSM.prototype.state_replace = function (S) {
    S.validTransitions([ 'normal' ]);

    var self = this;

    S.on(self, 'controlAsserted', function (info) {
        switch (info.key) {
        default:
            self.warn(NYI, 'replace', info.key);
            S.gotoState('normal');
            return;
        }
    });

    S.on(self, 'specialAsserted', function (name, _mods) {
        switch (name) {
        default:
            self.warn(NYI, 'replace', name);
            S.gotoState('normal');
            return;
        }
    });

    S.on(self, 'pressAsserted', function (ch) {
        self.emit('replace', ch, self.getCount());
        S.gotoState('normal');
    });
};


/**
 * Handle keys pressed in VISUAL mode.
 */
ViChatFSM.prototype.state_visual = function (S) {
    S.validTransitions([ 'charsearch', 'normal', 'visual' ]);

    var self = this;

    self.movement_action = 'highlight';
    self.movement_poststate = 'visual';

    S.on(self, 'controlAsserted', function (info) {
        if (self._processMovementControl(S, info)) {
            return;
        }

        switch (info.key) {
        case '^C':
        case '^[':
            S.gotoState('normal');
            return;
        default:
            self.warn(NYI, 'visual', info.key);
            S.gotoState('normal');
            return;
        }
    });

    S.on(self, 'specialAsserted', function (name, mods) {
        if (self._processMovementSpecial(S, name, mods)) {
            return;
        }

        switch (name) {
        default:
            self.warn(NYI, 'visual', name);
            S.gotoState('normal');
            return;
        }
    });

    S.on(self, 'pressAsserted', function (ch) {
        if (self._processMovementKey(S, ch)) {
            return;
        }

        if (self._processCount(ch)) {
            return;
        }

        switch (ch) {
        case 'v':
            S.gotoState('normal');
            return;
        default:
            self.warn(NYI, 'visual', ch);
            S.gotoState('normal');
            return;
        }
    });
};


/**
 * Handle keys pressed after typing ^W in NORMAL mode.
 */
ViChatFSM.prototype.state_wincmd = function (S) {
    S.validTransitions([ 'normal' ]);

    var self = this;

    S.on(self, 'controlAsserted', function (info) {
        switch (info.key) {
        case '^C':
        case '^[':
            S.gotoState('normal');
            return;
        default:
            self.warn(NYI, 'wincmd', info.key);
            S.gotoState('normal');
            return;
        }
    });

    S.on(self, 'specialAsserted', function (name, _mods) {
        switch (name) {
        case 'left':
        case 'right':
        case 'up':
        case 'down':
            self.emit('focus', 'window', name, self.getCount());
            S.gotoState('normal');
            return;
        default:
            self.warn(NYI, 'wincmd', name);
            S.gotoState('normal');
            return;
        }
    });

    S.on(self, 'pressAsserted', function (ch) {
        if (self._processCount(ch)) {
            return;
        }

        switch (ch) {
        case 'h':
            self.emit('focus', 'window', D_LEFT, self.getCount());
            S.gotoState('normal');
            return;
        case 'j':
            self.emit('focus', 'window', D_DOWN, self.getCount());
            S.gotoState('normal');
            return;
        case 'k':
            self.emit('focus', 'window', D_UP, self.getCount());
            S.gotoState('normal');
            return;
        case 'l':
            self.emit('focus', 'window', D_RIGHT, self.getCount());
            S.gotoState('normal');
            return;
        default:
            self.warn(NYI, 'wincmd', ch);
            S.gotoState('normal');
            return;
        }
    });
};


/**
 * If a count has been entered, fetch it. Otherwise, default to 1.
 */
ViChatFSM.prototype.getCount = function () {
    var count = this.count;
    this.count = 0;
    return (count === 0 ? 1 : count);
};


/**
 * If a register has been specified, fetch it. Otherwise, use the blackhole
 * register (_) in INSERT mode, and the default register (") everywhere else.
 */
ViChatFSM.prototype.getRegister = function () {
    if (this.isInState('insert')) {
        return '_';
    }

    var reg = this.register;
    this.register = null;
    return (reg === null ? '"' : reg);
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


/**
 * Given printf-style arguments, generate a warning.
 */
ViChatFSM.prototype.warn = function emitWarn() {
    this.emit('warn', sprintf.apply(null, arguments));
};


/**
 * Emit an action (like "move" or "yank") with the provided parameters,
 * and fetch any count or register previously specified.
 */
ViChatFSM.prototype.action = function emitAction(action, type, direction, ch) {
    this.emit(action, {
        type: type,
        direction: direction,
        character: ch,
        count: this.getCount(),
        register: this.getRegister()
    });
};


module.exports = {
    Chat: ViChatFSM
};