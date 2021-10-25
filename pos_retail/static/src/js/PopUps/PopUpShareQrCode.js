odoo.define('pos_retail.PopUpShareQrCode', function (require) {
    'use strict';

    const {useState, useRef, useContext} = owl.hooks;
    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');
    const contexts = require('point_of_sale.PosContext');
    const {useExternalListener} = owl.hooks;

    class PopUpShareQrCode extends AbstractAwaitablePopup {
        constructor() {
            super(...arguments);
            this.changes = {}
            this.state = useState(this.change);
            this.orderUiState = useContext(contexts.orderManagement);
            useExternalListener(window, 'keyup', this._keyUp);
        }

        _keyUp(event) {
            if (event.key == 'Enter') {
                this.confirm()
            }
        }

    }

    PopUpShareQrCode.template = 'PopUpShareQrCode';
    PopUpShareQrCode.defaultProps = {
        confirmText: 'Ok',
        cancelText: 'Cancel',
        array: [],
        isSingleItem: false,
    };

    Registries.Component.add(PopUpShareQrCode);

    return PopUpShareQrCode
});
