odoo.define('pos_retail.giftCardCreateScreen', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const {useRef, useState} = owl.hooks;


    class giftCardCreateScreen extends PosComponent {
        guidGenerator() {
            return (new Date().getUTCMilliseconds().toString() + new Date().getTime().toString());
        }

        constructor() {
            super(...arguments);
            if (this.env.pos.config.manual_card_number) {
                this.state = useState({
                    CardNumber: '',
                    SelectCustomer: this.props.selectCustomer,
                    ExpireDate: "",
                    Amount: "",
                    SelectCardType: "",
                    Paid: ''
                });
            } else {
                this.state = useState({
                    CardNumber: this.guidGenerator(),
                    SelectCustomer: this.props.selectCustomer,
                    ExpireDate: "",
                    Amount: "",
                    SelectCardType: "",
                    Paid: ''
                });
            }
            this.card_no = useRef('CardNumber');
            this.select_customer = useRef('SelectCustomer');
            this.text_expire_date = useRef('ExpireDate');
            this.text_amount = useRef('Amount');
            this.SelectCardType = useRef('SelectCardType');
            this.Paid = useRef('Paid');
        }

        onInputKeyDownNumberVlidation(e) {
            if (e.which != 190 && e.which != 110 && e.which != 8 && e.which != 0 && (e.which < 48 || e.which > 57) && (e.which < 96 || e.which > 105) && (e.which < 37 || e.which > 40)) {
                e.preventDefault();
            }
        }

        back() {
            this.trigger('close-temp-screen');
        }

        async confirm() {
            if (this.state.SelectCustomer == '') {
                return this.env.pos.db._t('danger', this.env._t('Please Select Customer'))
            } else if (this.state.ExpireDate == '' || this.state.ExpireDate < moment().locale('en').format('YYYY-MM-DD')) {
                return this.env.pos.db._t('danger', this.env._t('Please Enter Valid Expiry Date, Expiry Date required bigger than today'))
            } else {
                this.props.resolve({
                    confirmed: true,
                    payload: {
                        card_no: this.state.CardNumber,
                        customer_id: this.state.SelectCustomer.id,
                        expire_date: this.state.ExpireDate,
                        card_value: Number(this.state.Amount),
                        card_type: this.state.SelectCardType,
                    }
                });
                this.trigger('close-temp-screen');
            }
        }

        clickNext() {
            this.confirm();
        }

        async changeCustomer() {
            const {confirmed, payload: newClient} = await this.env.pos.chrome.showTempScreen(
                'ClientListScreen',
                {client: null}
            );
            if (confirmed) {
                this.state.SelectCustomer = newClient
                this.state.SelectedCustomerName = newClient['name']
            } else {
                return this.env.pos.alert_message({
                    title: this.env._t('Error'),
                    body: this.env._t('Required chosse 1 Customer before create Card')
                })
            }
        }

    }

    giftCardCreateScreen.template = 'giftCardCreateScreen';

    Registries.Component.add(giftCardCreateScreen);

    return giftCardCreateScreen;
});
