odoo.define('pos_retail.DebugWidget', function (require) {
    'use strict';

    const DebugWidget = require('point_of_sale.DebugWidget');
    const {useState} = owl.hooks;
    const Registries = require('point_of_sale.Registries');
    const NumberBuffer = require('point_of_sale.NumberBuffer');
    const models = require('point_of_sale.models');

    const RetailDebugWidget = (DebugWidget) =>
        class extends DebugWidget {
            constructor() {
                super(...arguments);
                this.state = useState({
                    barcodeInput: '',
                    weightInput: '',
                    isPaidOrdersReady: false,
                    isUnpaidOrdersReady: false,
                    buffer: NumberBuffer.get(),
                    syncData: '',
                    printerNetworkIp: '192.168.31.100',
                    printerNetworkMessage: 'POS Retail testing Printer Network',
                    printTotal: 1,
                    testDuplicateOrderNumber: 10,
                });
            }

            async testPrinterNetwork() {
                for (let i = 0; i < this.state.printTotal; i++) {
                    let statusPrinter = await this.env.pos.print_network('<div>' + this.state.printerNetworkMessage + '</div>', this.state.printerNetworkIp);
                    this.env.pos.set('printer.status', {
                        'state': 'connecting',
                        'pending': 'Result of Printing: ' + statusPrinter
                    });
                    this.state.printTotal = this.state.printTotal - 1
                }
            }

            manualSync() {
                this.env.pos.pos_bus.send_notification(JSON.parse(this.state.syncData))
            }

            test1Order() {
                let order = this.env.pos.get_order();
                if (!order && this.env.pos.tables && this.env.pos.tables.length) {
                    this.env.pos.set_table(this.env.pos.tables[0])
                }
                order = this.env.pos.get_order();
                if (!order) {
                    return
                }
                let total = 0;
                for (var product_id in this.env.pos.db.product_by_id) {
                    var product = this.env.pos.db.product_by_id[product_id]
                    var line = new models.Orderline({}, {pos: this.env.pos, order: order, product: product});
                    order.orderlines.add(line);
                    line.set_unit_price(Math.floor((Math.random() * 100) + 1));
                    line.set_quantity(Math.floor((Math.random() * 10) + 1));
                    line.set_discount(Math.floor((Math.random() * 10) + 1));
                    line.set_note('Testing Sync Between Session');
                    line.set_unit_price(Math.floor((Math.random() * 10) + 1))
                    total += 1;
                    if (total > 100) {
                        break
                    }

                }
                order.saveChanges()
            }

            test10Orders() {
                if (!this.env.pos.tables) {
                    return
                }
                for (let i = 0; i < this.env.pos.tables.length; i++) {
                    if (i >= 10) {
                        break
                    }
                    this.env.pos.set_table(this.env.pos.tables[i])
                }
                const orders = this.env.pos.get('orders').models;
                for (let i = 0; i < orders.length; i++) {
                    if (i >= 10) {
                        break
                    }
                    let order = orders[i]
                    let total = 0;
                    for (var product_id in this.env.pos.db.product_by_id) {
                        var product = this.env.pos.db.product_by_id[product_id]
                        var line = new models.Orderline({}, {pos: this.env.pos, order: order, product: product});
                        order.orderlines.add(line);
                        line.set_unit_price(Math.floor((Math.random() * 100) + 1));
                        line.set_quantity(Math.floor((Math.random() * 10) + 1));
                        line.set_discount(Math.floor((Math.random() * 10) + 1));
                        line.set_note('Testing Sync Between Session');
                        line.set_unit_price(Math.floor((Math.random() * 10) + 1))
                        total += 1;
                        if (total > 5) {
                            break
                        }

                    }
                    order.saveChanges()
                }
            }

            testFullTables() {
                if (!this.env.pos.tables) {
                    return
                }
                for (let i = 0; i < this.env.pos.tables.length; i++) {
                    this.env.pos.set_table(this.env.pos.tables[i])
                }
                const orders = this.env.pos.get('orders').models;
                for (let i = 0; i < orders.length; i++) {
                    let order = orders[i]
                    let total = 0;
                    for (var product_id in this.env.pos.db.product_by_id) {
                        var product = this.env.pos.db.product_by_id[product_id]
                        var line = new models.Orderline({}, {pos: this.env.pos, order: order, product: product});
                        order.orderlines.add(line);
                        line.set_unit_price(Math.floor((Math.random() * 100) + 1));
                        line.set_quantity(Math.floor((Math.random() * 10) + 1));
                        line.set_discount(Math.floor((Math.random() * 10) + 1));
                        line.set_note('Testing Sync Between Session');
                        line.set_unit_price(Math.floor((Math.random() * 10) + 1))
                        total += 1;
                        if (total > 3) {
                            break
                        }
                    }
                    order.saveChanges()
                }
            }

            async testDuplicateUidOrders() {
                let lastOrder = null
                for (let i = 0; i < this.state.testDuplicateOrderNumber; i++) {
                    let order = new models.Order({}, {pos: this.env.pos});
                    if (lastOrder) {
                        order['uid'] = lastOrder['uid']
                        order['name'] = lastOrder['name']
                    } else {
                        lastOrder = order
                    }
                    let total = 0
                    for (var product_id in this.env.pos.db.product_by_id) {
                        var product = this.env.pos.db.product_by_id[product_id]
                        var line = new models.Orderline({}, {pos: this.env.pos, order: order, product: product});
                        order.orderlines.add(line);
                        line.set_unit_price(Math.floor((Math.random() * 100) + 1));
                        line.set_quantity(Math.floor((Math.random() * 10) + 1));
                        line.set_discount(Math.floor((Math.random() * 10) + 1));
                        line.set_note('Testing Sync Between Session');
                        line.set_unit_price(Math.floor((Math.random() * 10) + 1))
                        total += 1;
                        if (total > 5) {
                            break
                        }

                    }
                    order.add_paymentline(this.env.pos.payment_methods[0]);
                    let amount_withtax = order.get_total_with_tax();
                    order.selected_paymentline.set_amount(amount_withtax);
                    let order_ids = await this.env.pos.push_single_order(order, {})
                    console.warn('[testDuplicateOrders] pushed succeed order_ids: ' + order_ids)
                }
            }
            async testDuplicateOrders() {
                let lastOrder = null
                for (let i = 0; i < this.state.testDuplicateOrderNumber; i++) {
                    let order = new models.Order({}, {pos: this.env.pos});
                    let total = 0
                    for (var product_id in this.env.pos.db.product_by_id) {
                        var product = this.env.pos.db.product_by_id[product_id]
                        var line = new models.Orderline({}, {pos: this.env.pos, order: order, product: product});
                        order.orderlines.add(line);
                        line.set_unit_price(Math.floor((Math.random() * 100) + 1));
                        line.set_quantity(Math.floor((Math.random() * 10) + 1));
                        line.set_discount(Math.floor((Math.random() * 10) + 1));
                        line.set_note('Testing Sync Between Session');
                        line.set_unit_price(Math.floor((Math.random() * 10) + 1))
                        total += 1;
                        if (total > 5) {
                            break
                        }

                    }
                    order.add_paymentline(this.env.pos.payment_methods[0]);
                    let amount_withtax = order.get_total_with_tax();
                    order.selected_paymentline.set_amount(amount_withtax);
                    let order_ids = await this.env.pos.push_single_order(order, {})
                    console.warn('[testDuplicateOrders] pushed succeed order_ids: ' + order_ids)
                }
            }
        }

    Registries.Component.extend(DebugWidget, RetailDebugWidget);

    return RetailDebugWidget;
});
