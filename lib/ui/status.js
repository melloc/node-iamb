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

var VirtualRegionFSM = require('./virtual').VirtualRegionFSM;


// --- Globals

var DISPLAY_STATES = [ 'insert', 'replace', 'visual' ];

// --- Exports

function StatusLine(opts) {
    assert.object(opts, 'opts');
    assert.object(opts.program, 'opts.program');
    assert.object(opts.screen, 'opts.screen');

    var self = this;

    self.program = opts.program;
    self.screen = opts.screen;

    self.messageRegion = new mod_draw.controls.ContentBox({
        format: { bold: true },
        content: ''
    });

    self.statusRegion = new mod_draw.controls.ContentBox({
        format: { bold: true },
        content: ''
    });

    VirtualRegionFSM.call(self, {
        wrapped: self.messageRegion,
        initialState: 'message'
    });
}
mod_util.inherits(StatusLine, VirtualRegionFSM);


StatusLine.prototype.state_status = function stateStatus(S) {
    S.validTransitions([ 'message' ]);

    var self = this;

    S.on(self, 'changeStateAsserted', function (newState) {
        if (newState === 'normal') {
            S.gotoState('message');
            return;
        }

        if (DISPLAY_STATES.indexOf(newState) !== -1) {
            self._updateState(newState);
        }
    });

    self.setWrapped(self.statusRegion);
};


StatusLine.prototype.state_message = function stateStatus(S) {
    S.validTransitions([ 'status' ]);

    var self = this;

    S.on(self, 'changeStateAsserted', function (newState) {
        if (DISPLAY_STATES.indexOf(newState) === -1) {
            return;
        }

        self._updateState(newState);
        S.gotoState('status');
    });

    self.messageRegion.clear();
    self.setWrapped(self.messageRegion);
};


StatusLine.prototype._updateState = function updateState(newState) {
    var display = '-- ' + newState.toUpperCase() + ' --';

    this.statusRegion.set_content(display);
};


StatusLine.prototype.changeState = function changeState(newState) {
    this.emit('changeStateAsserted', newState);
};


StatusLine.prototype.display = function displayMessage(msg) {
    assert.string(msg, 'msg');

    this.messageRegion.set_content(msg);
};

module.exports = StatusLine;
