odoo.define('pos_retail.SplitBillButton', function (require) {
    'use strict';

    const SplitBillButton = require('pos_restaurant.SplitBillButton');
    const {posbus} = require('point_of_sale.utils');
    const Registries = require('point_of_sale.Registries');
    const { useListener } = require('web.custom_hooks');

    const RetailSplitBillButton = (SplitBillButton) =>
        class extends SplitBillButton {

            async onClick() {
                const order = this.env.pos.get_order();
                if (order.get_orderlines().length > 0) {
                    posbus.trigger('set-screen', 'Split')
                }
            }
        }
    Registries.Component.extend(SplitBillButton, RetailSplitBillButton);

    return RetailSplitBillButton;
});
