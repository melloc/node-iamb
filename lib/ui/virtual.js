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
var mod_mooremachine = require('mooremachine');
var mod_util = require('util');

function VirtualRegion(opts) {
    assert.object(opts, 'opts');
    assert.object(opts.wrapped, 'opts.wrapped');

    this.vr_wrapped = opts.wrapped;
}
mod_util.inherits(VirtualRegion, mod_draw.Region);

VirtualRegion.prototype.setWrapped = function (region) {
    assert.object(region, 'region');
    this.vr_wrapped = region;
};

VirtualRegion.prototype.getWrapped = function () {
    return this.vr_wrapped;
};

VirtualRegion.prototype.pop_hint = function () {
    return this.vr_wrapped.pop_hint.apply(this.vr_wrapped, arguments);
};

VirtualRegion.prototype.shift_rows = function () {
    return this.vr_wrapped.shift_rows.apply(this.vr_wrapped, arguments);
};

VirtualRegion.prototype.add = function () {
    return this.vr_wrapped.add.apply(this.vr_wrapped, arguments);
};

VirtualRegion.prototype.get_cell = function () {
    return this.vr_wrapped.get_cell.apply(this.vr_wrapped, arguments);
};

VirtualRegion.prototype.resize = function () {
    return this.vr_wrapped.resize.apply(this.vr_wrapped, arguments);
};

VirtualRegion.prototype.height = function () {
    return this.vr_wrapped.height.apply(this.vr_wrapped, arguments);
};

VirtualRegion.prototype.width = function () {
    return this.vr_wrapped.width.apply(this.vr_wrapped, arguments);
};

VirtualRegion.prototype.clear = function () {
    return this.vr_wrapped.clear.apply(this.vr_wrapped, arguments);
};

VirtualRegion.prototype.chr = function () {
    return this.vr_wrapped.chr.apply(this.vr_wrapped, arguments);
};

VirtualRegion.prototype.str = function () {
    return this.vr_wrapped.str.apply(this.vr_wrapped, arguments);
};

VirtualRegion.prototype.vstr = function () {
    return this.vr_wrapped.vstr.apply(this.vr_wrapped, arguments);
};


function VirtualRegionFSM(opts) {
    assert.object(opts, 'opts');
    assert.object(opts.wrapped, 'opts.wrapped');
    assert.string(opts.initialState, 'opts.initialState');

    this.vr_wrapped = opts.wrapped;

    mod_mooremachine.FSM.call(this, opts.initialState);
}
mod_util.inherits(VirtualRegionFSM, mod_mooremachine.FSM);

VirtualRegionFSM.prototype.setWrapped = function (region) {
    assert.object(region, 'region');
    this.vr_wrapped = region;
};

VirtualRegionFSM.prototype.getWrapped = function () {
    return this.vr_wrapped;
};

VirtualRegionFSM.prototype.pop_hint = function () {
    return this.vr_wrapped.pop_hint.apply(this.vr_wrapped, arguments);
};

VirtualRegionFSM.prototype.shift_rows = function () {
    return this.vr_wrapped.shift_rows.apply(this.vr_wrapped, arguments);
};

VirtualRegionFSM.prototype.add = function () {
    return this.vr_wrapped.add.apply(this.vr_wrapped, arguments);
};

VirtualRegionFSM.prototype.get_cell = function () {
    return this.vr_wrapped.get_cell.apply(this.vr_wrapped, arguments);
};

VirtualRegionFSM.prototype.resize = function () {
    return this.vr_wrapped.resize.apply(this.vr_wrapped, arguments);
};

VirtualRegionFSM.prototype.height = function () {
    return this.vr_wrapped.height.apply(this.vr_wrapped, arguments);
};

VirtualRegionFSM.prototype.width = function () {
    return this.vr_wrapped.width.apply(this.vr_wrapped, arguments);
};

VirtualRegionFSM.prototype.clear = function () {
    return this.vr_wrapped.clear.apply(this.vr_wrapped, arguments);
};

VirtualRegionFSM.prototype.chr = function () {
    return this.vr_wrapped.chr.apply(this.vr_wrapped, arguments);
};

VirtualRegionFSM.prototype.str = function () {
    return this.vr_wrapped.str.apply(this.vr_wrapped, arguments);
};

VirtualRegionFSM.prototype.vstr = function () {
    return this.vr_wrapped.vstr.apply(this.vr_wrapped, arguments);
};

module.exports = {
    VirtualRegion: VirtualRegion,
    VirtualRegionFSM: VirtualRegionFSM
};
