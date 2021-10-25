odoo.define('pos_retail.ProductSaleCategories', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const {useState} = owl.hooks;
    const Registries = require('point_of_sale.Registries');
    const {posbus} = require('point_of_sale.utils');

    class ProductSaleCategories extends PosComponent {
        constructor() {
            super(...arguments);
            this.state = useState({
                selectedSaleCategory: this.env._t('Sale Categories'),
                selectedSaleCategoryId: 0
            });
        }

        willUnmount() {
            super.willUnmount();
            this.env.pos.off('change:selectedSaleCategoryId', null, this);

        }

        mounted() {
            super.mounted();
            this.env.pos.on('change:selectedSaleCategoryId', this.updateSelectedSaleCategoryToState, this);
        }

        updateSelectedSaleCategoryToState() {
            let selectedSaleCategoryId = this.env.pos.get('selectedSaleCategoryId')
            let selectedSaleCategory = this.env.pos.product_category_by_id[selectedSaleCategoryId]
            if (selectedSaleCategory) {
                this.state.selectedSaleCategory = selectedSaleCategory['name']
                this.state.selectedSaleCategoryId = selectedSaleCategory['id']
            }
            this.render()
        }

        setSaleCategory(category_id) {
            const selectedSaleCategory = this.env.pos.product_category_by_id[category_id]
            if (selectedSaleCategory['name'] == 'Root') {
                selectedSaleCategory['name'] = this.env._t('Sale Categories')
            }
            this.state.selectedSaleCategory = selectedSaleCategory['name']
            this.state.selectedSaleCategoryId = selectedSaleCategory['id']
            this.env.pos.set('selectedSaleCategoryId', category_id);
            this.env.pos.alert_message({
                title: selectedSaleCategory['name'],
                body: this.env._t('is Selected')
            })
        }

        getCountProduct(category_id) {

        }
    }

    ProductSaleCategories.template = 'ProductSaleCategories';

    Registries.Component.add(ProductSaleCategories);

    return ProductSaleCategories;
});
