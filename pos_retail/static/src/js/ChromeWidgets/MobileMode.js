odoo.define('point_of_sale.MobileMode', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');

    class MobileMode extends PosComponent {
        constructor() {
            super(...arguments);
        }

        async onClick() {
            owl.Component.env.isMobile = !owl.Component.env.isMobile
            owl.Component.env.qweb.forceUpdate();
            if (owl.Component.env.qweb.isMobile) {
                this.env.pos.alert_message({
                    title: this.env._t('Mobile Mode is'),
                    body: this.env._t('On'),
                })
            } else {
                this.env.pos.alert_message({
                    title: this.env._t('Mobile Mode is'),
                    body: this.env._t('Off'),
                })
            }
        }
    }

    MobileMode.template = 'MobileMode';

    Registries.Component.add(MobileMode);

    return MobileMode;
});
