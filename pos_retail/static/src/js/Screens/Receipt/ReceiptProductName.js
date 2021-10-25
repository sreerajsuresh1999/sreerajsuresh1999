odoo.define('pos_retail.ReceiptProductName', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');

    class ReceiptProductName extends PosComponent {
        constructor() {
            super(...arguments);
        }

    }

    ReceiptProductName.template = 'ReceiptProductName';

    Registries.Component.add(ReceiptProductName);

    return ReceiptProductName;
});
