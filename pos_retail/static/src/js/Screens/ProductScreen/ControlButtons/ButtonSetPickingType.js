odoo.define('pos_retail.ButtonSetPickingType', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');

    class ButtonSetPickingType extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
        }

        get isHighlighted() {
        }

        get currentPickingType() {
            const OrderLocationSelected = this.env.pos.get_source_stock_location()
            return OrderLocationSelected.display_name
        }

        get selectedOrderline() {
            return this.env.pos.get_order().get_selected_orderline();
        }

        async onClick() {
            const selectedOrder = this.env.pos.get_order();
            const OrderLocationSelected = this.env.pos.get_source_stock_location()
            let allStockPickingType = this.env.pos.stock_picking_types.filter(spt => spt.default_location_src_id != undefined)
            let list = []
            allStockPickingType.forEach(spt => {
                if (spt.default_location_src_id) {
                    list.push({
                        id: spt.id,
                        label: this.env._t('Location: ') + spt.default_location_src_id[1] + this.env._t('. Of Operation type: ') + spt.name,
                        item: spt,
                        icon: 'fa fa-home'
                    })
                }
            })
            if (list.length > 0) {
                let {confirmed, payload: pickingType} = await this.showPopup('SelectionPopup', {
                    title: this.env._t('Current Order Items in Cart redeem from Stock Location: ') + OrderLocationSelected.display_name + this.env._t(' . Are you want change Source Location of Picking to another Stock Location?'),
                    list: list,
                })
                if (confirmed) {
                    selectedOrder.set_picking_type(pickingType.id);
                    this.setLocation(pickingType.default_location_src_id[0])
                }
            } else {
                return this.env.pos.alert_message({
                    title: this.env._t('Error. Stock Operation Types is missed setting'),
                    body: this.env._t('Your POS Config not add any Stock Operation Type at tab Warehouse'),
                });
            }

        }

        setLocation(location_id) {
            var self = this;
            var location = self.env.pos.stock_location_by_id[location_id];
            var order = self.env.pos.get_order();
            if (location && order) {
                order.set_stock_location(location);
                this.env.pos.trigger('reload.quantity.available')
                this.env.pos.alert_message({
                    title: this.env._t('Alert'),
                    body: this.env._t('Delivery Source Location of all Order will come from :' + location['display_name'])
                })
            } else {
                return this.env.pos.alert_message({
                    title: self.env._t('Error'),
                    body: self.env._t('Stock Location ID ' + location_id + ' not load to POS'),
                });
            }
        }
    }

    ButtonSetPickingType.template = 'ButtonSetPickingType';

    ProductScreen.addControlButton({
        component: ButtonSetPickingType,
        condition: function () {
            return this.env.pos.config.multi_stock_operation_type;
        },
    });

    Registries.Component.add(ButtonSetPickingType);

    return ButtonSetPickingType;
});
