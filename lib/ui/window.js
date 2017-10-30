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

var Layout = mod_draw.controls.Layout;
var TextBox = require('./textbox');

function Window(opts) {
    assert.object(opts, 'opts');
    assert.object(opts.inputFSM, 'opts.inputFSM');
    assert.object(opts.program, 'opts.program');
    assert.object(opts.room, 'opts.room');
    assert.object(opts.screen, 'opts.screen');
    assert.object(opts.viewPane, 'opts.viewPane');

    var self = this;

    mod_draw.controls.Layout.call(self, {});

    self.input = opts.inputFSM;

    self.input.on('suspend', function () {
        opts.screen.suspend();
    });

    self.input.on('refresh', function () {
        opts.screen.msgbar.clear();
        opts.screen.redraw(true);
    });

    self.input.on('focus', function (type, direction, count) {
        opts.screen.focus(type, direction, count);
    });

    self.input.on('warn', function (msg) {
        opts.screen.warn(msg);
    });

    self.input.on('mark', function (name) {
        opts.screen.setMark(name, opts.room);
    });

    self.input.on('linejump', function (name) {
        opts.screen.focusMark(name);
    });

    var wrapper = new Layout({
        border: true
    });

    wrapper.add(opts.viewPane, {
        weight: 1,
        label: opts.room.getTitle()
    });

    var textbar = new TextBox({
        inputFSM: self.input,
        prompt: '> ',
        program: opts.program,
        log: opts.program.log,
        redraw: opts.screen.redraw.bind(opts.screen)
    });

    textbar.on('submit', function (v) {
        opts.room.submit(v);
    });

    self.add(wrapper, { weight: 1 });
    self.add(textbar, { fixed_height: 1 });
}
mod_util.inherits(Window, mod_draw.controls.Layout);

module.exports = Window;
