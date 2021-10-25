odoo.define('pos_retail.ProductName', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');

    class ProductName extends PosComponent {
        constructor() {
            super(...arguments);
        }

    }

    ProductName.template = 'ProductName';

    Registries.Component.add(ProductName);

    return ProductName;
});
