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
var mod_extsprintf = require('extsprintf');
var mod_jsprim = require('jsprim');
var mod_mooremachine = require('mooremachine');
var mod_util = require('util');


// --- Exports

/**
 * The Room is a chat room, possibly directly with another user, or with
 * a group of users in a conference.
 */
function Room(opts) {
    assert.object(opts, 'opts');
    assert.object(opts.room, 'opts.room');
    assert.object(opts.client, 'opts.client');
    assert.string(opts.room_id, 'opts.room_id');

    var self = this;

    self.client = opts.client;
    self.room = opts.room;
    self.room_id = opts.room_id;

    self.speakers = {};

    self._lines = [];
    self.last_speaker = null;

    self.room.on('message', function (m) {
        self._appendPost(m);
    });

    mod_mooremachine.FSM.call(this, 'loading');
}
mod_util.inherits(Room, mod_mooremachine.FSM);


Room.prototype.state_loading = function loadHistory(S) {
    S.validTransitions([ ]);

    var self = this;

    self.room.forEachMessage(function (m) {
        self._appendPost(m);
    });
};


Room.prototype._appendPost = function appendPost(m) {
    var user = m.speaker();
    var name = '';
    var dname;

    if (user.id() !== this.last_speaker) {
        dname = user.getDisplayName();
        this.speakers[dname] = true;
        name = (dname === null ? '<unknown>' : dname) + ':';
        this.last_speaker = user.id();
    }

    var msg = mod_extsprintf.sprintf('%17s %s', name, m.text());

    this._lines.push(msg);

    this.emit('line', msg);
};


Room.prototype.submit = function onSubmit(msg) {
    assert.string(msg, 'msg');

    var self = this;

    self.room.sendMessage(msg, function (err) {
        if (!err) {
            return;
        }

        self.emit('line', mod_extsprintf.sprintf(
            msg.length > 18
            ? 'Failed to send message: %15s...'
            : 'Failed to send message: %s', msg));
    });
};


Room.prototype.getLines = function getLines() {
    return this._lines;
};


Room.prototype.getShortName = function getShortName() {
    var name = this.room.name();
    if (name !== null) {
        return name;
    }

    var alias = this.room.alias();
    if (alias !== null) {
        return alias;
    }

    return this.room.id();
};


Room.prototype.getTitle = function getTitle() {
    var alias = this.room.alias();
    var name = this.room.name();

    if (alias !== null) {
        if (name !== null) {
            return mod_extsprintf.sprintf('%s (%s)',
                this.room.name(), this.room.alias());
        }

        return alias;
    }

    if (name !== null) {
        return name;
    }

    return this.room.id();
};


Room.prototype.complete = function complete(prefix) {
    var dnames = Object.keys(this.speakers);

    return dnames.reduce(function (acc, curr) {
        if (mod_jsprim.startsWith(curr, prefix)) {
            acc.push(curr.slice(prefix.length));
        }

        return acc;
    }, []);
};


module.exports = {
    Room: Room
};
