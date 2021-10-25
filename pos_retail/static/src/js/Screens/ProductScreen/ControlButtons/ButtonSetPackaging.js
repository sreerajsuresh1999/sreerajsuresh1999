odoo.define('pos_retail.ButtonSetPackaging', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');

    class ButtonSetPackaging extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
        }

        mounted() {
            this.env.pos.get('orders').on('add remove change', () => this.render(), this);
            this.env.pos.on('change:selectedOrder', () => this.render(), this);
            this.env.pos.get_order().orderlines.on('change', () => {
                this.render();
            });
        }

        willUnmount() {
            this.env.pos.get('orders').off('add remove change', null, this);
            this.env.pos.off('change:selectedOrder', null, this);
        }

        get isHighlighted() {
            let selectedOrder = this.env.pos.get_order();
            if (!selectedOrder) {
                return false
            }
            if (!selectedOrder || !selectedOrder.get_selected_orderline()) {
                return false
            }
            let selectedLine = this.env.pos.get_order().get_selected_orderline();
            if (selectedLine.product.sale_with_package && this.env.pos.packaging_by_product_id[selectedLine.product.id]) {
                return true
            } else {
                return false
            }
        }

        async onClick() {
            let selectedOrder = this.env.pos.get_order();
            if (selectedOrder) {
                selectedOrder.setProductPackaging()
            }
        }
    }

    ButtonSetPackaging.template = 'ButtonSetPackaging';

    ProductScreen.addControlButton({
        component: ButtonSetPackaging,
        condition: function () {
            return this.env.pos.packagings && this.env.pos.packagings.length
        },
    });

    Registries.Component.add(ButtonSetPackaging);

    return ButtonSetPackaging;
});
