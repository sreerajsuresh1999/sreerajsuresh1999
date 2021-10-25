odoo.define('pos_retail.NavigationCategory', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const {useState} = owl.hooks;
    const {useListener} = require('web.custom_hooks');
    const models = require('point_of_sale.models');
    const Registries = require('point_of_sale.Registries');
    const {Printer} = require('point_of_sale.Printer');
    const {posbus} = require('point_of_sale.utils');

    class NavigationCategory extends PosComponent {
        constructor() {
            super(...arguments);
            this.state = useState({
                selectedCategory: this.env._t('All Products'),
            });
        }

        willUnmount() {
            super.willUnmount();
            posbus.off('navigation-selected-category', this, null);

        }

        mounted() {
            super.mounted();
            posbus.on('navigation-selected-category', this, this._selectedCategory);
        }

        _selectedCategory(category_id) {
            const selectedCateg = this.env.pos.db.category_by_id[category_id]
            if (selectedCateg['name'] == 'Root') {
                selectedCateg['name'] = this.env._t('All Products')
            }
            this.state.selectedCategory = selectedCateg['name']
            this.env.pos.alert_message({
                title: selectedCateg['name'],
                body: this.env._t('is selected !!!')
            })
        }

        setCategory(category_id) {
            this.trigger('switch-category', category_id);
            this._selectedCategory(category_id)
        }

        getCountProduct(category_id) {
            const lastLimit = this.env.pos.db.limit
            this.env.pos.db.limit = 1000000
            const products = this.env.pos.db.get_product_by_category(category_id)
            this.env.pos.db.limit = lastLimit
            return products.length
        }
    }

    NavigationCategory.template = 'NavigationCategory';

    Registries.Component.add(NavigationCategory);

    return NavigationCategory;
});
