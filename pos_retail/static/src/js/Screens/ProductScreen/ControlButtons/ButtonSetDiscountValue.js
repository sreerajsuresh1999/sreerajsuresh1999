odoo.define('pos_retail.ButtonSetDiscountValue', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');
    const {Printer} = require('point_of_sale.Printer');

    class ButtonSetDiscountValue extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
            this._currentOrder = this.env.pos.get_order();
            this._currentOrder.orderlines.on('change', this.render, this);
            this.env.pos.on('change:selectedOrder', this._updateCurrentOrder, this);
        }

        willUnmount() {
            this._currentOrder.orderlines.off('change', null, this);
            this.env.pos.off('change:selectedOrder', null, this);
        }

        get isHighlighted() {
            var order = this.env.pos.get_order();
            if (!order) {
                return false
            }
            if (order.is_return) {
                return false;
            }
            const selectedLine = order.get_selected_orderline()
            if (!selectedLine || selectedLine.is_return) {
                return false
            } else {
                return true
            }
        }

        async onClick() {
            const order = this.env.pos.get_order();
            let {confirmed, payload: discount} = await this.showPopup('NumberPopup', {
                title: this.env._t('Which value of discount would you apply ?'),
                startingValue: 0,
                confirmText: this.env._t('Apply Discount'),
                cancelText: this.env._t('Remove all Discount'),
            })
            if (confirmed) {
                order.set_discount_value(parseFloat(discount))
            }
        }
    }

    ButtonSetDiscountValue.template = 'ButtonSetDiscountValue';

    ProductScreen.addControlButton({
        component: ButtonSetDiscountValue,
        condition: function () {
            // return (this.env.pos.config.discount_value && this.env.pos.config.discount_value_limit > 0)
            return false
        },
    });

    Registries.Component.add(ButtonSetDiscountValue);

    return ButtonSetDiscountValue;
});
