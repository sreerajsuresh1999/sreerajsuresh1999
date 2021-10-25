odoo.define('pos_retail.multi_unit', function(require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');

    class MultiUnitWidget extends PosComponent {
        constructor() {
            super(...arguments);
            this.uom_items = arguments.uom_items;
            this.selected_line = arguments.selected_line;
            this.uom_item_by_id = {};
            for (var i=0; i < this.uom_items.length; i++) {
                var uom_item = this.uom_items[i];
                this.uom_item_by_id[uom_item.uom_id[0]] = uom_item;
            }
        }
        get UomItems () {
            return this.uom_items
        }
        clickDeleteLastChar () {
            $('.uom-list').replaceWith();
        }
        clickAppendNewChar (event) {
            var uom_item_id = parseInt(event.currentTarget.getAttribute('id'));
            var uom_item = this.uom_item_by_id[uom_item_id];
            this.selected_line.set_unit(uom_item.uom_id[0], uom_item.price)
        }
    }
    MultiUnitWidget.template = 'MultiUnitWidget';

    Registries.Component.add(MultiUnitWidget);

    return MultiUnitWidget;
});

