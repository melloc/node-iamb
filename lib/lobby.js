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


/**
 * The Lobby is the default window shown on startup, and is used
 * to display content outside of chat rooms.
 */
function Lobby(opts) {
    assert.object(opts, 'opts');
    assert.object(opts.client, 'opts.client');
    assert.object(opts.program, 'opts.program');

    var self = this;

    self._lines = [];
    self.client = opts.client;

    mod_mooremachine.FSM.call(self, 'waiting');
}
mod_util.inherits(Lobby, mod_mooremachine.FSM);

Lobby.prototype.state_waiting = function waiting(S) {
    S.validTransitions([ ]);

    var self = this;

    /*
     * XXX: Update the screen in a better way to indicate
     * when we've connected and reconnected
     */
    self.client.on('connected', function (user) {
        self.display('< Client connected >');
        self.display('User: ' + user.nickname);
    });

    self.client.on('reconnected', function () {
        self.display('< Client reconnected >');
    });
};


Lobby.prototype.display = function display(txt) {
    assert.string(txt, 'txt');
    this._lines.push(txt);
    this.emit('line', txt);
};


Lobby.prototype.submit = function onSubmit(v) {
    this._lines.push(v);
    this.emit('line', 'Entered: ' + v);
};


Lobby.prototype.getLines = function getLines() {
    return this._lines;
};


Lobby.prototype.getShortName = function getShortName() {
    return 'Lobby';
};


Lobby.prototype.getTitle = function getTitle() {
    return 'Lobby';
};

module.exports = Lobby;
