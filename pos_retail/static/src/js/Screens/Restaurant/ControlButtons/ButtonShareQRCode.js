odoo.define('pos_retail.ButtonShareQRCode', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');

    class ButtonShareQRCode extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
        }


        async onClick() {
            const order = this.env.pos.get_order();
            if (order.table && this.env.pos.restaurant_order_config) {
                this.env.pos.selectedOrder = order;
                this.env.pos.qrcodeLink = window.origin + '/public/pos/web?table_id=' + order.table.id + '&config_id=' + this.env.pos.restaurant_order_config.id;
                this.showPopup('PopUpShareQrCode', {
                    title: this.env._t('Dear, you can share this Qrcode to Customer. Customers can use his Mobile Camera scan this code, and take order items'),
                    body: this.env._t(''),
                    selectedOrder: order
                })
            } else {
                return this.env.pos.alert_message({
                    title: this.env._t('Error'),
                    body: this.env._t('Your Point Of Sale have not setting any counter Restaurant Order')
                })
            }
        }
    }

    ButtonShareQRCode.template = 'ButtonShareQRCode';

    ProductScreen.addControlButton({
        component: ButtonShareQRCode,
        condition: function () {
            return this.env.pos.floors_by_id && this.env.pos.config.qrcode_order_screen;
        },
        position: ['after', 'SubmitOrderButton'],
    });

    Registries.Component.add(ButtonShareQRCode);

    return ButtonShareQRCode;
});
