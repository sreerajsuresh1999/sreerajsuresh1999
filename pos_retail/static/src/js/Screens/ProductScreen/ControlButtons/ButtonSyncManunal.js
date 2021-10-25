odoo.define('pos_retail.ButtonSyncManual', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');

    class ButtonSyncManual extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
        }

        async onClick() {
            let {confirmed, payload: confirm} = await this.showPopup('ConfirmPopup', {
                title: this.env._t('Alert'),
                body: this.env._t('Are you want send your Session Orders to another Sessions')
            })
            if (confirmed) {
                var orders = this.env.pos.get('orders').models;
                if (orders.length > 0) {
                    for (var i = 0; i < orders.length; i++) {
                        var selected_order = orders[i];
                        if (selected_order && this.env.pos.pos_bus) {
                            this.env.pos.pos_bus.send_notification({
                                data: selected_order.export_as_JSON(),
                                action: 'new_order',
                                order_uid: selected_order.uid,
                            }, true);
                        }
                    }
                }
            }
        }
    }

    ButtonSyncManual.template = 'ButtonSyncManual';

    ProductScreen.addControlButton({
        component: ButtonSyncManual,
        condition: function () {
            return this.env.pos.config.mrp;
        },
    });

    Registries.Component.add(ButtonSyncManual);

    return ButtonSyncManual;
});
