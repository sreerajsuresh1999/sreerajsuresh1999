odoo.define('pos_retail.CategorySimpleButton', function (require) {
    'use strict';

    const CategorySimpleButton = require('point_of_sale.CategorySimpleButton');
    const Registries = require('point_of_sale.Registries');

    const RetailCategorySimpleButton = (CategorySimpleButton) =>
        class extends CategorySimpleButton {

            get isSelected() {
                let selectedCategoryId = this.env.pos.get('selectedCategoryId')
                if ((selectedCategoryId && selectedCategoryId == this.props.category.id) || (selectedCategoryId == 0 && this.props.category.id == 0)) {
                    return true
                } else {
                    return false
                }
            }
        }
    Registries.Component.extend(CategorySimpleButton, RetailCategorySimpleButton);

    return RetailCategorySimpleButton;
});
