odoo.define('pos_retail.ButtonSetBundlePack', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');

    class ButtonSetBundlePack extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
        }

        mounted() {
            this.env.pos.get_order().orderlines.on('change', () => {
                this.render();
            });
        }

        get isHighlighted() {
            var order = this.env.pos.get_order();
            if (!order) {
                return false
            }
            if (order && order.get_selected_orderline()) {
                let selectedLine = order.get_selected_orderline();
                let combo_items = this.env.pos.combo_items.filter((c) => selectedLine.product.product_tmpl_id == c.product_combo_id[0])
                if (combo_items.length) {
                    return true
                }
            }
            return false
        }

        async onClick() {
            const selectedOrder = this.env.pos.get_order()
            if (selectedOrder) {
                selectedOrder.setBundlePackItems()
            }

        }
    }

    ButtonSetBundlePack.template = 'ButtonSetBundlePack';

    ProductScreen.addControlButton({
        component: ButtonSetBundlePack,
        condition: function () {
            return this.env.pos.combo_items.length != 0;
        },
    });

    Registries.Component.add(ButtonSetBundlePack);

    return ButtonSetBundlePack;
});
