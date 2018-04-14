/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2017, Cody Mello.
 * Copyright (c) 2017, Jordan Hendricks.
 */

'use strict';

var assert = require('assert-plus');
var mod_bunyan = require('bunyan');
var mod_config = require('./config');
var mod_cueball = require('cueball');
var mod_path = require('path');
var mod_reg = require('./registers');
var mod_room = require('./room');
var mod_url = require('url');
var mod_users = require('./users');
var mod_vasync = require('vasync');
var spawn = require('child_process').spawn;

var Screen = require('./screen');
var MMClient = require('iamb-mattermost').Client;

var TEAM;
var USER;

var CHANNELS_BY_NAME = {
    O: {},
    P: {},
    G: {}
};

var CHANNELS_BY_ID = {
    O: {},
    P: {},
    G: {}
};

var DIRECT_BY_ID = { };

function filterCurrentUser(uid) {
    return (uid !== USER.id);
}

function Program(opts) {
    assert.object(opts, 'opts');
    assert.string(opts.configFile, 'opts.configFile');

    var self = this;

    var account = mod_config.load(opts.configFile);
    if (account instanceof Error) {
        console.error('%s', account.toString());
        process.exit(2);
    }

    var u = mod_url.parse(account.url);
    if (u.protocol !== 'https:') {
        console.error('account.url must be HTTPS: %s', account.url);
        process.exit(2);
    }

    var baseDir = mod_path.join(__dirname, '..');

    self.log = mod_bunyan.createLogger({
        name: 'iamb',
        src: true,
        streams: [ {
            path: mod_path.join(baseDir, 'iamb-debug.log'),
            level: 'trace'
        } ]
    });

    self.cueballAgent = new mod_cueball.HttpsAgent({
        log: self.log,
        resolvers: [ '8.8.8.8' ],
        initialDomains: [ u.hostname ],
        tcpKeepAliveInitialDelay: 5000,
        spares: 2,
        maximum: 10,
        recovery: {
            default: {
                timeout: 2000,
                maxTimeout: 8000,
                retries: 3,
                delay: 0,
                maxDelay: 1000
            }
        }
    });

    self.client = new MMClient({
        agent: self.cueballAgent,
        userAgentInfo: 'iamb/0.0.1',
        log: self.log.child({ component: 'mattermost-client' }, true),
        url: account.url,
        account: account.auth
    });

    self.userdb = new mod_users.UserDB({
        client: self.client
    });

    self.registers = new mod_reg.RegisterManager();

    self.screen = new Screen({
        program: self,
        client: self.client,
        log: self.log
    });

    self.rooms = {};

    self.client.on('connected', function (user) {
        USER = user;

        self.userdb.fillFull(user);
        self.client.getTeamByName(account.team, function (gErr, team) {
            if (gErr) {
                self.warn('failed to get team info');
                return;
            }

            TEAM = team;

            self.userdb.loadAllUsers(function (uErr) {
                if (uErr) {
                    /*
                     * If we fail to load all users, log the reason why, but
                     * continue on. We'll make sure to load information about
                     * all of the users we have active DMs with, at least, and
                     * continue fetching user information as we need it.
                     */
                    self.log.error(uErr, 'failed to load all users');
                }

                self.loadChannels(function (lErr) {
                    if (lErr) {
                        self.log.warn(lErr, 'failed to load channels');
                    } else {
                        self.log.info('loaded user and channel information');
                    }
                });
            });
        });
    });
}


Program.prototype.loadDirectChannel =
    function loadDirectChannel(channel, callback) {
    var other = channel.name.split('__').filter(filterCurrentUser);
    if (other.length !== 1) {
        this.warn('failed to find other user for ' + channel.name);
        callback();
        return;
    }

    DIRECT_BY_ID[other[0]] = channel;

    if (this.userdb.getUserById(other[0]) !== null) {
        callback();
        return;
    }

    this.userdb.loadUserById(other[0], callback);
};

Program.prototype.loadChannel = function loadChannel(c, callback) {
    var self = this;

    self.client.getChannelById(c.id, function (err, channel) {
        if (err) {
            callback(err);
            return;
        }

        if (channel.type !== 'D') {
            CHANNELS_BY_ID[channel.type][channel.id] = channel;
            CHANNELS_BY_NAME[channel.type][channel.name] = channel;
            callback();
            return;
        }

        self.loadDirectChannel(channel, callback);
    });
};


Program.prototype.loadChannels = function loadChannels(callback) {
    var self = this;

    self.client.getChannelsForUser(USER.id, TEAM.id, function (err, channels) {
        if (err) {
            self.warn('failed to load channels: ' + err.message);
            return;
        }

        mod_vasync.forEachParallel({
            inputs: channels,
            func: function (channel, cb) {
                self.loadChannel(channel, cb);
            }
        }, callback);
    });
};


Program.prototype.openRoom = function (room_id, room_name) {
    if (this.rooms[room_id]) {
        this.screen.focusRoom(this.rooms[room_id]);
        return;
    }

    var room = new mod_room.Room({
        client: this.client,
        room_id: room_id,
        room_name: room_name,
        userdb: this.userdb
    });

    this.rooms[room_id] = room;
    this.screen.focusRoom(room);
};


Program.prototype.openDirect = function (otherUser) {
    var other = this.userdb.getUserByName(otherUser);
    if (other === null) {
        this.warn('unknown user: ' + otherUser);
        return;
    }

    if (!DIRECT_BY_ID[other.id]) {
        this.warn('no existing chat with ' + otherUser);
        return;
    }

    var room = DIRECT_BY_ID[other.id].id;
    this.openRoom(room, otherUser);
};

Program.prototype.openConference = function (conference) {
    var type = 'O';
    var channel = CHANNELS_BY_NAME[type][conference];
    if (!channel) {
        this.warn('unknown conference: ' + conference);
        return;
    }

    var roomId = channel.id;
    this.openRoom(roomId, conference);
};

Program.prototype.shell = function doShell() {
    var shell = process.env.SHELL;
    if (shell === undefined) {
        shell = 'sh';
    }

    this.screen.pauseFor(function (done) {
        var child = spawn(shell, [], { stdio: 'inherit' });
        child.on('close', function (_) {
            done();
        });
    });
};


Program.prototype.quit = function doQuit() {
    this.screen.draw.close();
    process.exit(0);
};


Program.prototype.warn = function doWarn(msg) {
    this.screen.warn(msg);
};


module.exports = Program;
