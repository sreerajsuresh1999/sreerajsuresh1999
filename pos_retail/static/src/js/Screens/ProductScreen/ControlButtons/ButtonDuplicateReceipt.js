odoo.define('pos_retail.ButtonDuplicateReceipt', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');

    class ButtonDuplicateReceipt extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
        }
        get numberDuplicate() {
            return this.env.pos.config.duplicate_number
        }

        async onClick() {
            const {confirmed, payload: number} = await this.showPopup('NumberPopup', {
                title: this.env._t('How many receipt number need duplicate, example: 2 ?'),
                startingValue: this.env.pos.config.duplicate_number,
            })
            if (confirmed) {
                this.env.pos.config.duplicate_number = parseInt(number);
                this.render()
            }
        }
    }

    ButtonDuplicateReceipt.template = 'ButtonDuplicateReceipt';

    ProductScreen.addControlButton({
        component: ButtonDuplicateReceipt,
        condition: function () {
            return this.env.pos.config.duplicate_receipt;
        },
    });

    Registries.Component.add(ButtonDuplicateReceipt);

    return ButtonDuplicateReceipt;
});
