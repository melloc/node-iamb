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

function User() {

}

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


UserDB.prototype.fillPartial = function loadUserById(id, name) {
    if (this.getUserById(id) !== null) {
        return;
    }

    this._usersById[id] = {
        nickname: name
    };

    this.loadUserById(id, function () {
        // XXX: log result?
    });
};

UserDB.prototype.fillFull = function fillFull(user) {
    assert.object(user, 'user');
    this._usersById[user.id] = user;
    this._usersByUsername[user.username] = user;
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
