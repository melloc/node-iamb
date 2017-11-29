/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2017, Cody Mello.
 * Copyright (c) 2017, Jordan Hendricks.
 */

'use strict';

var assert = require('assert-plus');
var mod_bindings = require('../lib/keybindings');
var mod_commands = require('./commands');
var mod_draw = require('termdraw');
var mod_mooremachine = require('mooremachine');
var mod_ui = require('./ui');
var mod_util = require('util');
var VError = require('verror');

var HistList = require('./util').HistList;
var Layout = mod_draw.controls.Layout;
var Lobby = require('./lobby');


/**
 * The Screen manages everything that is currently shown in the
 * terminal window, and handles directing input to the currently
 * focused UI element.
 *
 * The heirarchy of UI elements is as follows:
 *
 * - The topmost element, the Screen, is a collection of Windows and the bottom
 *   bar. (For now, only a single Window is supported.)
 * - A Window is a collection of Panes, and handles tiling them.
 * - A Pane is a history of Views.
 * - A View is a chat log and a text box for messages.
 *
 * Each of these elements has an idea of a focus within it, all the way down to
 * a text box that text is being typed into.
 */
function Screen(opts) {
    assert.object(opts, 'opts');
    assert.object(opts.program, 'opts.program');
    assert.object(opts.client, 'opts.client');
    assert.object(opts.log, 'opts.log');

    var self = this;

    self.program = opts.program;
    self.client = opts.client;
    self.log = opts.log;

    self.marks = {};
    self.jump_list = new HistList({
        log: self.log
    });

    self.cmd_in = new mod_bindings.simple.Chat();

    self.draw = new mod_draw.Draw({});
    self.redrawScheduled = false;
    self.redrawFull = false;

    self.visible = new Layout({
        width: self.draw.width(),
        height: self.draw.height()
    });

    self.redrawFunc = function redrawScreen() {
        self.visible._redo();
        self.redraw();
    };

    self.lobby = new Lobby({
        client: opts.client,
        program: self.program,
        screen: self
    });

    self.window = new mod_ui.Window({
        lobby: self.lobby,
        log: self.log,
        program: self.program,
        screen: self
    });

    self.cmdbar = new mod_ui.TextBox({
        inputFSM: self.cmd_in,
        program: self.program,
        log: self.program.log,
        prompt: ':',
        redraw: self.redrawFunc
    });

    self.msgbar = new mod_ui.StatusLine({
        program: self.program,
        screen: self
    });

    self.bottom = new mod_ui.VirtualRegion({
        wrapped: self.msgbar
    });

    self.visible.add(self.window, { weight: 1 });
    self.visible.add(self.bottom, { fixed_height: 1 });

    self.cmd_in.on('suspend', self.suspend.bind(self));

    self.draw.on('resize', function () {
        self.forceResize();
        self.redrawFunc();
    });

    mod_mooremachine.FSM.call(this, 'focusPane');

    self.redrawFunc();
    self.redrawInterval = setInterval(self.redrawFunc, 1000);
}
mod_util.inherits(Screen, mod_mooremachine.FSM);


Screen.prototype.state_focusPane = function (S) {
    S.validTransitions([ 'focusCommand' ]);

    var self = this;

    self.bottom.setWrapped(self.msgbar);
    self.redraw();

    S.on(self.draw, 'control', function (info) {
        self.window.pane.getWrapped().input.control(info);
    });

    S.on(self.draw, 'keypress', function (ch) {
        self.window.pane.getWrapped().input.press(ch);
    });

    S.on(self.draw, 'special', function (name, mods) {
        self.window.pane.getWrapped().input.special(name, mods);
    });

    S.on(self, 'focus-command', function () {
        S.gotoState('focusCommand');
    });
};


Screen.prototype.state_focusCommand = function (S) {
    S.validTransitions([ 'focusPane' ]);

    var self = this;

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


Screen.prototype.forceResize = function resizeScreen() {
    this.visible.resize(this.draw.width(), this.draw.height());
};


Screen.prototype.getCursor = function getCursor() {
    if (this.redrawInterval === undefined) {
        return null;
    }

    if (this.isInState('focusPane')) {
        return this.window.getCursor();
    }

    var cursor = this.cmdbar.getCursor();
    return {
        x: cursor.x,
        y: cursor.y + this.window.height()
    };
};


/**
 * Schedule a redraw of the screen on the next tick.
 *
 * This method should be called by UI elements after they have updated
 * their viewable content, and need the screen to be redrawn.
 */
Screen.prototype.redraw = function scheduleRedrawScreen(full) {
    var self = this;

    self.redrawFull = self.redrawFull || full;

    if (self.redrawScheduled) {
        return;
    }

    self.redrawScheduled = true;

    process.nextTick(function () {
        self._redraw();
    });
};


/**
 * Actually redraw the screen, and determine where we should drop off
 * the cursor when we're done.
 */
Screen.prototype._redraw = function redrawScreen() {
    var full = this.redrawFull;

    this.redrawFull = false;
    this.redrawScheduled = false;

    this.draw.redraw(this.visible, full);

    var cursor = this.getCursor();
    if (cursor !== null) {
        this.draw.draw_term.cursor(true);
        this.draw.draw_term.moveto(cursor.x + 1, cursor.y + 1);
    }
};


Screen.prototype.pauseFor = function pauseFor(action) {
    var self = this;

    self.draw.draw_term.at_in.setRawMode(false);
    self.draw.draw_term.at_in.pause();
    self.draw.draw_term.softReset();

    clearInterval(self.redrawInterval);

    action(function () {
        self.redrawInterval = setInterval(self.redrawFunc, 1000);
        self.draw.draw_term.at_in.setRawMode(true);
        self.draw.draw_term.at_in.resume();
        self.draw.draw_term.clear();
        self.draw.draw_term.cursor(false);
        self.visible.resize(self.draw.width(), self.draw.height());
        self.visible._redo();
        self.draw.redraw(self.visible, true);

        process.nextTick(function () {
            self.visible._redo();
            self.draw.redraw(self.visible, true);
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


Screen.prototype.changeState = function changeState(newState) {
    this.msgbar.changeState(newState);
};


Screen.prototype.warn = function showWarn(msg) {
    this.msgbar.display(msg);
};


Screen.prototype.focusRoom = function (room) {
    var view = new mod_ui.View({
        program: this.program,
        room: room,
        screen: this
    });

    this.window.pane.focusView(view);
};


Screen.prototype.setMark = function (name, view) {
    this.marks[name] = view;
};


Screen.prototype.focusMark = function (name) {
    var view = this.marks[name];
    if (view) {
        this.focusRoom(view);
    } else {
        this.warn('Mark not set');
    }
};


Screen.prototype.focus = function (type, direction, count) {
    switch (type) {
    case 'command':
        this.emit('focus-command');
        return;
    case 'lobby':
        this.focusRoom(this.lobby);
        return;
    case 'window':
        this.window.focus(direction, count);
        return;
    case 'history':
        this.window.pane.focusHistory(direction, count);
        return;
    default:
        throw new VError('unknown focus type: %j', type);
    }
};

module.exports = Screen;
