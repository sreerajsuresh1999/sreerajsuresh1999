odoo.define('pos_retail.RetailTableWidget', function (require) {
    'use strict';

    const TableWidget = require('pos_restaurant.TableWidget');
    const Registries = require('point_of_sale.Registries');

    const RetailTableWidget = (TableWidget) =>
        class extends TableWidget {
            get checkedIn() {
                const orders = this.env.pos.get_table_orders(this.props.table);
                if (orders.length > 0) {
                    return true
                } else {
                    return false
                }
            }

            get tableInformation() {
                let info = {
                    'checkedIn': null,
                    'amount': 0,
                }
                const orders = this.env.pos.get_table_orders(this.props.table);
                if (orders.length > 0) {
                    for (let i=0; i < orders.length; i++) {
                        let order = orders[i]
                        info['checkedIn'] = order['created_time']
                        info['amount'] = order.get_total_with_tax()
                    }
                    return info
                } else {
                    return info
                }
            }
            get getCountItemsWaitingDelivery() {
                var count = 0;
                const orders = this.env.pos.get_table_orders(this.props.table);
                for (let i = 0; i < orders.length; i++) {
                    let order = orders[i];
                    let receiptOrders = this.env.pos.db.getOrderReceiptByUid(order.uid);
                    for (let j = 0; j < receiptOrders.length; j++) {
                        let receiptOrder = receiptOrders[j];
                        let linesReadyTransfer = receiptOrder.new.filter(n => n.state == 'Ready Transfer' || n.state == 'Kitchen Requesting Cancel')
                        count += linesReadyTransfer.length
                    }
                }
                return count
            }
        }
    Registries.Component.extend(TableWidget, RetailTableWidget);

    return RetailTableWidget
});
