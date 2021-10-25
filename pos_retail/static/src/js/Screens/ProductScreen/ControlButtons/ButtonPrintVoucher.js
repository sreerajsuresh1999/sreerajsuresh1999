odoo.define('pos_retail.ButtonPrintVoucher', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');

    class ButtonPrintVoucher extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
        }
        async onClick() {
            var order = this.env.pos.get_order();
            order.create_voucher()
        }
    }

    ButtonPrintVoucher.template = 'ButtonPrintVoucher';

    ProductScreen.addControlButton({
        component: ButtonPrintVoucher,
        condition: function () {
            return this.env.pos.config.print_voucher;
        },
    });

    Registries.Component.add(ButtonPrintVoucher);

    return ButtonPrintVoucher;
});
