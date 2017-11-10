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
var mod_draw = require('termdraw');
var mod_util = require('util');
var VError = require('verror');

var HistList = require('../util').HistList;


// --- Globals

var HISTSIZE = 500;


// --- Internal helpers

/**
 * Usually, rightward delete/yank movements affect up to (that is,
 * not including), the position that the cursor would land on when
 * just moving. This functions checks if this movement type is one
 * of the exceptions, and therefore requires extending the affected
 * range.
 */
function isInclusive(type) {
    return (
        type === 'to-char' ||
        type === 'till-char' ||
        type === 'word-end');
}


function repeat(text, count) {
    var result = '';
    for (var i = 0; i < count; ++i) {
        result += text;
    }
    return result;
}


function isKeyword(c) {
    return (
        c >= '!' && c <= '/' ||
        c >= '[' && c <= '^' ||
        c >= '{' && c <= '~' ||
        c === '`');
}


function isWordChar(c) {
    return (
        c >= 'a' && c <= 'z' ||
        c >= 'A' && c <= 'Z' ||
        c >= '0' && c <= '9' ||
        c === '_');
}


function isWordBegin(val, idx) {
    if (idx === 0) {
        return true;
    }

    var a = val[idx - 1];
    var b = val[idx];

    var awc = isWordChar(a);
    var akw = isKeyword(a);
    var bwc = isWordChar(b);
    var bkw = isKeyword(b);

    return (
        (awc && bkw) || (akw && bwc) ||
        (!awc && bwc) || (!akw && bkw));
}


function isWordEnd(val, idx) {
    if (idx === 0 || idx >= val.length - 1) {
        return true;
    }

    var a = val[idx];
    var b = val[idx + 1];

    var awc = isWordChar(a);
    var akw = isKeyword(a);
    var bwc = isWordChar(b);
    var bkw = isKeyword(b);

    return (
        (awc && bkw) || (akw && bwc) ||
        (awc && !bwc) || (akw && !bkw));
}


// --- Exports

/*
 * Custom UI element for managing chat input.
 */
function TextBox(options) {
    assert.object(options, options);
    assert.object(options.program, 'options.program');
    assert.object(options.log, 'options.log');
    assert.string(options.prompt, options.prompt);
    assert.func(options.redraw, 'options.redraw');
    assert.object(options.inputFSM, 'options.inputFSM');

    var self = this;

    mod_draw.Region.call(self, {
        width: 1,
        height: 1
    });

    self.log = options.log;
    self.redraw = options.redraw;

    self.value = '';
    self.cursor = { x: 0, y: 0 };
    self.start = { x: 0, y: 0 };
    self.program = options.program;
    self.prompt = options.prompt;

    self.prev = null;
    self.history = null;
    self.resetHistory();

    var inputFSM = options.inputFSM;

    // Append typed characters, and move cursor right.
    inputFSM.on('type', function (ch) {
        self._insert(self.cursor.x, 0, ch);
    });

    inputFSM.on('clear', function () {
        self.clearText();
        self.refresh();
    });

    inputFSM.on('clamp', function () {
        self.clamp();
    });

    inputFSM.on('submit', function () {
        var value = self.value;
        if (value === '') {
            // Do nothing if nothing's been entered.
            return;
        }

        self.clearText();
        self.resetHistory();
        self.emit('submit', value);
    });

    // Move cursor around the text.
    inputFSM.on('move', function (action) {
        self.move(action);
        self.refresh();
    });

    inputFSM.on('replace', function (ch, count) {
        self.replace(ch, count);
        self.refresh();
    });

    inputFSM.on('delete', function (action) {
        self.delete(action);
        self.refresh();
    });

    inputFSM.on('yank', function (action) {
        self.yank(action);
        self.refresh();
    });

    inputFSM.on('paste', function (where, what, count) {
        self.paste(where, what, count);
        self.refresh();
    });

    inputFSM.on('checkpoint', function () {
        self.checkpoint();
    });

    inputFSM.on('undo', function (count) {
        self.value = self.history.prev(count);
        self.prev = self.value;
        self.refresh();
    });

    inputFSM.on('redo', function (count) {
        self.value = self.history.next(count);
        self.prev = self.value;
        self.refresh();
    });

    /*
     * Perform our first screen refresh, to make sure we have the prompt drawn.
     * We need to delay until the next tick to make sure we've gotten our first
     * resize.
     */
    setImmediate(function () {
        self.refresh();
    });
}
mod_util.inherits(TextBox, mod_draw.Region);


TextBox.prototype._insert = function _insert(where, co, text) {
    this.value =
        this.value.slice(0, where) + text +
        this.value.slice(where);
    this.move({
        type: 'char',
        direction: 'right',
        count: text.length + co
    });
    this.refresh();
};


/**
 * Seek to a given character on the line.
 */
TextBox.prototype._findChar = function _findChar(nc, offset, move, count, ch) {
    if (ch === null || ch === undefined) {
        nc.x = -1;
        return;
    }

    while (count > 0 && nc.x >= 0 && nc.x <= this.value.length) {
        nc.x += move;

        if (this.value[nc.x + offset] === ch) {
            count -= 1;
        }
    }

    /*
     * While other movements will just stop at the end of the line if
     * they can't do the full movement, character searching must find
     * the character the exact number of specified times.
     */
    if (count > 0) {
        nc.x = -1;
    }
};


/**
 * Seek to word boundaries on the line.
 */
TextBox.prototype._findWord = function _findWord(matches, nc, move, count) {
    while (count > 0 && nc.x >= 0 && nc.x < this.value.length) {
        nc.x += move;

        if (matches(this.value, nc.x)) {
            count -= 1;
        }
    }
};


/**
 * Perform a movement starting from the current cursor position,
 * and return the coordinates for where the cursor would stop.
 */
TextBox.prototype._movement = function _movement(action) {
    assert.object(action, 'action');
    var self = this;
    var nc = {
        x: self.cursor.x,
        y: self.cursor.y
    };

    switch (action.type) {
    case 'line':
        switch (action.direction) {
        case 'left':
            nc.x = 0;
            break;
        case 'right':
            nc.x = self.value.length;
            break;
        case 'first-word':
            nc.x = 0;
            while (self.value[nc.x] === ' ') {
                nc.x += 1;
            }
            break;
        default:
            throw new VError('unknown direction: %j', action.direction);
        }
        break;
    case 'word-begin':
        switch (action.direction) {
        case 'left':
            self._findWord(isWordBegin, nc, -1, action.count);
            break;
        case 'right':
            self._findWord(isWordBegin, nc, 1, action.count);
            break;
        case 'down':
        case 'up':
            break;
        default:
            throw new VError('unknown direction: %j', action.direction);
        }
        break;
    case 'word-end':
        switch (action.direction) {
        case 'left':
            self._findWord(isWordEnd, nc, -1, action.count);
            break;
        case 'right':
            self._findWord(isWordEnd, nc, 1, action.count);
            break;
        case 'down':
        case 'up':
            break;
        default:
            throw new VError('unknown direction: %j', action.direction);
        }
        break;
    case 'to-char':
        switch (action.direction) {
        case 'left':
            self._findChar(nc, 0, -1, action.count, action.character);
            break;
        case 'right':
            self._findChar(nc, 0, 1, action.count, action.character);
            break;
        default:
            throw new VError('Unknown direction: %j', action.direction);
        }
        break;
    case 'till-char':
        switch (action.direction) {
        case 'left':
            self._findChar(nc, -1, -1, action.count, action.character);
            break;
        case 'right':
            self._findChar(nc, 1, 1, action.count, action.character);
            break;
        default:
            throw new VError('Unknown direction: %j', action.direction);
        }
        break;
    case 'char':
        switch (action.direction) {
        case 'left':
            nc.x = Math.max(nc.x - action.count, 0);
            break;
        case 'right':
            nc.x = Math.min(nc.x + action.count, self.value.length);
            break;
        case 'down':
        case 'up':
            break;
        default:
            throw new VError('unknown direction: %j', action.direction);
        }
        break;
    default:
        throw new VError('unknown movement type: %j', action.type);
    }

    if (nc.x < 0 || nc.x > self.value.length) {
        /*
         * Movement failed, so the cursor stays still.
         */
        return null;
    }

    return nc;
};


/**
 * Given an action's movement, calculate the affected [start, end) range.
 */
TextBox.prototype._range = function _range(action) {
    var nc = this._movement(action);
    if (nc === null) {
        return null;
    }

    var cc = {
        x: this.cursor.x,
        y: this.cursor.y
    };

    if (nc.x < this.cursor.x) {
        return {
            start: nc,
            end: cc,
            nc: nc
        };
    }

    if (isInclusive(action.type)) {
        nc.x += 1;
    }

    return {
        start: cc,
        end: nc,
        nc: cc
    };
};


/**
 * Return the position at which to draw the cursor on-screen.
 */
TextBox.prototype.getCursor = function getCursor() {
    return {
        x: this.prompt.length + this.cursor.x - this.start.x,
        y: this.cursor.y - this.start.y
    };
};


TextBox.prototype.setPrompt = function setPrompt(prompt) {
    assert.string(prompt, 'prompt');
    this.prompt = prompt;
};


TextBox.prototype.clearText = function clearText() {
    this.value = '';
    this.cursor = { x: 0, y: 0 };
    this.start = { x: 0, y: 0 };
    this._refresh();
};


TextBox.prototype.resetHistory = function resetHistory() {
    this.history = new HistList({
        maxSize: HISTSIZE,
        log: this.log
    });
    this.history.append(this.value);
    this.prev = this.value;
};


/*
 * Save the current text to the history list if it's been changed since the
 * last time.
 */
TextBox.prototype.checkpoint = function checkpoint() {
    if (this.value !== this.prev) {
        this.history.append(this.value);
        this.prev = this.value;
    }
};


/*
 * Clamp the cursor if needed. This is needed after exiting
 * INSERT or REPLACE mode, or after deleting characters at
 * the end of the line while in NORMAL mode.
 */
TextBox.prototype.clamp = function clamp() {
    if (this.cursor.x < this.value.length) {
        return;
    }

    if (this.value.length === 0) {
        this.cursor.x = 0;
    } else {
        this.cursor.x = Math.min(this.cursor.x, this.value.length - 1);
    }

    this.refresh();
};


TextBox.prototype.move = function moveCursor(action) {
    var nc = this._movement(action);
    if (nc === null) {
        return;
    }

    this.cursor = nc;
};


TextBox.prototype.delete = function deleteText(action) {
    var r = this._range(action);
    if (r === null) {
        return;
    }

    this.program.registers.updateRegister('delete', action.register,
        this.value.slice(r.start.x, r.end.x));
    this.value =
        this.value.slice(0, r.start.x) +
        this.value.slice(r.end.x);
    this.cursor = r.nc;
};


TextBox.prototype.yank = function yankText(action) {
    var r = this._range(action);
    if (r === null) {
        return;
    }

    this.program.registers.updateRegister('yank', action.register,
        this.value.slice(r.start.x, r.end.x));
    this.cursor = r.nc;
};


TextBox.prototype.paste = function pasteText(where, what, count) {
    var text = this.program.registers.getRegister(what);
    if (text === null) {
        this.program.warn('Nothing in register ' + what);
        return;
    }

    text = repeat(text, count);

    switch (where) {
    case 'before':
        this._insert(this.cursor.x, -1, text);
        break;
    case 'after':
        this._insert(this.cursor.x + 1, 0, text);
        break;
    default:
        throw new VError('unknown paste direction: %j', where);
    }
};


TextBox.prototype.replace = function replaceText(ch, count) {
    var target = this.value.slice(this.cursor.x);
    if (target.length < count) {
        /*
         * If we aren't actually going to replace count
         * characters, do nothing.
         */
        return;
    }

    var first = this.value.slice(0, this.cursor.x);

    /*
     * 0 is a hacky, special case to indicate that we're
     * in REPLACE mode. We move the cursor right, and
     * then treat the count as 1.
     */
    if (count === 0) {
        this.cursor.x += 1;
        count = 1;
    }

    var last = target.slice(count);

    this.value = first + repeat(ch, count) + last;
};


TextBox.prototype._refresh = function refreshTextBox() {
    this.clear();
    this.str(0, 0, this.prompt);

    var width = this.width() - this.prompt.length - 1;
    if (width <= 0) {
        return;
    }

    /*
     * The cursor may have moved out of the viewable range of text. If so,
     * then we need to redetermine what the start of that range is, and
     * account for whether the cursor is at the end.
     */
    if (this.cursor.x < this.start.x) {
        this.start.x = this.cursor.x;
    } else if (this.cursor.x > (this.start.x + width - 1)) {
        this.start.x = this.cursor.x - width;
    }

    var cpos = this.prompt.length + this.cursor.x - this.start.x;
    var end = this.start.x + width;
    if (cpos !== this.width()) {
        end += 1;
    }

    this.str(this.prompt.length, 0, this.value.slice(this.start.x, end));
};


TextBox.prototype.refresh = function refreshTextBox() {
    this._refresh();
    this.redraw();
};


TextBox.prototype.resize = function resizeTextBox(w, h) {
    TextBox.super_.prototype.resize.call(this, w, h);
    this._refresh();
};


module.exports = TextBox;
