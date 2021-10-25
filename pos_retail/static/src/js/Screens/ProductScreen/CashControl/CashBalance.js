odoo.define('point_of_sale.CashBalance', function(require) {
    'use strict';

    const { useState } = owl.hooks;
    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');
    const { useAutoFocusToLast } = require('point_of_sale.custom_hooks');

    class CashBalance extends AbstractAwaitablePopup {
        /**
         * @param {String} title required title of popup
         * @param {Array} [props.array=[]] the array of { id, text } to be edited or an array of strings
         * @param {Boolean} [props.isSingleItem=false] true if only allowed to edit single item (the first item)
         */
        constructor() {
            super(...arguments);
            this._id = 0;
            this.state = useState({ array: this._initialize(this.props.array) });
            useAutoFocusToLast();
        }
        _nextId() {
            return this._id++;
        }
        _emptyItem() {
            return {
                number: 1,
                coin_value: 0,
                _id: this._nextId(),
            };
        }
        _initialize(array) {
            // If no array is provided, we initialize with one empty item.
            if (array.length === 0) return [this._emptyItem()];
            // Put _id for each item. It will serve as unique identifier of each item.
            return array.map((item) => Object.assign({}, { _id: this._nextId() }, typeof item === 'object'? item: { 'coin_value': item.coin_value, 'number': item.number}));
        }
        removeItem(event) {
            const itemToRemove = event.detail;
            this.state.array.splice(
                this.state.array.findIndex(item => item._id == itemToRemove._id),
                1
            );
            // We keep a minimum of one empty item in the popup.
            if (this.state.array.length === 0) {
                this.state.array.push(this._emptyItem());
            }
        }
        createNewItem() {
            if (this.props.isSingleItem) return;
            this.state.array.push(this._emptyItem());
        }
        /**
         * @override
         */
        getPayload() {
            return {
                newArray: this.state.array
                    .filter((item) => item.coin_value > 0 && item.number > 0)
                    .map((item) => Object.assign({}, item)),
            };
        }
    }
    CashBalance.template = 'CashBalance';
    CashBalance.defaultProps = {
        confirmText: 'Ok',
        cancelText: 'Cancel',
        array: [],
        isSingleItem: false,
    };

    Registries.Component.add(CashBalance);

    return CashBalance;
});
