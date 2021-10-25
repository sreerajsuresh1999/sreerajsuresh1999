odoo.define('pos_retail.PaymentScreenStatus', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const PaymentScreenStatus = require('point_of_sale.PaymentScreenStatus');
    const {useState} = owl.hooks;
    const {useListener} = require('web.custom_hooks');
    const models = require('point_of_sale.models');
    const Registries = require('point_of_sale.Registries');
    var core = require('web.core');
    var _t = core._t;
    var Session = require('web.Session');

    const RetailPaymentScreenStatus = (PaymentScreenStatus) =>
        class extends PaymentScreenStatus {
            constructor() {
                super(...arguments);
            }

            get Client() {
                if (this.env.pos.get_order() && this.env.pos.get_order().get_client()) {
                    return this.env.pos.get_order().get_client();
                } else {
                    return {
                        pos_loyalty_point: 0,
                        balance: 0,
                        wallet: 0,
                    }
                }
            }

            get getTipTotal() {
                const self = this
                const currentOrder = this.env.pos.get_order()
                if (!currentOrder || !this.env.pos.config.iface_tipproduct || !currentOrder || !this.env.pos.config.tip_product_id) {
                    return null
                } else {
                    let tipTotal = 0
                    currentOrder.orderlines.models.forEach(l => {
                        if (l.product.id == self.env.pos.config.tip_product_id[0]) {
                            tipTotal += l.get_price_with_tax()
                        }
                    })
                    if (tipTotal) {
                        return this.env.pos.format_currency(tipTotal)
                    } else {
                        return null
                    }
                }
            }

            get getDiscountTotal() {
                const currentOrder = this.env.pos.get_order()
                if (!currentOrder) {
                    return null
                }
                let discountTotal = currentOrder.get_total_discount()
                if (discountTotal) {
                    return this.env.pos.format_currency(discountTotal)
                } else {
                    return null
                }
            }
        }
    Registries.Component.extend(PaymentScreenStatus, RetailPaymentScreenStatus);

    return RetailPaymentScreenStatus;
});
