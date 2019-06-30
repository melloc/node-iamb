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
 * This is the logic for handling iamb's vi keybindings, and turning them into
 * actions by emitting the following events:
 *
 * - "checkpoint", sent to indicate the consumer should save a new history point
 *   if the text has changed
 * - "clamp", to indicate we're in NORMAL mode, and the cursor should not be
 *   allowed past the last character
 * - "edit", to take an editing action on a range of text
 * - "type", to type a character
 * - "replace", to replace a character
 * - "submit", to submit the currently entered text
 * - "scroll", to scroll the window
 * - "mark", to create a new named mark
 * - "charjump", to jump to a specific character mark
 * - "linejump", to jump to a specific line mark
 * - "paste", to paste some text
 * - "clear", to clear the text on the line
 * - "undo", to undo an edit
 * - "redo", to redo an edit
 * - "focus", to focus another UI element
 * - "refresh", to force a full window redraw
 * - "suspend", to suspend the program
 *
 * When "edit" is emitted, it is accompanied by the kind of editing action,
 * which can be one of the following:
 *
 * - "move", to move the cursor
 * - "highlight", to extend a highlighted range
 * - "delete", to delete some text
 * - "yank", to yank some text
 * - "erase", to restore replaced text
 * - "togglecase", to toggle the capitalization of text
 * - "uppercase", to make some text uppercase
 * - "lowercase", to make some text lowercase
 *
 * When these vi editing actions are taken, additional parameters to the action
 * are passed in the next argument, in an object with some subset of:
 *
 * - "movement", the kind of movement
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
    this.register = null;

    this.charsearch_character = null;
    this.charsearch_direction = D_RIGHT;
    this.charsearch_operation = 'to-char';

    this.movement_action = 'move';
    this.movement_poststate = 'normal';

    this.checkpoint_pending = false;

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

    function emit(movement, direction) {
        self.action(self.movement_action, movement, direction);
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

    function emit(movement, direction, c) {
        self.action(self.movement_action, movement, direction, c);
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
        'charjump',
        'charreplace',
        'charsearch',
        'goto',
        'insert',
        'linejump',
        'mark',
        'movement',
        'normal',
        'register',
        'replace',
        'visual',
        'wincmd'
    ]);

    self.count = 0;
    self.movement_action = 'move';
    self.movement_actchar = null;
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
            self.scroll('up', 'screen', 0.5 * self.getCount());
            return;
        case '^D':
            self.scroll('down', 'screen', 0.5 * self.getCount());
            return;
        case '^B':
            self.scroll('up', 'screen', self.getCount());
            return;
        case '^F':
            self.scroll('down', 'screen', self.getCount());
            return;
        case '^P':
        case '^Y':
            self.scroll('up', 'line', self.getCount());
            return;
        case '^N':
        case '^E':
            self.scroll('down', 'line', self.getCount());
            return;


        // Editing history
        case '^R':
            self.emit('redo', self.getCount());
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

        // Jump lists
        case '^I':
            self.emit('focus', 'history', 'next', self.getCount());
            return;
        case '^O':
            self.emit('focus', 'history', 'previous', self.getCount());
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
            self.scroll('up', 'screen', self.getCount());
            return;
        case 'next':
            self.scroll('down', 'screen', self.getCount());
            return;
        case 'delete':
            self.action('delete', 'char', D_RIGHT);
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
            self.scroll('bottom');
            return;
        case 'j':
            self.scroll('down', 'line', self.getCount());
            return;
        case 'k':
            self.scroll('up', 'line', self.getCount());
            return;

        // Paste
        case 'p':
            self.paste('after');
            S.gotoState('normal');
            return;
        case 'P':
            self.paste('before');
            S.gotoState('normal');
            return;

        // Editing history
        case 'u':
            self.emit('undo', self.getCount());
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
            self.emit('edit', 'move', {
                movement: 'line',
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
            self.emit('edit', 'move', {
                movement: 'line',
                direction: D_RIGHT,
                character: undefined,
                count: 1,
                register: self.getRegister()
            });
            S.gotoState('insert');
            return;
        case 'a':
            self.emit('edit', 'move', {
               movement: 'char',
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
            self.movement_actchar = 'y';
            self.movement_action = 'yank';
            self.movement_poststate = 'normal';
            S.gotoState('movement');
            return;
        case 'd':
            self.movement_actchar = 'd';
            self.movement_action = 'delete';
            self.movement_poststate = 'normal';
            S.gotoState('movement');
            return;
        case 'c':
            self.movement_actchar = 'c';
            self.movement_action = 'delete';
            self.movement_poststate = 'insert';
            S.gotoState('movement');
            return;
        case 'C':
            self.action('delete', 'line', D_RIGHT);
            S.gotoState('insert');
            return;
        case 'g':
            S.gotoState('goto');
            return;
        case 'r':
            S.gotoState('charreplace');
            return;
        case 'R':
            S.gotoState('replace');
            return;
        case 'S':
            self.action('delete', 'line', D_DOWN);
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
        case '~':
            self.action('togglecase', 'char', D_RIGHT);
            S.gotoState('normal');
            return;

        default:
            self.warn(NYI, 'normal', ch);
            break;
        }
    });

    /*
     * After we've performed a series of actions that should be grouped
     * together for undo/redo purposes (e.g. "2cwhello^[" should only be
     * a single undo action; same goes for everything typed in INSERT
     * mode).
     */
    if (self.checkpoint_pending) {
        self.emit('checkpoint');
        self.checkpoint_pending = false;
    }

    self.emit('clamp');
};

ViChatFSM.prototype.state_movement = function (S) {
    S.validTransitions([
        'charsearch',
        'insert',
        'normal'
    ]);

    var self = this;

    assert.string(self.movement_action, 'self.movement_action');
    assert.string(self.movement_actchar, 'self.movement_actchar');
    assert.string(self.movement_poststate, 'self.movement_poststate');

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
            self.warn(NYI, 'movement', info.key);
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
            self.warn(NYI, 'movement', name);
            S.gotoState('normal');
            break;
        }
    });

    S.on(self, 'pressAsserted', function (ch) {
        if (ch === self.movement_actchar) {
            self.action(self.movement_action, 'line', D_DOWN);
            S.gotoState(self.movement_poststate);
            return;
        }

        if (self._processMovementKey(S, ch)) {
            return;
        }

        if (self._processCount(ch)) {
            return;
        }

        switch (ch) {
        default:
            self.warn(NYI, 'movement', ch);
            S.gotoState('normal');
            return;
        }
    });
};


/**
 * Handle keys pressed after typing 'g' in NORMAL mode.
 *
 * Most of the commonly used keys in this state are for going to
 * a line (hence the state's name), but truthfully vim just uses
 * the 'g' key as a bit of a grab bag of actions.
 */
ViChatFSM.prototype.state_goto = function (S) {
    S.validTransitions([ 'movement', 'normal' ]);

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
            self.scroll(name, 'char', self.getCount());
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
            self.scroll('top');
            break;
        case 'j':
            self.scroll('down', 'line', self.getCount());
            break;
        case 'k':
            self.scroll('up', 'line', self.getCount());
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

        // Change text chase
        case '~':
            self.movement_actchar = '~';
            self.movement_action = 'togglecase';
            self.movement_poststate = 'normal';
            S.gotoState('movement');
            return;
        case 'u':
            self.movement_actchar = 'u';
            self.movement_action = 'lowercase';
            self.movement_poststate = 'normal';
            S.gotoState('movement');
            return;
        case 'U':
            self.movement_actchar = 'U';
            self.movement_action = 'uppercase';
            self.movement_poststate = 'normal';
            S.gotoState('movement');
            return;

        // Custom iamb keys
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
 * Handle keys pressed in INSERT mode.
 */
ViChatFSM.prototype.state_insert = function (S) {
    S.validTransitions([ 'insert', 'normal', 'paste' ]);

    var self = this;

    self.movement_action = 'move';
    self.movement_poststate = 'insert';
    self.checkpoint_pending = true;

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
        if (self._processMovementSpecial(S, name, mods)) {
            return;
        }

        switch (name) {
        case 'prior':
            self.scroll('up', 'screen', self.getCount());
            return;
        case 'next':
            self.scroll('down', 'screen', self.getCount());
            return;
        case 'delete':
            self.action('delete', 'char', D_RIGHT);
            return;
        default:
            self.warn(NYI, 'insert', name);
            return;
        }
    });

    S.on(self, 'pressAsserted', function (ch) {
        self.emit('type', ch, 0);
    });
};


/*
 * Handle keys pressed in REPLACE mode.
 */
ViChatFSM.prototype.state_replace = function (S) {
    S.validTransitions([ 'normal', 'paste', 'replace' ]);

    var self = this;

    self.movement_action = 'move';
    self.movement_poststate = 'replace';
    self.checkpoint_pending = true;

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
            self.action('erase', 'char', D_LEFT);
            return;
        case '^J':
        case '^M':
            self.emit('submit');
            return;
        case '^U':
            self.emit('clear');
            return;
        default:
            self.warn(NYI, 'replace', info.key);
            return;
        }
    });

    S.on(self, 'specialAsserted', function (name, mods) {
        if (self._processMovementSpecial(S, name, mods)) {
            self.emit('checkpoint');
            return;
        }

        switch (name) {
        case 'prior':
            self.scroll('up', 'screen', self.getCount());
            return;
        case 'next':
            self.scroll('down', 'screen', self.getCount());
            return;
        case 'delete':
            self.action('erase', 'char', D_LEFT);
            return;
        default:
            self.warn(NYI, 'replace', name);
            return;
        }
    });

    S.on(self, 'pressAsserted', function (ch) {
        self.emit('replace', ch, true, {
            movement: 'char',
            direction: D_RIGHT,
            character: undefined,
            count: 1,
            register: self.getRegister()
        });
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
    S.validTransitions([ this.movement_poststate ]);

    var self = this;

    S.on(self, 'controlAsserted', function (info) {
        switch (info.key) {
        case '^[':
            S.gotoState(self.movement_poststate);
            return;
        default:
            self.warn('Unknown mark: %s', info.key);
            S.gotoState(self.movement_poststate);
            return;
        }
    });

    S.on(self, 'specialAsserted', function (name, _mods) {
        self.warn('Unknown mark: %s', name);
        S.gotoState(self.movement_poststate);
    });

    S.on(self, 'pressAsserted', function (ch) {
        var lch = ch.toLowerCase();
        if (lch >= 'a' && lch <= 'z') {
            self.emit('charjump', ch);
        } else {
            self.warn('Unknown mark: %s', ch);
        }

        S.gotoState(self.movement_poststate);
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
 * or REPLACE mode, by pressing ^R.
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
    S.validTransitions([ this.movement_poststate ]);

    var self = this;

    S.on(self, 'controlAsserted', function (info) {
        switch (info.key) {
        default:
            self.warn(NYI, 'register', info.key);
            S.gotoState(self.movement_poststate);
            return;
        }
    });

    S.on(self, 'specialAsserted', function (name, _mods) {
        switch (name) {
        default:
            self.warn(NYI, 'register', name);
            S.gotoState(self.movement_poststate);
            return;
        }
    });

    S.on(self, 'pressAsserted', function (ch) {
        if (REGISTER_REGEX.test(ch)) {
            self.register = ch;
        } else {
            self.warn('Invalid register name: %s', ch);
        }
        S.gotoState(self.movement_poststate);
    });
};


/**
 * Handle keys pressed after typing 'r' in NORMAL mode.
 */
ViChatFSM.prototype.state_charreplace = function (S) {
    S.validTransitions([ 'normal' ]);

    var self = this;

    self.checkpoint_pending = true;

    S.on(self, 'controlAsserted', function (info) {
        switch (info.key) {
        case '^C':
        case '^[':
            S.gotoState('normal');
            return;
        default:
            self.warn(NYI, 'charreplace', info.key);
            S.gotoState('normal');
            return;
        }
    });

    S.on(self, 'specialAsserted', function (name, _mods) {
        switch (name) {
        default:
            self.warn(NYI, 'charreplace', name);
            S.gotoState('normal');
            return;
        }
    });

    S.on(self, 'pressAsserted', function (ch) {
        self.emit('replace', ch, false, {
            movement: 'char',
            direction: D_RIGHT,
            character: undefined,
            count: self.getCount(),
            register: self.getRegister()
        });
        S.gotoState('normal');
    });
};


/**
 * Handle keys pressed after typing 'r' in VISUAL mode.
 */
ViChatFSM.prototype.state_visreplace = function (S) {
    S.validTransitions([
        'normal',
        'visual'
    ]);

    var self = this;

    self.checkpoint_pending = true;

    S.on(self, 'controlAsserted', function (info) {
        switch (info.key) {
        case '^C':
        case '^[':
            S.gotoState('visual');
            return;
        default:
            self.warn(NYI, 'visreplace', info.key);
            S.gotoState('normal');
            return;
        }
    });

    S.on(self, 'specialAsserted', function (name, _mods) {
        switch (name) {
        default:
            self.warn(NYI, 'visreplace', name);
            S.gotoState('normal');
            return;
        }
    });

    S.on(self, 'pressAsserted', function (ch) {
        self.emit('replace', ch, false, {
            movement: 'highlight',
            direction: undefined,
            character: undefined,
            count: undefined,
            register: self.getRegister()
        });
        S.gotoState('normal');
    });
};

/**
 * Handle keys pressed in VISUAL mode.
 */
ViChatFSM.prototype.state_visual = function (S) {
    S.validTransitions([
        'charsearch',
        'insert',
        'normal',
        'register',
        'visual',
        'visreplace'
    ]);

    var self = this;

    self.movement_action = 'highlight';
    self.movement_poststate = 'visual';

    S.on(self, 'controlAsserted', function (info) {
        switch (info.key) {
        case '^C':
        case '^[':
            S.gotoState('normal');
            return;
        case '^?':
            self.action('delete', 'highlight');
            S.gotoState('normal');
            return;
        case '^H':
            self.action('highlight', 'char', D_LEFT);
            return;
        default:
            self.warn(NYI, 'visual', info.key);
            return;
        }
    });

    S.on(self, 'specialAsserted', function (name, mods) {
        if (self._processMovementSpecial(S, name, mods)) {
            return;
        }

        switch (name) {
        case 'delete':
            self.action('delete', 'highlight');
            break;
        default:
            self.warn(NYI, 'visual', name);
            break;
        }

        S.gotoState('normal');
    });

    S.on(self, 'pressAsserted', function (ch) {
        if (self._processMovementKey(S, ch)) {
            return;
        }

        if (self._processCount(ch)) {
            return;
        }

        switch (ch) {
        // State changes
        case 'r':
            S.gotoState('visreplace');
            return;
        case '"':
            S.gotoState('register');
            return;
        case '`':
            S.gotoState('charjump');
            return;

        // Focus other UI elements
        case ':':
            self.emit('focus', 'command');
            return;

        // Actions
        case 'c':
            self.action('delete', 'highlight');
            S.gotoState('insert');
            break;
        case 'd':
        case 'x':
            self.action('delete', 'highlight');
            break;
        case 'y':
            self.action('yank', 'highlight');
            break;
        case 'v':
            break;
        case '~':
            self.action('togglecase', 'highlight');
            break;
        case 'u':
            self.action('lowercase', 'highlight');
            break;
        case 'U':
            self.action('uppercase', 'highlight');
            break;

        default:
            self.warn(NYI, 'visual', ch);
            return;
        }

        S.gotoState('normal');
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
            break;

        // Window navigation
        case '^H':
            self.emit('focus', 'window', D_LEFT, self.getCount());
            break;
        case '^J':
            self.emit('focus', 'window', D_DOWN, self.getCount());
            break;
        case '^K':
            self.emit('focus', 'window', D_UP, self.getCount());
            break;
        case '^L':
            self.emit('focus', 'window', D_RIGHT, self.getCount());
            break;
        case '^B':
            self.emit('focus', 'window', 'bottom');
            break;
        case '^T':
            self.emit('focus', 'window', 'top');
            break;
        case '^W':
            self.emit('focus', 'window', 'next', self.count);
            break;

        // Window splits
        case '^S':
            self.emit('window', 'split', 'horizontal', self.count);
            break;
        case '^V':
            self.emit('window', 'split', 'vertical', self.count);
            break;

        // Window zoom
        case '^Z':
            self.emit('focus', 'window', 'zoom');
            break;

        default:
            self.warn(NYI, 'wincmd', info.key);
            break;
        }

        S.gotoState('normal');
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
        // Window resizing
        case '-':
            self.emit('window', 'resize', 'horizontal', -1 * self.getCount());
            break;
        case '+':
            self.emit('window', 'resize', 'horizontal', self.getCount());
            break;
        case '<':
            self.emit('window', 'resize', 'vertical', -1 * self.getCount());
            break;
        case '>':
            self.emit('window', 'resize', 'vertical', self.getCount());
            break;
        case '=':
            self.emit('window', 'resize', 'equal');
            break;

        // Window navigation
        case 'r':
            self.emit('window', 'rotate', 'down', self.getCount());
            break;
        case 'R':
            self.emit('window', 'rotate', 'up', self.getCount());
            break;

        // Window navigation
        case 'b':
            self.emit('focus', 'window', 'bottom');
            break;
        case 't':
            self.emit('focus', 'window', 'top');
            break;
        case 'w':
            self.emit('focus', 'window', 'next', self.count);
            break;
        case 'W':
            self.emit('focus', 'window', 'previous', self.count);
            break;
        case 'h':
            self.emit('focus', 'window', D_LEFT, self.getCount());
            break;
        case 'j':
            self.emit('focus', 'window', D_DOWN, self.getCount());
            break;
        case 'k':
            self.emit('focus', 'window', D_UP, self.getCount());
            break;
        case 'l':
            self.emit('focus', 'window', D_RIGHT, self.getCount());
            break;

        // Window splits
        case 's':
            self.emit('window', 'split', 'horizontal', self.count);
            break;
        case 'v':
            self.emit('window', 'split', 'vertical', self.count);
            break;

        // Window zoom
        case 'z':
            self.emit('focus', 'window', 'zoom');
            break;

        default:
            self.warn(NYI, 'wincmd', ch);
            break;
        }

        S.gotoState('normal');
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
ViChatFSM.prototype.action =
    function emitAction(action, movement, direction, ch) {
    if (action !== 'move') {
        this.checkpoint_pending = true;
    }

    this.emit('edit', action, {
        movement: movement,
        direction: direction,
        character: ch,
        count: this.getCount(),
        register: this.getRegister()
    });
};


ViChatFSM.prototype.paste = function emitPaste(direction) {
    this.checkpoint_pending = true;
    this.emit('paste', direction, this.getRegister(), this.getCount());
};


ViChatFSM.prototype.scroll = function emitScroll(direction, type, count) {
    this.emit('scroll', direction, type, count);
};


module.exports = {
    Chat: ViChatFSM
};
