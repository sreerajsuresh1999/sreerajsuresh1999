odoo.define('pos_hr.CheckInScreen', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const {useState} = owl;

    class CheckInScreen extends PosComponent {
        constructor() {
            super(...arguments);
            this.state = useState({
                mobile: ''.state,
                error: false,
                client: null
            });

        }

        back() {
            this.props.resolve({confirmed: false, payload: false});
            this.trigger('close-temp-screen');
        }

        confirm() {
            this.props.resolve({confirmed: true, payload: true});
            this.trigger('close-temp-screen');
        }

        get shopName() {
            return this.env.pos.config.name;
        }

        async OnChangeMobile(event) {
            const newMobile = event.target.value;
            this.state.mobile = newMobile
            const partners = this.env.pos.db.search_partner(this.state.mobile)
            console.log(partners)
            if (partners.length == 1) {
                this.state.client = partners[0]
            }
        }

        async checkIn() {
            if (!this.state.mobile) {
                this.state.error = this.env._t('Please typing your mobile/phone to input box')
                return false
            }
            const partners = this.env.pos.db.search_partner(this.state.mobile)
            if (partners.length == 1) {
                this.state.client = partners[0]
            } else {
                this.state.error = this.env._t('Your mobile not found')
            }
        }
    }

    CheckInScreen.template = 'CheckInScreen';

    Registries.Component.add(CheckInScreen);

    return CheckInScreen;
});
