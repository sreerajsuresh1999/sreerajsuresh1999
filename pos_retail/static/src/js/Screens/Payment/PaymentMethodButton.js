odoo.define('pos_retail.PaymentMethodButton', function (require) {
    'use strict';

    const PaymentMethodButton = require('point_of_sale.PaymentMethodButton');
    const Registries = require('point_of_sale.Registries');
    PaymentMethodButton.template = 'RetailPaymentMethodButton'

    const RetailPaymentMethodButton = (PaymentMethodButton) =>
        class extends PaymentMethodButton {
            constructor() {
                super(...arguments);
                this._currentOrder = this.env.pos.get_order();
                this._currentOrder.paymentlines.on('change', this.render, this);
            }

            get paymentAmount() {
                let paymentLines = this._currentOrder.paymentlines.models.filter(p => p.payment_method && p.payment_method.id == this.props.paymentMethod.id)
                if (paymentLines && paymentLines.length > 0) {
                    let total = 0
                    paymentLines.forEach(p => {
                        total += p.amount
                    })
                    return total
                } else {
                    return 0
                }
            }

            get isSelected() {
                let paymentLine = this._currentOrder.paymentlines.models.find(p => p.payment_method && p.selected && p.payment_method.id == this.props.paymentMethod.id)
                if (paymentLine) {
                    return true
                } else {
                    return false
                }
            }
        }

    Registries.Component.extend(PaymentMethodButton, RetailPaymentMethodButton);
});
