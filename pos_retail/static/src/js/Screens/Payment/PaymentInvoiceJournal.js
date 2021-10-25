odoo.define('pos_retail.PaymentInvoiceJournal', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');

    class PaymentInvoiceJournal extends PosComponent {
        constructor() {
            super(...arguments);
        }

        get isSelected() {
            var selectedOrder = this.env.pos.get_order();
            if (this.props.paymentInvoiceJournal.id == selectedOrder.payment_journal_id) {
                return true
            } else {
                return false
            }
        }

    }

    PaymentInvoiceJournal.template = 'PaymentInvoiceJournal';

    Registries.Component.add(PaymentInvoiceJournal);

    return PaymentInvoiceJournal;
});
