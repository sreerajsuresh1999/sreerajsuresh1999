odoo.define('pos_retail.LicenseExpiredDays', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const {useState} = owl.hooks;

    class LicenseExpiredDays extends PosComponent {
        constructor() {
            super(...arguments);
            this.changes = {
                code: 403,
                isValid: false,
                expiredDays: 30,
                message: 'License Activated'
            }
            this.state = useState(this.changes);
        }

        mounted() {
            super.mounted();
            this._bindBackendServer();
        }

        async onClick() {
            const self = this;
            let {confirmed, payload: license} = await this.showPopup('TextAreaPopup', {
                title: this.env._t('Dear. Please input your license codes to Text Box'),
                body: this.env._t('Your pos will Expired after ' + this.state.expiredDays + ' (days). If you have not license please email to thanhchatvn@gmail.com get a License')

            })
            if (confirmed) {
                let isValid = await this.rpc({
                    model: 'pos.session',
                    method: 'register_license',
                    args: [[], license]
                }, {
                    shadow: true,
                    timeout: 65000,
                }).then(function (isValid) {
                    return isValid
                }, function (err) {
                    window.location = '/web#action=point_of_sale.action_client_pos_menu';
                });
                if (!isValid) {
                    return self.env.pos.alert_message({
                        title: 'Error !!!',
                        body: 'Your License Code is wrong !!!'
                    })
                } else {
                    self.env.pos.session.license = true
                    $('.trial').addClass('oe_hidden')
                    let {confirmed, payload: license} = await self.showPopup('ConfirmPopup', {
                        title: 'Great Job',
                        body: 'License register succeed, Thanks for Your Purchased. We starting support your POS 2 months from now. If have any issues or bugs or something like that, Please contact direct us email: thanhchatvn@gmail.com'
                    })
                    location.reload();
                }
            }
        }

        async _bindBackendServer(ev) {
            const value = await this.rpc({
                model: 'pos.session',
                method: 'getExpiredDays',
                args: [[]]
            })
            this.state.isValid = value.isValid
            this.state.code = value.code
            if (!this.state.isValid) {
                if (value.usedDays > 30) {
                    this.state.expiredDays = 0
                } else {
                    this.state.expiredDays = 30 - value.usedDays
                }
                if (this.state.expiredDays > 0) {
                    this.state.message = 'Your POS License will Expired after: ' + this.state.expiredDays + ' (days)'
                } else {
                    this.state.message = 'Your POS License is Expired !!!'
                    this.env.pos.chrome.state.uiState = 'CLOSING'
                    this.env.pos.chrome.setLoadingMessage('We so Sorry, Your License is expired. We required Blocked your POS Session. Please contact direct us thanhchatvn@gmail.con for register license')
                }
            }
            this.render()
        }
    }

    LicenseExpiredDays.template = 'LicenseExpiredDays';

    Registries.Component.add(LicenseExpiredDays);

    return LicenseExpiredDays;
});
