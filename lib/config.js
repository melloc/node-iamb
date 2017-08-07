/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2017, Cody Mello.
 */

'use strict';

var Ajv = require('ajv');
var mod_fs = require('fs');
var VError = require('verror');

var AJV_ENV = new Ajv();

AJV_ENV.addSchema({
    id: 'config',
    type: 'object',
    required: [ 'url', 'team', 'auth' ],
    properties: {
        'url': {
            type: 'string'
        },
        'team': {
            type: 'string'
        },
        'auth': {
            type: 'object',
            required: [ 'username' ],
            properties: {
                'username': {
                    type: 'string'
                },
                'token': {
                    type: 'string'
                },
                'password': {
                    type: 'string'
                }
            }
        }
    }
});

function validateConfig(config) {
    if (AJV_ENV.validate('config', config)) {
        return null;
    }

    return new VError('%s', AJV_ENV.errorsText(AJV_ENV.errors,
        { dataVar: 'config' }));
}

function loadConfig(path) {
    var contents, config, valid;

    try {
        contents = mod_fs.readFileSync(path);
    } catch (e) {
        return new VError(e, 'failed to load config');
    }

    try {
        config = JSON.parse(contents);
    } catch (e) {
        return new VError(e, 'failed to parse config');
    }

    valid = validateConfig(config);

    if (valid !== null) {
        return new VError(valid, 'invalid configuration');
    }

    return config;
}

module.exports = {
    load: loadConfig,
    validate: validateConfig
};
