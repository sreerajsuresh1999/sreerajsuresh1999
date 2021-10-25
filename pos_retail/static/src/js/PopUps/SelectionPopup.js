odoo.define('pos_retail.SelectionPopup', function (require) {
    'use strict';

    const SelectionPopup = require('point_of_sale.SelectionPopup');
    const Registries = require('point_of_sale.Registries');
    const {useExternalListener} = owl.hooks;
    const {useBarcodeReader} = require('point_of_sale.custom_hooks');

    const RetailSelectionPopup = (SelectionPopup) =>
        class extends SelectionPopup {
            constructor() {
                super(...arguments);
                useExternalListener(window, 'keyup', this._keyUp);
            }

            async _keyUp(event) {
                if (["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"].includes(event.key) && this.props.list[parseInt(event.key)]) {
                    this.state.selectedId = this.props.list[parseInt(event.key)]['id']
                    await this.confirm()
                }
            }

        }
    Registries.Component.extend(SelectionPopup, RetailSelectionPopup);

    return RetailSelectionPopup;
});
