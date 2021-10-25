odoo.define('pos_retail.QrCodeOrders', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const {posbus} = require('point_of_sale.utils');

    class QrCodeOrders extends PosComponent {
        onClick() {
            this.showScreen('QrCodeOrderScreen');
        }

        willPatch() {
            posbus.off('save-qrcode-order', this);
        }

        patched() {
            posbus.on('save-qrcode-order', this, this.render);
        }

        mounted() {
            posbus.on('save-qrcode-order', this, this.render);
        }

        willUnmount() {
            posbus.off('save-qrcode-order', this);
        }

        get isHidden() {
            if (!this.env || !this.env.pos || !this.env.pos.config || !this.env.pos.config.sync_multi_session || (this.env && this.env.pos && this.env.pos.config && !this.env.pos.config.qrcode_order_screen)) {
                return true
            } else {
                return false
            }
        }

        get count() {
            if (this.env.pos) {
                return this.env.pos.db.getQrCodeOrders().length;
            } else {
                return 0;
            }
        }
    }

    QrCodeOrders.template = 'QrCodeOrders';

    Registries.Component.add(QrCodeOrders);

    return QrCodeOrders;
});
