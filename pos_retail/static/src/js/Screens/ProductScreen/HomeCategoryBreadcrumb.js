odoo.define('pos_retail.HomeCategoryBreadcrumb', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const HomeCategoryBreadcrumb = require('point_of_sale.HomeCategoryBreadcrumb');
    const {useState} = owl.hooks;
    const {useListener} = require('web.custom_hooks');
    const models = require('point_of_sale.models');
    const Registries = require('point_of_sale.Registries');

    const RetailHomeCategoryBreadcrumb = (HomeCategoryBreadcrumb) =>
        class extends HomeCategoryBreadcrumb {
            async _categPopup() {
                // removed at 23.12.2020
                // const self = this;
                // let selectionList = [{
                //     id: 0,
                //     name: 'All Items',
                // }];
                // this.env.pos.pos_categories.forEach(c => {
                //     if (c.id == self.env.pos.get('selectedCategoryId')) {
                //         c.selected = true
                //     } else {
                //         c.selected = false
                //     }
                // });
                // selectionList = selectionList.concat(this.env.pos.pos_categories)
                // const {confirmed, payload: selectedCategories} = await this.showPopup(
                //     'PopUpSelectionBox',
                //     {
                //         title: this.env._t('Select the category'),
                //         items: selectionList,
                //         onlySelectOne: true,
                //     }
                // );
                // if (confirmed && selectedCategories['items'].length > 0) {
                //     const selectedCategory = selectedCategories['items'][0]
                //     if (selectedCategory && selectedCategory.id) {
                //         this.trigger('switch-category', selectedCategory.id);
                //     }
                // }
                let selectionList = [{
                    id: 0,
                    label: 'All Items',
                    isSelected: 0 === this.env.pos.get('selectedCategoryId'),
                    item: {id: 0, name: 'All Items'},
                }];
                let subs = this.props.subcategories.map(category => ({
                    id: category.id,
                    label: category.name,
                    isSelected: category.id === this.env.pos.get('selectedCategoryId'),
                    item: category,
                    imageUrl: category.image_128
                }));
                selectionList = selectionList.concat(subs);
                const {confirmed, payload: selectedCategory} = await this.showPopup(
                    'SelectionPopup',
                    {
                        title: this.env._t('Select the category'),
                        list: selectionList,
                    }
                );
                if (confirmed) {
                    this.trigger('switch-category', selectedCategory.id);
                }
            }
        }
    Registries.Component.extend(HomeCategoryBreadcrumb, RetailHomeCategoryBreadcrumb);

    return RetailHomeCategoryBreadcrumb;
});