odoo.define('pos_retail.ButtonSetDoneLines', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');
    const {posbus} = require('point_of_sale.utils');

    class ButtonSetDoneLines extends PosComponent {
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

        get countItemsNeedDelivery() {
            let selectedOrder = this.env.pos.get_order();
            if (!selectedOrder) {
                return 0
            }
            const allReceipts = this.env.pos.db.getOrderReceipts()
            const receiptOfSelectedOrders = allReceipts.filter(r => r['uid'] == selectedOrder['uid'] && r['ready_transfer_items'] && r['ready_transfer_items'] > 0)
            if (!receiptOfSelectedOrders || receiptOfSelectedOrders.length == 0) {
                return 0
            } else {
                let totalItemsNeedDelivery = 0
                receiptOfSelectedOrders.forEach(r => {
                    totalItemsNeedDelivery += r['ready_transfer_items']
                })
                return totalItemsNeedDelivery
            }
        }

        get isWarningBox() {
            return true
        }

        willUnmount() {
            this.env.pos.get('orders').off('add remove change', null, this);
            this.env.pos.off('change:selectedOrder', null, this);
        }

        get addedClasses() {
            let selectedOrder = this.env.pos.get_order();
            if (!selectedOrder) return {};
            const countItemsNeedDelivery = this.countItemsNeedDelivery
            if (countItemsNeedDelivery > 0) {
                return {
                    highlight: true,
                };
            } else {
                return {};
            }

        }

        async onClick() {
            posbus.trigger('reloadKitchenScreen', {})
            this.showScreen('KitchenScreen', {});
        }
    }

    ButtonSetDoneLines.template = 'ButtonSetDoneLines';

    ProductScreen.addControlButton({
        component: ButtonSetDoneLines,
        condition: function () {
            return this.env.pos.config.sync_multi_session && this.env.pos.config.send_order_to_kitchen && this.env.pos.config.module_pos_restaurant;
        },
        position: ['after', 'SubmitOrderButton'],
    });

    Registries.Component.add(ButtonSetDoneLines);

    return ButtonSetDoneLines;
});
