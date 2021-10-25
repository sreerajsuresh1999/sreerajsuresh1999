odoo.define('pos_retail.ButtonSetDiscountGlobal', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');
    const {Printer} = require('point_of_sale.Printer');

    class ButtonSetDiscountGlobal extends PosComponent {
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
            const selectedOder = this.env.pos.get_order();
            if (selectedOder.is_return) {
                return this.env.pos.alert_message({
                    title: this.env._t('Error'),
                    body: this.env._t('It not possible add Global Dicsount for Order Return')
                })
            }
            const list = this.env.pos.discounts.map(discount => ({
                id: discount.id,
                label: discount.name,
                isSelected: false,
                item: discount,
                cancelButtonText: this.env._t('Remove All Global Discount'),
                confirmButtonText: this.env._t('Close'),
            }))
            let {confirmed, payload: global_discount} = await this.showPopup('SelectionPopup', {
                title: this.env._t('Please select one Global Discount need to apply'),
                list: list
            })
            if (confirmed) {
                selectedOder.add_global_discount(global_discount)
            } else {
                selectedOder.clear_discount_extra()
            }
        }
    }

    ButtonSetDiscountGlobal.template = 'ButtonSetDiscountGlobal';

    ProductScreen.addControlButton({
        component: ButtonSetDiscountGlobal,
        condition: function () {
            // return (this.env.pos.config.discount && this.env.pos.config.discount_ids.length > 0)
            return false
        },
    });

    Registries.Component.add(ButtonSetDiscountGlobal);

    return ButtonSetDiscountGlobal;
});
