odoo.define('pos_retail.ButtonSetSignature', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');

    class ButtonSetSignature extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
        }

        async onClick() {
            var order = this.env.pos.get_order();
            const {confirmed, payload: values} = await this.showPopup('PopUpSignatureOrder', {
                title: this.env._t('Signatue Order'),
            })
            if (confirmed) {
                if (!values.signature) {
                    return this.env.pos.alert_message({
                        title: this.env._t('Warning'),
                        body: this.env._t('Signature not success, please try again')
                    })
                } else {
                    order.set_signature(values.signature)
                }
            }
        }
    }

    ButtonSetSignature.template = 'ButtonSetSignature';

    ProductScreen.addControlButton({
        component: ButtonSetSignature,
        condition: function () {
            // return this.env.pos.config.signature_order;
            return false
        },
    });

    Registries.Component.add(ButtonSetSignature);

    return ButtonSetSignature;
});
