odoo.define('pos_retail.TicketButton', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const TicketButton = require('point_of_sale.TicketButton');
    const {useState} = owl.hooks;
    const {useListener} = require('web.custom_hooks');
    const models = require('point_of_sale.models');
    const Registries = require('point_of_sale.Registries');
    const { posbus } = require('point_of_sale.utils');

    const RetailTicketButton = (TicketButton) =>
        class extends TicketButton {
            constructor() {
                super(...arguments);
            }

            // onClick() {
            //     if (this.props.isTicketScreenShown) {
            //         posbus.trigger('ticket-button-clicked');
            //     } else {
            //         posbus.trigger('set-screen', 'Tickets')
            //     }
            // }

            get isKitchenScreen() {
                if (!this || !this.env || !this.env.pos || !this.env.pos.config) {
                    return false
                } else {
                    if (this.env.pos.config.screen_type == 'kitchen') {
                        return true
                    } else {
                        return false
                    }
                }
            }

            get count() {
                if (!this.env.pos || !this.env.pos.config) return 0;
                if (this.env.pos.config.iface_floorplan) {
                    return this.env.pos.get('orders').models.length;
                } else {
                    return super.count;
                }
            }

        }
    TicketButton.template = 'RetailTicketButton'
    Registries.Component.extend(TicketButton, RetailTicketButton);

    return RetailTicketButton;
});
