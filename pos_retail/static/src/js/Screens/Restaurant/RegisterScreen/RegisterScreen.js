odoo.define('pos_retail.RegisterScreen', function (require) {
    'use strict';

    const Registries = require('point_of_sale.Registries');
    const PosComponent = require('point_of_sale.PosComponent');
    const {useState} = owl.hooks;
    var models = require('point_of_sale.models');
    const {posbus} = require('point_of_sale.utils');
    const IndependentToOrderScreen = require('point_of_sale.IndependentToOrderScreen');

    class RegisterScreen extends IndependentToOrderScreen {
        constructor() {
            super(...arguments);
            this.changes = {
                name: '',
                mobile: '',
            }
            this.state = useState(this.change);
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
            return this.env.pos.config.login_title;
        }

        async printPlaceOrder() {
            try {
                const isPrinted = document.execCommand('print', false, null);
                if (!isPrinted) window.print();
                return true;
            } catch (err) {
                await this.env.pos.alert_message({
                    title: this.env._t('Printing is not supported on some browsers'),
                    body: this.env._t(
                        'Printing is not supported on some browsers due to no default printing protocol ' +
                        'is available. It is possible to print your tickets by making use of an IoT Box.'
                    ),
                });
                return false;
            }
        }

        addNewTicket() {
            const orders = this.env.pos.get('orders').models
            orders.forEach(o => o.destroy({'reason': 'abandon'}))
            let selectedOrder = new models.Order({}, {pos: this.env.pos});
            if (this.env.pos.tables_by_id && this.env.pos.floors_by_id) {
                const table = this.env.pos.tables_by_id[this.env.session.table_id];
                if (table) {
                    const floor = this.env.pos.floors_by_id[table.floor_id[0]];
                    selectedOrder.table = table
                    selectedOrder.floor = floor
                } else {
                    this.env.pos.alert_message({
                        title: this.env._t('Error'),
                        body: this.env._t('POS Setting missed add Floors and Tables')
                    })
                }
            }
            this.env.pos.get('orders').add(selectedOrder);
            this.env.pos.set('selectedOrder', selectedOrder);
            return selectedOrder
        }

        OnChange(event) {
            if (event.target.type == 'checkbox') {
                this.changes[event.target.name] = event.target.checked;
            } else {
                this.changes[event.target.name] = event.target.value;
            }
            if (event.target.name == 'mobile') {
                const partners = this.env.pos.db.search_partner(this.changes['mobile'])
                if (partners.length > 0) {
                    const partner = partners.find(p => p.mobile == this.changes['mobile'])
                    if (partner) {
                        const selectedOrder = this.addNewTicket()
                        selectedOrder.set_client(partners[0])
                        this.closeScreen(partners[0].name)
                    }
                }
            }
        }

        async closeScreen(partnerName) {
            this.props.resolve({confirmed: true, payload: true});
            this.trigger('close-temp-screen');
            // posbus.trigger('hide-header')
        }

        async openSession() {
            if (this.changes['name'] == '' || this.changes['mobile'] == '') {
                return this.env.pos.alert_message({
                    title: this.env._t('Alert'),
                    body: this.env._t('If you have registered before, please check again your Mobile input, else please full fill Mobile and Name. Thanks'),
                    color: 'warning'
                })
            } else {
                const partners = this.env.pos.db.search_partner(this.changes['mobile'])
                let partner;
                if (partners.length == 1) {
                    partner = partners[0]
                } else {
                    let partner_id = await this.rpc({
                        model: 'res.partner',
                        method: 'create',
                        args: [this.changes],
                        context: {}
                    })
                    await this.env.pos.syncProductsPartners()
                    partner = this.env.pos.db.partner_by_id[partner_id]
                }
                const selectedOrder = this.addNewTicket()
                if (partner) {
                    selectedOrder.set_client(partner);
                    this.closeScreen(partner.name)
                } else {
                    this.closeScreen('Guests')
                }
            }
        }

        openSessionDirect() {
            const selectedOrder = this.addNewTicket()
            this.closeScreen('Guests')
        }

        closeSession() {
            window.location = '/web/login';
        }
    }

    RegisterScreen.template = 'RegisterScreen';

    Registries.Component.add(RegisterScreen);

    return RegisterScreen;
});
