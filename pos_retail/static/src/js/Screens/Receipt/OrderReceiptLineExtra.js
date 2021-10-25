odoo.define('pos_retail.OrderReceiptLineExtra', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const {useState} = owl.hooks;

    class OrderReceiptLineExtra extends PosComponent {
        constructor() {
            super(...arguments);
            const line = this.props.line;
            this.state = useState({
                line: line,
            });
        }

    }

    OrderReceiptLineExtra.template = 'OrderReceiptLineExtra';

    Registries.Component.add(OrderReceiptLineExtra);

    return OrderReceiptLineExtra;
});
