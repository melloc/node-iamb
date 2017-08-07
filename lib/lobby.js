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
var mod_mooremachine = require('mooremachine');
var mod_ui = require('./ui');
var mod_util = require('util');

function Lobby(opts) {
    assert.object(opts, 'opts');
    assert.object(opts.client, 'opts.client');

    var self = this;

    self.client = opts.client;

    self.input = new mod_bindings.vi.Chat();

    self.pane = new mod_ui.ChatLog({
        inputFSM: self.input,
        redraw: opts.screen.redraw.bind(opts.screen)
    });

    self.window = new mod_ui.Window({
        inputFSM: self.input,
        name: 'Lobby',
        onSubmit: function lobbySubmit(v) {
            self.pane.add('Entered: ' + v);
        },
        screen: opts.screen,
        viewPane: self.pane
    });

    mod_mooremachine.FSM.call(self, 'waiting');
}
mod_util.inherits(Lobby, mod_mooremachine.FSM);

Lobby.prototype.state_waiting = function waiting(S) {
    S.validTransitions([ ]);

    var self = this;

    self.client.on('connected', function (user) {
        // XXX: Update the screen in a better way to indicate we're connected
        self.pane.add('< Client connected >');
        self.pane.add('User: ' + user.nickname);
    });
};


Lobby.prototype.addLines = function addLines(msg) {
    this.pane.add(msg);
    this.pane._redo();
};

module.exports = Lobby;
