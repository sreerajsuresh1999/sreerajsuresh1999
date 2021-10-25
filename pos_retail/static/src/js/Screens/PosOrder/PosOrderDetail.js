odoo.define('pos_retail.PosOrderDetail', function (require) {
    'use strict';

    const {getDataURLFromFile} = require('web.utils');
    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const {useListener} = require('web.custom_hooks');
    const models = require('point_of_sale.models');
    const core = require('web.core');
    const qweb = core.qweb;
    const OrderReceipt = require('point_of_sale.OrderReceipt');

    class PosOrderDetail extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('reprint_order', () => this.RePrintOrder());
            useListener('register_amount', () => this.registerAmount());
            useListener('edit_order', () => this.editOrder());
            useListener('cancel_order', () => this.cancelOrder());
            useListener('action_invoice', () => this.actionInvoice());
            useListener('download_invoice', () => this.downloadInvoice());
            useListener('return_order', () => this.returnOrder());
            useListener('refill_order', () => this.refillOrder());
            useListener('continue-order', () => this.updateOrder());
            useListener('covert_to_voucher', () => this.covertToVoucher());
            useListener('download_order_report', () => this.downloadOrderReport());
            useListener('download_delivery_report', () => this.downloadDeliveryReport());
            useListener('covert_to_credit', () => this.covertToCredit());
        }

        async downloadOrderReport() {
            this.env.pos.do_action('pos_retail.report_pos_order', {
                additional_context: {
                    active_ids: [this.props.order.id],
                }
            });
        }

        async downloadDeliveryReport() {
            let picking_ids = await this.rpc({
                model: 'stock.picking',
                method: 'search_read',
                domain: [['pos_order_id', '=', this.props.order.id]],
                fields: ['id'],
                context: {
                    limit: 1
                }
            })
            if (picking_ids.length > 0) {
                this.env.pos.do_action('stock.action_report_picking', {
                    additional_context: {
                        active_ids: [picking_ids[0]['id']],
                    }
                });
            }
        }

        async covertToCredit() {
        }

        async covertToVoucher() { // kimanh: need move it to payment screen if return products ???
            const order = this.props.order;
            const lines = order['lines'];
            this.env.pos.add_return_order(order, lines);
            const selectedOrder = this.env.pos.get_order();
            selectedOrder['name'] = this.env._t('Return and covert to Voucher of Order / ') + order['name']
            if (selectedOrder) {
                let number = await this.env.pos._getVoucherNumber()
                const {confirmed, payload} = await this.showPopup('PopUpPrintVoucher', {
                    title: this.env._t('Covert Return Order to Voucher'),
                    number: number,
                    value: -selectedOrder.get_total_with_tax(),
                    period_days: this.env.pos.config.expired_days_voucher,
                });
                if (confirmed) {
                    let order_ids = this.env.pos.push_single_order(selectedOrder, {})
                    console.log('[covertToVoucher] pushed last order to return order: ' + order_ids)
                    let values = payload.values;
                    let error = payload.error;
                    if (!error) {
                        let voucher = await this.rpc({
                            model: 'pos.voucher',
                            method: 'create_from_ui',
                            args: [[], values],
                            context: {}
                        })
                        let url_location = window.location.origin + '/report/barcode/EAN13/';
                        voucher['url_barcode'] = url_location + voucher['code'];
                        let report_html = qweb.render('VoucherCard', this.env.pos._get_voucher_env(voucher));
                        await this.rpc({
                            model: 'pos.order',
                            method: 'write',
                            args: [[this.props.order.id], {
                                'is_returned': true
                            }],
                            context: {}
                        })
                        await this.env.pos.getPosOrders();
                        var new_order = this.env.pos.db.order_by_id[this.props.order.id];
                        this.props.order = new_order;
                        this.trigger('close-temp-screen');
                        this.showScreen('ReportScreen', {
                            report_html: report_html
                        });
                        this.env.pos.do_action('pos_retail.report_pos_voucher_small_size', {
                            additional_context: {
                                active_ids: [voucher.id],
                            }
                        });
                    } else {
                        this.env.pos.alert_message({
                            title: this.env._t('Error'),
                            body: error,
                        })
                    }
                    selectedOrder.destroy({'reason': 'abandon'});
                }
            }
        }

        async updateOrder() {
            let order = this.props.order;
            let lines = order['lines'];
            if (!lines || lines.length == 0) {
                return this.env.pos.alert_message({
                    title: this.env._t('Error'),
                    body: this.env._t('Order Lines not found')
                })
            }
            let {confirmed, payload: confirm} = await this.showPopup('ConfirmPopup', {
                title: this.env._t('Continue order or update Order'),
                body: this.env._t("You can change items in cart, payment amount .... But if you need add new Order, please Drop it. If finished update and need save again to Draft, you can click to Save to Draft Order on bottom of Product page !"),
            })
            if (confirmed) {
                const newOrder = this.env.pos.add_refill_order(order, lines);
                if (order.session_id[0] != this.env.pos.pos_session.id) {
                    let update = await this.rpc({
                        model: 'pos.order',
                        method: 'write',
                        args: [[order.id], {'session_id': this.env.pos.pos_session.id}],
                    })
                }
                newOrder['ean13'] = order['ean13']
                newOrder['name'] = order['pos_reference']
                newOrder['backend_id'] = order['id']
                for (let i = 0; i < order.payments.length; i++) {
                    let payment = order.payments[i]
                    let payment_method = _.find(this.env.pos.payment_methods, function (method) {
                        return payment['payment_method_id'][0] == method.id
                    });
                    if (payment_method) {
                        newOrder.add_paymentline(payment_method);
                        newOrder.selected_paymentline.set_amount(payment['amount']);
                    }
                }
                newOrder.trigger('change', newOrder)
                this.trigger('close-temp-screen');
            }
        }

        async refillOrder() {
            let order = this.props.order;
            let lines = order['lines'];
            if (!lines || lines.length == 0) {
                return this.env.pos.alert_message({
                    title: this.env._t('Error'),
                    body: this.env._t('Order Lines not found')
                })
            }
            this.env.pos.add_refill_order(order, lines);
            this.trigger('close-temp-screen');
        }

        async returnOrder() {
            let order = this.props.order;
            let lines = order['lines'];
            if (!lines || lines.length == 0) {
                this.env.pos.alert_message({
                    title: this.env._t('Error'),
                    body: this.env._t('Order Lines not found')
                })
                return false
            }
            this.env.pos.add_return_order(order, lines);
            const selectedOrder = this.env.pos.get_order();
            this.trigger('close-temp-screen');
            if (this.env.pos.config.required_reason_return) {
                let {confirmed, payload: note} = await this.showPopup('TextAreaPopup', {
                    title: this.env._t('Add some notes why customer return products ?'),
                })
                if (confirmed) {
                    selectedOrder.set_note(note);
                    selectedOrder.submitOrderToBackEnd()
                    return true
                } else {
                    return this.env.pos.alert_message({
                        title: this.env._t('Warning'),
                        body: this.env._t('Return Products/Order is required')
                    })
                }
            } else {
                selectedOrder.submitOrderToBackEnd()
                return true
            }
        }

        async downloadInvoice() {
            let order = this.props.order;
            let download_invoice = await this.env.pos.do_action('account.account_invoices', {
                additional_context: {
                    active_ids: [order.account_move[0]]
                }
            })
            return download_invoice
        }

        async orderToInvoice() {
            var self = this;
            let order = this.props.order;
            await this.rpc({
                model: 'pos.order',
                method: 'action_pos_order_invoice',
                args: [[order.id]],
            }).then(function (result) {
                return result
            }, function (err) {
                return self.env.pos.query_backend_fail(err);
            })
            await this.env.pos.getPosOrders();
            var new_order = this.env.pos.db.order_by_id[this.props.order.id];
            this.props.order = new_order;
            this.render()
            this.downloadInvoice()
        }

        async actionInvoice() {
            var self = this;
            let order = this.props.order;
            if (order.account_move) {
                return this.downloadInvoice()
            } else {
                if (!order.partner_id) {
                    this.showPopup('ConfirmPopup', {
                        title: this.env._t('Alert'),
                        body: this.env._t('Please set customer to Order before do action invoice')
                    })
                    let {confirmed, payload: newClient} = await this.showTempScreen(
                        'ClientListScreen',
                        {client: null}
                    );
                    if (newClient) {
                        await this.rpc({
                            model: 'pos.order',
                            method: 'write',
                            args: [[order.id], {'partner_id': newClient.id}],
                        })
                        return this.orderToInvoice()
                    } else {
                        this.env.pos.alert_message({
                            title: this.env._t('Warning'),
                            body: this.env._t('Order missed Partner, please set Partner for this Order first')
                        })
                    }
                } else {
                    return this.orderToInvoice()
                }
            }
        }

        async cancelOrder() {
            var self = this;
            let order = this.props.order
            let {confirmed, payload: result} = await this.showPopup('ConfirmPopup', {
                title: this.env._t('Warning'),
                body: this.env._t('Are you want cancel this Order')
            })
            if (confirmed) {
                await this.rpc({
                    model: 'pos.order',
                    method: 'action_pos_order_cancel',
                    args: [[order.id]],
                }).then(function (result) {
                    return result
                }, function (err) {
                    self.env.pos.query_backend_fail(err);
                    return false;
                })
                await this.env.pos.getPosOrders();
                var new_order = this.env.pos.db.order_by_id[this.props.order.id];
                this.props.order = new_order;
                this.render()
            }
        }

        async registerAmount() {
            var self = this;
            let debit_amount = await this.rpc({ // todo: template rpc
                model: 'pos.order',
                method: 'get_debit',
                args: [[], this.props.order.id],
            }).then(function (debit_amount) {
                return debit_amount
            }, function (err) {
                return self.env.pos.query_backend_fail(err);
            })
            if (debit_amount != 0) {
                const {confirmed, payload: values} = await this.showPopup('PopUpRegisterPayment', {
                    order: this.props.order,
                    id: this.props.order.id,
                    title: this.env._t('Do Register Payment:' + this.props.order.pos_reference),
                    amount: debit_amount,
                    payment_reference: this.props.order.pos_reference,
                    payment_methods: this.env.pos.payment_methods.filter((p) => (p.journal && p.pos_method_type && p.pos_method_type == 'default') || (!p.journal && !p.pos_method_type)),
                    payment_date: new Date().toISOString().split('T')[0],
                })
                if (confirmed) {
                    let payment_val = values.values
                    let payment = {
                        pos_order_id: this.props.order.id,
                        payment_method_id: payment_val.payment_method_id,
                        amount: payment_val['amount'],
                        name: payment_val['payment_reference'],
                        payment_date: payment_val['payment_date']
                    };
                    if (!payment.payment_method_id) {
                        return this.env.pos.alert_message({
                            title: this.env._t('Error'),
                            body: this.env._t('Payment Mode is required`')
                        })
                    }
                    if (payment_val['amount'] > debit_amount) {
                        payment_val['amount'] = debit_amount
                    }
                    if (!payment.payment_date) {
                        payment.payment_date = moment().format('YYYY-MM-DD');
                    }
                    await this.rpc({
                        model: 'pos.make.payment',
                        method: 'add_payment',
                        args: [[], payment],
                    }).then(function (payment_id) {
                        return payment_id
                    }, function (err) {
                        return self.env.pos.query_backend_fail(err);
                    })
                    await this.env.pos.getPosOrders();
                    let new_order = this.env.pos.db.order_by_id[self.props.order.id];
                    this.props.order = new_order;
                    this.render()
                }
            } else {
                return this.env.pos.alert_message({
                    title: this.env._t('Warning'),
                    body: this.env._t('Order is Paid full or Your Odoo offline, could not check Amount Debit of Order')
                })
            }


        }

        async RePrintOrder() {
            const order = await this.addBackOrder();
            setTimeout(function () {
                order.destroy({'reason': 'abandon'});
            }, 2000)
            if (this.env.pos.proxy.printer && this.env.pos.config.proxy_ip) {
                return this.env.pos.proxy.printer.printXmlReceipt(qweb.render('XmlReceipt', this.env.pos.getReceiptEnv()));
            } else {
                let orderRequest = null
                const fixture = document.createElement('div');
                const orderReceipt = new (Registries.Component.get(OrderReceipt))(null, {order, orderRequest});
                await orderReceipt.mount(fixture);
                const receiptHtml = orderReceipt.el.outerHTML;
                await this.showTempScreen('ReportScreen', {
                    report_html: receiptHtml,
                    report_xml: null,
                });

            }
        }

        async editOrder() {
            await this.addBackOrder(true);
            this.trigger('close-temp-screen');
        }

        async addBackOrder(draft) {
            const self = this
            const order = this.props.order;
            const lines = order['lines'];
            if (!lines || !lines.length) {
                return this.env.pos.alert_message({
                    title: this.env._t('Error'),
                    body: this.env._t('Your order is blank cart'),
                });
            }
            if (draft) {
                let setToDraft = await this.rpc({ // todo: template rpc
                    model: 'pos.order',
                    method: 'write',
                    args: [[order.id], {'state': 'draft'}],
                })
                if (!setToDraft) {
                    return;
                }
            }
            const paymentLines = order['payments']
            var new_order = new models.Order({}, {pos: this.env.pos, temporary: true});
            var partner = order['partner_id'];
            if (partner) {
                var partner_id = partner[0];
                var partner = this.env.pos.db.get_partner_by_id(partner_id);
                new_order.set_client(partner);
            }
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i];
                var product = this.env.pos.db.get_product_by_id(line.product_id[0]);
                if (!product) {
                    continue
                } else {
                    var new_line = new models.Orderline({}, {
                        pos: this.env.pos,
                        order: new_order,
                        product: product
                    });
                    new_line.set_quantity(line.qty, 'keep price, for re-print receipt');
                    new_order.orderlines.add(new_line);
                    if (line.discount) {
                        new_line.set_discount(line.discount);
                    }
                    if (line.discount_reason) {
                        new_line.discount_reason = line.discount_reason;
                    }
                    if (line.promotion) {
                        new_line.promotion = line.promotion;
                    }
                    if (line.promotion_reason) {
                        new_line.promotion_reason = line.promotion_reason;
                    }
                    if (line.note) {
                        new_line.set_line_note(line.note);
                    }
                    if (line.plus_point) {
                        new_line.plus_point = line.plus_point;
                    }
                    if (line.redeem_point) {
                        new_line.redeem_point = line.redeem_point;
                    }
                    if (line.uom_id) {
                        var uom_id = line.uom_id[0];
                        var uom = this.env.pos.uom_by_id[uom_id];
                        if (uom) {
                            new_line.set_unit(uom_id);
                        }
                    }
                    if (line.notice) {
                        new_line.notice = line.notice;
                    }
                    new_line.set_unit_price(line.price_unit);
                }
            }
            var orders = this.env.pos.get('orders');
            orders.add(new_order);
            this.env.pos.set('selectedOrder', new_order);
            new_order['uid'] = order['pos_reference'].split(' ')[1];
            new_order['pos_reference'] = order['pos_reference'];
            new_order['create_date'] = order['create_date'];
            new_order['ean13'] = order['ean13'];
            new_order['name'] = order['pos_reference'];
            new_order['date_order'] = order['date_order'];
            paymentLines.forEach(p => {
                let payment_method = self.env.pos.payment_methods.find(m => m.id == p.payment_method_id[0])
                if (payment_method) {
                    new_order.add_paymentline(payment_method)
                    new_order.selected_paymentline.set_amount(p.amount)
                }
            })
            this.env.pos.set('selectedOrder', new_order);
            return new_order;
        }

        get partnerImageUrl() {
            const order = this.props.order;
            const partner = order.partner_id
            if (partner) {
                return `/web/image?model=res.partner&id=${partner[0]}&field=image_128&unique=1`;
            } else {
                return false;
            }
        }

        get OrderUrl() {
            const order = this.props.order;
            return window.location.origin + "/web#id=" + order.id + "&view_type=form&model=pos.order";
        }
    }

    PosOrderDetail.template = 'PosOrderDetail';

    Registries.Component.add(PosOrderDetail);

    return PosOrderDetail;
});
