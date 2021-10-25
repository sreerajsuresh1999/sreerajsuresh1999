odoo.define('pos_retail.ButtonCreateLots', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');

    class ButtonCreateLots extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
        }

        get isHighlighted() {
        }

        get selectedOrderline() {
            return this.env.pos.get_order().get_selected_orderline();
        }

        async onClick() {
            let self = this;
            let selectedOrder = this.env.pos.get_order();
            let selectedLine = selectedOrder.get_selected_orderline();
            if (!selectedLine) {
                return this.env.pos.alert_message({
                    title: this.env._t('Error'),
                    body: this.env._t('Please add Product have tracking by Lot to cart the first'),
                })
            }
            let {confirmed} = await this.showPopup('ConfirmPopup', {
                title: this.env._t('Warning'),
                body: this.env._t('Will create multi lots with quantity of Line selected: ') + selectedLine.product.display_name + this.env._t(', with quantity: ') + selectedLine.quantity
            })
            if (confirmed) {

                let {confirmed, payload} = await this.showPopup('EditListPopup', {
                    title: this.env._t('Create: Lot(s)/Serial Number. Press Enter to keyboard for add more lines'),
                    array: [],
                });
                if (confirmed) {
                    const lots = payload.newArray.map((item) => ({
                        name: item.text,
                        product_qty: selectedLine.quantity,
                        product_id: selectedLine.product.id,
                        company_id: this.env.pos.company.id
                    }));
                    if (lots.length > 0) {
                        let lot_ids = await this.rpc({
                            model: 'stock.production.lot',
                            method: 'create',
                            args: [lots]
                        })
                        if (lot_ids > 0) {
                            await this.env.pos._do_update_quantity_onhand([selectedLine.product.id]);
                            this.env.pos.trigger('reload.quantity.available')
                            this.showPopup('ConfirmPopup', {
                                title: this.env._t('Succeed'),
                                body:  this.env._t('Lots just created, you can use it now.'),
                                disableCancelButton: true,
                            })
                        }
                    }
                }
            }

        }
    }

    ButtonCreateLots.template = 'ButtonCreateLots';

    ProductScreen.addControlButton({
        component: ButtonCreateLots,
        condition: function () {
            return this.env.pos.config.create_lots;
        },
    });

    Registries.Component.add(ButtonCreateLots);

    return ButtonCreateLots;
});
