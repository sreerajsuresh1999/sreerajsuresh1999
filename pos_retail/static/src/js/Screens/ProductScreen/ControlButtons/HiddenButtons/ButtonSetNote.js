odoo.define('pos_retail.ButtonSetNote', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');

    class ButtonSetNote extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
        }

        async onClick() {
            var order = this.env.pos.get_order();
            const {confirmed, payload: note} = await this.showPopup('TextAreaPopup', {
                title: this.env._t('Set Note to selected Order'),
                startingValue: order.get_note()
            })
            if (confirmed) {
                order.set_note(note)
            }
        }
    }

    ButtonSetNote.template = 'ButtonSetNote';

    ProductScreen.addControlButton({
        component: ButtonSetNote,
        condition: function () {
            // return this.env.pos.config.note_order;
            return false
        },
    });

    Registries.Component.add(ButtonSetNote);

    return ButtonSetNote;
});
