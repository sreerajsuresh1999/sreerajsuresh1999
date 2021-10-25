odoo.define('pos_retail.ClientListScreen', function (require) {
    'use strict';

    const ClientListScreen = require('point_of_sale.ClientListScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');
    const {posbus} = require('point_of_sale.utils');
    var BarcodeEvents = require('barcodes.BarcodeEvents').BarcodeEvents;

    const RetailClientListScreen = (ClientListScreen) =>
        class extends ClientListScreen {
            constructor() {
                super(...arguments);
                this.buffered_key_events = [];
                this._onKeypadKeyDown = this._onKeypadKeyDown.bind(this);
                useListener('show-popup', this.removeEventKeyboad);
                useListener('show-reference-contact', () => this.showReferenceAddress());
                useListener('clear-search', () => this.clearSearch());
                useListener('set-customer-to-cart', this.setCustomerToCart);
            }

            mounted() {
                super.mounted();
                posbus.on('closed-popup', this, this.addEventKeyboad);
                this.addEventKeyboad()
            }

            willUnmount() {
                super.willUnmount();
                posbus.off('closed-popup', this, null);
                this.removeEventKeyboad()
            }

            confirm() { // single screen
                try {
                    super.confirm()
                } catch (ex) {
                    const selectedOrder = this.env.pos.get_order();
                    selectedOrder.set_client(this.state.selectedClient)
                    posbus.trigger('reset-screen')
                }
            }

            back() { // single screen
                try {
                    super.back()
                } catch (ex) {
                    posbus.trigger('reset-screen')
                }
            }

            clearSearch() {
                this.state.query = null
                this.render()
            }

            setCustomerToCart(event) {
                const selectedClient = event.detail.client;
                const selectedOrder = this.env.pos.get_order();
                if (!selectedOrder || (selectedOrder && selectedOrder['finalized'])) {
                    this.props.resolve({confirmed: true, payload: selectedClient});
                    return this.trigger('close-temp-screen');
                }
                if (selectedClient && selectedOrder) {
                    selectedOrder.set_client(selectedClient)
                    try {
                        this.props.resolve({confirmed: true, payload: selectedClient});
                        this.trigger('close-temp-screen');
                    } catch (ex) {

                    }
                    posbus.trigger('reset-screen')
                }
            }

            async showReferenceAddress() {
                const selectedClient = this.state.selectedClient;
                if (selectedClient) {
                    const customersReference = this.env.pos.db.partners_by_parent_id[selectedClient.id]
                    this.customersReference = customersReference;
                    this.render()
                }
            }

            get clients() {
                if (this.customersReference) {
                    let clients = this.customersReference
                    this.customersReference = null
                    return clients
                } else {
                    if (this.state.query && this.state.query.trim() !== '') {
                        return this.env.pos.db.search_partner(this.state.query.trim());
                    } else {
                        return this.env.pos.db.get_partners_sorted(1000);
                    }
                }
            }

            addEventKeyboad() {
                console.log('add event keyboard')
                $(document).off('keydown.productscreen', this._onKeypadKeyDown);
                $(document).on('keydown.productscreen', this._onKeypadKeyDown);
            }

            removeEventKeyboad() {
                console.log('remove event keyboard')
                $(document).off('keydown.productscreen', this._onKeypadKeyDown);
            }

            _onKeypadKeyDown(ev) {
                if (!_.contains(["INPUT", "TEXTAREA"], $(ev.target).prop('tagName'))) {
                    clearTimeout(this.timeout);
                    this.buffered_key_events.push(ev);
                    this.timeout = setTimeout(_.bind(this._keyboardHandler, this), BarcodeEvents.max_time_between_keys_in_ms);
                }
                if ([13, 27, 38, 40].includes(ev.keyCode)) {  // esc key
                    this.buffered_key_events.push(ev);
                    this.timeout = setTimeout(_.bind(this._keyboardHandler, this), BarcodeEvents.max_time_between_keys_in_ms);
                }
            }

            _keyboardHandler() {
                if (this.buffered_key_events.length > 2) {
                    this.buffered_key_events = [];
                    return true;
                }
                for (let i = 0; i < this.buffered_key_events.length; i++) {
                    let event = this.buffered_key_events[i]
                    console.log(event.keyCode)
                    // -------------------------- product screen -------------
                    let key = '';
                    if (event.keyCode == 13) { // enter
                        const query = $('.searchbox-client >input').val();
                        const partners = this.env.pos.db.search_partner(query)
                        if (partners.length == 1) {
                            $(this.el).find('.searchbox-client >input').blur()
                            $(this.el).find('.searchbox-client >input')[0].value = "";
                            this.props.resolve({confirmed: true, payload: partners[0]});
                            this.trigger('close-temp-screen');
                        }
                        $(this.el).find('.save').click()
                        $(this.el).find('.next').click()
                    }
                    if (event.keyCode == 66 || event.keyCode == 27) { // b
                        $(this.el).find('.back').click()
                    }
                    if (event.keyCode == 69) { // e
                        $(this.el).find('.edit-client-button').click()
                    }
                    if (![27, 38, 40, 66, 69].includes(event.keyCode)) {
                        $(this.el).find('.searchbox-client >input').focus()
                    }
                    if ([38, 40].includes(event.keyCode)) {
                        const selectedClient = this.state.selectedClient;
                        let clients = [];
                        if (this.state.query && this.state.query.trim() !== '') {
                            clients = this.env.pos.db.search_partner(this.state.query.trim());
                        } else {
                            clients = this.env.pos.db.get_partners_sorted(1000);
                        }
                        if (clients.length != 0) {
                            if (!selectedClient) {
                                this.state.selectedClient = clients[[0]];
                                this.render();
                            } else {
                                let isSelected = false
                                for (let i = 0; i < clients.length; i++) {
                                    let client = clients[i]
                                    if (client.id == selectedClient.id) {
                                        let line_number = null;
                                        if (event.keyCode == 38) { // up
                                            if (i == 0) {
                                                line_number = clients.length - 1
                                            } else {
                                                line_number = i - 1
                                            }
                                        } else { // down
                                            if (i + 1 >= clients.length) {
                                                line_number = 0
                                            } else {
                                                line_number = i + 1
                                            }
                                        }
                                        if (clients[line_number]) {
                                            this.state.selectedClient = clients[line_number];
                                            this.render();
                                            isSelected = true
                                            break
                                        }
                                    }
                                }
                                if (!isSelected) {
                                    this.state.selectedClient = clients[0];
                                    this.render();
                                }
                            }
                        }

                    }

                }
                this.buffered_key_events = [];
            }

            // async saveChanges(event) {
            //     let self = this;
            //     let fields = event.detail.processedChanges;
            //     if (fields.phone && fields.phone != "" && this.env.pos.config.check_duplicate_phone) {
            //         let partners = await this.rpc({
            //             model: 'res.partner',
            //             method: 'search_read',
            //             domain: [['id', '!=', fields.id], '|', ['phone', '=', fields.phone], ['mobile', '=', fields.phone]],
            //             fields: ['id'],
            //         }, {
            //             shadow: true,
            //             timeout: 65000
            //         }).then(function (count) {
            //             return count
            //         }, function (err) {
            //             return self.env.pos.query_backend_fail(err);
            //         })
            //         if (partners.length) {
            //             return this.env.pos.alert_message({
            //                 title: this.env._t('Error'),
            //                 body: fields.phone + this.env._t(' already used by another customer')
            //             })
            //         }
            //     }
            //     if (fields.mobile && fields.mobile != "" && this.env.pos.config.check_duplicate_phone) {
            //         let partners = await this.rpc({
            //             model: 'res.partner',
            //             method: 'search_read',
            //             domain: [['id', '!=', fields.id], '|', ['phone', '=', fields.mobile], ['mobile', '=', fields.mobile]],
            //             fields: ['id']
            //         }, {
            //             shadow: true,
            //             timeout: 65000
            //         }).then(function (count) {
            //             return count
            //         }, function (err) {
            //             return self.env.pos.query_backend_fail(err);
            //         })
            //         if (partners.length) {
            //             return this.env.pos.alert_message({
            //                 title: this.env._t('Error'),
            //                 body: fields.mobile + this.env._t(' already used by another customer')
            //             })
            //         }
            //     }
            //     if (fields.email && fields.email != "" && this.env.pos.config.check_duplicate_email) {
            //         let partners = await this.rpc({
            //             model: 'res.partner',
            //             method: 'search_read',
            //             domain: [['id', '!=', fields.id], ['email', '=', fields.email]],
            //             fields: ['id']
            //         }, {
            //             shadow: true,
            //             timeout: 65000
            //         }).then(function (count) {
            //             return count
            //         }, function (err) {
            //             return self.env.pos.query_backend_fail(err);
            //         })
            //         if (partners.length) {
            //             return this.env.pos.alert_message({
            //                 title: this.env._t('Error'),
            //                 body: fields.email + this.env._t(' already used by another customer')
            //             })
            //         }
            //     }
            //     // TODO: we sync backend res.partner via longpolling, no need to call load_new_partners(), it reason no call super
            //     let partnerId = await this.rpc({
            //         model: 'res.partner',
            //         method: 'create_from_ui',
            //         args: [event.detail.processedChanges],
            //     });
            //     this.state.selectedClient = this.env.pos.db.get_partner_by_id(partnerId);
            //     this.state.detailIsShown = false;
            //     this.render();
            // }

            activateEditMode(event) {
                if (!this.env.pos.config.add_client) {
                    return this.env.pos.alert_message({
                        title: this.env._t('Error'),
                        body: this.env._t('You have not permission create new Customer ! You can request admin go to your pos setting / Clients Screen [Tab] / Security and check to field [Allow add client]')
                    })
                }
                super.activateEditMode(event)
                if (event.detail['parent_id']) {
                    this.state.editModeProps['partner']['parent_id'] = event.detail['parent_id'] // todo: send this to ClientDetailsEdit.js for saveChange can get it
                }
            }
        }
    Registries.Component.extend(ClientListScreen, RetailClientListScreen);

    return ClientListScreen;
});
