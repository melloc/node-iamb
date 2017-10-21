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

/**
 * Vim has several different classes of registers, each with different
 * behaviour:
 *
 * - ", the default unnamed register. This register gets updated with every
 *   change/delete/yank.
 * - _, the blackhole register. Writes to this register disappear.
 * - 0, the yank register. This contains the most recent, unnamed yank.
 * - 1-9, the delete registers. These are the nine most recent, unnamed deletes.
 * - a-z, the named registers. These are registers that the user can keep
 *   anything they want in. They can be referred to by their uppercase
 *   variants, A-Z, in order to append to the contents of the register instead
 *   of overwriting them.
 * - -, the small delete register, which contains the most recent, unnamed
 *   deleted text that was less than a line in length.
 * - ., the last inserted text register.
 * - %, the name of the current buffer.
 * - #, the name of the alternate buffer (usually the previous buffer).
 * - :, the most recently executed : command.
 * - /, the most recent search.
 * - =, the expression register, which, when referenced, prompts for an
 *   expression, stores the results, and allows it to be immediately pasted.
 *
 * In Vim, registers 0-9 only contain the contents of whole-line yanks/deletes.
 * Since this is a chat client, and edits will almost never operate on whole
 * lines, all yanks/deletes are treated equally.
 *
 * For % and #, the "buffer names" are room names.
 */
function RegisterManager() {
    this.yanked = null;
    this.recent = [];
    this.registers = {};
}


RegisterManager.prototype.updateYankRegister = function (value) {
    assert.string(value, 'value');
    this.yanked = value;
};


RegisterManager.prototype.updateDeleteRegisters = function (value) {
    assert.string(value, 'value');
    this.recent.unshift(value);
    this.registers['-'] = value;
    while (this.recent.length > 9) {
        this.recent.pop();
    }
};


RegisterManager.prototype.updateCurrentBufferName = function (value) {
    assert.string(value, 'value');
    this.registers['%'] = this.registers['#'];
    this.registers['#'] = value;
};


RegisterManager.prototype.updateInsertedText = function (value) {
    assert.string(value, 'value');
    this.registers['.'] = value;
};


RegisterManager.prototype.updateCommand = function (value) {
    assert.string(value, 'value');
    this.registers[':'] = value;
};


RegisterManager.prototype.updateSearch = function (value) {
    assert.string(value, 'value');
    this.registers[':'] = value;
};


RegisterManager.prototype.updateNamedRegister = function (reg, value) {
    assert.string(reg, 'reg');
    assert.string(value, 'value');

    this.registers[reg] = value;
};


RegisterManager.prototype.appendNamedRegister = function (reg, value) {
    var regl = reg.toLowerCase();

    if (this.registers[regl] !== undefined) {
        this.registers[regl] += value;
    } else {
        this.registers[regl] = value;
    }
};


RegisterManager.prototype.updateRegister = function (action, reg, value) {
    assert.string(reg, 'reg');
    assert.string(value, 'value');

    if (reg === '_') {
        return;
    }

    if (reg === '0') {
        this.yanked = value;
    } else if (reg >= '1' && reg <= '9') {
        this.recent[reg] = value;
    } else if (reg >= 'a' && reg <= 'z') {
        this.updateNamedRegister(reg, value);
    } else if (reg >= 'A' && reg <= 'z') {
        this.appendNamedRegister(reg, value);
    } else if (reg === '"') {
        if (action === 'yank') {
            this.updateYankRegister(value);
        } else if (action === 'delete') {
            this.updateDeleteRegisters(value);
        }
    } else {
        /*
         * Otherwise, this is an immutable register.
         */
        return;
    }

    this.registers['"'] = value;
};


RegisterManager.prototype.getRegister = function (reg) {
    assert.string(reg, 'reg');

    if (reg === '0') {
        return this.yanked;
    } else if (reg >= '1' && reg <= '9') {
        return this.recent[reg - 1] || null;
    } else if (this.registers[reg] !== undefined) {
        return this.registers[reg];
    } else {
        return null;
    }
};


/**
 * Return a snapshot of the current register state, with keys added
 * to the object in alphabetical order.
 */
RegisterManager.prototype.dumpRegisters = function () {
    var self = this;
    var regs = {};

    if (self.yanked !== null) {
        regs['0'] = self.yanked;
    }

    self.recent.forEach(function (v, i) {
        regs[i + 1] = v;
    });

    var named = Object.keys(self.registers).sort();
    named.forEach(function (name) {
        if (self.registers[name] !== undefined) {
            regs[name] = self.registers[name];
        }
    });

    return regs;
};


module.exports = {
    RegisterManager: RegisterManager
};
