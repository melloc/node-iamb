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
var mod_util = require('util');

/*
 * Custom UI element for navigating contacts.
 */
function ContactsList(options) {
    assert.object(options, options);
    assert.object(options.inputFSM, 'options.inputFSM');

    var self = this;

    mod_draw.Region.call(self, {
        width: 1,
        height: 1
    });
}
mod_util.inherits(ContactsList, mod_draw.Region);


module.exports = ContactsList;
