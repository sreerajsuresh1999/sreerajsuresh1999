odoo.define('pos_retail.CashBoxOpening', function (require) {
    'use strict';

    const CashBoxOpening = require('point_of_sale.CashBoxOpening');
    const {useState} = owl;
    const Registries = require('point_of_sale.Registries');
    const NumberBuffer = require('point_of_sale.NumberBuffer');
    const {useListener} = require('web.custom_hooks');

    const RetailCashBoxOpening = (CashBoxOpening) =>
        class extends CashBoxOpening {
            constructor() {
                super(...arguments);
                useListener('accept-input', this.startSession);
                let startingBuffer = this.defaultValue;
                this.state = useState({buffer: startingBuffer});
                NumberBuffer.use({
                    nonKeyboardInputEvent: 'open-session-numpad-click-input',
                    triggerAtEnter: 'accept-input',
                    state: this.state,
                });
            }

            get decimalSeparator() {
                return this.env._t.database.parameters.decimal_point;
            }

            sendInput(key) {
                const self = this;
                this.trigger('open-session-numpad-click-input', {key});
                setTimeout(function () {
                    self.state.buffer = NumberBuffer.get()
                    self.changes['cashBoxValue'] = self.state.buffer
                }, 200)
            }

            async startSession() {
                let cashOpening = this.changes.cashBoxValue ? this.changes.cashBoxValue : this.defaultValue;
                this.env.pos.alert_message({
                    title: this.env._t('Opening Session Successfully'),
                    body: this.env._t('Cash opening is: ') + this.env.pos.format_currency(cashOpening)
                })
                super.startSession()
            }
        }
    Registries.Component.extend(CashBoxOpening, RetailCashBoxOpening);

    return RetailCashBoxOpening;
});
