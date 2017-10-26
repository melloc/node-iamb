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
var mod_bindings = require('../lib/keybindings');
var mod_extsprintf = require('extsprintf');
var mod_mooremachine = require('mooremachine');
var mod_ui = require('./ui');
var mod_util = require('util');


// --- Exports

/**
 * The Room is a chat room, possibly directly with another user, or with
 * a group of users in a conference.
 */
function Room(opts) {
    assert.object(opts, 'opts');
    assert.object(opts.client, 'opts.client');
    assert.object(opts.program, 'opts.program');
    assert.object(opts.userdb, 'opts.userdb');
    assert.string(opts.room_id, 'opts.room_id');
    assert.string(opts.room_name, 'opts.room_name');
    assert.func(opts.redraw, 'opts.redraw');
    assert.object(opts.screen, 'opts.screen');

    var self = this;

    self.client = opts.client;
    self.userdb = opts.userdb;
    self.room_id = opts.room_id;
    self.room_name = opts.room_name;
    self.screen = opts.screen;

    self.last_speaker = null;

    self.input = new mod_bindings.vi.Chat();

    self.messages = new mod_ui.ChatLog({
        inputFSM: self.input,
        redraw: opts.redraw
    });

    self.window = new mod_ui.Window({
        inputFSM: self.input,
        program: opts.program,
        room: self,
        screen: opts.screen,
        viewPane: self.messages
    });

    mod_mooremachine.FSM.call(this, 'loading');
}
mod_util.inherits(Room, mod_mooremachine.FSM);


Room.prototype.state_loading = function loadHistory(S) {
    S.validTransitions([ 'loading', 'listening' ]);

    var self = this;

    self.client.getPostsForChannel(self.room_id, function (err, posts) {
        if (err) {
            S.gotoState('loading');
            return;
        }

        self._loadPosts(posts);

        S.gotoState('listening');
    });
};


Room.prototype.state_listening = function loadHistory(S) {
    S.validTransitions([ 'loading' ]);

    var self = this;

    /*
     * When the client reconnects, we need to load any messages we
     * may have missed.
     */
    S.on(self.client, 'reconnect', function () {
        S.gotoState('loading');
    });

    S.on(self.client, 'message', function (data, post) {
        if (post.channel_id !== self.room_id) {
            return;
        }

        self.userdb.fillPartial(post.user_id, data.sender_name);
        self._appendPost(post);
    });
};


Room.prototype._loadPosts = function loadHistory(posts) {
    assert.object(posts, 'posts');
    assert.array(posts.order, 'posts.order');
    assert.object(posts.posts, 'posts.posts');

    for (var i = posts.order.length - 1; i >= 0; --i) {
        var id = posts.order[i];
        if (posts.posts[id]) {
            this._appendPost(posts.posts[id]);
        }
    }
};

Room.prototype._appendPost = function appendPost(post) {
    var name = '';
    var user;

    if (post.user_id !== this.last_speaker) {
        user = this.userdb.getUserById(post.user_id);
        name = (user !== null ? user.displayName() : '<unknown>') + ':';
        this.last_speaker = post.user_id;
    }

    var msg = mod_extsprintf.sprintf('%17s %s',
        name, post.message);

    this.messages.add(msg);
};


Room.prototype.submit = function onSubmit(msg) {
    assert.string(msg, 'msg');

    var self = this;

    self.client.createPost(self.room_id, msg, function (err) {
        if (!err) {
            return;
        }

        self.messages.add(mod_extsprintf.sprintf(
            msg.length > 18
            ? 'Failed to send message: %15s...'
            : 'Failed to send message: %s', msg));
    });
};


Room.prototype.getShortName = function getShortName() {
    return this.room_name;
};


Room.prototype.getTitle = function getTitle() {
    return this.room_name;
};


module.exports = {
    Room: Room
};
