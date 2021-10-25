odoo.define('pos_retail.NumpadWidget', function (require) {
    'use strict';

    const NumpadWidget = require('point_of_sale.NumpadWidget');
    const {useState} = owl.hooks;
    const Registries = require('point_of_sale.Registries');

    NumpadWidget.template = 'NumpadWidgetRetail';
    Registries.Component.add(NumpadWidget);
    const {Gui} = require('point_of_sale.Gui');

    const RetailNumpadWidget = (NumpadWidget) =>
        class extends NumpadWidget {
            constructor() {
                super(...arguments);
                this._currentOrder = this.env.pos.get_order();
                if (this._currentOrder) {
                    this._currentOrder.orderlines.on('change', this.render, this);
                    this._currentOrder.orderlines.on('remove', this.render, this);
                    this._currentOrder.orderlines.on('change', this._totalWillPaid, this);
                    this._currentOrder.orderlines.on('remove', this._totalWillPaid, this);
                    this._currentOrder.paymentlines.on('change', this._totalWillPaid, this);
                    this._currentOrder.paymentlines.on('remove', this._totalWillPaid, this);
                }
                this.env.pos.on('change:selectedOrder', this._updateCurrentOrder, this);
                this.state = useState({total: 0, tax: 0});
                this._totalWillPaid()
            }

            willUnmount() {
                this._currentOrder.orderlines.off('change', null, this);
                this.env.pos.off('change:selectedOrder', null, this);
            }

            get invisibleDiscountButton() {
                if (!this.env.pos.config.allow_discount || this.blockScreen || this.env.session.restaurant_order) {
                    return true
                } else {
                    return false
                }
            }

            _totalWillPaid() {
                const total = this._currentOrder ? this._currentOrder.get_total_with_tax() : 0;
                const due = this._currentOrder ? this._currentOrder.get_due() : 0;
                const tax = this._currentOrder ? total - this._currentOrder.get_total_without_tax() : 0;
                this.state.total = due;
                this.state.tax = tax;
                this.render();
            }

            _updateCurrentOrder(pos, newSelectedOrder) {
                this._currentOrder.orderlines.off('change', null, this);
                if (newSelectedOrder) {
                    this._currentOrder = newSelectedOrder;
                    this._currentOrder.orderlines.on('change', this.render, this);
                }
            }

            get invisibleNumpad() {
                const selectedOrder = this._currentOrder;
                if (!selectedOrder || !this.env.pos.config.allow_numpad) {
                    return true
                } else {
                    return false
                }
            }

            async _validateMode(mode) {
                if (mode == 'discount' && (!this.env.pos.config.allow_numpad || !this.env.pos.config.allow_discount)) {
                    this.env.pos.alert_message({
                        title: this.env._t('Alert'),
                        body: this.env._t('You have not Permission change Discount')
                    })
                    return false;
                }
                if (mode == 'quantity' && (!this.env.pos.config.allow_numpad || !this.env.pos.config.allow_discount)) {
                    this.env.pos.alert_message({
                        title: this.env._t('Alert'),
                        body: this.env._t('You have not Permission change Quantity')
                    })
                    return false;
                }
                if (mode == 'price' && (!this.env.pos.config.allow_numpad || !this.env.pos.config.allow_price)) {
                    this.env.pos.alert_message({
                        title: this.env._t('Alert'),
                        body: this.env._t('You have not Permission change Quantity')
                    })
                    return false;
                }
                if (this.env.pos.config.validate_quantity_change && mode == 'quantity') {
                    let validate = await this.env.pos._validate_action(this.env._t('Requesting change Quantity of Line, Please requesting 1 Manager full fill Security PIN'));
                    if (!validate) {
                        return false;
                    }
                }
                if (this.env.pos.config.validate_price_change && mode == 'price') {
                    let validate = await this.env.pos._validate_action(this.env._t('Requesting change Price of Line, Please requesting 1 Manager full fill Security PIN'));
                    if (!validate) {
                        return false;
                    }
                }
                if (this.env.pos.config.validate_discount_change && mode == 'discount') {
                    let validate = await this.env.pos._validate_action(this.env._t('Requesting change Discount of Line, Please requesting 1 Manager full fill Security PIN'));
                    if (!validate) {
                        return false;
                    }
                }
                return true
            }

            async sendInput(key) {
                if (this.env.pos.config.validate_change_minus && key == '-') {
                    let validate = await this.env.pos._validate_action(this.env._t('Requesting change +/- of Line, Please requesting 1 Manager full fill Security PIN'));
                    if (!validate) {
                        return false;
                    }
                }
                super.sendInput(key);
            }

            get blockScreen() {
                const selectedOrder = this.env.pos.get_order();
                if (!selectedOrder || !selectedOrder.is_return) {
                    return false
                } else {
                    return true
                }
            }
        }
    Registries.Component.extend(NumpadWidget, RetailNumpadWidget);

    return NumpadWidget;
});
