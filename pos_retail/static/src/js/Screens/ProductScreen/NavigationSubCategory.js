odoo.define('pos_retail.NavigationSubCategory', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const {posbus} = require('point_of_sale.utils');

    class NavigationSubCategory extends PosComponent {
        constructor() {
            super(...arguments);
            this.category = this.env.pos.db.category_by_id[this.props.category_id]
            this.parent = this.env.pos.db.get_category_parent_id(this.props.category_id)
        }

        setCategory(category_id) {
            this.trigger('switch-category', category_id);
            posbus.trigger('navigation-selected-category', category_id)
        }

        getCountProduct(category_id) {
            const lastLimit = this.env.pos.db.limit
            this.env.pos.db.limit = 1000000
            const products = this.env.pos.db.get_product_by_category(category_id)
            this.env.pos.db.limit = lastLimit
            return products.length
        }
    }

    NavigationSubCategory.template = 'NavigationSubCategory';

    Registries.Component.add(NavigationSubCategory);

    return NavigationSubCategory;
});
