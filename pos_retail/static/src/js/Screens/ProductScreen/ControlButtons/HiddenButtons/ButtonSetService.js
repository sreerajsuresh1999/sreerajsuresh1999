odoo.define('pos_retail.ButtonSetService', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');

    class ButtonSetService extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
        }

        async onClick() {
            const list = this.env.pos.services_charge.map(service => ({
                id: service.id,
                label: service.name,
                isSelected: false,
                item: service
            }))
            let {confirmed, payload: service} = await this.showPopup('SelectionPopup', {
                title: this.env._t('Please select one Service'),
                list: list,
            });
            if (confirmed) {
                var product = this.env.pos.db.get_product_by_id(service['product_id'][0]);
                if (product) {
                    this.env.pos.get_order().add_shipping_cost(service, product, false)
                } else {
                    return this.env.pos.alert_message({
                        title: this.env._t('Warning'),
                        body: service['product_id'][1] + this.env._t(' not available in POS')
                    })
                }
            }
        }

        get serviceAdded() {
            var order = this.env.pos.get_order();
            var serviceLine = _.find(order.orderlines.models, function (l) {
                return l.service_id != null
            })
            if (serviceLine) {
                return serviceLine.product.display_name;
            } else {
                return this.env._t('Service')
            }
        }
    }

    ButtonSetService.template = 'ButtonSetService';

    ProductScreen.addControlButton({
        component: ButtonSetService,
        condition: function () {
            // return this.env.pos.services_charge;
            return false
        },
    });

    Registries.Component.add(ButtonSetService);

    return ButtonSetService;
});
