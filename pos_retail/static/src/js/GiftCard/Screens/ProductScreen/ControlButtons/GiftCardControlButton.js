odoo.define('pos_retail.giftCardControlButton', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');

    class giftCardControlButton extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
        }

        async onClick(props) {
            this.showScreen('GiftCardScreen');
        }
    }

    giftCardControlButton.template = 'giftCardControlButton';

    ProductScreen.addControlButton({
        component: giftCardControlButton,
        condition: function () {
            return this.env.pos.config.enable_gift_card;
        },
    });

    Registries.Component.add(giftCardControlButton);

    return giftCardControlButton;
});
