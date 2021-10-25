odoo.define('pos_retail.ProductList', function (require) {
    'use strict';

    const ProductList = require('point_of_sale.ProductList');
    const Registries = require('point_of_sale.Registries');

    ProductList.template = 'RetailProductList';
    Registries.Component.add(ProductList);

    const RetailProductList = (ProductList) =>
        class extends ProductList {
            // mounted() {
            //     this.env.pos.on(
            //         'change:ProductView',
            //         (pos, synch) => {
            //             this.render()
            //         },
            //         this
            //     );
            // }
        }
    Registries.Component.extend(ProductList, RetailProductList);

    return ProductList;
});
