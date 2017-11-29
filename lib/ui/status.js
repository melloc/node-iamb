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

var VirtualRegionFSM = require('./virtual').VirtualRegionFSM;


// --- Globals

var DISPLAY_STATES = [ 'insert', 'replace', 'visual' ];


// --- Exports

function StatusLine(opts) {
    assert.object(opts, 'opts');
    assert.object(opts.program, 'opts.program');
    assert.object(opts.screen, 'opts.screen');

    this.program = opts.program;
    this.screen = opts.screen;

    this.messageRegion = new mod_draw.Region();
    this.statusRegion = new mod_draw.Region();

    VirtualRegionFSM.call(this, {
        wrapped: this.messageRegion,
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
    self.screen.redraw();
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
    self.screen.redraw();
};


StatusLine.prototype._updateState = function updateState(newState) {
    this.statusRegion.clear();
    this.statusRegion.str(0, 0,
        '-- ' + newState.toUpperCase() + ' --', { bold: true });
};


StatusLine.prototype.changeState = function changeState(newState) {
    this.emit('changeStateAsserted', newState);
};


StatusLine.prototype.display = function displayMessage(msg) {
    this.messageRegion.clear();
    this.messageRegion.str(0, 0, msg, { bold: true });
    this.screen.redraw();
};

StatusLine.prototype.resize = function resize(w, h) {
    this.messageRegion.resize(w, h);
    this.statusRegion.resize(w, h);
};


module.exports = StatusLine;
