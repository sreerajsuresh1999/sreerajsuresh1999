odoo.define('pos_retail.ButtonSetGuest', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');

    class ButtonSetGuest extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
        }

        async onClick() {
            var order = this.env.pos.get_order();
            const {confirmed, payload: values} = await this.showPopup('PopUpSetGuest', {
                title: this.env._t('Set Guest Name and Number'),
            })
            if (confirmed) {
                order.guest = values['guest'];
                order.guest_number = values['guest_number'];
                order.trigger('change', order);
            }
        }
        get GuestName() {
            var order = this.env.pos.get_order();
            if (order.guest) {
                return order.guest
            } else {
                return this.env._t('Guest')
            }
        }
    }

    ButtonSetGuest.template = 'ButtonSetGuest';

    ProductScreen.addControlButton({
        component: ButtonSetGuest,
        condition: function () {
            return this.env.pos.config.set_guest || this.env.pos.config.set_guest_when_add_new_order;
        },
    });

    Registries.Component.add(ButtonSetGuest);

    return ButtonSetGuest;
});
