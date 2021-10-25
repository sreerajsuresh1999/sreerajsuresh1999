odoo.define('point_of_sale.CustomerFacingScreenWiget', function (require) {
    'use strict';

    const {useState} = owl;
    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');

    class CustomerFacingScreenWiget extends PosComponent {
        constructor() {
            super(...arguments);
            this.opening = false
            this.onClick()
        }

        async onClick() {
            const self = this
            if (!this.env.pos.config.sync_multi_session || (this.env.pos.config.sync_multi_session && this.env.pos.config.screen_type != 'kitchen')) {
                if (!this.opening) {
                    let {confirmed, payload: result} = await this.showPopup('ConfirmPopup', {
                        title: this.env._t('Are you want ?'),
                        body: this.env._t('Customer Facing Screen !')
                    })
                    if (confirmed) {
                        this.env.pos.customer_monitor_screen = window.open(window.location.origin + "/point_of_sale/display", 'winname', 'directories=no,titlebar=no,toolbar=no,location=no,status=no,menubar=no,width=' + this.env.pos.config.customer_facing_screen_width + ',height=' + this.env.pos.config.customer_facing_screen_height);
                        setTimeout(() => {
                            self.env.pos.trigger('refresh.customer.facing.screen');
                        }, 1000)
                        this.opening = true
                    }
                } else {
                    this.env.pos.customer_monitor_screen.close()
                    this.opening = false
                    this.env.pos.alert_message({
                        title: this.env._t('Alert'),
                        body: this.env._t('Facing Screen Turn Off')
                    })
                }

            }
        }

        get isHidden() {
            if (this.env.pos.config.sync_multi_session && this.env.pos.config.screen_type == 'kitchen') {
                return true
            } else {
                return false
            }
        }
    }

    CustomerFacingScreenWiget.template = 'CustomerFacingScreenWiget';

    Registries.Component.add(CustomerFacingScreenWiget);

    return CustomerFacingScreenWiget;
});
