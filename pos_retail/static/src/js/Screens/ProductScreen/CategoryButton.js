odoo.define('pos_retail.CategoryButton', function (require) {
    'use strict';

    const CategoryButton = require('point_of_sale.CategoryButton');
    const Registries = require('point_of_sale.Registries');

    const RetailCategoryButton = (CategoryButton) =>
        class extends CategoryButton {

            get imageUrl() {
                const category = this.props.category
                if (category.image_128) {
                    return 'data:image/png;base64, ' + category.image_128
                } else {
                    return null
                }
            }
        }
    Registries.Component.extend(CategoryButton, RetailCategoryButton);

    return RetailCategoryButton;
});
