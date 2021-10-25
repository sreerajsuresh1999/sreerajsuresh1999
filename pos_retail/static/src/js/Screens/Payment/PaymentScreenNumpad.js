odoo.define('pos_retail.PaymentScreenNumpad', function (require) {
    'use strict';

    const PaymentScreenNumpad = require('point_of_sale.PaymentScreenNumpad');
    const Registries = require('point_of_sale.Registries');

    const RetailPaymentScreenNumpad = (PaymentScreenNumpad) =>
        class extends PaymentScreenNumpad {
            removeAllPayments() {
                const self = this;
                const selectedOrder = this.env.pos.get_order()
                if (selectedOrder) {
                    this.currentOrder = selectedOrder
                } else {
                    return this.env.pos.alert_message({
                        title: this.env._t('Alert'),
                        body: this.env._t('Order not found')
                    })
                }
                if (this.currentOrder.paymentlines.models.length == 0) {
                    return this.env.pos.alert_message({
                        title: this.env._t('Alert'),
                        body: this.env._t('Order Blank Payment Register')
                    })
                }
                this.currentOrder.paymentlines.models.forEach(function (p) {
                    self.currentOrder.remove_paymentline(p)
                })
                this.currentOrder.paymentlines.models.forEach(function (p) {
                    self.currentOrder.remove_paymentline(p)
                })
                this.currentOrder.paymentlines.models.forEach(function (p) {
                    self.currentOrder.remove_paymentline(p)
                })
                this.currentOrder.trigger('change', this.currentOrder)
            }
        }
    Registries.Component.extend(PaymentScreenNumpad, RetailPaymentScreenNumpad);

    return RetailPaymentScreenNumpad;
});
