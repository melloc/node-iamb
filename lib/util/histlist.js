/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2017, Jordan Hendricks.
 */

'use strict';

var assert = require('assert-plus');
var mod_util = require('util');

var sprintf = mod_util.format;

var HL_DEF_MAX_SIZE = 100;

/*
 * A generic implemention of a list of historical items, suitable for
 * implementing various history features that do not require branching.
 *
 * The HistList maintains a pointer to the current item in the list. Callers may
 * call prev() to retrieve the previous item in the list and decrement this
 * pointer. Similarly, callers may call next() to retrieve the next item in the
 * list and increment the pointer. Both prev() and next() can optionally be
 * provided a count to travel count items backward or forward in the list,
 * updating the pointer appropriately.
 *
 * Callers may append() items to the list as well. If the current pointer is at
 * the end of the list, then all items in the list are maintained, provided it
 * is under its size limit. When append() is called and the current pointer is
 * not pointing to the last item in the list, the remainder of the list is
 * discarded, and the current pointer becomes the end of the list.
 *
 */
function HistList(opts) {
    assert.object(opts, 'opts');
    assert.object(opts.log, 'opts.log');
    assert.optionalNumber(opts.maxSize, 'opts.maxSize');
    if (opts.maxSize)
        assert.ok(opts.maxSize > 0, 'maxSize must be a positive integer');

    var self = this;
    self.log = opts.log;
    self.hl_maxSize = opts.maxSize || HL_DEF_MAX_SIZE;

    self.hl_list = [];
    self.hl_ptr = -1;
}

HistList.prototype.append = function append(item) {
    assert.ok(item, 'item');

    var self = this;

    if (self.hl_ptr === (self.hl_maxSize - 1)) {
        self.hl_list.splice(0, 1);
    } else {
        self.hl_ptr++;
        self.hl_list.splice(self.hl_ptr);
    }

    self.hl_list[self.hl_ptr] = item;
};

HistList.prototype.next = function next(count) {
    assert.optionalNumber(count, 'count');
    assert.ok((typeof count !== 'number') || (count >= 0),
        'count must be a positive integer');
    assert.ok(this.hl_ptr >= 0, 'no items in histlist');

    var self = this;

    if (typeof count !== 'number') {
        count = 1;
    }

    self.log.trace({
        jump_list_len: self.hl_list.length,
        jump_prt: self.hl_ptr,
        count: count
    }, 'next: before');

    if ((self.hl_ptr + count) > (self.hl_list.length - 1)) {
        self.hl_ptr = self.hl_list.length - 1;
    } else {
        self.hl_ptr += count;
    }

    var item = self.hl_list[self.hl_ptr];
    assert.ok(item, sprintf('empty item in histlist: %d, %s', self.hl_ptr,
                self.hl_list));

    self.log.trace({
        jump_list_len: self.hl_list.length,
        jump_prt: self.hl_ptr
    }, 'next: after');
    return (item);
};

HistList.prototype.prev = function prev(count) {
    assert.optionalNumber(count, 'count');
    assert.ok((typeof count !== 'number') || (count >= 0),
        'count must be a positive integer');
    assert.ok(this.hl_ptr >= 0, 'no items in histlist');

    var self = this;

    if (typeof count !== 'number') {
        count = 1;
    }

    self.log.trace({
        jump_list_len: self.hl_list.length,
        jump_prt: self.hl_ptr,
        count: count
    }, 'prev: before');

    if ((self.hl_ptr - count) < 0) {
        self.hl_ptr = 0;
    } else {
        self.hl_ptr = self.hl_ptr -= count;
    }

    var item = self.hl_list[self.hl_ptr];
    assert.ok(item, sprintf('empty item in histlist: %d, %s', self.hl_ptr,
                self.hl_list));

    self.log.trace({
        jump_list_len: self.hl_list.length,
        jump_prt: self.hl_ptr
    }, 'prev: after');

    return (item);
};

module.exports = HistList;
