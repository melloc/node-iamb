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
function isInclusiveRight(type) {
    return (
        type === 'to-char' ||
        type === 'till-char' ||
        type === 'highlight' ||
        type === 'word-end');
}


/**
 * Similarly, when moving leftwards, the starting character is normally not
 * included. The exception is in visual mode, when the action is finally
 * taken and the cursor is lying to the right of where visual mode was
 * initially entered.
 */
function isInclusiveLeft(type) {
    return (type === 'highlight');
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


function toggleCase(src) {
    var res = '';

    for (var i = 0; i < src.length; i++) {
        var lc = src[i].toLowerCase();
        if (src[i] === lc) {
            res += src[i].toUpperCase();
        } else {
            res += lc;
        }
    }

    return res;
}

function toUpperCase(str) {
    return str.toUpperCase();
}

function toLowerCase(str) {
    return str.toLowerCase();
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
    assert.object(options.inputFSM, 'options.inputFSM');
    assert.func(options.complete, 'options.complete');

    var self = this;

    mod_draw.Region.call(self, {
        width: options.width,
        height: options.height
    });

    self.log = options.log;
    self.program = options.program;
    self.prompt = options.prompt;

    self.value = '';
    self.cursor = { x: 0, y: 0 };
    self.start = { x: 0, y: 0 };
    self.hlbegin = null;
    self.history = null;
    self.prev = null;

    self.completion_func = options.complete;
    self.completion_options = [];
    self.completion_index = null;
    self.completion_original = null;
    self.completion_cursor = null;

    self.reset();

    var inputFSM = options.inputFSM;

    inputFSM.on('submit', self.submit.bind(self));

    inputFSM.on('clamp', self.clamp.bind(self));

    inputFSM.on('type', self.type.bind(self));
    inputFSM.on('edit', self.edit.bind(self));
    inputFSM.on('replace', self.replace.bind(self));
    inputFSM.on('paste', self.paste.bind(self));

    inputFSM.on('complete', self.complete.bind(self));

    inputFSM.on('checkpoint', self.checkpoint.bind(self));
    inputFSM.on('undo', self.undo.bind(self));
    inputFSM.on('redo', self.redo.bind(self));

    self.on('resize', self._refresh.bind(self));

    self._refresh();
}
mod_util.inherits(TextBox, mod_draw.Region);


TextBox.prototype._insert = function _insert(where, co, text) {
    this.value =
        this.value.slice(0, where) + text +
        this.value.slice(where);

    this.cursor = this._movement({
        movement: 'char',
        direction: 'right',
        count: text.length + co
    });
};


TextBox.prototype._transform = function _transform(f, action) {
    var r = this._range(action);
    if (r === null) {
        return;
    }

    this.value =
        this.value.slice(0, r.start.x) +
        f(this.value.slice(r.start.x, r.end.x)) +
        this.value.slice(r.end.x);
    this.cursor = r.end;
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

    switch (action.movement) {
    case 'highlight':
        if (self.hlbegin !== null) {
            nc = self.hlbegin;
            self.hlbegin = null;
        }
        break;
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
        throw new VError('unknown movement type: %j', action.movement);
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
 * Given an action's movement, calculate the affected [start, end) range
 * based on the cursor's current position.
 */
TextBox.prototype._movement2range = function _movement2range(action) {
    var nc = this._movement(action);
    if (nc === null) {
        return null;
    }

    var cc = {
        x: this.cursor.x,
        y: this.cursor.y
    };

    if (nc.x < this.cursor.x) {
        if (isInclusiveLeft(action.movement)) {
            cc.x += 1;
        }

        return {
            start: nc,
            end: cc,
            nc: nc
        };
    }

    if (isInclusiveRight(action.movement)) {
        nc.x += 1;
    }

    return {
        start: cc,
        end: nc,
        nc: cc
    };
};


TextBox.prototype._range = function _range(action) {
    switch (action.movement) {
    case 'line':
        switch (action.direction) {
        case 'up':
        case 'down':
            return {
                start: {
                    x: 0,
                    y: this.cursor.y
                },
                end: {
                    x: this.value.length,
                    y: this.cursor.y
                },
                nc: {
                    x: 0,
                    y: this.cursor.y
                }
            };
        default:
            break;
        }
        break;
    default:
        break;
    }

    return this._movement2range(action);
};


/**
 * Return the position at which to draw the cursor on-screen.
 */
TextBox.prototype.get_cursor = function getCursor() {
    return {
        x: this.prompt.length + this.cursor.x - this.start.x,
        y: this.cursor.y - this.start.y
    };
};


TextBox.prototype.setPrompt = function setPrompt(prompt) {
    assert.string(prompt, 'prompt');
    this.prompt = prompt;
    this._refresh();
};


TextBox.prototype._resetcompl = function _resetcompl() {
    this.completion_options = [];
};


TextBox.prototype.reset = function reset() {
    this._resetcompl();

    this.value = '';

    this.cursor = { x: 0, y: 0 };
    this.start = { x: 0, y: 0 };
    this.hlbegin = null;

    this.history = new HistList({
        maxSize: HISTSIZE,
        log: this.log
    });
    this.history.append(this.value);
    this.prev = this.value;

    this._refresh();
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


TextBox.prototype.undo = function undo(count) {
    this.value = this.history.prev(count);
    this.prev = this.value;
    this._refresh();
};


TextBox.prototype.redo = function redo(count) {
    this.value = this.history.next(count);
    this.prev = this.value;
    this._refresh();
};


/*
 * Clamp the cursor if needed, and reset any abandoned state. This is needed
 * after exiting modes like INSERT/REPLACE/VISUAL, or after deleting characters
 * at the end of the line while in NORMAL mode.
 */
TextBox.prototype.clamp = function clamp() {
    var nr = false;

    if (this.hlbegin !== null) {
        this.hlbegin = null;
        nr = true;
    }

    if (this.cursor.x >= this.value.length) {
        if (this.value.length === 0) {
            this.cursor.x = 0;
        } else {
            this.cursor.x = Math.min(this.cursor.x, this.value.length - 1);
        }

        nr = true;
    }

    if (nr) {
        this._refresh();
    }

    this._resetcompl();
};


TextBox.prototype.complete = function completeText(direction) {
    var x, txt;

    if (this.completion_options.length === 0) {
        x = this.cursor.x - 1;

        while (isWordChar(this.value[x - 1])) {
            x -= 1;
        }

        txt = this.value.slice(x, this.cursor.x);

        this.completion_options = this.completion_func(txt);
        if (this.completion_options.length === 0) {
            return;
        }

        this.completion_index = this.completion_options.length;
        this.completion_original = this.value;
        this.completion_cursor = this.cursor;
    }

    switch (direction) {
    case 'next':
        if (this.completion_index === this.completion_options.length) {
            this.completion_index = 0;
        } else {
            this.completion_index += 1;
        }
        break;
    case 'previous':
        if (this.completion_index === 0) {
            this.completion_index = this.completion_options.length;
        } else {
            this.completion_index -= 1;
        }
        break;
    default:
        throw new VError('unknown completion direction: %j', direction);
    }

    this.value = this.completion_original;
    this.cursor = this.completion_cursor;

    if (this.completion_index !== this.completion_options.length) {
        this._insert(this.cursor.x, 0,
            this.completion_options[this.completion_index]);
    }

    this._refresh();
};


TextBox.prototype.move = function moveCursor(action) {
    var nc = this._movement(action);
    if (nc === null) {
        return;
    }

    this.cursor = nc;
    this._refresh();
    this._resetcompl();
};


TextBox.prototype.highlight = function highlightText(action) {
    var nc = this._movement(action);
    if (nc === null) {
        return;
    }

    if (this.hlbegin === null) {
        this.hlbegin = this.cursor;
    }

    this.cursor = nc;
    this._refresh();
    this._resetcompl();
};


TextBox.prototype.togglecase = function toggleText(action) {
    this._transform(toggleCase, action);
    this._refresh();
    this._resetcompl();
};

TextBox.prototype.lowercase = function lcText(action) {
    this._transform(toLowerCase, action);
    this._refresh();
    this._resetcompl();
};

TextBox.prototype.uppercase = function ucText(action) {
    this._transform(toUpperCase, action);
    this._refresh();
    this._resetcompl();
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

    this._refresh();
    this._resetcompl();
};


TextBox.prototype.yank = function yankText(action) {
    var r = this._range(action);
    if (r === null) {
        return;
    }

    this.program.registers.updateRegister('yank', action.register,
        this.value.slice(r.start.x, r.end.x));

    /*
     * When yanking, the cursor is moved to the beginning of the yanked range.
     * For forwards movements this is a no-op, but it is meaningful for
     * backwards movements and ranges.
     */
    this.cursor = r.nc;
    this._refresh();
    this._resetcompl();
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

    this._refresh();
    this._resetcompl();
};


TextBox.prototype.replace = function replaceText(ch, typing, action) {
    var r = this._range(action);
    if (r === null) {
        return;
    }

    var length = r.end.x - r.start.x;
    if (typing) {
        /*
         * When typing in REPLACE mode, we always want to
         * make sure that we enter a character, even if
         * we're at the end of the line and there's no
         * character to overwrite.
         */
        length = Math.max(length, 1);
    } else if (length < action.count) {
        /*
         * If we aren't actually going to replace count
         * characters, do nothing.
         */
        return;
    }

    this.value =
        this.value.slice(0, r.start.x) +
        repeat(ch, length) +
        this.value.slice(r.end.x);

    if (typing) {
        this.cursor.x += length;
    }

    this._refresh();
    this._resetcompl();
};


/**
 * Remove or restore characters with what they were from the previous
 * history item, effectively "erasing" the replacement. This is what
 * backspacing in REPLACE mode does.
 */
TextBox.prototype.erase = function eraseText(action) {
    var r = this._range(action);
    if (r === null) {
        return;
    }

    var prev = this.history.current();
    if (prev !== this.value) {
        this.value =
            this.value.slice(0, r.start.x) +
            prev.slice(r.start.x, r.end.x) +
            this.value.slice(r.end.x);
    }

    this.cursor = r.nc;

    this._refresh();
    this._resetcompl();
};


/**
 * Enter some new text (usually just a character) under the cursor.
 */
TextBox.prototype.type = function type(ch) {
    // Append typed characters, and move cursor right.
    this._insert(this.cursor.x, 0, ch);
    this._refresh();
    this._resetcompl();
};


/**
 * Perform a basic editor action over some range of characters determined by
 * "movement".
 */
TextBox.prototype.edit = function editText(action, movement) {
    assert.string(action, 'action');
    assert.object(movement, 'movement');

    switch (action) {
    case 'move':
        this.move(movement);
        break;
    case 'highlight':
        this.highlight(movement);
        break;
    case 'erase':
        this.erase(movement);
        break;
    case 'delete':
        this.delete(movement);
        break;
    case 'yank':
        this.yank(movement);
        break;

    case 'togglecase':
        this.togglecase(movement);
        break;
    case 'uppercase':
        this.uppercase(movement);
        break;
    case 'lowercase':
        this.lowercase(movement);
        break;

    default:
        throw new VError('unknown editing action: %j', action);
    }
};


/**
 * If any text has been entered, emit a "submit" event with it, and reset
 * the TextBox to be empty.
 */
TextBox.prototype.submit = function submit() {
    var value = this.value;
    if (value === '') {
        // Do nothing if nothing's been entered.
        return;
    }

    this.reset();
    this.emit('submit', value);
};


/**
 * When any of the following change, then this method needs to be called to
 * make sure the Region shows the correct characters:
 *
 *   - Cursor position
 *   - Text
 *   - Prompt
 *   - Highlighted region
 */
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

    /*
     * Finally, if we have a highlighted range of text, go back and update
     * those cells to be in reverse video. Otherwise, we're done.
     */
    if (this.hlbegin === null) {
        return;
    }

    var hb, he;
    if (this.hlbegin.x < this.cursor.x) {
        hb = Math.max(this.hlbegin.x, this.start.x);
        he = this.cursor.x;
    } else {
        hb = this.cursor.x;
        he = Math.min(this.hlbegin.x, end - 1);
    }

    for (var i = hb; i <= he; i++) {
        var c = this.get_cell(this.prompt.length + i - this.start.x, 0);
        c.format({ reverse: true });
    }
};

module.exports = TextBox;
