odoo.define('pos_retail.KitchenOrderSelected', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const core = require('web.core');
    const Qweb = core.qweb;
    const models = require('point_of_sale.models');
    const OrderReceipt = require('point_of_sale.OrderReceipt');
    const {posbus} = require('point_of_sale.utils');

    class KitchenOrderSelected extends PosComponent {
        constructor() {
            super(...arguments);
            this.state = {
                order: this.props.order,
            };
        }

        get isHiddenTransferItems() {
            const newIsReady = this.props.order.new.filter(n => n.state != undefined)
            const cancelledIsReady = this.props.order.cancelled.filter(n => n.state != undefined)
            if (newIsReady.length > 0 || cancelledIsReady.length > 0) {
                return false
            } else {
                return true
            }
        }

        get invisiblePriority() {
            const lineStateIsNew = this.props.order.new.filter(n => (n.state == 'New' || n.state == 'Priority') && n.qty > 0)
            if (lineStateIsNew.length > 0 && this.props.order.state != 'Removed' && this.props.order.state != 'Paid') {
                return false
            } else {
                return true
            }
        }

        get isPriority() {
            const lineStateIsPriority = this.props.order.new.filter(n => n.state == 'Priority' && n.qty > 0)
            if (lineStateIsPriority.length > 0) {
                return true
            } else {
                return false
            }
        }

        get needTransfer() {
            const lineNeedTransfer = this.props.order.new.find(n => n.state == 'Ready Transfer')
            if (lineNeedTransfer) {
                return true
            } else {
                return false
            }
        }


        sync() {
            this.env.pos.pos_bus.send_notification({
                action: 'request_printer',
                data: {
                    uid: this.props.order.uid,
                    computeChanges: this.props.order,
                },
                order_uid: this.props.order.uid,
            })
        }

        async printOrder() {
            let orderRequest = this.props.order;
            const self = this;
            this.sync()
            var printers = this.env.pos.printers;
            if (!printers || printers.length == 0) {
                return this.env.pos.alert_message({
                    title: this.env._t('Error'),
                    body: this.env._t('You pos not set Order PRINTERs')
                })
            }
            let printerNetwork = printers.find((p) => p.printer_type == 'network')
            let printerViaPOSBOX = this.env.pos.config.proxy_ip && this.env.pos.config.iface_print_via_proxy
            if (!printerNetwork && !printerViaPOSBOX) { // todo: if pos not set proxy ip or printer network we return back odoo original
                this.env.pos.alert_message({
                    title: this.env._t('Warning'),
                    body: this.env._t('Your POS Config not setup POSBOX or IOT Boxes')
                })
            } else {
                let epson_printer = null;
                for (var i = 0; i < printers.length; i++) {
                    var printer = printers[i];
                    if (orderRequest['new'].length > 0 || orderRequest['cancelled'].length > 0) {
                        var receipt = Qweb.render('OrderChangeReceipt', {changes: order, widget: this});
                        if (!printer.config.printer_id) {
                            printers[i].print(receipt);
                        } else {
                            var epson_printer_will_connect = this.env.pos.epson_priner_by_id[printer.config.printer_id[0]];
                            epson_printer = _.find(this.env.pos.epson_printers, function (epson_printer) {
                                return epson_printer['ip'] == epson_printer_will_connect['ip'] && epson_printer['state'] == 'Online'
                            });
                            if (epson_printer) {
                                this.env.pos.print_network(receipt, epson_printer['ip'])
                            }
                        }
                    }
                }
            }
            if (orderRequest['uid']) {
                const order = this.env.pos.get_order_by_uid(orderRequest['uid'])
                if (order) {
                    const fixture = document.createElement('div');
                    const orderReceipt = new (Registries.Component.get(OrderReceipt))(this, {order, orderRequest});
                    await orderReceipt.mount(fixture);
                    const receiptHtml = orderReceipt.el.outerHTML;
                    this.showScreen('ReportScreen', {
                        report_html: receiptHtml,
                        report_xml: null,
                        orderRequest: orderRequest
                    });
                    if (orderRequest['state'] == 'PAID') {
                        this.env.db.remove_order(order.id);
                        order.destroy({'reason': 'abandon'});
                    }
                    this.env.pos.alert_message({
                        title: this.env._t('Ticket Number'),
                        body:  orderRequest['ticket_number'] + this.env._t(' Done !!!'),
                        timer: 5000,
                    })
                } else {
                    this.env.pos.alert_message({
                        title: this.env._t('Warning'),
                        body: this.env._t('Order not found, it have Paid or Remove before')
                    })
                }
            }
        }

        openOrder() {
            const orderReceiptSelected = this.props.order;
            const selectedOrder = this.env.pos.get_order_by_uid(orderReceiptSelected.uid)
            if (selectedOrder) {
                this.env.pos.set_order(selectedOrder, {})
                this.sync()
                this.showScreen('ProductScreen')
            }
        }

        get highlight() {
            return this.props.order.selected || false
        }
    }

    KitchenOrderSelected.template = 'KitchenOrderSelected';

    Registries.Component.add(KitchenOrderSelected);

    return KitchenOrderSelected;
});
