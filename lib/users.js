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
var mod_jsprim = require('jsprim');
var LOMStream = require('lomstream').LOMStream;

// --- Globals

var FETCH_USER_LIMIT = 200;


// --- Internal helpers

function fetchUsers(client, lobj, _, callback) {
    client.listUsers({
        per_page: lobj.limit,
        page: Math.ceil(lobj.offset / lobj.limit)
    }, function (err, users) {
        if (err) {
            callback(err);
            return;
        }

        callback(null, {
            done: (users.length === 0),
            results: users
        });
    });
}


// -- Exports

/**
 * Wrap the information from the service about the user,
 * and provide some convenient methods.
 */
function User(data) {
    assert.object(data, 'data');
    assert.string(data.id, 'data.id');
    this.data = data;
    this.id = data.id;
}


User.prototype.setData = function displayName(data) {
    assert.object(data, 'data');
    assert.equal(data.id, this.id, 'data.id === this.id');
    this.data = data;
};


User.prototype.displayName = function displayName() {
    if (this.data.nickname) {
        return this.data.nickname;
    } else {
        return this.data.username;
    }
};


/**
 * Track user information as it's requested/becomes available.
 */
function UserDB(opts) {
    assert.object(opts, 'opts');
    assert.object(opts.client, 'opts.client');

    this.client = opts.client;
    this._usersById = {};
    this._usersByUsername = {};
}


UserDB.prototype.getUserById = function getUserById(id) {
    assert.string(id, 'id');

    if (this._usersById[id]) {
        return this._usersById[id];
    } else {
        return null;
    }
};


UserDB.prototype.getUserByName = function getUserByName(name) {
    assert.string(name, 'name');

    if (this._usersByUsername[name]) {
        return this._usersByUsername[name];
    } else {
        return null;
    }
};


UserDB.prototype.fillPartial = function fillPartial(id, name) {
    if (this.getUserById(id) !== null) {
        return;
    }

    this._usersById[id] = new User({
        nickname: name,
        id: id
    });

    this.loadUserById(id, function () {
        // XXX: log result?
    });
};


UserDB.prototype.fillFull = function fillFull(data) {
    assert.object(data, 'data');
    assert.string(data.id, 'data.id');
    assert.string(data.username, 'data.username');

    var user;
    if (mod_jsprim.hasKey(this._usersById, data.id)) {
        user = this._usersById[data.id];
        user.setData(data);
    } else {
        user = new User(data);
    }

    this._usersById[data.id] = user;
    this._usersByUsername[data.username] = user;
};


UserDB.prototype.loadAllUsers = function loadAllUsers(callback) {
    var self = this;

    var lom = new LOMStream({
        limit: FETCH_USER_LIMIT,
        offset: true,
        fetch: fetchUsers,
        fetcharg: self.client
    });

    lom.on('error', callback);

    lom.on('readable', function () {
        var user;

        for (;;) {
            user = lom.read(1);
            if (user === null) {
                return;
            }

            self.fillFull(user);
        }
    });

    lom.on('end', callback);
};


UserDB.prototype.loadUserById = function loadUserById(id, callback) {
    assert.string(id, 'id');
    assert.func(callback, 'callback');

    var self = this;

    self.client.getUserById(id, function (err, user) {
        if (err) {
            callback(err);
            return;
        }

        self.fillFull(user);

        callback();
    });
};


module.exports = {
    User: User,
    UserDB: UserDB
};
