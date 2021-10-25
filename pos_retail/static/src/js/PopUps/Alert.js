odoo.define('pos_retail.Alert', function(require) {
    'use strict';

    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');

    // formerly ConfirmPopupWidget
    class Alert extends AbstractAwaitablePopup {}
    Alert.template = 'Alert';
    Alert.defaultProps = {
        confirmText: 'Ok',
        cancelText: 'Cancel',
        title: 'Confirm ?',
        body: '',
    };

    Registries.Component.add(Alert);

    return Alert;
});
