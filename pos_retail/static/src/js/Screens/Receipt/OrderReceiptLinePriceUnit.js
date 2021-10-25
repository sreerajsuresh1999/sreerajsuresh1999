odoo.define('pos_retail.OrderReceiptLinePriceUnit', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const {useState} = owl.hooks;

    class OrderReceiptLinePriceUnit extends PosComponent {
        constructor() {
            super(...arguments);
            this.line = this.props.line;
        }
        get Price() {
            return this.line.price
        }

    }

    OrderReceiptLinePriceUnit.template = 'OrderReceiptLinePriceUnit';

    Registries.Component.add(OrderReceiptLinePriceUnit);

    return OrderReceiptLinePriceUnit;
});
