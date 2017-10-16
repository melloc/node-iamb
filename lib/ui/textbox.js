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


/*
 * Custom UI element for managing chat input.
 */
function TextBox(options) {
    assert.object(options, options);
    assert.string(options.prompt, options.prompt);
    assert.func(options.redraw, 'options.redraw');
    assert.object(options.inputFSM, 'options.inputFSM');

    var self = this;

    mod_draw.Region.call(self, {
        width: 1,
        height: 1
    });

    self.redraw = options.redraw;

    self.value = '';
    self.cursor = { x: 0, y: 0 };
    self.start = { x: 0, y: 0 };
    self.prompt = options.prompt;

    var inputFSM = options.inputFSM;

    // Append typed characters, and move cursor right.
    inputFSM.on('type', function (ch) {
        self.value =
            self.value.slice(0, self.cursor.x) + ch +
            self.value.slice(self.cursor.x);
        self.move('right', 1);
        self.refresh();
    });

    inputFSM.on('clear', function () {
        self.clearText();
        self.refresh();
    });

    inputFSM.on('submit', function () {
        var value = self.value;
        if (value === '') {
            // Do nothing if nothing's been entered.
            return;
        }

        self.clearText();
        self.emit('submit', value);
    });

    // Move cursor around the text.
    inputFSM.on('move', function (direction, type, count) {
        self.move(direction, count);
        self.refresh();
    });

    inputFSM.on('line', function (type) {
        switch (type) {
        case 'start':
            self.cursor.x = 0;
            break;
        case 'end':
            self.cursor.x = self.value.length;
            break;
        case 'first-word':
            self.cursor.x = 0;
            while (self.value[self.cursor.x] === ' ') {
                self.cursor.x += 1;
            }
            break;
        default:
            break;
        }

        self.refresh();
    });

    inputFSM.on('delete', function (type, count) {
        self.value =
            self.value.slice(0, self.cursor.x) +
            self.value.slice(self.cursor.x + count);
        self.refresh();
    });

    inputFSM.on('backspace', function (type, count) {
        self.value =
            self.value.slice(0, Math.max(self.cursor.x - count, 0)) +
            self.value.slice(self.cursor.x);
        self.move('left', count);
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


TextBox.prototype.move = function moveCursor(direction, count) {
    switch (direction) {
    case 'left':
        this.cursor.x = Math.max(this.cursor.x - count, 0);
        break;
    case 'right':
        this.cursor.x = Math.min(this.cursor.x + count, this.value.length);
        break;
    case 'up':
        break;
    case 'down':
        break;
    default:
        break;
    }
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

    /*
     * XXX: For now just make where the cursor would be the inverse.
     * We should really move the cursor to the right place ourselves,
     * though.
     */
    this.get_cell(cpos, 0).format({ reverse: true });
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
