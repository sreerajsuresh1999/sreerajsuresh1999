odoo.define('pos_retail.ButtonClearTaxes', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');

    class ButtonClearTaxes extends PosComponent {
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
            let order = this.env.pos.get_order();
            if (!order) {
                return false
            }
            for (let i = 0; i < order.orderlines.models.length; i++) {
                let line = order.orderlines.models[i]
                if ((line.tax_ids && line.tax_ids.length) || line.product.tax_id) {
                    return true
                }
            }
            return false
        }

        async onClick() {
            let order = this.env.pos.get_order();
            let selectedLine = order.get_selected_orderline();
            if (!selectedLine) {
                return this.env.pos.alert_message({
                    title: this.env._t('Error'),
                    body: this.env._t('Have not any line in cart')
                })
            }
            if (selectedLine.is_return || order.is_return) {
                return this.env.pos.alert_message({
                    title: this.env._t('Error'),
                    body: this.env._t('It not possible set taxes on Order return')
                })
            }
            if (order.orderlines.models.length == 0) {
                return this.env.pos.alert_message({
                    title: this.env._t('Error'),
                    body: this.env._t('Your Order empty cart')
                })
            }
            for (let i = 0; i < order.orderlines.models.length; i++) {
                let line = order.orderlines.models[i]
                line.set_taxes([]);
            }
            this.env.pos.chrome.showNotification(this.env._t('Successfully'), this.env._t('All Taxes peer Product has removed'))
        }
    }

    ButtonClearTaxes.template = 'ButtonClearTaxes';

    ProductScreen.addControlButton({
        component: ButtonClearTaxes,
        condition: function () {
            return this.env.pos.config.update_tax_ids.length;
        },
    });

    Registries.Component.add(ButtonClearTaxes);

    return ButtonClearTaxes;
});
