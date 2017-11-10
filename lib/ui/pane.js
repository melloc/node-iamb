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
var mod_util = require('util');
var VError = require('verror');

var HistList = require('../util').HistList;

var View = require('./view');
var VirtualRegion = require('./virtual');

function Pane(opts) {
    assert.object(opts, 'opts');
    assert.object(opts.initial, 'opts.initial');
    assert.object(opts.log, 'opts.log');
    assert.object(opts.screen, 'opts.screen');
    assert.object(opts.program, 'opts.program');
    assert.optionalObject(opts.jumplist, 'opts.jumplist');

    this.log = opts.log;
    this.screen = opts.screen;
    this.program = opts.program;

    if (opts.jumplist) {
        this.jumplist = opts.jumplist;
    } else {
        this.jumplist = new HistList({
            log: this.log
        });
        this.jumplist.append(opts.initial);
    }

    this.program.registers.updateCurrentBufferName(
        opts.initial.room.getShortName());

    VirtualRegion.call(this, {
        wrapped: opts.initial
    });
}
mod_util.inherits(Pane, VirtualRegion);


Pane.prototype.setView = function setView(view) {
    assert.ok(view instanceof View, 'view instanceof View');
    var name = view.room.getShortName();

    view.resize(this.width(), this.height());

    this.program.registers.updateCurrentBufferName(name);
    this.setWrapped(view);
    this.screen.redraw();
};


Pane.prototype.getCursor = function getCursor() {
    return this.getWrapped().getCursor();
};


Pane.prototype.setFocus = function setFocus(focused) {
    this.getWrapped().setFocus(focused);
};


Pane.prototype.focusHistory = function focusHistory(direction, count) {
    var view;

    switch (direction) {
        case 'previous':
            view = this.jumplist.prev(count);
            break;
        case 'next':
            view = this.jumplist.next(count);
            break;
        default:
            throw new VError('unknown history direction: %j', direction);
    }

    this.setView(view);
};


Pane.prototype.focusView = function focusView(view) {
    this.jumplist.append(view);
    this.setView(view);
};

Pane.prototype.clone = function cloneView() {
    var jumplist = this.jumplist.clone();
    var initial = jumplist.current();
    var pane = new Pane({
        log: this.log,
        initial: initial,
        jumplist: jumplist,
        program: this.program,
        screen: this.screen
    });

    return pane;
};


module.exports = Pane;
