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
var mod_bindings = require('../lib/keybindings');
var mod_commands = require('./commands');
var mod_draw = require('termdraw');
var mod_mooremachine = require('mooremachine');
var mod_ui = require('./ui');
var mod_util = require('util');

var Layout = mod_draw.controls.Layout;
var Lobby = require('./lobby');


function Screen(opts) {
    assert.object(opts, 'opts');
    assert.object(opts.program, 'opts.program');
    assert.object(opts.client, 'opts.client');
    assert.object(opts.log, 'opts.log');

    var self = this;

    self.program = opts.program;
    self.client = opts.client;

    self.marks = {};

    self.cmd_in = new mod_bindings.simple.Chat();

    self.draw = new mod_draw.Draw({});

    self.window = new Layout({
        width: self.draw.width(),
        height: self.draw.height()
    });

    function redrawScreen() {
        self.window._redo();
        self.redraw();
    }

    self.lobby = new Lobby({
        client: opts.client,
        screen: self
    });

    self.currentRoom = new mod_ui.VirtualRegion({
        wrapped: self.lobby.window
    });

    self.cmdbar = new mod_ui.TextBox({
        inputFSM: self.cmd_in,
        prompt: ':',
        redraw: redrawScreen
    });
    self.msgbar = new mod_draw.Region();

    self.bottom = new mod_ui.VirtualRegion({
        wrapped: self.msgbar
    });

    self.window.add(self.currentRoom, { weight: 1 });
    self.window.add(self.bottom, { fixed_height: 1 });

    self.cmd_in.on('suspend', self.suspend.bind(self));

    self.draw.on('resize', function () {
        self.window.resize(self.draw.width(), self.draw.height());
        redrawScreen();
    });

    redrawScreen();
    self.redrawInterval = setInterval(redrawScreen, 1000);

    mod_mooremachine.FSM.call(this, 'focusPane');
}
mod_util.inherits(Screen, mod_mooremachine.FSM);

Screen.prototype.state_focusPane = function (S) {
    S.validTransitions([ 'focusCommand' ]);

    var self = this;

    self.bottom.setWrapped(self.msgbar);
    self.redraw();

    S.on(self.draw, 'control', function (info) {
        self.currentRoom.getWrapped().input.control(info);
    });

    S.on(self.draw, 'keypress', function (ch) {
        self.currentRoom.getWrapped().input.press(ch);
    });

    S.on(self.draw, 'special', function (name, mods) {
        self.currentRoom.getWrapped().input.special(name, mods);
    });

    S.on(self, 'focus-command', function () {
        S.gotoState('focusCommand');
    });
};

Screen.prototype.state_focusCommand = function (S) {
    S.validTransitions([ 'focusPane' ]);

    var self = this;

    self.msgbar.clear();
    self.cmdbar.clearText();
    self.bottom.setWrapped(self.cmdbar);
    self.redraw();

    S.on(self.draw, 'control', function (info) {
        self.cmd_in.control(info);
    });

    S.on(self.draw, 'keypress', function (ch) {
        self.cmd_in.press(ch);
    });

    S.on(self.draw, 'special', function (name, mods) {
        self.cmd_in.special(name, mods);
    });

    S.on(self.cmd_in, 'switch', function () {
        S.gotoState('focusPane');
    });

    S.on(self.cmdbar, 'submit', function (text) {
        mod_commands.run(self.program, text);
        S.gotoState('focusPane');
    });
};

Screen.prototype.focusCommandBar = function () {
    this.emit('focus-command');
};

Screen.prototype.redraw = function redrawScreen(full) {
    this.draw.redraw(this.window, full);
};


Screen.prototype.pauseFor = function pauseFor(action) {
    var self = this;

    self.draw.draw_term.at_in.setRawMode(false);
    self.draw.draw_term.at_in.pause();
    self.draw.draw_term.softReset();

    action(function () {
        self.draw.draw_term.at_in.setRawMode(true);
        self.draw.draw_term.at_in.resume();
        self.draw.draw_term.clear();
        self.draw.draw_term.cursor(false);
        self.window.resize(self.draw.width(), self.draw.height());
        self.window._redo();
        self.draw.redraw(self.window, true);

        process.nextTick(function () {
            self.window._redo();
            self.draw.redraw(self.window, true);
        });
    });
};


Screen.prototype.suspend = function doSuspend() {
    this.pauseFor(function (done) {
        process.kill(process.pid, 'SIGTSTP');
        done();
    });
};


Screen.prototype.quit = function doQuit() {
    this.draw.close();
    process.exit(0);
};


Screen.prototype.warn = function showWarn(msg) {
    this.msgbar.clear();
    this.msgbar.str(0, 0, msg, { bold: true });
    this.bottom.setWrapped(this.msgbar);
    this.redraw();
};


Screen.prototype.setRoom = function (w) {
    this.currentRoom.setWrapped(w);
    this.redraw();
};

Screen.prototype.setMark = function (name, w) {
    this.marks[name] = w;
};

Screen.prototype.focusMark = function (name) {
    var w = this.marks[name];
    if (w) {
        this.setRoom(w);
    } else {
        this.warn('Mark not set');
    }
};

Screen.prototype.focusLobby = function () {
    this.setRoom(this.lobby.window);
};

module.exports = Screen;
