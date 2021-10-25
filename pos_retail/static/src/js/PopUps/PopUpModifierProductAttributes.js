odoo.define('pos_retail.PopUpModifierProductAttributes', function (require) {
    'use strict';

    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');
    const {useExternalListener} = owl.hooks;

    class PopUpModifierProductAttributes extends AbstractAwaitablePopup {
        constructor() {
            super(...arguments);
            this.changes = {}
            useExternalListener(window, 'keyup', this._keyUp);
        }

        _keyUp(event) {
            if (event.key == 'Enter') {
                this.confirm()
            }
        }

        OnChange(event) {
            this.changes[event.target.name] = event.target.value;
        }

        getPayload() {
            return this.changes
        }
    }

    PopUpModifierProductAttributes.template = 'PopUpModifierProductAttributes';
    PopUpModifierProductAttributes.defaultProps = {
        confirmText: 'Ok',
        cancelText: 'Cancel',
        array: [],
        isSingleItem: false,
    };

    Registries.Component.add(PopUpModifierProductAttributes);

    return PopUpModifierProductAttributes
});
