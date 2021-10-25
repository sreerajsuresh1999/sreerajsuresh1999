odoo.define('pos_retail.ProductBrands', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const {useState} = owl.hooks;
    const Registries = require('point_of_sale.Registries');
    const {posbus} = require('point_of_sale.utils');

    class ProductBrands extends PosComponent {
        constructor() {
            super(...arguments);
            this.state = useState({
                selectedBrand: this.env._t('Brands'),
                selectedbrandId: 0
            });
        }

        willUnmount() {
            super.willUnmount();
            this.env.pos.off('change:selectedBrandId', null, this);

        }

        mounted() {
            super.mounted();
            this.env.pos.on('change:selectedBrandId', this.updateSelectedBrandToState, this);
        }

        updateSelectedBrandToState() {
            let selectedBrandId = this.env.pos.get('selectedBrandId')
            let selectedBrand = this.env.pos.productByBrandId[selectedBrandId]
            if (selectedBrand) {
                this.state.selectedBrand = selectedBrand['name']
                this.state.selectedbrandId = selectedBrand['id']
            }
            this.render()
        }

        setBrand(product_brand_id) {
            const selectedBrand = this.env.pos.productByBrandId[product_brand_id]
            if (selectedBrand['name'] == 'Root') {
                selectedBrand['name'] = this.env._t('All Brands')
            }
            this.state.selectedBrand = selectedBrand['name']
            this.state.selectedbrandId = selectedBrand['id']
            this.env.pos.set('selectedBrandId', product_brand_id);
            this.env.pos.alert_message({
                title: selectedBrand['name'],
                body: this.env._t('is Selected')
            })
        }

        getCountProduct(product_brand_id) {
            const lastLimit = this.env.pos.db.limit
            this.env.pos.db.limit = 1000000
            const products = this.env.pos.db.get_product_by_category(product_brand_id)
            this.env.pos.db.limit = lastLimit
            return products.length
        }
    }

    ProductBrands.template = 'ProductBrands';

    Registries.Component.add(ProductBrands);

    return ProductBrands;
});
