odoo.define('pos_retail.PopUpCreateInternalTransfer', function (require) {
    'use strict';

    const {useState, useRef, useContext} = owl.hooks;
    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');
    const contexts = require('point_of_sale.PosContext');
    const {useExternalListener} = owl.hooks;

    class PopUpCreateInternalTransfer extends AbstractAwaitablePopup {
        constructor() {
            super(...arguments);
            this.changes = {
                note: this.props.note,
                picking_type_id: this.props.picking_type_id,
                location_id: this.props.location_id,
                location_dest_id: this.props.location_dest_id,
                move_type: 'direct',
                priority: '0',
                scheduled_date: this.props.scheduled_date,
            }
            this.state = useState(this.change);
            this.orderUiState = useContext(contexts.orderManagement);
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

    PopUpCreateInternalTransfer.template = 'PopUpCreateInternalTransfer';
    PopUpCreateInternalTransfer.defaultProps = {
        confirmText: 'Ok',
        cancelText: 'Cancel',
        array: [],
        isSingleItem: false,
    };

    Registries.Component.add(PopUpCreateInternalTransfer);

    return PopUpCreateInternalTransfer
});
