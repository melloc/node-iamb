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
var VError = require('verror');

var HLayout = mod_draw.controls.HLayout;
var Pane = require('./pane');
var View = require('./view');
var VirtualRegionFSM = require('./virtual').VirtualRegionFSM;

// --- Internal helpers

function pane2opt(p) {
    return {
        child: p.pane,
        fixed: p.height
    };
}

function panes2opts(ps) {
    return ps.map(pane2opt);
}

// --- Globals

/*
 * Don't allow windows to have a fixed height less than 4, since we need
 * to make sure that we have room for printing the top/bottom border, the
 * text bar, and a single line of text from the room.
 */
var MIN_VIEW_HEIGHT = 4;

// --- Exports

function Window(opts) {
    assert.object(opts, 'opts');
    assert.object(opts.program, 'opts.program');
    assert.object(opts.lobby, 'opts.lobby');
    assert.object(opts.log, 'opts.log');
    assert.object(opts.screen, 'opts.screen');

    this.program = opts.program;
    this.screen = opts.screen;
    this.lobby = opts.lobby;
    this.log = opts.log;

    this.pane = new Pane({
        log: this.log,
        screen: this.screen,
        program: this.program,
        initial: new View({
            log: this.log,
            program: this.program,
            room: this.lobby,
            screen: this.screen
        })
    });
    this.panes = [ {
        pane: this.pane,
        height: null,
        width: null
    } ];
    this.index = 0;

    this.frame = new HLayout({
        children: panes2opts(this.panes)
    });

    VirtualRegionFSM.call(this, {
        wrapped: this.frame,
        initialState: 'tile'
    });
}
mod_util.inherits(Window, VirtualRegionFSM);


Window.prototype.state_tile = function (S) {
    S.validTransitions([ 'zoom' ]);

    var self = this;

    S.on(self, 'focusAsserted', function (direction, count) {
        if (direction === 'zoom') {
            S.gotoState('zoom');
            return;
        }

        self._focus(direction, count);
    });

    self.reflow();
};


Window.prototype.state_zoom = function (S) {
    S.validTransitions([ 'tile' ]);

    var self = this;

    S.on(self, 'focusAsserted', function (direction, count) {
        if (direction !== 'zoom') {
            self._focus(direction, count);
        }

        S.gotoState('tile');
    });

    self.setWrapped(self.pane);
};


Window.prototype.get_cursor = function getCursor() {
    var cursor = this.pane.get_cursor();
    if (this.isInState('zoom')) {
        return cursor;
    }

    var offset = 0;
    for (var i = 0; i < this.index; i++) {
        offset += this.panes[i].pane.height();
    }

    return {
        x: cursor.x,
        y: cursor.y + offset
    };
};


Window.prototype._setIndex = function setIndex(index) {
    if (this.index === index) {
        return;
    }

    this.index = index;
    this.pane.setFocus(false);
    this.pane = this.panes[this.index].pane;
    this.pane.setFocus(true);
};


Window.prototype._focus = function updateFocus(direction, count) {
    var index = this.index;

    switch (direction) {
    case 'next':
        if (count === 0) {
            index += 1;
            if (index === this.panes.length) {
                index = 0;
            }
        } else {
            index = Math.min(count, this.panes.length) - 1;
        }
        break;
    case 'top':
        index = 0;
        break;
    case 'previous':
        if (count === 0) {
            index -= 1;
            if (index <= -1) {
                index = this.panes.length - 1;
            }
        } else {
            index = Math.min(count, this.panes.length) - 1;
        }
        break;
    case 'bottom':
        index = this.panes.length - 1;
        break;
    case 'left':
        break;
    case 'down':
        index = Math.min(index + count, this.panes.length - 1);
        break;
    case 'up':
        index = Math.max(index - count, 0);
        break;
    case 'right':
        break;
    default:
        throw new VError('unknown direction: %j', direction);
    }

    this._setIndex(index);
};


Window.prototype.focus = function (direction, count) {
    this.emit('focusAsserted', direction, count);
};


Window.prototype.reflow = function () {
    var self = this;

    if (self.isInState('zoom')) {
        return;
    }

    self.frame.set_children(panes2opts(self.panes));

    self.setWrapped(self.frame);

    self.pane.setFocus(false);
    self.pane = self.panes[self.index].pane;
    self.pane.setFocus(true);
};

Window.prototype._insert = function (pane, height, width) {
    this.panes.splice(this.index, 0, {
        pane: pane,
        height: height,
        width: width
    });

    this.reflow();
};

Window.prototype._remove = function () {
    this.panes.splice(this.index, 1);

    if (this.index === this.panes.length) {
        this.index -= 1;
    }

    this.reflow();
};

Window.prototype.hsplit = function (height) {
    if (this.height() / (this.panes.length + 1) < MIN_VIEW_HEIGHT) {
        this.screen.warn('Not enough room');
        return;
    }

    if (height) {
        height = Math.max(height, MIN_VIEW_HEIGHT);
    }

    this._insert(this.pane.clone(), height, null);
};

Window.prototype.vsplit = function (width) {
    assert.optionalNumber(width, 'width');
    this.screen.warn('Vertical splits not yet supported');
};

/**
 * Offset the border of a horizontal split.
 */
Window.prototype.hresize = function (offset) {
    var p = this.panes[this.index];
    var size = p.height;

    if (!size) {
        size = p.pane.height();
    }
    p.height = Math.max(size + offset, MIN_VIEW_HEIGHT);

    this.reflow();
};


/**
 * Offset the border of a vertical split.
 */
Window.prototype.vresize = function (offset) {
    assert.optionalNumber(offset, 'offset');
    this.screen.warn('Vertical splits not yet supported');
};


/**
 * Remove the fixed height/width specifications for each pane, so that
 * they'll occupy an equivalent amount of horizontal and vertical space.
 */
Window.prototype.eresize = function () {
    this.panes.forEach(function (pane) {
        pane.height = null;
        pane.width = null;
    });
    this.reflow();
};

Window.prototype.split = function (direction, size) {
    switch (direction) {
    case 'horizontal':
        this.hsplit(size);
        break;
    case 'vertical':
        this.vsplit(size);
        break;
    default:
        throw new VError('unknown split direction: %j', direction);
    }
};

Window.prototype.resizePane = function (direction, size) {
    switch (direction) {
    case 'horizontal':
        this.hresize(size);
        break;
    case 'vertical':
        this.vresize(size);
        break;
    case 'equal':
        this.eresize();
        break;
    default:
        throw new VError('unknown resize direction: %j', direction);
    }
};


Window.prototype.rotate = function (direction, count) {
    var front, back;
    var length = this.panes.length;

    count %= length;

    switch (direction) {
    case 'down':
        front = this.panes.splice(-count, count);
        back = this.panes;
        this.index = (length + this.index + count) % length;
        break;
    case 'up':
        back = this.panes.splice(0, count);
        front = this.panes;
        this.index = (length + this.index - count) % length;
        break;
    default:
        throw new VError('unknown rotate direction: %j', direction);
    }

    this.panes = front.concat(back);
    this.reflow();
};


Window.prototype.quit = function () {
    if (this.panes.length === 1) {
        this.program.quit();
        return;
    }

    this._remove();
};

module.exports = Window;
