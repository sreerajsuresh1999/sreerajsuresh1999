odoo.define('pos_retail.PopupTemplate', function (require) {
    'use strict';

    const {useState, useRef, useContext} = owl.hooks;
    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');
    const contexts = require('point_of_sale.PosContext');
    const {useListener} = require('web.custom_hooks');
    const {useExternalListener} = owl.hooks;

    class PopupTemplate extends AbstractAwaitablePopup {
        constructor() {
            super(...arguments);
            this.changes = {}
            this.state = useState(this.change);
            this.orderUiState = useContext(contexts.orderManagement);
            useListener('click-item', this.onClickItem);
            useExternalListener(window, 'keyup', this._keyUp);
        }

        _keyUp(event) {
            if (event.key == 'Enter') {
                this.confirm()
            }
        }

        OnChange(event) {
            if (event.target.type == 'checkbox') {
                this.changes[event.target.name] = event.target.checked;
            } else {
                this.changes[event.target.name] = event.target.value;
            }
            this.render()
        }


        getPayload() {
            return this.changes
        }
    }

    PopupTemplate.template = 'PopupTemplate';
    PopupTemplate.defaultProps = {
        confirmText: 'Ok',
        cancelText: 'Cancel',
        array: [],
        isSingleItem: false,
    };

    Registries.Component.add(PopupTemplate);

    return PopupTemplate
});
