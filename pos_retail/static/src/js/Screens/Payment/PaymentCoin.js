odoo.define('pos_retail.PaymentCoin', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');

    class PaymentCoin extends PosComponent {
        constructor() {
            super(...arguments);
        }
    }

    PaymentCoin.template = 'PaymentCoin';

    Registries.Component.add(PaymentCoin);

    return PaymentCoin;
});
