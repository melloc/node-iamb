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
var mod_bindings = require('../keybindings');
var mod_draw = require('termdraw');
var mod_util = require('util');
var VError = require('verror');

var HLayout = mod_draw.controls.HLayout;
var ChatLog = require('./chatlog');
var TextBox = require('./textbox');

function View(opts) {
    assert.object(opts, 'opts');
    assert.object(opts.program, 'opts.program');
    assert.object(opts.room, 'opts.room');
    assert.object(opts.screen, 'opts.screen');
    assert.optionalObject(opts.logbox, 'opts.logbox');

    var self = this;

    mod_draw.controls.HLayout.call(self, {});

    self.program = opts.program;
    self.room = opts.room;
    self.screen = opts.screen;

    self.input = new mod_bindings.vi.Chat();

    self.input.on('stateChanged', function (newState) {
        opts.screen.changeState(newState);
    });

    self.input.on('suspend', function () {
        opts.screen.suspend();
    });

    self.input.on('refresh', function () {
        opts.screen.warn('');
        opts.screen.redraw(true);
    });

    self.input.on('focus', function (type, direction, count) {
        opts.screen.focus(type, direction, count);
    });

    self.input.on('warn', function (msg) {
        opts.screen.warn(msg);
    });

    self.input.on('mark', function (name) {
        opts.screen.setMark(name, self.room);
    });

    self.input.on('linejump', function (name) {
        opts.screen.focusMark(name);
    });

    self.input.on('window', function (action, direction, count) {
        switch (action) {
        case 'split':
            self.screen.window.split(direction, count);
            break;
        case 'resize':
            self.screen.window.resizePane(direction, count);
            break;
        case 'rotate':
            self.screen.window.rotate(direction, count);
            break;
        default:
            throw new VError('unknown window command: %j', action);
        }
    });

    if (opts.logbox) {
        self.logbox = opts.logbox;
    } else {
        self.logbox = new ChatLog({
            inputFSM: self.input
        });
    }

    self.wrapper = new HLayout({
        border: true,
        children: [
            { child: self.logbox, weight: 1, label: opts.room.getTitle() }
        ]
    });

    self.textbar = new TextBox({
        inputFSM: self.input,
        prompt: '> ',
        program: opts.program,
        log: opts.program.log
    });

    self.textbar.on('submit', function (v) {
        opts.room.submit(v);
    });

    opts.room.on('line', function (l) {
        self.logbox.add(l);
        opts.screen.redraw();
    });

    self.push(self.wrapper, { weight: 1 });
    self.push(self.textbar, { fixed: 1 });

    /*
     * Get any previously loaded room history.
     */
    self.room.getLines().forEach(function (line) {
        self.logbox.add(line);
    });
}
mod_util.inherits(View, mod_draw.controls.HLayout);


View.prototype.get_cursor = function getCursor() {
    var cursor = this.textbar.get_cursor();

    return {
        x: cursor.x,
        y: cursor.y + this.wrapper.height()
    };
};


View.prototype.setFocus = function setFocus(focused) {
    if (focused) {
        this.textbar.setPrompt('> ');
    } else {
        this.textbar.setPrompt('  ');
    }
};


View.prototype.clone = function cloneView() {
    var view = new View({
        program: this.program,
        room: this.room,
        screen: this.screen
    });

    return view;
};

module.exports = View;
