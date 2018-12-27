/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2018, Cody Mello.
 * Copyright (c) 2017, Jordan Hendricks.
 */

'use strict';

var assert = require('assert-plus');
var backends = require('./backends');
var mod_bunyan = require('bunyan');
var mod_config = require('./config');
var mod_cueball = require('cueball');
var mod_path = require('path');
var mod_reg = require('./registers');
var mod_room = require('./room');
var mod_url = require('url');
var spawn = require('child_process').spawn;

var Screen = require('./screen');

function Program(opts) {
    assert.object(opts, 'opts');
    assert.string(opts.configFile, 'opts.configFile');

    var self = this;

    var account = mod_config.load(opts.configFile);
    if (account instanceof Error) {
        console.error('%s', account.toString());
        process.exit(2);
    }

    var u = mod_url.parse(account.auth.url);
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
            level: 'debug'
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

    self.client = new backends[account.protocol].Client({
        agent: self.cueballAgent,
        userAgentInfo: 'iamb/0.0.1',
        log: self.log.child({ component: 'mattermost-client' }, true),
        account: account.auth
    });

    self.registers = new mod_reg.RegisterManager();

    self.screen = new Screen({
        program: self,
        client: self.client,
        log: self.log
    });

    self.rooms = {};
}


Program.prototype.openRoom = function (channel) {
    var room_id = channel.id();

    if (this.rooms[room_id]) {
        this.screen.focusRoom(this.rooms[room_id]);
        return;
    }

    var room = new mod_room.Room({
        client: this.client,
        room: channel,
        room_id: room_id
    });

    this.rooms[room_id] = room;
    this.screen.focusRoom(room);
};


Program.prototype.openDirect = function (username) {
    var channel = this.client.getDirectByName(username);
    if (channel === null) {
        this.warn('unknown user: ' + username);
        return;
    }

    this.openRoom(channel);
};

Program.prototype.openConference = function (conference) {
    var channel = this.client.getRoomByName(conference);
    if (channel === null) {
        this.warn('unknown conference: ' + conference);
        return;
    }

    this.openRoom(channel);
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
