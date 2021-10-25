odoo.define('pos_retail.HeaderLockButton', function (require) {
    'use strict';

    const HeaderLockButton = require('point_of_sale.HeaderLockButton');
    const Registries = require('point_of_sale.Registries');

    const RetailHeaderLockButton = (HeaderLockButton) =>
        class extends HeaderLockButton {
            // async showLoginScreen() {
            //     let {confirmed, payload: result} = await this.showPopup('ConfirmPopup', {
            //         title: this.env._t('Logout POS Screen'),
            //         body: this.env._t('What your choice with Log Out POS Screen ?'),
            //         confirmText: this.env._t('Close and Automatic POS Entries POS Session'),
            //         cancelText: this.env._t('Lock Screen Only')
            //     })
            //     if (confirmed) {
            //         this.env.pos.chrome._closePos()
            //     } else {
            //         await this.showTempScreen('LoginScreen');
            //     }
            //
            // }
        }
    Registries.Component.extend(HeaderLockButton, RetailHeaderLockButton);

    return RetailHeaderLockButton;
});
