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

/*
 * Custom UI element for navigating chat history.
 */
function ChatLog(options) {
    assert.object(options, options);
    assert.object(options.inputFSM, 'options.inputFSM');

    var self = this;

    mod_draw.controls.LogBox.call(self);

    var inputFSM = options.inputFSM;

    inputFSM.on('scroll', function (direction, type, count) {
        function getLines() {
            switch (type) {
            case 'screen':
                return Math.floor(self.height() * count);
            case 'line':
                return count;
            default:
                return 0;
            }
        }

        switch (direction) {
        case 'up':
            self.offset(-getLines());
            break;
        case 'down':
            self.offset(getLines());
            break;
        case 'top':
        case 'bottom':
            self.moveto(direction);
            break;
        default:
            break;
        }
    });
}
mod_util.inherits(ChatLog, mod_draw.controls.LogBox);

module.exports = ChatLog;
