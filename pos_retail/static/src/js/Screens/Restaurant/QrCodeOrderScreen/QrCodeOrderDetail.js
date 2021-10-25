odoo.define('pos_retail.QrCodeOrderDetail', function (require) {
    'use strict';

    const {getDataURLFromFile} = require('web.utils');
    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const {useListener} = require('web.custom_hooks');
    const core = require('web.core');

    class QrCodeOrderDetail extends PosComponent {
        constructor() {
            super(...arguments);
        }

        get partnerImageUrl() {
            const move = this.props.move;
            const partner = move.partner_id
            if (partner) {
                return `/web/image?model=res.partner&id=${partner[0]}&field=image_128&unique=1`;
            } else {
                return false;
            }
        }

        get OrderUrl() {
            const move = this.props.move;
            return window.location.origin + "/web#id=" + move.id + "&view_type=form&model=account.move";
        }
    }

    QrCodeOrderDetail.template = 'QrCodeOrderDetail';

    Registries.Component.add(QrCodeOrderDetail);

    return QrCodeOrderDetail;
});
