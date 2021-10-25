odoo.define('pos_retail.ProductsWidget', function (require) {
    'use strict';

    const ProductsWidget = require('point_of_sale.ProductsWidget');
    const Registries = require('point_of_sale.Registries');

    const RetailProductsWidget = (ProductsWidget) =>
        class extends ProductsWidget {
            constructor() {
                super(...arguments);
            }

            mounted() {
                super.mounted();
            }

            willUnmount() {
                super.willUnmount();
            }


            willPatch() {
                super.willPatch();
            }

            patched() {
                super.patched();
            }
        }
    Registries.Component.extend(ProductsWidget, RetailProductsWidget);

    return RetailProductsWidget;
});
